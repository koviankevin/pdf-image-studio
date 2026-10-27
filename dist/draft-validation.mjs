const fail=()=>{throw Error('專案的頁面或編輯資料格式不正確。');};
const text=(value,max)=>typeof value==='string'&&value.length<=max;
const numbers=value=>Array.isArray(value)&&value.length===6&&value.every(Number.isFinite)&&Math.abs(value[0]*value[3]-value[1]*value[2])>1e-12;
export function validateMarks(marks){
  if(!Array.isArray(marks)||marks.length>100000)fail();const ids=new Set(),nativeIds=new Set();
  for(const mark of marks){
    if(!mark||!text(mark.id,100)||ids.has(mark.id)||!['text','highlight','arrow','box','replace','native'].includes(mark.type)||!numbers(mark.frame)||!/^#[\da-f]{6}$/i.test(mark.color)||!['x','y','width','height'].every(key=>Number.isFinite(mark[key])&&Math.abs(mark[key])<1e7)||!Number.isFinite(mark.fontSize)||mark.fontSize<2||mark.fontSize>120||!Number.isFinite(mark.thickness)||mark.thickness<1||mark.thickness>16||!text(mark.text,2000))fail();
    if(['replace','native'].includes(mark.type)&&(!['sans','serif'].includes(mark.font)||!/^#[\da-f]{6}$/i.test(mark.background)||mark.width<=0||mark.height<=0||mark.width>10000||mark.height>10000||!['paddingX','paddingY'].every(key=>Number.isFinite(mark[key])&&mark[key]>=0&&mark[key]<=1000)))fail();
    if(mark.type==='native'&&(!/^b\d{1,4}$/.test(mark.blockId)||!/^[\da-f]{64}$/.test(mark.sourceHash)||!mark.original||!['x','y','width','height'].every(k=>Number.isFinite(mark.original[k])&&Math.abs(mark.original[k])<1e7)||mark.original.width<=0||mark.original.height<=0))fail();
    if(mark.type==='native'){const key=mark.sourceHash+':'+mark.blockId;if(nativeIds.has(key))fail();nativeIds.add(key);}
    ids.add(mark.id);
  }
}
export function validateOcr(ocr){
  if(!ocr)return;
  if(!['ocr','native'].includes(ocr.mode)||!numbers(ocr.frame)||!Array.isArray(ocr.lines)||ocr.lines.length>100000)fail();
  for(const line of ocr.lines)if(!line||line.frame!==undefined&&!numbers(line.frame)||!text(line.text,1000000)||!['x','y','width','height'].every(key=>Number.isFinite(line[key])&&Math.abs(line[key])<1e7)||line.width<0||line.height<0||!Number.isFinite(line.confidence))fail();
}
export function validateRecord(record){
  if(!record||!text(record.id,100)||!text(record.sourceId,100)||!Number.isInteger(record.index)||record.index<0||!text(record.thumbnail,100))fail();
  if(record.rotation!==undefined&&(!Number.isInteger(record.rotation)||![0,90,180,270].includes(record.rotation)))fail();
  if(record.crop&&(!['x','y','width','height'].every(key=>Number.isFinite(record.crop[key])&&Math.abs(record.crop[key])<1e7)||record.crop.width<=0||record.crop.height<=0))fail();
  if(record.annotations!==undefined)validateMarks(record.annotations);validateOcr(record.ocr);
}
export function validateEditor(editor,pageIds){
  if(!editor)return;
  if(!['marks','crop','ocr'].includes(editor.kind))fail();
  if(editor.kind==='ocr'){
    if(!Array.isArray(editor.records)||editor.records.length>500||!Number.isInteger(editor.active)||editor.active<0||editor.active>=editor.records.length)fail();
    for(const item of editor.records){if(!pageIds.has(item.id))fail();validateOcr(item.ocr);}
  }else{
    if(!pageIds.has(editor.pageId)||!editor.fields||Object.keys(editor.fields).length>12||Object.values(editor.fields).some(value=>!text(value,2000)))fail();
    if(editor.kind==='marks')validateMarks(editor.marks);
    else if(![0,90,180,270].includes(editor.rotation)||editor.crop&&(!['x','y','width','height'].every(key=>Number.isFinite(editor.crop[key]))||editor.crop.width<=0||editor.crop.height<=0))fail();
  }
}
