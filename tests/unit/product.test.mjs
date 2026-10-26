import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnosticSnapshot,storedSummary,backupState,readableBytes} from '../../dist/product-core.mjs';

test('diagnostics use an allowlist and cannot include document, error or browser secrets',()=>{
  const secret='private-SECRET-123';
  const result=diagnosticSnapshot({userAgent:'Chrome/145 '+secret,task:'capture',pages:3,sources:2,selected:1,autosave:true,secureContext:true,
    filename:secret,workspace:secret,password:secret,url:'https://host/'+secret,stack:secret,ocr:{text:secret},error:new Error(secret),issues:['FILE_IMPORT',secret,'STORAGE'],custom:{secret}});
  assert.ok(!JSON.stringify(result).includes(secret));assert.equal(result.browser,'Chrome');assert.equal(result.task,'capture');assert.deepEqual(result.issues,['FILE_IMPORT','STORAGE']);assert.deepEqual(result.workspace,{pages:3,sources:2,selected:1,autosave:true});
});
test('diagnostics bound malformed counts, enum values and issue history',()=>{
  const value=diagnosticSnapshot({pages:Infinity,sources:-1,selected:1000000,task:'<script>',issues:Array(30).fill('DEMO')});
  assert.equal(value.workspace.pages,0);assert.equal(value.workspace.sources,0);assert.equal(value.workspace.selected,100000);assert.equal(value.task,'all');assert.equal(value.issues.length,10);assert.equal(value.environment.persistentStorage,null);assert.equal(diagnosticSnapshot({persistentStorage:false}).environment.persistentStorage,false);assert.equal(diagnosticSnapshot({persistentStorage:true}).environment.persistentStorage,true);
});
test('storage summaries distinguish missing drafts, layout-only work and corrupted metadata',()=>{
  assert.equal(storedSummary(null).hasDraft,false);
  const value=storedSummary({updatedAt:123,project:{sources:[{size:100},{size:200}],pages:[],layout:{created:true,sheetCount:2,items:[]},name:'private'}});
  assert.deepEqual(value,{revision:null,savedAt:123,pages:0,sources:2,sourceBytes:300,sheets:2,hasDraft:true});assert.ok(!JSON.stringify(value).includes('private'));
  assert.throws(()=>storedSummary({project:{sources:[null],pages:[],layout:{}}}));
});
test('backup reminders use the saved revision and never claim a file was saved to disk',()=>{
  assert.equal(backupState({hasDraft:false},0),'沒有已存草稿');assert.equal(backupState({hasDraft:true,revision:2},null),'尚未產生專案備份');assert.equal(backupState({hasDraft:true,revision:2},30,1),'備份後仍有更新');assert.equal(backupState({hasDraft:true,revision:2},30,2),'已產生此草稿的備份');assert.equal(backupState({hasDraft:true,revision:2},30,null),'已產生備份，尚未確認與已存草稿一致');assert.equal(readableBytes(NaN),'尚無資訊');
});
