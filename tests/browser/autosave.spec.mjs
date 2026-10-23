import {test, expect} from './fixtures.mjs';
import {createFixtures} from '../support/pdfs.mjs';
import {downloadBytes, inspectPdf} from '../support/ocr-pdf.mjs';
import {createScanPdf,scanCases} from '../support/scans.mjs';

async function load(page, ids = ['A']) {
  await page.goto('/'); await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled','false');
  const {sources} = await createFixtures();
  await page.locator('#file-input').setInputFiles(ids.map(id=>({name:sources.get(id).name,mimeType:'application/pdf',buffer:Buffer.from(sources.get(id).bytes)})));
  await expect(page.locator('#file-input')).toBeEnabled();
}
async function saved(page) { await expect(page.locator('#autosave-status')).toContainText(/已儲存|已還原/, {timeout:20000}); }
const warns = page => page.evaluate(()=>!window.dispatchEvent(new Event('beforeunload',{cancelable:true})));

test('closing the page restores sources, page order, selection, rotation and searchable annotations', {tag:'@compatibility'}, async ({page,context,baseURL})=>{
  await load(page,['A','B']);
  await page.getByRole('button',{name:'標記第 1 頁',exact:true}).click(); await expect(page.locator('#mark-fields')).toBeEnabled();
  await page.locator('[data-tool="text"]').click(); await page.locator('#mark-text').fill('紙間本機草稿'); await page.locator('#mark-center').click();
  await page.locator('#mark-save').click(); await expect(page.locator('#file-input')).toBeEnabled();
  await page.getByRole('button',{name:'旋轉第 2 頁',exact:true}).click(); await expect(page.locator('#file-input')).toBeEnabled();
  await page.getByRole('button',{name:'下移第 1 頁',exact:true}).click();
  await page.getByRole('checkbox',{name:'選取第 5 頁',exact:true}).uncheck(); await page.locator('#output-name').fill('接續編輯');
  await saved(page); expect(await warns(page)).toBe(false); await page.close();
  const next=await context.newPage(); await next.goto(baseURL); await expect(next.locator('#page-count')).toHaveText('5');
  await expect(next.locator('#file-input')).toBeEnabled(); await expect(next.locator('#output-name')).toHaveValue('接續編輯');
  await expect(next.locator('.page-card').first()).toContainText('已旋轉 90°'); await expect(next.locator('.page-card').nth(1)).toContainText('1 個標記');
  await expect(next.getByRole('checkbox',{name:'選取第 5 頁',exact:true})).not.toBeChecked();
  const output=await inspectPdf(next,await downloadBytes(next,next.locator('#export-pdf')));
  expect(output).toHaveLength(4); expect(output[0].text).toContain('SOURCE_A_PAGE_2'); expect(output[1].text).toContain('紙間本機草稿');
  expect(output[0].width).toBe(420); expect(output[0].height).toBe(320);
});

test('unapplied annotation text and crop fields resume in their editors', async ({page})=>{
  await load(page); await page.getByRole('button',{name:'標記第 1 頁',exact:true}).click(); await expect(page.locator('#mark-fields')).toBeEnabled();
  await page.locator('[data-tool="text"]').click(); await page.locator('#mark-center').click();
  await page.locator('#mark-text').fill('尚未按儲存的文字'); await saved(page); await page.reload();
  await expect(page.locator('#mark-dialog')).toBeVisible(); await expect(page.locator('#mark-text')).toHaveValue('尚未按儲存的文字');
  await expect(page.locator('#mark-overlay [data-mark]')).toHaveCount(1);
  await page.locator('#mark-close').click(); await saved(page);
  await page.getByRole('button',{name:'框選第 1 頁',exact:true}).click(); await expect(page.locator('#crop-controls')).toBeEnabled();
  await page.locator('#crop-rotate-right').click(); await expect(page.locator('#crop-controls')).toBeEnabled();
  await page.locator('#crop-width').fill('55'); await saved(page); await page.reload();
  await expect(page.locator('#crop-dialog')).toBeVisible(); await expect(page.locator('#crop-controls')).toBeEnabled();
  await expect(page.locator('#crop-width')).toHaveValue('55'); await page.locator('#crop-apply').click();
  await expect(page.locator('.page-card').first()).toContainText('已裁切'); await expect(page.locator('.page-card').first()).toContainText('已旋轉 90°');
});

