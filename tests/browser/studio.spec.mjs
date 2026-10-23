import {test,expect} from './fixtures.mjs';
import {createFixtures} from '../support/pdfs.mjs';
import {downloadBytes,inspectPdf} from '../support/ocr-pdf.mjs';
import {PDFDocument,StandardFonts,PDFName,PDFRawStream,decodePDFRawStream} from '../../dist/vendor/pdf-lib/pdf-lib.mjs';
import {createHash} from 'node:crypto';
import {comparisonFiles} from '../support/comparison.mjs';
import {unpackProject} from '../../dist/project-files.mjs';

async function ready(page){await page.goto('/');await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled','false');}
async function load(page,ids=['A']){const before=Number(await page.locator('#page-count').textContent()),{sources}=await createFixtures();await page.locator('#file-input').setInputFiles(ids.map(id=>({name:sources.get(id).name,mimeType:'application/pdf',buffer:Buffer.from(sources.get(id).bytes)})));await expect(page.locator('#file-input')).toBeEnabled();await expect(page.locator('#page-count')).toHaveText(String(before+ids.reduce((n,id)=>n+(id==='A'?2:3),0)));}
const saved=page=>expect(page.locator('#autosave-status')).toContainText(/已儲存|已還原/,{timeout:20000});
const output=async page=>inspectPdf(page,await downloadBytes(page,page.locator('#export-pdf')));
async function free(page){await page.locator('#free-layout').click();await expect(page.locator('#free-preview')).toBeEnabled();}
async function twoSheets(page){await free(page);const id=await page.locator('#free-item option').nth(1).getAttribute('value');await page.locator('#free-sheet-add').click();await page.locator('#free-sheet-select').selectOption('0');await page.locator('#free-item').selectOption(id);await page.locator('#free-move-sheet').selectOption('1');await page.locator('#free-move-item').click();await expect(page.locator('#free-sheet-select')).toHaveValue('1');}

test('multiple A4 sheets retain vector text, cross-sheet moves, undo, recovery and portable backups',{tag:'@compatibility'},async({page})=>{
  await ready(page);await load(page);await twoSheets(page);await expect(page.locator('#free-sheet [data-item]')).toHaveCount(1);
  await page.locator('#free-undo').click();await expect(page.locator('#free-sheet-select')).toHaveValue('0');await expect(page.locator('#free-sheet [data-item]')).toHaveCount(2);await page.locator('#free-redo').click();await expect(page.locator('#free-sheet-select')).toHaveValue('1');
  await page.locator('#free-sheet-remove').click();await expect(page.locator('#free-sheet-select option')).toHaveCount(1);await page.locator('#free-undo').click();await expect(page.locator('#free-sheet-select option')).toHaveCount(2);
  await page.locator('#free-preview').click();await expect(page.locator('#proof-download')).toBeEnabled();const document=await inspectPdf(page,await downloadBytes(page,page.locator('#proof-download')));expect(document).toHaveLength(2);expect(document[0].text).toContain('SOURCE_A_PAGE_2');expect(document[1].text).toContain('SOURCE_A_PAGE_1');expect(document.every(item=>Math.abs(item.width-595.276)<.01)).toBe(true);await page.locator('#proof-close').click();
  await saved(page);await page.reload();await expect(page.locator('#free-dialog')).toBeVisible();await expect(page.locator('#free-sheet-select option')).toHaveCount(2);await expect(page.locator('#free-sheet-select')).toHaveValue('1');await expect(page.locator('#free-sheet [data-item]')).toHaveCount(1);await page.locator('#free-close').click();
  await page.locator('#project-panel summary').click();const backup=await unpackProject(new Blob([await downloadBytes(page,page.locator('#project-backup'))]));expect(backup.project.layout.sheetCount).toBe(2);expect(backup.project.layout.items.map(item=>item.sheet??0)).toEqual([1,0]);
  expect((await output(page)).map(item=>item.text.trim())).toEqual(['SOURCE_A_PAGE_1','SOURCE_A_PAGE_2']);
});

test('batch crop uses displayed proportions on even pages and restores every page with one undo',{tag:'@compatibility'},async({page})=>{
  await ready(page);await load(page,['A','B']);await page.getByRole('button',{name:'旋轉第 2 頁',exact:true}).click();await expect(page.locator('#file-input')).toBeEnabled();const before=await output(page);
  await page.getByRole('button',{name:'框選第 1 頁',exact:true}).click();await expect(page.locator('#crop-controls')).toBeEnabled();for(const [key,value]of [['x','10'],['y','20'],['width','50'],['height','40']])await page.locator('#crop-'+key).fill(value);await page.locator('.batch-crop-settings summary').click();await page.locator('#crop-batch-scope').selectOption('even');await page.locator('#crop-batch-apply').click();await expect(page.locator('#crop-dialog')).not.toBeVisible();await expect(page.locator('#file-input')).toBeEnabled();
  const after=await output(page);for(let index=0;index<5;index++){if(index%2===0)expect(after[index].pixelHash).toBe(before[index].pixelHash);else{expect(after[index].width).toBeCloseTo(before[index].width*.5,1);expect(after[index].height).toBeCloseTo(before[index].height*.4,1);}}
  await page.locator('#undo').click();expect((await output(page)).map(item=>item.pixelHash)).toEqual(before.map(item=>item.pixelHash));await page.locator('#redo').click();await saved(page);await page.reload();await expect(page.locator('#file-input')).toBeEnabled();expect((await output(page)).map(item=>item.pixelHash)).toEqual(after.map(item=>item.pixelHash));
});

test('cancelling a staged batch crop leaves original pages and controls usable',async({page})=>{
  await page.route('**/workspace.mjs*',async route=>{
    const response=await route.fetch(),original=await response.text();
    // Hold the real staging loop after page one has rendered. A fixed delay
    // can disappear between assertion polls on a busy runner.
    const body=original.replace('onProgress?.(index+1,edits.length);',"onProgress?.(index+1,edits.length);if(index===1)await new Promise(resolve=>window.releaseBatchCropStage=resolve);");
    expect(body).not.toBe(original);await route.fulfill({response,body});
  });
  await ready(page);await load(page,['A','B']);const before=await output(page);await page.getByRole('button',{name:'框選第 1 頁',exact:true}).click();await expect(page.locator('#crop-controls')).toBeEnabled();await page.locator('#crop-width').fill('50');await page.locator('.batch-crop-settings summary').click();await page.locator('#crop-batch-apply').click();
  try{await expect(page.locator('#crop-status')).toContainText('2 / 5');await page.locator('#crop-batch-cancel').click();}
  finally{await page.evaluate(()=>window.releaseBatchCropStage?.());}
  await expect(page.locator('#crop-status')).toContainText('原有頁面全部保留');await page.locator('#crop-close').click();await expect(page.locator('#file-input')).toBeEnabled();expect((await output(page)).map(item=>item.pixelHash)).toEqual(before.map(item=>item.pixelHash));
});

async function mixedPdf(page){
  const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=800;canvas.height=250;const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,800,250);context.fillStyle='black';context.font='bold 58px Arial';context.fillText('REGION ALPHA 123',30,125);return [...Uint8Array.from(atob(canvas.toDataURL().split(',')[1]),character=>character.charCodeAt(0))];});
  const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),image=await doc.embedPng(new Uint8Array(png)),sheet=doc.addPage([500,500]);sheet.drawText('HEADER_NATIVE',{x:50,y:430,font,size:18});sheet.drawImage(image,{x:50,y:100,width:400,height:125});return doc.save();
}
async function originalVisualData(bytes){
  const doc=await PDFDocument.load(bytes),result=[];
  for(const [,stream]of doc.context.enumerateIndirectObjects())if(stream instanceof PDFRawStream){
    const data=decodePDFRawStream(stream).decode();
    const image=stream.dict.get(PDFName.of('Subtype'))===PDFName.of('Image');
    // The synthetic native header uses this original, unmodified text stream;
    // OCR text is independently checked through PDF.js's extracted text/modes.
    const native=new TextDecoder().decode(data).includes('<4845414445525F4E4154495645> Tj');
    if(image||native)result.push((image?'image:':'native:')+createHash('sha256').update(data).digest('hex'));
  }
  expect(result.filter(value=>value.startsWith('image:'))).toHaveLength(1);expect(result.filter(value=>value.startsWith('native:'))).toHaveLength(1);return result.sort();
}

