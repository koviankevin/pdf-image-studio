import assert from 'node:assert/strict';
import {test,expect,expectControlEnabled} from './fixtures.mjs';

test('fieldset readiness waits for its own and inherited disabled states',{tag:'@compatibility'},async({page})=>{
 await page.setContent('<fieldset id="parent" disabled><fieldset id="child"><button>Continue</button></fieldset></fieldset>');
 const parent=page.locator('#parent'),child=page.locator('#child');
 await expect(parent).toHaveJSProperty('disabled',true);await expect(child).toHaveJSProperty('disabled',false);
 await assert.rejects(()=>expectControlEnabled(parent,{timeout:100}),/Control must be enabled/);
 await assert.rejects(()=>expectControlEnabled(child,{timeout:100}),/Control must be enabled/);
 await parent.evaluate(el=>el.disabled=false);await expectControlEnabled(parent);await expectControlEnabled(child);
 await child.evaluate(el=>el.disabled=true);await assert.rejects(()=>expectControlEnabled(child,{timeout:100}),/Control must be enabled/);
});
