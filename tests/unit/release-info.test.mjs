import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReleaseInfo,diagnosticSnapshot} from '../../dist/product-core.mjs';
test('update metadata accepts only bounded version identifiers and content hashes',()=>{
  const value={version:'0.9.0',date:'2026-10-27',channel:'readiness',buildId:'a'.repeat(64),files:271};assert.deepEqual(validateReleaseInfo(value),value);
  for(const changes of [{version:'<script>'},{version:'9'.repeat(1000)+'.0.0'},{buildId:'private filename'},{files:Infinity},{files:10001},{date:'yesterday'},{channel:'private/'.repeat(50)}])assert.throws(()=>validateReleaseInfo({...value,...changes}));
  assert.equal(diagnosticSnapshot({buildId:value.buildId}).buildId,value.buildId);assert.equal(diagnosticSnapshot({buildId:'private'}).buildId,null);
});