test('region and forced OCR read mixed pages without cropping or changing visible output',{tag:'@compatibility'},async({page})=>{
  let original;
  // Render font glyph paths for exact visual comparisons across page reloads.
  // WebKit's system-font rasterization can differ with identical PDF streams;
  // retain strict pixel equality and also verify original image/content bytes.
  const output=async page=>{
    const bytes=await downloadBytes(page,page.locator('#export-pdf')),fingerprint=await originalVisualData(bytes);
    if(original)expect(fingerprint).toEqual(original);else original=fingerprint;
    return inspectPdf(page,bytes,{disableFontFace:true});
  };
  test.setTimeout(180000);await ready(page);const source=await mixedPdf(page);await page.locator('#file-input').setInputFiles({name:'mixed.pdf',mimeType:'application/pdf',buffer:Buffer.from(source)});await expect(page.locator('#file-input')).toBeEnabled();const before=await output(page);await page.locator('#ocr-language').selectOption('eng');await page.locator('#ocr-layout').selectOption('single-column');
  await page.getByRole('button',{name:'框選第 1 頁',exact:true}).click();await expect(page.locator('#crop-controls')).toBeEnabled();for(const [key,value]of [['x','10'],['y','55'],['width','80'],['height','25']])await page.locator('#crop-'+key).fill(value);await page.locator('#crop-ocr').click();await expect(page.locator('#ocr-dialog')).toBeVisible({timeout:120000});await expect(page.locator('#ocr-save')).toBeEnabled();await expect(page.locator('#ocr-lines')).toContainText('第 1 行');expect((await page.locator('#ocr-lines textarea').evaluateAll(elements=>elements.map(element=>element.value))).join(' ')).toContain('REGION ALPHA 123');
  await page.locator('#ocr-save').click();await page.locator('#ocr-close').click();const after=await output(page);expect(after[0].pixelHash).toBe(before[0].pixelHash);expect(after[0].width).toBe(500);expect(after[0].text).toContain('HEADER_NATIVE');expect(after[0].text).toContain('REGION ALPHA 123');expect(after[0].hiddenModes).toContain(3);
  await page.locator('#document-query').fill('HEADER_NATIVE');await expect(page.locator('#search-status')).toContainText('找到 1 頁');await page.locator('#document-query').fill('REGION ALPHA');await expect(page.locator('#search-status')).toContainText('找到 1 頁');await saved(page);await page.reload();await expect(page.locator('#file-input')).toBeEnabled();await page.locator('#document-query').fill('REGION ALPHA');await expect(page.locator('#search-status')).toContainText('找到 1 頁');
  await page.locator('#ocr-language').selectOption('eng');await page.locator('#ocr-mode').selectOption('force');await page.locator('#ocr-start').click();await expect(page.locator('#ocr-dialog')).toBeVisible({timeout:120000});await expect(page.locator('#ocr-save')).toBeEnabled();expect((await page.locator('#ocr-lines textarea').evaluateAll(elements=>elements.map(element=>element.value))).join(' ')).toContain('REGION ALPHA 123');expect(await page.locator('#ocr-lines textarea').first().getAttribute('readonly')).toBeNull();await page.locator('#ocr-close').click();const forced=await output(page);expect(forced[0].pixelHash).toBe(before[0].pixelHash);
  await page.getByRole('button',{name:'框選第 1 頁',exact:true}).click();await expect(page.locator('#crop-controls')).toBeEnabled();await page.locator('#crop-rotate-right').click();await expect(page.locator('#crop-controls')).toBeEnabled();for(const [key,value]of [['x','0'],['y','0'],['width','20'],['height','20']])await page.locator('#crop-'+key).fill(value);await page.locator('#crop-ocr').click();await expect(page.locator('#ocr-dialog')).toBeVisible({timeout:120000});await expect(page.locator('#ocr-save')).toBeEnabled();await page.locator('#ocr-save').click();await page.locator('#ocr-close').click();const retained=await output(page),sort=items=>items.slice().sort((a,b)=>a.text.localeCompare(b.text)||a.x-b.x||a.y-b.y);expect(sort(retained[0].textItems)).toEqual(sort(forced[0].textItems));expect(retained[0].pixelHash).toBe(before[0].pixelHash);await saved(page);await page.reload();await expect(page.locator('#file-input')).toBeEnabled();expect(sort((await output(page))[0].textItems)).toEqual(sort(forced[0].textItems));
});

