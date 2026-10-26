import {test,expect} from './fixtures.mjs';
import {createFixtures} from '../support/pdfs.mjs';
import {downloadBytes,inspectPdf} from '../support/ocr-pdf.mjs';
import {unpackProject} from '../../dist/project-files.mjs';

async function ready(page){await page.goto('/');await expect(page.locator('#file-input')).toBeEnabled();await expect(page.locator('#product-help')).toBeEnabled();}
async function load(page){const {sources}=await createFixtures(),source=sources.get('A');await page.locator('#file-input').setInputFiles({name:'PRIVATE_source.pdf',mimeType:'application/pdf',buffer:Buffer.from(source.bytes)});await expect(page.locator('#page-count')).toHaveText('2');await expect(page.locator('#file-input')).toBeEnabled();}
const saved=page=>expect(page.locator('#autosave-status')).toContainText(/已儲存|已還原/,{timeout:20000});
const pdf=async page=>inspectPdf(page,await downloadBytes(page,page.locator('#export-pdf')));

test('teacher demo uses real import, searchable output and A4 layout without real documents',{tag:'@compatibility'},async({page})=>{
  test.setTimeout(120000);await ready(page);await page.locator('#try-handout').click();await expect(page.locator('#page-count')).toHaveText('3',{timeout:60000});await expect(page.locator('#file-input')).toBeEnabled();await expect(page.locator('[data-task="layout"]')).toHaveAttribute('aria-pressed','true');
  const result=await pdf(page);expect(result).toHaveLength(3);expect(result[0].text).toContain('課堂講義');expect(result[2].text).toContain('補充資料');
  await page.locator('#free-layout').click();await expect(page.locator('#free-preview')).toBeEnabled();await page.locator('#free-preview').click();await expect(page.locator('#proof-download')).toBeEnabled();const laidOut=await inspectPdf(page,await downloadBytes(page,page.locator('#proof-download')));expect(laidOut).toHaveLength(1);expect(laidOut[0].text).toContain('課堂講義');expect(laidOut[0].text).toContain('補充資料');await page.locator('#proof-close').click();await page.locator('#free-close').click();
});

test('office demo appends after explicit confirmation and preserves existing pages',async({page})=>{
  test.setTimeout(120000);await ready(page);await load(page);const before=await pdf(page);await page.locator('#product-help').click();page.once('dialog',dialog=>dialog.accept());await page.locator('#demo-office').click();await expect(page.locator('#page-count')).toHaveText('5',{timeout:60000});await expect(page.locator('#file-input')).toBeEnabled();const result=await pdf(page);expect(result.slice(0,2)).toEqual(before);expect(result[2].text).toContain('會議摘要');await expect(page.locator('[data-task="organize"]')).toHaveAttribute('aria-pressed','true');await saved(page);await page.reload();await expect(page.locator('#page-count')).toHaveText('5');
});

test('data center lists only metadata, creates backups, detects later edits and deletes inactive workspaces',{tag:'@compatibility'},async({page})=>{
  test.setTimeout(120000);await ready(page);await load(page);await saved(page);
  await page.evaluate(()=>{
    window.summaryOnly=true;const original=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(names,mode,...rest){if(summaryOnly&&mode==='readonly'&&[].concat(names).some(name=>['documents','assets'].includes(name)))throw Error('Data listing must not load PDF or preview payloads');return original.call(this,names,mode,...rest);};
  });
  await page.locator('#product-data').click();const first=page.locator('.product-card[data-workspace="legacy"]');await expect(first).toContainText('已存 2 頁');await expect(first).toContainText('尚未產生專案備份');await expect(first.locator('[data-workspace-action="delete"]')).toBeDisabled();await page.evaluate(()=>summaryOnly=false);
  const backup=await unpackProject(new Blob([await downloadBytes(page,first.locator('[data-workspace-action="backup"]'))]));expect(backup.project.pages).toHaveLength(2);await expect(first).toContainText('已產生此草稿的備份');await page.locator('#product-close').click();
  await page.getByRole('button',{name:'旋轉第 1 頁',exact:true}).click();await expect(page.locator('#file-input')).toBeEnabled();await saved(page);await page.locator('#product-data').click();await expect(first).toContainText('備份後仍有更新');await page.locator('#product-close').click();
  await page.locator('#project-panel summary').click();await page.locator('#project-new').click();await expect(page.locator('#file-input')).toBeEnabled();await expect(page.locator('#page-count')).toHaveText('0');await page.locator('#product-data').click();await expect(page.locator('[data-workspace]')).toHaveCount(2);
  const previous=page.locator('[data-workspace="legacy"]');const inactive=await unpackProject(new Blob([await downloadBytes(page,previous.locator('[data-workspace-action="backup"]'))]));expect(inactive.project.pages).toHaveLength(2);expect(inactive.project.pages[0].rotation).toBe(90);
  page.once('dialog',dialog=>dialog.dismiss());await previous.locator('[data-workspace-action="delete"]').click();await expect(page.locator('#product-status')).toContainText('已取消');await expect(page.locator('[data-workspace]')).toHaveCount(2);
  page.once('dialog',dialog=>dialog.accept());await previous.locator('[data-workspace-action="delete"]').click();await expect(page.locator('[data-workspace]')).toHaveCount(1);await expect(page.locator('#page-count')).toHaveText('0');await page.locator('#product-close').click();await expect(page.locator('#file-input')).toBeEnabled();
});

