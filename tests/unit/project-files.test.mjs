import test from 'node:test';
import assert from 'node:assert/strict';
import {packProject,unpackProject} from '../../dist/project-files.mjs';
import {zipSync,strToU8} from '../../dist/vendor/fflate/fflate.mjs';
import {validateDraft} from '../../dist/draft-store.mjs';

function fixture(){return {project:{version:1,name:'文件',sources:[{id:'s1',key:'document',name:'來源.pdf',size:4,count:1}],pages:[{id:'p1',sourceId:'s1',index:0,thumbnail:'thumb'}],selected:['p1'],assetKeys:['thumb'],receipts:[],layout:{orientation:'portrait',items:[]}},documents:new Map([['document',new Blob(['%PDF'],{type:'application/pdf'})]]),assets:new Map([['thumb',new Blob(['image'],{type:'image/jpeg'})]])};}
test('portable projects round-trip binary files and editable records without password data',async()=>{
  const value=fixture(),restored=await unpackProject(await packProject(value,'跨電腦'));
  assert.equal(restored.name,'跨電腦');assert.deepEqual(restored.project,value.project);assert.equal(await restored.documents.get('document').text(),'%PDF');assert.equal(restored.assets.get('thumb').type,'image/jpeg');
});
test('project archives reject unsupported formats, missing references and unsafe paths',async()=>{
  for(const entries of [{'../bad':new Uint8Array(1)},{'project.json':strToU8('{broken')},{'project.json':strToU8(JSON.stringify({format:'unknown',version:1,resources:[]}))},{'project.json':strToU8(JSON.stringify({format:'shijian-project',version:1,name:'missing',resources:[],project:fixture().project}))}]){
    await assert.rejects(unpackProject(new Blob([zipSync(entries,{level:0})])));
  }
});
test('ZIP expanded sizes are bounded before decompression allocates their output',async()=>{
  const data=zipSync({'project.json':strToU8('{}')},{level:0}),view=new DataView(data.buffer);
  for(let i=0;i<data.length-28;i++)if(view.getUint32(i,true)===0x02014b50){view.setUint32(i+24,251*1024*1024,true);break;}
  await assert.rejects(unpackProject(new Blob([data])),/過大|格式/);
});
test('DEFLATE streams are rejected even when their declared expanded size is forged',async()=>{
  const data=zipSync({'project.json':new Uint8Array(1024*1024)},{level:6}),view=new DataView(data.buffer);
  for(let i=0;i<data.length-28;i++)if(view.getUint32(i,true)===0x02014b50){view.setUint32(i+24,1,true);break;}
  await assert.rejects(unpackProject(new Blob([data])),/原始專案備份/);
});
test('imported editable records reject unsafe geometry, invalid marks, OCR and editor references',()=>{
  const changes=[v=>v.project.pages[0].rotation=NaN,v=>v.project.pages[0].crop={x:0,y:0,width:-2,height:10},v=>v.project.pages[0].annotations=[{id:'bad'}],v=>v.project.pages[0].ocr={mode:'ocr',frame:[1,0,0,1,0,0],lines:[{text:'a',x:0,y:0,width:1,height:Infinity,confidence:100}]},v=>v.project.layout.fieldChanges={},v=>v.project.editor={kind:'crop',pageId:'missing',fields:{},rotation:0}];
  for(const change of changes){const value=fixture();change(value);assert.throws(()=>validateDraft(value.project,value.documents,value.assets));}
});