test('free A4 positions, crops and an unblurred Chinese title survive reload', {tag:'@compatibility'}, async ({page})=>{
  await page.setViewportSize({width:390,height:1100}); await load(page);
  await page.getByRole('button',{name:'框選第 1 頁',exact:true}).click(); await expect(page.locator('#crop-controls')).toBeEnabled();
  await page.locator('#crop-width').fill('75'); await page.locator('#crop-add-layout').click(); await expect(page.locator('#free-preview')).toBeEnabled();
  await page.locator('#free-width').fill('80'); await page.locator('#free-width').blur(); await page.locator('#free-x').fill('22'); await page.locator('#free-x').blur();
  const piece=await page.locator('#free-item').inputValue(); await page.locator('#free-add-title').click(); await expect(page.locator('#free-text')).toBeVisible();
  await page.locator('#free-text').fill('重新開啟繼續排版'); await saved(page); await page.reload();
  await expect(page.locator('#free-dialog')).toBeVisible(); await expect(page.locator('#free-text')).toHaveValue('重新開啟繼續排版');
  await expect(page.locator('#free-item option')).toHaveCount(3);
  expect(await page.locator(`#free-sheet [data-item="${piece}"] rect`).first().getAttribute('x')).toBe('22');
  await page.locator('#free-preview').click(); await expect(page.locator('#proof-download')).toBeEnabled();
  const [sheet]=await inspectPdf(page,await downloadBytes(page,page.locator('#proof-download')));
  expect(sheet.text).toContain('重新開啟繼續排版'); expect(sheet.text).toContain('SOURCE_A_PAGE_1');
});

test('clearing and opting out remove all persisted documents while keeping the active workspace usable', async ({page})=>{
  await load(page); await saved(page); await page.locator('#autosave-enabled').uncheck();
  await expect(page.locator('#autosave-status')).toContainText('已移除'); await expect(page.locator('#page-count')).toHaveText('2');
  page.once('dialog',dialog=>dialog.accept()); await page.reload(); await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled','false');
  await expect(page.locator('#page-count')).toHaveText('0'); await expect(page.locator('#autosave-enabled')).not.toBeChecked();
  await page.locator('#autosave-enabled').check(); const {sources}=await createFixtures(),source=sources.get('A');
  await page.locator('#file-input').setInputFiles({name:source.name,mimeType:'application/pdf',buffer:Buffer.from(source.bytes)}); await saved(page);
  await page.locator('#reset').click(); await expect(page.locator('#file-input')).toBeEnabled(); await page.reload();
  await expect(page.locator('#page-count')).toHaveText('0'); await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled','false');
});

test('a quota failure preserves the last successful draft and retains leave protection', async ({page})=>{
  await load(page); await saved(page);
  await page.evaluate(()=>{const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='state')throw new DOMException('Test quota','QuotaExceededError');return original.apply(this,args);};});
  await page.getByRole('button',{name:'旋轉第 1 頁',exact:true}).click(); await expect(page.locator('#autosave-status')).toContainText('儲存空間不足');
  expect(await warns(page)).toBe(true); page.once('dialog',dialog=>dialog.accept()); await page.reload();
  await expect(page.locator('#file-input')).toBeEnabled(); await expect(page.locator('#page-count')).toHaveText('2');
  await expect(page.locator('.page-card').first()).not.toContainText('已旋轉');
});