test('diagnostic preview and download never include filenames, workspace names or error details',{tag:'@compatibility'},async({page})=>{
  await ready(page);await load(page);await page.locator('#project-panel summary').click();await page.locator('#project-name').fill('PRIVATE_WORKSPACE');await page.locator('#project-rename').click();await expect(page.locator('#file-input')).toBeEnabled();
  await page.evaluate(()=>window.dispatchEvent(new ErrorEvent('error',{message:'PRIVATE_PASSWORD_OCR',filename:location.origin+'/workspace.mjs?PRIVATE_TOKEN',error:new Error('PRIVATE_STACK')})));
  await page.locator('#product-support').click();await page.locator('#product-diagnostic-create').click();const text=await page.locator('#product-diagnostic').inputValue();expect(text).not.toContain('PRIVATE');const diagnostic=JSON.parse(text);expect(diagnostic.workspace.pages).toBe(2);expect(diagnostic.issues).toContain('APP_RUNTIME');expect(JSON.parse((await downloadBytes(page,page.locator('#product-diagnostic-download'))).toString('utf8'))).toEqual(diagnostic);expect(await page.locator('#product-issue-link').getAttribute('href')).not.toContain('PRIVATE');
});

test('missing storage estimates do not block workspace access or original output',async({page})=>{
  await page.addInitScript(()=>{Object.defineProperty(navigator.storage,'estimate',{value:()=>Promise.reject(Error('unavailable'))});Object.defineProperty(navigator.storage,'persisted',{value:()=>Promise.reject(Error('unavailable'))});});
  await ready(page);await load(page);await saved(page);await page.locator('#product-data').click();await expect(page.locator('#product-storage-summary')).toContainText('未提供');await expect(page.locator('[data-workspace="legacy"]')).toContainText('已存 2 頁');await page.locator('#product-close').click();expect(await pdf(page)).toHaveLength(2);
});

test('help and safe diagnostics remain available when the editing module cannot load',async({page})=>{
  await page.route('**/workspace.mjs*',route=>route.abort());await page.goto('/');await expect(page.locator('#status')).toContainText('未能載入');await page.locator('#product-help').click();await expect(page.locator('#demo-handout')).toBeDisabled();await page.locator('[data-product-panel="privacy"]').click();await expect(page.locator('#product-privacy')).toContainText('已解鎖文件內容');await page.locator('[data-product-panel="support"]').click();await page.locator('#product-diagnostic-create').click();expect(JSON.parse(await page.locator('#product-diagnostic').inputValue()).workspace.pages).toBe(0);
});

