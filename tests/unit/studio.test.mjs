import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,PDFName,PDFRawStream} from '../../dist/vendor/pdf-lib/pdf-lib.mjs';
import {composeFreePdf,validateFreeLayout} from '../../dist/free-layout-core.mjs';
import {cropTargets,batchCropEdits} from '../../dist/batch-crop.mjs';
import {comparePixels} from '../../dist/compare-core.mjs';
import {mergeRegionLines,ocrLineVisible} from '../../dist/ocr-region.mjs';
import {cleanTemplate,readTemplates,encodeTemplates} from '../../dist/template-core.mjs';

const slot=(id,sheet=0)=>({id,sheet,type:'page',record:{sourceId:'s',index:0},x:10,y:10,width:50,height:60});
test('multi-sheet geometry accepts old projects and bounds per-sheet and total complexity',()=>{
  validateFreeLayout({orientation:'portrait',items:[slot('old')]});
  validateFreeLayout({orientation:'portrait',sheetCount:2,items:Array.from({length:60},(_,index)=>slot(String(index),index%2))});
  for(const changed of [{sheetCount:21},{activeSheet:-1},{items:[slot('invalid',2)]},{items:Array.from({length:31},(_,index)=>slot(String(index)))}])assert.throws(()=>validateFreeLayout({orientation:'portrait',sheetCount:2,items:[slot('a')],...changed}));
});
test('300 repeated pieces on 20 sheets share one raster resource and keep blank sheets',async()=>{
  const document=await PDFDocument.create(),image=await document.embedPng(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'));document.addPage([200,200]).drawImage(image,{x:0,y:0,width:200,height:200});
  const items=Array.from({length:300},(_,index)=>slot(String(index),Math.floor(index/30))),data=await composeFreePdf({orientation:'portrait',sheetCount:20,items},new Map([['s',{doc:document}]]));
  const result=await PDFDocument.load(data),images=result.context.enumerateIndirectObjects().filter(([,object])=>object instanceof PDFRawStream&&object.dict.get(PDFName.of('Subtype'))===PDFName.of('Image'));
  assert.equal(result.getPageCount(),20);assert.equal(images.length,1);assert.ok(data.length<500000);assert.equal(document.getPageCount(),1);
});
test('batch crop selects current order and maps display percentages without changing input',async()=>{
  const pages=Array.from({length:5},(_,index)=>({id:String(index),rotation:index===1?90:0}));
  assert.deepEqual(cropTargets(pages,[pages[3],pages[0]],'selected').map(page=>page.id),['0','3']);assert.deepEqual(cropTargets(pages,[],'odd').map(page=>page.id),['0','2','4']);assert.deepEqual(cropTargets(pages,[],'even').map(page=>page.id),['1','3']);assert.throws(()=>cropTargets(pages,[],'bad'));
  const selection={x:.1,y:.2,width:.5,height:.4},viewport={width:200,height:100,convertToPdfPoint:(x,y)=>[10+x,110-y]},edits=await batchCropEdits(pages,selection,90,async()=>viewport);
  for(const [key,value]of Object.entries({x:30,y:50,width:100,height:40}))assert.ok(Math.abs(edits[0].crop[key]-value)<1e-9);assert.deepEqual(edits.map(page=>page.rotation),[90,180,90,90,90]);assert.equal(pages[0].crop,undefined);
  const controller=new AbortController();controller.abort();await assert.rejects(batchCropEdits(pages,selection,0,async()=>viewport,{signal:controller.signal}),{name:'AbortError'});
});
test('pixel comparison ignores tolerated antialiasing and detects changed pixels with bounded buffers',()=>{
  const a=new Uint8ClampedArray([255,255,255,255,0,0,0,255]),b=new Uint8ClampedArray([245,245,245,255,255,255,255,255]),copy=a.slice();
  const result=comparePixels(a,b,2,1,28);assert.equal(result.changed,1);assert.equal(result.total,2);assert.deepEqual(a,copy);assert.deepEqual([...result.overlay.slice(4)],[197,44,79,255]);assert.equal(comparePixels(a,a,2,1).changed,0);
  assert.throws(()=>comparePixels(a,b,1201,1));assert.throws(()=>comparePixels(a,b,2,1,-1));assert.throws(()=>comparePixels(a,b,2,2));
});
test('regional OCR replaces overlap but preserves earlier text in source coordinates',()=>{
  const line=(text,x,y)=>({text,x,y,width:20,height:10,confidence:90}),previous={mode:'ocr',frame:[1,0,0,1,0,0],lines:[line('above',0,0),line('replace',50,50),line('below',120,120)]};
  const viewport={transform:[1,0,0,1,-40,-40],width:60,height:60},result=mergeRegionLines(previous,[line('new',10,10)],viewport);
  const vertical={text:'vertical',x:0,y:0,width:20,height:10};assert.equal(ocrLineVisible(vertical,[0,1,-1,0,100,0],{x:90,y:0,width:10,height:20}),true);assert.equal(ocrLineVisible(vertical,[0,1,-1,0,100,0],{x:0,y:0,width:10,height:20}),false);
  assert.deepEqual(result.map(line=>line.text),['above','new','below']);assert.deepEqual([result[0].x,result[0].y],[0,0]);assert.deepEqual([result[2].x,result[2].y],[120,120]);assert.deepEqual(result[0].frame,previous.frame);assert.equal(previous.lines[1].text,'replace');
});
const template=()=>({settings:{dpi:'600',format:'png','max-edge':'0','jpeg-quality':'95','nup-preset':'4','nup-rows':'2','nup-columns':'2','nup-orientation':'portrait','nup-margin':'10','nup-gap':'5','blank-orientation':'portrait','batch-header':'','batch-footer':'第 {page} 頁','batch-start':'1','batch-size':'10','batch-align':'center','batch-margin':'8','batch-color':'#454545','image-page-size':'a4','image-orientation':'portrait','image-margin':'24','ocr-mode':'auto','ocr-language':'eng','ocr-layout':'auto'},layout:{orientation:'portrait',sheetCount:2,items:[{...slot('a',1),record:{sourceId:'private.pdf',index:0,ocr:{lines:['secret']}}}]}});
test('templates retain only settings and layout slots, and reject malformed or excessive data',()=>{
  const value=template(),clean=cleanTemplate({...value,password:'secret'}),encoded=encodeTemplates([{id:'one',name:'講義',...clean}]);
  for(const secret of ['private.pdf','secret','sourceId','record','password'])assert.ok(!encoded.includes(secret));assert.equal(readTemplates(encoded)[0].layout.sheetCount,2);assert.deepEqual(readTemplates(null),[]);
  assert.throws(()=>cleanTemplate({...value,settings:{...value.settings,dpi:'9999'}}));assert.throws(()=>cleanTemplate({...value,layout:{...value.layout,sheetCount:500}}));assert.throws(()=>readTemplates('{'));assert.throws(()=>readTemplates('x'.repeat(1024*1024+1)));
  assert.throws(()=>readTemplates(JSON.stringify({version:1,templates:Array.from({length:21},(_,index)=>({id:String(index),name:'x',...clean}))})));
});

test('blank sheets export without inventing source pages',async()=>{
  const bytes=await composeFreePdf({orientation:'landscape',created:true,sheetCount:3,items:[]},new Map());const result=await PDFDocument.load(bytes);assert.equal(result.getPageCount(),3);
});
test('rotated regional OCR preserves the exact baseline frame and dimensions of retained lines',()=>{
  const frame=[1,0,0,-1,0,400],old={text:'KEEP',x:10,y:20,width:80,height:10,confidence:99},previous={mode:'ocr',frame,lines:[old]},result=mergeRegionLines(previous,[],{transform:[0,1,1,0,-100,0],width:50,height:50});assert.equal(result.length,1);assert.equal(result[0].width,80);assert.equal(result[0].height,10);assert.deepEqual(result[0].frame,frame);assert.equal(result[0].x,old.x);assert.equal(result[0].y,old.y);
});
test('template storage capacity is measured in UTF-8 bytes',()=>{
  const clean=cleanTemplate(template()),title={type:'text',sheet:0,x:1,y:1,width:10,height:10,text:'字'.repeat(200),fontSize:6,color:'#454545'},large={...clean,layout:{orientation:'portrait',sheetCount:10,items:Array.from({length:300},(_,index)=>({...title,sheet:Math.floor(index/30)}))}},text=JSON.stringify({version:1,templates:Array.from({length:10},(_,index)=>({id:String(index),name:'large',...large}))});assert.ok(text.length<1024*1024);assert.ok(new TextEncoder().encode(text).length>1024*1024);assert.throws(()=>readTemplates(text),/過大/);
});
