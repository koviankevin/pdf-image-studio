import test from 'node:test';
import assert from 'node:assert/strict';
import {replacementLayout} from '../../dist/replacement-core.mjs';
import {validateMarks,validateEditor} from '../../dist/draft-validation.mjs';
import {drawPageExtras} from '../../dist/document-model.mjs';
import {PDFDocument,StandardFonts} from '../../dist/vendor/pdf-lib/pdf-lib.mjs';
const mark=()=>({id:'replacement',type:'replace',frame:[1,0,0,-1,0,200],x:20,y:20,width:104,height:60,fontSize:20,thickness:2,color:'#18253e',background:'#ffffff',font:'serif',paddingX:2,paddingY:2,text:'更新文字甲乙'});
test('replacement wraps measured text and explicit lines without silently shrinking or truncating',()=>{
  const value=mark(),measure=text=>Array.from(text).length*20,result=replacementLayout(value,measure);
  assert.deepEqual(result.lines.map(v=>v.text),['更新文字甲','乙']);assert.equal(result.overflow,false);assert.ok(Math.abs(result.lines[1].y-result.lines[0].y-26)<1e-9);assert.equal(value.text,'更新文字甲乙');
  assert.equal(replacementLayout({...value,height:20},measure).overflow,true);assert.equal(replacementLayout({...value,width:10},measure).overflow,true);assert.equal(replacementLayout({...value,text:'',height:3,width:3},measure).overflow,false);
  assert.deepEqual(replacementLayout({...value,text:'甲\n乙'},measure).lines.map(v=>v.text),['甲','乙']);
});
test('replacement metadata is validated while original mark and editor drafts remain supported',()=>{
  validateMarks([mark()]);validateMarks([{...mark(),type:'text'}]);validateEditor({kind:'marks',pageId:'p',marks:[mark()],fields:Object.fromEntries(Array.from({length:10},(_,i)=>['field'+i,'']))},new Set(['p']));
  for(const patch of [{font:'remote-url'},{background:'url(x)'},{paddingX:-1},{paddingY:Infinity},{width:0},{height:10001},{font:undefined}])assert.throws(()=>validateMarks([{...mark(),...patch}]));
});
test('PDF replacement writes a background and searchable text using the selected font; overflow fails',async()=>{
  const doc=await PDFDocument.create(),page=doc.addPage([300,200]),font=await doc.embedFont(StandardFonts.TimesRoman),names=[];
  await drawPageExtras(doc,page,{annotations:[{...mark(),text:'New text'}]},async name=>{names.push(name);return font;});assert.deepEqual(names,['serif']);assert.ok((await doc.save()).length>500);
  await assert.rejects(drawPageExtras(doc,page,{annotations:[{...mark(),text:'This does not fit',height:3}]},async()=>font),/超出/);
  await drawPageExtras(doc,page,{annotations:[{...mark(),text:''}]},async()=>{throw Error('Blank covers should not embed unused fonts');});
});

test('long text has bounded measurement calls and ink bearings protect accents and descenders',()=>{
  let calls=0;const measure=text=>{calls++;return text.length*6;};measure.bounds=text=>({left:-2,right:text.length*6,ascent:21,descent:6});const value={...mark(),text:'a'.repeat(2000),fontSize:6,width:10000,height:100};const result=replacementLayout(value,measure);assert.equal(result.lines.map(l=>l.text).join('').length,2000);assert.ok(calls<10);assert.equal(result.lines[0].x,value.x+value.paddingX+2);assert.equal(replacementLayout({...mark(),text:'j',height:24},measure).overflow,true);
});
