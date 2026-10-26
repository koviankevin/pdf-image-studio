import test from 'node:test';
import assert from 'node:assert/strict';
import {writeRelease,canonicalBytes} from '../../scripts/release-manifest.mjs';
test('release metadata is bound to the complete current website source',async()=>{
  const info=await writeRelease({check:true});assert.match(info.buildId,/^[a-f0-9]{64}$/);assert.ok(info.files>100);
});
test('release hashing normalizes checkout line endings without changing binary payloads',()=>{
  assert.equal(canonicalBytes(Buffer.from('a\r\nb\r\n')).toString(),'a\nb\n');
  const binary=Buffer.from([0,13,10,255,1]);assert.deepEqual(canonicalBytes(binary),binary);
});
