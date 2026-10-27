import {removeNativeText} from './native-stream.mjs?v=20261028-hub1';
import {PDFDocument,degrees} from './vendor/pdf-lib/pdf-lib.mjs';
import {parsePages} from './utils.mjs';
import {drawPageExtras,embedChineseFont} from './document-model.mjs?v=20261028-hub1';
import {checkpoint} from './cancellation.mjs';

export function parseSplitRanges(text,count){
  if(!text.trim())throw new Error('請輸入拆分範圍，例如 1-3; 4-8。');
  const parts=text.replace(/；/g,';').split(/[;\n]/).map(s=>s.trim()).filter(Boolean);
  if(!parts.length||parts.length>500)throw new Error('請設定 1 至 500 組拆分範圍。');
  const groups=parts.map(part=>parsePages(part,count));
  if(groups.reduce((n,g)=>n+g.length,0)>2000)throw new Error('拆分後總計超過 2,000 頁，請分批處理。');
  return groups;
}

export function viewportCrop(viewport,crop){
  if(!crop)return{x:0,y:0,width:viewport.width,height:viewport.height};
  const rect=viewport.convertToViewportRectangle([crop.x,crop.y,crop.x+crop.width,crop.y+crop.height]);
  return{x:Math.min(rect[0],rect[2]),y:Math.min(rect[1],rect[3]),width:Math.abs(rect[2]-rect[0]),height:Math.abs(rect[3]-rect[1])};
}
export function selectionToCrop(viewport,selection){
  const {x,y,width,height}=selection;
  if(![x,y,width,height].every(Number.isFinite)||x<0||y<0||width<=0||height<=0||x+width>1.000001||y+height>1.000001)throw new Error('框選範圍須在頁面內，寬度與高度必須大於 0。');
  const a=viewport.convertToPdfPoint(x*viewport.width,y*viewport.height),b=viewport.convertToPdfPoint((x+width)*viewport.width,(y+height)*viewport.height);
  return{x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),width:Math.abs(b[0]-a[0]),height:Math.abs(b[1]-a[1])};
}

// Position is the first moved page's final, one-based position.
export function movePages(pages,ids,position){
  const selected=new Set(ids),moving=pages.filter(p=>selected.has(p.id)),rest=pages.filter(p=>!selected.has(p.id));
  if(!moving.length)throw new Error('請先勾選要移動的頁面。');
  if(!Number.isInteger(position)||position<1||position>rest.length+1)throw new Error(`移動位置須介於 1 至 ${rest.length+1}。`);
  return [...rest.slice(0,position-1),...moving,...rest.slice(position-1)];
}

export async function assemblePdf(pages,sources,title,{signal}={}){
  signal?.throwIfAborted();
  if(!pages.length)throw new Error('請至少選取一頁。');
  const output=await PDFDocument.create(),groups=new Map(),copied=new Map();
  const fonts=new Map();const getFont=(name='sans')=>{if(!fonts.has(name))fonts.set(name,embedChineseFont(output,name));return fonts.get(name);};
  for(const page of pages){if(!groups.has(page.sourceId))groups.set(page.sourceId,[]);groups.get(page.sourceId).push(page);}
  // Copy a source's pages together so fonts and other shared resources are reused.
  for(const [sourceId,group] of groups){
    await checkpoint(signal);
    const source=sources.get(sourceId);if(!source)throw new Error('找不到來源 PDF，請重新加入檔案。');
    let input=source.doc,indices=group.map(page=>page.index);
    if(group.some(page=>page.annotations?.some(mark=>mark.type==='native'))){
      input=await PDFDocument.create();const prepared=await input.copyPages(source.doc,indices);
      for(let i=0;i<prepared.length;i++){await checkpoint(signal);await removeNativeText(prepared[i],(group[i].annotations||[]).filter(mark=>mark.type==='native'));input.addPage(prepared[i]);}
      indices=prepared.map((_,i)=>i);
    }
    // Copy only reachable rewritten page objects into the output; old content
    // streams in the temporary document must not survive as orphan objects.
    const newPages=await output.copyPages(input,indices);
    group.forEach((page,index)=>copied.set(page.id,newPages[index]));
  }
  for(const [index,page] of pages.entries()){
    if(index%16===0)await checkpoint(signal);
    const copy=copied.get(page.id);
    await drawPageExtras(output,copy,page,getFont);
    copy.setRotation(degrees(((copy.getRotation().angle+(page.rotation||0))%360+360)%360));
    if(page.crop){const {x,y,width,height}=page.crop;if(![x,y,width,height].every(Number.isFinite)||width<=0||height<=0)throw new Error('無效的裁切範圍。');copy.setCropBox(x,y,width,height);}
    output.addPage(copy);
  }
  output.setTitle(title);output.setProducer('紙間');output.setCreator('紙間');
  await checkpoint(signal);
  const bytes=await output.save();signal?.throwIfAborted();return bytes;
}
