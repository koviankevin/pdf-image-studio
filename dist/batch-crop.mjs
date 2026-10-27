import {selectionToCrop} from './editor-core.mjs?v=20261027-replace1';
import {checkpoint} from './cancellation.mjs';

export function cropTargets(pages,selected,mode){
  if(!['selected','odd','even'].includes(mode))throw Error('請選擇裁切套用範圍。');
  const ids=new Set(selected.map(page=>page.id));
  return pages.filter((page,index)=>mode==='selected'?ids.has(page.id):(index+1)%2===(mode==='odd'?1:0));
}
export async function batchCropEdits(records,selection,rotationDelta,getViewport,{signal}={}){
  if(!records.length)throw Error('套用範圍沒有頁面。');
  if(![0,90,180,270].includes(rotationDelta))throw Error('旋轉角度無效。');
  const edits=[];
  for(const record of records){
    await checkpoint(signal);const rotation=((record.rotation||0)+rotationDelta)%360,viewport=await getViewport({...record,rotation,crop:null});
    const crop=selection.x===0&&selection.y===0&&selection.width===1&&selection.height===1?null:selectionToCrop(viewport,selection);
    edits.push({...record,rotation,crop});
  }
  return edits;
}
