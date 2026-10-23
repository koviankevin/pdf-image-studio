import {test,expect} from './fixtures.mjs';
import {createFixtures} from '../support/pdfs.mjs';
import {PDFDocument,StandardFonts,degrees} from '../../dist/vendor/pdf-lib/pdf-lib.mjs';

async function ready(page){await page.goto('/');await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled','false');}
async function load(page){const {sources}=await createFixtures(),source=sources.get('A');await page.locator('#file-input').setInputFiles({name:source.name,mimeType:'application/pdf',buffer:Buffer.from(source.bytes)});await expect(page.locator('#page-count')).toHaveText('2');await expect(page.locator('#file-input')).toBeEnabled();}
const saved=page=>expect(page.locator('#autosave-status')).toContainText(/已儲存|已還原/,{timeout:20000});
async function panel(page){if(!await page.locator('#project-panel').evaluate(element=>element.open))await page.locator('#project-panel summary').click();}

test('blank generation locks the complete operation so reset and another import cannot interleave',{tag:'@compatibility'},async({page})=>{
  await page.route('**/page-operations.mjs*',async route=>{const response=await route.fetch(),body=(await response.text()).replace('await document.save()',`await (()=>{window.blankHeld=true;return new Promise(resolve=>window.releaseBlank=()=>document.save().then(resolve));})()`);await route.fulfill({response,body});});
  await ready(page);await load(page);await page.locator('#insert-blank').click();await expect.poll(()=>page.evaluate(()=>window.blankHeld)).toBe(true);
  await expect(page.locator('#reset')).toBeDisabled();await expect(page.locator('#file-input')).toBeDisabled();await expect(page.locator('#insert-blank')).toBeDisabled();
  await page.evaluate(()=>releaseBlank());await expect(page.locator('#page-count')).toHaveText('3');await expect(page.locator('#file-input')).toBeEnabled();
  await page.locator('#undo').click();await expect(page.locator('#page-count')).toHaveText('2');await page.locator('#redo').click();await expect(page.locator('#page-count')).toHaveText('3');await page.locator('#reset').click();await expect(page.locator('#page-count')).toHaveText('0');await expect(page.locator('#autosave-status')).toContainText(/已刪除|加入文件/);await expect(page.locator('#file-input')).toBeEnabled();
});

for(const stage of ['catalog-read','draft-open'])test(`startup recovers if another tab deletes the project during ${stage}`,{tag:'@compatibility'},async({page,context,baseURL})=>{
  const hold=`if(window.holdCatalogStartup){window.holdCatalogStartup=false;window.catalogHeld=true;await new Promise(resolve=>window.releaseCatalog=resolve);}`;
  await context.route(stage==='catalog-read'?'**/project-tools.mjs*':'**/autosave-tools.mjs*',async route=>{const response=await route.fetch(),source=await response.text(),body=stage==='catalog-read'?source.replace('const value=await catalog.read();active=value.active;',`const value=await catalog.read();${hold}active=value.active;`):source.replace('store = await openDraftStore',`${hold}store = await openDraftStore`);await route.fulfill({response,body});});
  await ready(page);await load(page);await saved(page);const other=await context.newPage();
  await other.addInitScript(()=>{if(!sessionStorage.getItem('held-catalog-once')){sessionStorage.setItem('held-catalog-once','true');window.holdCatalogStartup=true;}});await other.goto(baseURL);await expect.poll(()=>other.evaluate(()=>window.catalogHeld)).toBe(true);
  await panel(page);await page.locator('#project-new').click();await expect(page.locator('#page-count')).toHaveText('0');await expect(page.locator('#file-input')).toBeEnabled();await panel(page);await page.locator('#project-name').fill('保留的工作區');await page.locator('#project-rename').click();await expect(page.locator('#project-current')).toContainText('保留的工作區');
  await page.locator('#project-list').selectOption('legacy');page.once('dialog',dialog=>dialog.accept());await page.locator('#project-delete').click();await expect(page.locator('#project-status')).toContainText('已刪除');
  await other.evaluate(()=>releaseCatalog());await expect(other.locator('#dropzone')).toHaveAttribute('aria-disabled','false');await expect(other.locator('#project-current')).toContainText('保留的工作區');
  await load(other);await saved(other);await other.reload();await expect(other.locator('#page-count')).toHaveText('2');await expect(other.locator('#project-current')).toContainText('保留的工作區');await expect(other.locator('#file-input')).toBeEnabled();await other.close();
});

test('cropping across rotated native text keeps visible text searchable',{tag:'@compatibility'},async({page})=>{
  const source=await PDFDocument.create(),font=await source.embedFont(StandardFonts.Helvetica),sheet=source.addPage([200,200]);sheet.drawText('VERTICAL_VISIBLE',{x:100,y:10,size:12,font,rotate:degrees(90)});sheet.drawText('OUTSIDE',{x:5,y:20,size:8,font});
  await ready(page);await page.locator('#file-input').setInputFiles({name:'rotated-text.pdf',mimeType:'application/pdf',buffer:Buffer.from(await source.save())});await expect(page.locator('#file-input')).toBeEnabled();
  await page.getByRole('button',{name:'框選第 1 頁',exact:true}).click();await expect(page.locator('#crop-controls')).toBeEnabled();for(const [name,value]of [['x','42.5'],['y','65'],['width','10'],['height','10']])await page.locator('#crop-'+name).fill(value);await page.locator('#crop-apply').click();await expect(page.locator('#file-input')).toBeEnabled();
  await page.locator('#document-query').fill('VERTICAL_VISIBLE');await expect(page.locator('#search-status')).toContainText('找到 1 頁');await page.locator('#document-query').fill('OUTSIDE');await expect(page.locator('#search-status')).toContainText('找到 0 頁');
  await page.locator('#ocr-start').click();await expect(page.locator('#ocr-dialog')).toBeVisible();await expect(page.locator('#ocr-save')).toBeEnabled();await expect(page.locator('#ocr-lines textarea')).toHaveValue('VERTICAL_VISIBLE');
});

test('failed blank generation releases controls and retains the original pages',{tag:'@compatibility'},async({page})=>{
  await page.route('**/page-operations.mjs*',async route=>{const response=await route.fetch(),body=(await response.text()).replace('await document.save()',`await Promise.reject(Error('simulated blank generation failure'))`);await route.fulfill({response,body});});
  await ready(page);await load(page);await page.locator('#insert-blank').click();await expect(page.locator('#status')).toContainText('simulated blank generation failure');await expect(page.locator('#page-count')).toHaveText('2');await expect(page.locator('#file-input')).toBeEnabled();await expect(page.locator('#reset')).toBeEnabled();
  const download=page.waitForEvent('download');await page.locator('#export-pdf').click();expect((await download).suggestedFilename()).toMatch(/\.pdf$/);await expect(page.locator('#file-input')).toBeEnabled();
});

test('unavailable catalog reports unsaved state while original editing and backups remain usable',{tag:'@compatibility'},async({page})=>{
  await page.route('**/project-catalog.mjs*',async route=>{const response=await route.fetch(),body=(await response.text()).replace('read:()=>access()',`read:()=>Promise.reject(Error('simulated catalog failure'))`);await route.fulfill({response,body});});
  await ready(page);await expect(page.locator('#autosave-status')).toContainText('無法還原／儲存');await load(page);await panel(page);await expect(page.locator('#project-status')).toContainText('simulated catalog failure');await expect(page.locator('#project-new')).toBeDisabled();await expect(page.locator('#project-backup')).toBeEnabled();
  await page.locator('#rotate-selected').click();await expect(page.locator('#undo')).toBeEnabled();await page.locator('#undo').click();
  const backup=page.waitForEvent('download');await page.locator('#project-backup').click();expect((await backup).suggestedFilename()).toMatch(/\.shijian$/);await expect(page.locator('#autosave-status')).not.toContainText('已儲存');await expect(page.locator('#file-input')).toBeEnabled();
});