test('personal templates restore settings and multi-sheet slots without saving document content',{tag:'@compatibility'},async({page})=>{
  await ready(page);await load(page);await twoSheets(page);await page.locator('#free-close').click();await page.locator('#dpi').selectOption('600');await page.locator('#max-edge').fill('0');await page.locator('#impose-pdf').click();await page.locator('#nup-preset').selectOption('4');await page.locator('#nup-orientation').selectOption('landscape');await page.locator('#nup-margin').fill('12');await page.locator('#nup-gap').fill('7');await page.locator('#nup-close').click();await page.locator('.batch-label-settings summary').click();await page.locator('#batch-footer').fill('講義 {page}');
  await page.locator('#template-panel summary').click();await page.locator('#template-name').fill('講義範本');await page.locator('#template-save').click();await expect(page.locator('#template-status')).toContainText('已儲存');const stored=await page.evaluate(()=>localStorage.getItem('shijian.templates.v1'));for(const secret of ['SOURCE_A','sourceId','thumbnail','preview','password','annotations'])expect(stored).not.toContain(secret);
  await page.locator('#dpi').selectOption('150');await page.locator('#max-edge').fill('800');await page.locator('#impose-pdf').click();await page.locator('#nup-margin').fill('0');await page.locator('#nup-close').click();await page.locator('#batch-footer').fill('改過');await free(page);await page.locator('#free-add-title').click();await expect(page.locator('#free-controls')).toBeEnabled();await page.locator('#free-close').click();await page.locator('#template-apply').click();await expect(page.locator('#template-status')).toContainText('已套用');await expect(page.locator('#dpi')).toHaveValue('600');await expect(page.locator('#max-edge')).toHaveValue('0');await expect(page.locator('#nup-margin')).toHaveValue('12');await expect(page.locator('#nup-orientation')).toHaveValue('landscape');await expect(page.locator('#batch-footer')).toHaveValue('講義 {page}');
  await free(page);await expect(page.locator('#free-sheet-select option')).toHaveCount(2);await expect(page.locator('#free-sheet [data-item]')).toHaveCount(1);await page.locator('#free-undo').click();await expect(page.locator('#free-sheet [data-item]')).toHaveCount(2);await page.locator('#free-redo').click();await page.locator('#free-close').click();await saved(page);await page.reload();await expect(page.locator('#file-input')).toBeEnabled();await page.locator('#template-panel summary').click();await expect(page.locator('#template-list option')).toHaveText('講義範本');
});