test('product center supports keyboard navigation and a 320px viewport',{tag:'@compatibility'},async({page})=>{
  await page.setViewportSize({width:320,height:740});await ready(page);await page.locator('#product-help').click();for(const section of ['guide','data','privacy','support']){await page.locator(`[data-product-panel="${section}"]`).click();expect(await page.locator('#product-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);}await page.keyboard.press('Escape');await expect(page.locator('#product-dialog')).toBeHidden();await expect(page.locator('#product-help')).toBeFocused();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('update checks identify the loaded build and preserve work until an explicit safe reload',async({page})=>{
  await ready(page);await load(page);await saved(page);await page.locator('#autosave-enabled').uncheck();await expect(page.locator('#autosave-status')).toContainText('已移除');await page.locator('#product-support').click();await page.locator('#product-update-check').click();await expect(page.locator('#product-update-status')).toContainText('版本一致');await expect(page.locator('#product-update-actions')).toBeHidden();
  await page.route('**/release.json*',async route=>{const response=await route.fetch(),value=await response.json();value.buildId='f'.repeat(64);await route.fulfill({response,json:value});});
  await page.locator('#product-update-check').click();await expect(page.locator('#product-update-actions')).toBeVisible();await page.locator('#product-update-backed-up').check();await page.locator('#product-close').click();await page.locator('#product-support').click();await expect(page.locator('#product-update-backed-up')).not.toBeChecked();await page.locator('#product-update-reload').click();await expect(page.locator('#product-update-status')).toContainText('自動儲存已關閉');await expect(page.locator('#page-count')).toHaveText('2');await page.locator('#product-close').click();expect((await pdf(page)).map(p=>p.text.trim())).toEqual(['SOURCE_A_PAGE_1','SOURCE_A_PAGE_2']);
});

test('offline or invalid update metadata cannot erase documents or inject remote text',async({page})=>{
  await ready(page);await load(page);await page.locator('#product-support').click();await page.route('**/release.json*',route=>route.fulfill({contentType:'application/json',body:'{"version":"<script>PRIVATE</script>"}'}));await page.locator('#product-update-check').click();await expect(page.locator('#product-update-status')).toContainText('無法確認');await expect(page.locator('#product-dialog')).not.toContainText('PRIVATE');await page.locator('#product-close').click();await expect(page.locator('#page-count')).toHaveText('2');await expect(page.locator('#file-input')).toBeEnabled();
});

test('demo preparation can be cancelled before a delayed font finishes without touching existing files',async({page})=>{
  let releaseFont,requested;const gate=new Promise(resolve=>releaseFont=resolve),loading=new Promise(resolve=>requested=resolve);
  await page.route('**/fonts/NotoSansCJKtc-Regular.otf',async route=>{const response=await route.fetch();requested();await gate;await route.fulfill({response});});
  await ready(page);await load(page);await page.locator('#product-help').click();page.once('dialog',dialog=>dialog.accept());await page.locator('#demo-handout').click();await loading;
  try{await expect(page.locator('#product-demo-cancel')).toBeVisible();await page.locator('#product-demo-cancel').click();await expect(page.locator('#product-status')).toContainText('已停止');await expect(page.locator('#product-close')).toBeEnabled();await expect(page.locator('#page-count')).toHaveText('2');}
  finally{releaseFont();}
  await page.locator('#product-close').click();await expect(page.locator('#file-input')).toBeEnabled();expect((await pdf(page)).map(p=>p.text.trim())).toEqual(['SOURCE_A_PAGE_1','SOURCE_A_PAGE_2']);
});

test('opening product information does not write document drafts and text can be enlarged',async({page})=>{
  await ready(page);await load(page);await saved(page);const before=await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('shijian.workspace.v1');r.onsuccess=()=>resolve(r.result);});try{return await new Promise(resolve=>{const r=db.transaction('state','readonly').objectStore('state').get('current');r.onsuccess=()=>resolve(r.result.revision);});}finally{db.close();}});
  await page.locator('#product-help').click();await page.locator('[data-product-panel="privacy"]').click();await page.locator('[data-product-panel="support"]').click();await page.locator('#product-diagnostic-create').click();await page.locator('#product-close').click();await expect(page.locator('#autosave-status')).toContainText('已儲存');
  const after=await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('shijian.workspace.v1');r.onsuccess=()=>resolve(r.result);});try{return await new Promise(resolve=>{const r=db.transaction('state','readonly').objectStore('state').get('current');r.onsuccess=()=>resolve(r.result.revision);});}finally{db.close();}});expect(after).toBe(before);
  await page.addStyleTag({content:'html{font-size:200% !important}'});await page.locator('#product-help').click();expect(await page.locator('#product-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await page.locator('#product-close').focus();await expect(page.locator('#product-close')).toBeInViewport();
});

test('a backup from an older tab cannot mark a newer stored revision as backed up',async({page,context})=>{
  await ready(page);await load(page);await saved(page);const older=await context.newPage();await older.goto(page.url());await expect(older.locator('#page-count')).toHaveText('2');await expect(older.locator('#file-input')).toBeEnabled();
  await page.getByRole('button',{name:'旋轉第 1 頁',exact:true}).click();await expect(page.locator('#file-input')).toBeEnabled();await saved(page);
  await older.locator('#product-data').click();const row=older.locator('[data-workspace="legacy"]');const backup=await unpackProject(new Blob([await downloadBytes(older,row.locator('[data-workspace-action="backup"]'))]));expect(backup.project.pages[0].rotation||0).toBe(0);await expect(row).toContainText('備份後仍有更新');await older.close();
});


