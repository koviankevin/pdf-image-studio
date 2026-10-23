import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDraft,openDraftStore} from '../../dist/draft-store.mjs';
import {createExportReceipts} from '../../dist/workflow-core.mjs';

function fixture(){
  const documents=new Map([['document',new Blob(['%PDF-synthetic'],{type:'application/pdf'})]]), assets=new Map([['thumb',new Blob(['thumbnail'],{type:'image/jpeg'})]]);
  const project={version:1,name:'接續',sources:[{id:'s1',key:'document',name:'a.pdf',size:14,count:2}],pages:[{id:'p1',sourceId:'s1',index:1,thumbnail:'thumb'}],selected:['p1'],assetKeys:['thumb'],receipts:[],layout:{orientation:'portrait',items:[]}};
  return {project,documents,assets};
}
test('saved draft validates local document and thumbnail references, including free-layout-only sources',()=>{
  const {project,documents,assets}=fixture(); assert.equal(validateDraft(project,documents,assets),project);
  project.layout.items=[{type:'page',record:project.pages[0],preview:'thumb'}];project.pages=[];
  assert.equal(validateDraft(project,documents,assets),project);
});
test('missing documents, thumbnails, wrong versions and out-of-bounds source pages reject recovery',()=>{
  for(const change of [v=>v.project.version=2,v=>v.documents.clear(),v=>v.assets.clear(),v=>v.project.pages[0].index=2,v=>v.project.layout=null,v=>v.project.sources[0].size=NaN,v=>v.project.receipts={}]){
    const value=fixture();change(value);assert.throws(()=>validateDraft(value.project,value.documents,value.assets));
  }
  const value=fixture();value.project.layout.items=[{type:'page',record:value.project.pages[0],preview:'missing'}];assert.throws(()=>validateDraft(value.project,value.documents,value.assets),/預覽/);
});
test('a browser without IndexedDB reports a recoverable error',async()=>{
  await assert.rejects(openDraftStore(null),/不支援/);
});
test('export receipts round-trip without treating later edits as already exported',()=>{
  const page={id:'p1',sourceId:'s1',index:0},first=createExportReceipts();first.mark([page],[page]);
  const restored=createExportReceipts();restored.restore(structuredClone(first.capture()));assert.equal(restored.pending([page]),false);
  assert.equal(restored.pending([{...page,rotation:90}]),true);
});
