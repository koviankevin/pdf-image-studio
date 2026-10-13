import {test, expect} from './fixtures.mjs';
import {createFixtures} from '../support/pdfs.mjs';
import {downloadBytes, inspectPdf} from '../support/ocr-pdf.mjs';

test('A4 UI exports selected workspace order, changes layout, previews every sheet and rejects invalid spacing', async ({page}, testInfo) => {
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  const {sources} = await createFixtures();
  await page.goto('/');
  await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled','false');
  await expect(page.locator('#impose-pdf')).toBeDisabled();
  await page.locator('#file-input').setInputFiles([...sources.values()].map(s=>({name:s.name,mimeType:'application/pdf',buffer:Buffer.from(s.bytes)})));
  await expect(page.locator('#page-count')).toHaveText('5');
  await expect(page.locator('#impose-pdf')).toBeEnabled();
  await page.getByRole('button',{name:'上移第 3 頁',exact:true}).click();
  await page.getByRole('checkbox',{name:'選取第 5 頁',exact:true}).uncheck();
  await page.locator('#impose-pdf').click();
  await expect(page.locator('#nup-download')).toBeEnabled();
  await expect(page.locator('#nup-summary')).toContainText('4 頁 → 2 張 A4');
  await expect(page.locator('#nup-page-label')).toHaveText('第 1 / 2 張 A4');
  await page.locator('#nup-next').click();
  await expect(page.locator('#nup-page-label')).toHaveText('第 2 / 2 張 A4');
  const bytes=await downloadBytes(page,page.locator('#nup-download'));
  const result=await inspectPdf(page,bytes);
  expect(result).toHaveLength(2);
  expect(result[0].width).toBeCloseTo(841.89,1);
  expect(result[0].height).toBeCloseTo(595.28,1);
  expect(result[0].text.match(/SOURCE_[AB]_PAGE_\d/g)).toEqual(['SOURCE_A_PAGE_1','SOURCE_B_PAGE_1']);
  expect(result[1].text.match(/SOURCE_[AB]_PAGE_\d/g)).toEqual(['SOURCE_A_PAGE_2','SOURCE_B_PAGE_2']);
  expect(result[0].textItems[0].x).toBeLessThan(result[0].textItems[1].x);
  await page.locator('#nup-preset').selectOption('4');
  await expect(page.locator('#nup-download')).toBeEnabled();
  await expect(page.locator('#nup-summary')).toContainText('4 頁 → 1 張 A4');
  await page.locator('#nup-margin').fill('50');
  await page.locator('#nup-gap').fill('50');
  await page.locator('#nup-preset').selectOption('custom');
  await page.locator('#nup-columns').fill('6');
  await expect(page.locator('#nup-status')).toHaveClass(/error/);
  await expect(page.locator('#nup-download')).toBeDisabled();
  await page.locator('#nup-margin').fill('10'); await page.locator('#nup-gap').fill('5');
  await page.locator('#nup-columns').fill('2');
  await expect(page.locator('#nup-download')).toBeEnabled();
  await page.screenshot({path:testInfo.outputPath('a4-desktop.png')});
  await page.setViewportSize({width:390,height:844});
  expect(await page.locator('#nup-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('a4-mobile.png')});
  await page.locator('#nup-close').click();
  await expect(page.locator('#impose-pdf')).toBeEnabled();
  await page.locator('#impose-pdf').click(); await page.locator('#nup-close').click();
  await expect(page.locator('#file-input')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('vector imposition preserves all rotated cropped pages and annotations without rasterizing', async ({page}) => {
  await page.goto('/'); await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled','false');
  const outcome=await page.evaluate(async()=>{
    const lib=await import('/vendor/pdf-lib/pdf-lib.mjs'), pdfjs=await import('/vendor/pdfjs/pdf.mjs');
    const {imposePdf}=await import('/imposition-core.mjs');
    const {assemblePdf}=await import('/editor-core.mjs');
    const doc=await lib.PDFDocument.create(),font=await doc.embedFont(lib.StandardFonts.Helvetica);
    const records=[];
    // Offset MediaBox and CropBox, inherited rotation plus a workspace rotation.
    for(let i=0;i<4;i++){
      const p=doc.addPage([300,400]); p.setMediaBox(10,20,300,400); p.setCropBox(35,50,220,290);
      p.setRotation(lib.degrees(i*90));
      p.drawRectangle({x:35,y:50,width:220,height:290,color:lib.rgb(.95,.95,.95)});
      p.drawRectangle({x:45,y:60,width:40,height:60,color:lib.rgb(1,0,0)});
      p.drawText('VECTOR_'+i,{x:70,y:260,font,size:18});
      records.push({id:'p'+i,sourceId:'s',index:i,rotation:90,crop:{x:40,y:55,width:200,height:270},
        annotations:[{type:'box',frame:[1,0,0,1,0,0],x:80,y:100,width:60,height:30,color:'#0000ff',thickness:3}]});
    }
    const sources=new Map([['s',{doc}]]), originals=await assemblePdf(records,sources,'Original');
    const imposed=await imposePdf(records,sources,{rows:2,columns:2,orientation:'portrait',margin:10,gap:5});
    const options={isEvalSupported:false,cMapUrl:location.origin+'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:location.origin+'/vendor/pdfjs/standard_fonts/'};
    const ot=pdfjs.getDocument({...options,data:originals}), nt=pdfjs.getDocument({...options,data:imposed});
    try {
      const original=await ot.promise, output=await nt.promise;
      pdfjs.PagesMapper.instance.pagesNumber=1;
      const out=await output.getPage(1),view=out.getViewport({scale:1});
      const actual=document.createElement('canvas'); actual.width=Math.ceil(view.width);actual.height=Math.ceil(view.height);
      await out.render({canvasContext:actual.getContext('2d'),viewport:view}).promise;
      const expected=document.createElement('canvas');expected.width=actual.width;expected.height=actual.height;
      const ctx=expected.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,expected.width,expected.height);
      const mm=72/25.4,cw=(view.width-25*mm)/2,ch=(view.height-25*mm)/2;
      for(let i=0;i<4;i++){
        pdfjs.PagesMapper.instance.pagesNumber=4;
        const p=await original.getPage(i+1),v=p.getViewport({scale:1});
        const s=Math.min(cw/v.width,ch/v.height),x=10*mm+(i%2)*(cw+5*mm)+(cw-v.width*s)/2;
        const y=10*mm+Math.floor(i/2)*(ch+5*mm)+(ch-v.height*s)/2;
        await p.render({canvasContext:ctx,viewport:p.getViewport({scale:s}),transform:[1,0,0,1,x,y],background:'rgba(0,0,0,0)'}).promise;
      }
      const a=actual.getContext('2d').getImageData(0,0,actual.width,actual.height).data,b=ctx.getImageData(0,0,expected.width,expected.height).data;
      let different=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>90)different++;
      const text=await out.getTextContent(),operators=await out.getOperatorList();
      return{pixelDifference:different/(actual.width*actual.height),text:text.items.map(i=>i.str).join(' '),
        imageOperators:operators.fnArray.filter(n=>[pdfjs.OPS.paintImageXObject,pdfjs.OPS.paintInlineImageXObject].includes(n)).length};
    }finally{await ot.destroy();await nt.destroy();}
  });
  expect(outcome.text.match(/VECTOR_\d/g)).toEqual(['VECTOR_0','VECTOR_1','VECTOR_2','VECTOR_3']);
  expect(outcome.imageOperators).toBe(0);
  expect(outcome.pixelDifference).toBeLessThan(.005);
});

test('imposition retains original JPEG bytes and searchable Chinese annotation / OCR text', async ({page}) => {
  await page.goto('/'); await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled','false');
  const result=await page.evaluate(async()=>{
    const lib=await import('/vendor/pdf-lib/pdf-lib.mjs');
    const {imposePdf}=await import('/imposition-core.mjs');
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=320;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#d0a35c';ctx.fillRect(0,0,640,320);
    const jpeg=new Uint8Array(await (await new Promise(r=>canvas.toBlob(r,'image/jpeg',.92))).arrayBuffer());
    const doc=await lib.PDFDocument.create(),image=await doc.embedJpg(jpeg);
    doc.addPage([320,160]).drawImage(image,{x:0,y:0,width:320,height:160});
    const record={id:'image',sourceId:'image',index:0,
      annotations:[{type:'text',frame:[1,0,0,-1,0,160],x:20,y:20,fontSize:16,text:'拼版標記',color:'#000000'}],
      ocr:{mode:'ocr',frame:[1,0,0,-1,0,160],lines:[{x:20,y:60,width:180,height:20,text:'中文辨識文字'}]}};
    const bytes=await imposePdf([record],new Map([['image',{doc}]]),{});
    const output=await lib.PDFDocument.load(bytes);
    const images=output.context.enumerateIndirectObjects().map(([,v])=>v).filter(v=>v instanceof lib.PDFRawStream && v.dict.get(lib.PDFName.of('Subtype'))===lib.PDFName.of('Image'));
    const intact=images.some(v=>v.contents.length===jpeg.length&&v.contents.every((b,i)=>b===jpeg[i]));
    return {bytes:[...bytes],intact};
  });
  expect(result.intact).toBe(true);
  const [sheet]=await inspectPdf(page,Buffer.from(result.bytes));
  expect(sheet.text.replace(/\s/g,'')).toContain('拼版標記');
  expect(sheet.text.replace(/\s/g,'')).toContain('中文辨識文字');
  expect(sheet.hiddenModes).toContain(3);
});