test('PDF comparison identifies identical, changed and missing pages and never modifies the workspace',{tag:'@compatibility'},async({page})=>{
  await ready(page);await page.locator('#file-input').setInputFiles(await comparisonFiles());await expect(page.locator('#file-input')).toBeEnabled();const before=await output(page);await page.locator('#compare-open').click();await expect(page.locator('#compare-status')).toContainText('未發現畫面差異');await expect(page.locator('#compare-next')).toBeEnabled();await page.locator('#compare-next').click();await expect(page.locator('#compare-status')).toContainText('紅色為差異位置');const bytes=await downloadBytes(page,page.locator('#compare-download'));const size=await page.evaluate(async data=>{const bitmap=await createImageBitmap(new Blob([new Uint8Array(data)]));const result=[bitmap.width,bitmap.height];bitmap.close();return result;},[...bytes]);expect(Math.max(...size)).toBeLessThanOrEqual(1200);
  await page.locator('#compare-next').click();await expect(page.locator('#compare-status')).toContainText('只存在於其中一份');await page.locator('#compare-scan').click();await expect(page.locator('#compare-status')).toContainText('已完成 3 頁，2 頁有畫面差異或缺頁');await expect(page.locator('#compare-results button')).toHaveCount(3);await page.locator('#compare-close').click();await expect(page.locator('#file-input')).toBeEnabled();expect((await output(page)).map(item=>item.pixelHash)).toEqual(before.map(item=>item.pixelHash));
});