test('another tab cannot silently overwrite a newer draft', async ({page,context,baseURL})=>{
  await load(page); await saved(page); const other=await context.newPage(); await other.goto(baseURL); await expect(other.locator('#page-count')).toHaveText('2'); await expect(other.locator('#file-input')).toBeEnabled(); await saved(other);
  await page.getByRole('button',{name:'旋轉第 1 頁',exact:true}).click(); await saved(page);
  await other.getByRole('button',{name:'旋轉第 2 頁',exact:true}).click(); await expect(other.locator('#autosave-status')).toContainText('其他分頁已更新');
  expect(await warns(other)).toBe(true); await page.reload(); await expect(page.locator('#page-count')).toHaveText('2'); await expect(page.locator('#file-input')).toBeEnabled();
  await expect(page.locator('.page-card').first()).toContainText('已旋轉 90°'); await expect(page.locator('.page-card').nth(1)).not.toContainText('已旋轉');
  await other.locator('#autosave-enabled').uncheck(); await expect(other.locator('#autosave-status')).toContainText('已移除');
  await other.close(); await page.reload(); await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled','false'); await expect(page.locator('#page-count')).toHaveText('0');
});

test('an unlocked password PDF resumes without storing or asking for its password', async ({page})=>{
  await page.goto('/'); await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled','false');
  const {sources}=await createFixtures(),doc=sources.get('A').doc;
  doc.encrypt({userPassword:'local-test-secret',ownerPassword:'owner-only'});
  await page.locator('#file-input').setInputFiles({name:'locked.pdf',mimeType:'application/pdf',buffer:Buffer.from(await doc.save())});
  await expect(page.locator('#password-dialog')).toBeVisible(); await page.locator('#password').fill('local-test-secret'); await page.locator('#password').press('Enter');
  await saved(page); await page.reload(); await expect(page.locator('#file-input')).toBeEnabled(); await expect(page.locator('#page-count')).toHaveText('2');
  await expect(page.locator('#password-dialog')).not.toBeVisible();
  const metadata=await page.evaluate(async()=>{const {openDraftStore}=await import('/draft-store.mjs');const store=await openDraftStore();try{const saved=await store.read();return JSON.stringify(saved.project);}finally{store.close();}});
  expect(metadata).not.toContain('local-test-secret'); expect(metadata).not.toContain('owner-only');
  expect((await inspectPdf(page,await downloadBytes(page,page.locator('#export-pdf'))))[0].text).toContain('SOURCE_A_PAGE_1');
});

test('unsaved Chinese OCR corrections resume and export as searchable text', async ({page})=>{
  test.setTimeout(180000); await page.goto('/'); await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled','false');
  const scan=await createScanPdf(page,[scanCases[0].pages[0]]);
  await page.locator('#file-input').setInputFiles({name:'scan.pdf',mimeType:'application/pdf',buffer:Buffer.from(scan)}); await expect(page.locator('#file-input')).toBeEnabled();
  await page.locator('#ocr-start').click(); await expect(page.locator('#ocr-dialog')).toBeVisible({timeout:120000}); await expect(page.locator('#ocr-save')).toBeEnabled();
  await page.locator('#ocr-lines textarea').first().fill('重新開啟的中文校對'); await saved(page); await page.reload();
  await expect(page.locator('#ocr-dialog')).toBeVisible(); await expect(page.locator('#ocr-lines textarea').first()).toHaveValue('重新開啟的中文校對');
  await page.locator('#ocr-save').click(); await page.locator('#ocr-close').click();
  const [output]=await inspectPdf(page,await downloadBytes(page,page.locator('#export-pdf')));
  expect(output.text).toContain('重新開啟的中文校對'); expect(output.hiddenModes).toContain(3);
});

