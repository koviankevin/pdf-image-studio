import assert from 'node:assert/strict';
import {test,expect,expectControlEnabled} from './fixtures.mjs';

test('fieldset readiness waits for its own and inherited disabled states',{tag:'@compatibility'},async({page})=>{
 await page.setContent('<fieldset id="parent" disabled><fieldset id="child"><button>Continue</button></fieldset></fieldset>');
 // expect.poll can time out before formatting a matcher result on a loaded runner.
 // Accept its predicate timeout too; enabled controls must still pass below.
 const parent=page.locator('#parent'),child=page.locator('#child');
 await expect(parent).toHaveJSProperty('disabled',true);await expect(child).toHaveJSProperty('disabled',false);
 await assert.rejects(()=>expectControlEnabled(parent,{timeout:1000}),/Control must be enabled|Timeout \d+ms exceeded while waiting on the predicate/);
 await assert.rejects(()=>expectControlEnabled(child,{timeout:1000}),/Control must be enabled|Timeout \d+ms exceeded while waiting on the predicate/);
 await parent.evaluate(el=>el.disabled=false);await expectControlEnabled(parent);await expectControlEnabled(child);
 await child.evaluate(el=>el.disabled=true);await assert.rejects(()=>expectControlEnabled(child,{timeout:1000}),/Control must be enabled|Timeout \d+ms exceeded while waiting on the predicate/);
});