test('320px layouts keep new controls inside the viewport',async({page})=>{
  await page.setViewportSize({width:320,height:850});await ready(page);await load(page);await page.locator('#template-panel summary').click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await twoSheets(page);expect(await page.locator('#free-dialog').evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);await page.locator('#free-close').click();await load(page,['B']);await page.locator('#compare-open').click();await expect(page.locator('#compare-next')).toBeEnabled();expect(await page.locator('#compare-dialog').evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);await page.locator('#compare-close').click();
});

test('an entirely blank multi-sheet PDF remains exportable and recoverable without sources',{tag:'@compatibility'},async({page})=>{
  await ready(page);await load(page);await free(page);await page.locator('#free-clear').click();await page.locator('#free-sheet-add').click();await page.locator('#free-sheet-add').click();await expect(page.locator('#free-sheet-select option')).toHaveCount(3);await page.locator('#free-preview').click();await expect(page.locator('#proof-download')).toBeEnabled();const document=await inspectPdf(page,await downloadBytes(page,page.locator('#proof-download')));expect(document).toHaveLength(3);expect(document.every(sheet=>!sheet.text.trim())).toBe(true);await page.locator('#proof-close').click();await page.locator('#free-close').click();await free(page);await expect(page.locator('#free-sheet [data-item]')).toHaveCount(0);await expect(page.locator('#free-sheet-select option')).toHaveCount(3);await page.locator('#free-close').click();await page.locator('#delete-selected').click();await expect(page.locator('#page-count')).toHaveText('0');await page.locator('#free-layout').click();await saved(page);await page.reload();await expect(page.locator('#free-dialog')).toBeVisible();await expect(page.locator('#free-sheet-select option')).toHaveCount(3);await expect(page.locator('#free-preview')).toBeEnabled();await page.locator('#free-close').click();await expect(page.locator('#reset')).toBeEnabled();await page.locator('#reset').click();await expect(page.locator('#file-input')).toBeEnabled();await expect(page.locator('#autosave-status')).toContainText(/已刪除|加入文件/);await expect(page.locator('#free-layout')).toBeDisabled();
});

test('template changes from another tab do not overwrite other saved templates',async({page,context,baseURL})=>{
  await ready(page);await page.locator('#template-panel summary').click();const other=await context.newPage();await other.goto(baseURL);await expect(other.locator('#file-input')).toBeEnabled();await other.locator('#template-panel summary').click();
  await page.locator('#template-name').fill('第一份');await page.locator('#template-save').click();await expect(page.locator('#template-status')).toContainText('已儲存');await other.locator('#template-name').fill('第二份');await other.locator('#template-save').click();await expect(other.locator('#template-status')).toContainText('已儲存');await expect(page.locator('#template-list option')).toHaveCount(2);await expect(other.locator('#template-list option')).toHaveCount(2);
  await page.locator('#template-name').fill('更新第一份');await page.locator('#template-update').click();await expect(page.locator('#template-status')).toContainText('已儲存');await other.locator('#template-delete').click();await expect(other.locator('#template-status')).toContainText('已刪除');await expect(page.locator('#template-list option')).toHaveText('更新第一份');await other.close();
});
