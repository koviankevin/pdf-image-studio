import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';

test('fieldset readiness uses the real disabled-state helper instead of the generic enabled matcher',async()=>{
 const root=new URL('../../dist/',import.meta.url),ids=new Set();for(const file of await readdir(root)){if(!/\.(?:html|mjs)$/.test(file))continue;const source=await readFile(new URL(file,root),'utf8');for(const match of source.matchAll(/<fieldset\b[^>]*\bid=["']([^"']+)/g))ids.add(match[1]);}
 assert.ok(ids.size>0);const group=[...ids].map(id=>id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
 const invalid=new RegExp("\\.locator\\(\\s*(['\"])#(?:"+group+")\\1\\s*\\)\\s*\\)\\s*\\.toBe(?:Enabled|Disabled)\\s*\\(",'g');

 const id=[...ids][0];for(const matcher of ['toBeEnabled','toBeDisabled'])assert.equal([...`await expect(page.locator('#${id}')).${matcher}();`.matchAll(invalid)].length,1,'policy must detect the forbidden fieldset matcher');
 assert.equal([...`await expectControlEnabled(page.locator('#${id}'));`.matchAll(invalid)].length,0);assert.equal([..."await expect(page.locator('#ocr-start')).toBeEnabled();".matchAll(invalid)].length,0);
 for(const directory of ['browser','compatibility'])for(const file of await readdir(new URL('../'+directory+'/',import.meta.url))){if(!file.endsWith('.spec.mjs'))continue;const source=await readFile(new URL('../'+directory+'/'+file,import.meta.url),'utf8');assert.equal([...source.matchAll(invalid)].length,0,`${directory}/${file}: use expectControlEnabled for fieldset readiness`);}
});