test('diagnostics still work when a browser security policy throws on IndexedDB access',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(window,'indexedDB',{configurable:true,get(){throw new DOMException('Storage disabled','SecurityError');}}));
  await ready(page);await load(page);await page.locator('#product-support').click();await page.locator('#product-diagnostic-create').click();const diagnostic=JSON.parse(await page.locator('#product-diagnostic').inputValue());expect(diagnostic.environment.indexedDB).toBe(false);expect(diagnostic.workspace.pages).toBe(2);await page.locator('#product-close').click();expect(await pdf(page)).toHaveLength(2);
});


test('an exported layout still needs a project backup before reload when autosave is off',async({page})=>{
  await ready(page);await load(page);await page.locator('#free-layout').click();await page.locator('#free-preview').click();await expect(page.locator('#proof-download')).toBeEnabled();const output=await inspectPdf(page,await downloadBytes(page,page.locator('#proof-download')));expect(output[0].text).toContain('SOURCE_A_PAGE_1');await page.locator('#proof-close').click();await page.locator('#free-close').click();await page.locator('#delete-selected').click();await expect(page.locator('#page-count')).toHaveText('0');await saved(page);await page.locator('#autosave-enabled').uncheck();await expect(page.locator('#autosave-status')).toContainText('已移除');
  await page.route('**/release.json*',async route=>{const response=await route.fetch(),value=await response.json();value.buildId='f'.repeat(64);await route.fulfill({response,json:value});});await page.locator('#product-support').click();await page.locator('#product-update-check').click();await expect(page.locator('#product-update-actions')).toBeVisible();await page.locator('#product-update-reload').click();await expect(page.locator('#product-update-status')).toContainText('自動儲存已關閉');await expect(page.locator('#product-dialog')).toBeVisible();await page.locator('#product-close').click();await page.locator('#free-layout').click();await page.locator('#free-preview').click();await expect(page.locator('#proof-download')).toBeEnabled();const preserved=await inspectPdf(page,await downloadBytes(page,page.locator('#proof-download')));expect(preserved).toEqual(output);
});


test('update reload waits for a real save and stays open when that save fails',async({page})=>{
  await ready(page);await load(page);await saved(page);await page.evaluate(()=>{window.failUpdateSave=true;const original=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(names,mode,...rest){if(failUpdateSave&&mode==='readwrite'&&[].concat(names).includes('state'))throw new DOMException('quota','QuotaExceededError');return original.call(this,names,mode,...rest);};});await page.locator('#output-name').fill('更新前的未存名稱');
  await page.route('**/release.json*',async route=>{const response=await route.fetch(),value=await response.json();value.buildId='f'.repeat(64);await route.fulfill({response,json:value});});await page.locator('#product-support').click();await page.locator('#product-update-check').click();await expect(page.locator('#product-update-actions')).toBeVisible();await page.locator('#product-update-reload').click();await expect(page.locator('#product-update-status')).toContainText('沒有重新載入');await expect(page.locator('#product-dialog')).toBeVisible();await expect(page.locator('#page-count')).toHaveText('2');
  await page.evaluate(()=>failUpdateSave=false);await Promise.all([page.waitForEvent('domcontentloaded'),page.locator('#product-update-reload').click()]);await expect(page.locator('#page-count')).toHaveText('2');await expect(page.locator('#output-name')).toHaveValue('更新前的未存名稱');await expect(page.locator('#file-input')).toBeEnabled();expect((await pdf(page))[0].text).toContain('SOURCE_A_PAGE_1');
});


test('one malformed workspace summary does not crash the data center or disable other files',async({page})=>{
  await ready(page);await load(page);await saved(page);await page.locator('#project-panel summary').click();await page.locator('#project-new').click();await expect(page.locator('#page-count')).toHaveText('0');await expect(page.locator('#file-input')).toBeEnabled();await load(page);await saved(page);
  await page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('shijian.workspace.v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{await new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put({revision:2,project:{sources:[null],pages:[],layout:{}}},'current');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}finally{db.close();}});
  await page.locator('#product-data').click();await expect(page.locator('[data-workspace="legacy"]')).toContainText('無法讀取');await expect(page.locator('[data-workspace]')).toHaveCount(2);await expect(page.locator('[data-workspace] button[data-workspace-action="backup"]').last()).toBeEnabled();await page.locator('#product-close').click();expect((await pdf(page))[0].text).toContain('SOURCE_A_PAGE_1');
});