test('free-layout-only documents remain recoverable after every main page is removed', async ({page})=>{
  await load(page); await page.getByRole('checkbox',{name:'選取第 2 頁',exact:true}).uncheck(); await page.locator('#free-layout').click();
  await expect(page.locator('#free-preview')).toBeEnabled(); await page.locator('#free-close').click();
  await page.locator('#select-all').click(); await page.locator('#delete-selected').click(); await expect(page.locator('#page-count')).toHaveText('0');
  await saved(page); await page.reload(); await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled','false');
  await expect(page.locator('#page-count')).toHaveText('0'); await expect(page.locator('#free-layout')).toBeEnabled();
  await page.locator('#free-layout').click(); await page.locator('#free-preview').click(); await expect(page.locator('#proof-download')).toBeEnabled();
  expect((await inspectPdf(page,await downloadBytes(page,page.locator('#proof-download'))))[0].text).toContain('SOURCE_A_PAGE_1');
});

test('storage being unavailable or a saved thumbnail being corrupt cannot disable normal editing', async ({page})=>{
  await load(page); await saved(page);
  await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('shijian.workspace.v1',1);r.onsuccess=()=>resolve(r.result);});try{await new Promise(resolve=>{const tx=db.transaction('assets','readwrite');tx.objectStore('assets').clear();tx.oncomplete=resolve;});}finally{db.close();}});
  await page.reload(); await expect(page.locator('#autosave-status')).toContainText('無法還原'); await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled','false');
  await expect(page.locator('#autosave-delete')).toBeEnabled(); await page.locator('#autosave-delete').click(); await expect(page.locator('#autosave-status')).toContainText('已刪除');
  await page.addInitScript(()=>Object.defineProperty(window,'indexedDB',{get(){throw new DOMException('Storage blocked','SecurityError');}}));
  await load(page); await expect(page.locator('#autosave-status')).toContainText('無法還原'); await expect(page.locator('#autosave-now')).toBeDisabled();
  await page.getByRole('button',{name:'旋轉第 1 頁',exact:true}).click(); await expect(page.locator('#file-input')).toBeEnabled();
  await expect(page.locator('#autosave-status')).toContainText('無法還原'); expect(await warns(page)).toBe(true);
  expect(await downloadBytes(page,page.locator('#export-pdf'))).not.toHaveLength(0);
});

test('switching A4 direction rejects an oversized title before it can damage recovery', async ({page})=>{
  await load(page); await page.locator('#free-layout').click(); await expect(page.locator('#free-preview')).toBeEnabled();
  await page.locator('#free-orientation').selectOption('landscape'); await page.locator('#free-add-title').click(); await expect(page.locator('#free-text')).toBeVisible();
  await page.locator('#free-text').fill('排版'.repeat(5)); await page.locator('#free-text').blur(); await page.locator('#free-font-size').fill('72'); await page.locator('#free-font-size').blur();
  expect(Number(await page.locator('#free-width').inputValue())).toBeGreaterThan(210);
  await page.locator('#free-orientation').selectOption('portrait'); await expect(page.locator('#free-orientation')).toHaveValue('landscape');
  await saved(page); await page.reload(); await expect(page.locator('#free-dialog')).toBeVisible(); await expect(page.locator('#free-orientation')).toHaveValue('landscape');
  await expect(page.locator('#page-count')).toHaveText('2');
});

test('clearing while a source is being serialized cannot resurrect the deleted draft', async ({page})=>{
  await page.goto('/'); await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled','false');
  await page.evaluate(async()=>{const {PDFDocument}=await import('/vendor/pdf-lib/pdf-lib.mjs');const save=PDFDocument.prototype.save;let held=false;PDFDocument.prototype.save=async function(...args){if(!held){held=true;window.sourceSaveHeld=true;await new Promise(resolve=>window.releaseSourceSave=resolve);}return save.apply(this,args);};});
  const {sources}=await createFixtures(),source=sources.get('A'); await page.locator('#file-input').setInputFiles({name:source.name,mimeType:'application/pdf',buffer:Buffer.from(source.bytes)});
  await page.waitForFunction(()=>window.sourceSaveHeld); await page.locator('#reset').click(); await page.evaluate(()=>window.releaseSourceSave());
  await expect(page.locator('#file-input')).toBeEnabled(); await page.reload(); await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled','false');
  await expect(page.locator('#page-count')).toHaveText('0');
});
