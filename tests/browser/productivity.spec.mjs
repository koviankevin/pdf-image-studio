import {test,expect} from './fixtures.mjs';
import {createFixtures} from '../support/pdfs.mjs';
import {downloadBytes,inspectPdf} from '../support/ocr-pdf.mjs';
import {zipSync,strToU8} from '../../dist/vendor/fflate/fflate.mjs';
import {unpackProject} from '../../dist/project-files.mjs';
import {createScanPdf,scanCases} from '../support/scans.mjs';
import {PDFDocument,StandardFonts} from '../../dist/vendor/pdf-lib/pdf-lib.mjs';

async function ready(page){await page.goto('/');await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled','false');}
async function load(page,ids=['A']){const {sources}=await createFixtures();await page.locator('#file-input').setInputFiles(ids.map(id=>({name:sources.get(id).name,mimeType:'application/pdf',buffer:Buffer.from(sources.get(id).bytes)})));await expect(page.locator('#file-input')).toBeEnabled();await expect(page.locator('#page-count')).toHaveText(String(ids.reduce((n,id)=>n+(id==='A'?2:3),0)));}
const saved=page=>expect(page.locator('#autosave-status')).toContainText(/已儲存|已還原/,{timeout:20000});
const pdf=async page=>inspectPdf(page,await downloadBytes(page,page.locator('#export-pdf')));
async function panel(page){if(!await page.locator('#project-panel').getAttribute('open').then(value=>value!==null))await page.locator('#project-panel summary').click();}
async function rename(page,name){await panel(page);await page.locator('#project-name').fill(name);await page.locator('#project-rename').click();await expect(page.locator('#project-current')).toContainText(name);}
async function switchProject(page,name){await panel(page);const id=await page.locator('#project-list option').filter({hasText:name}).getAttribute('value');await page.locator('#project-list').selectOption(id);await page.locator('#project-open').click();await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled','false');await expect(page.locator('#project-current')).toContainText(name);}

test('named workspaces switch independently and retain the original legacy draft',{tag:'@compatibility'},async({page})=>{
  await ready(page);await load(page);await rename(page,'講義');
  await page.getByRole('button',{name:'旋轉第 1 頁',exact:true}).click();await expect(page.locator('#file-input')).toBeEnabled();
  const first=await pdf(page);await panel(page);await page.locator('#project-new').click();
  await expect(page.locator('#page-count')).toHaveText('0');await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled','false');
  await rename(page,'會議資料');await load(page,['B']);await saved(page);
  await switchProject(page,'講義');await expect(page.locator('#page-count')).toHaveText('2');expect(await pdf(page)).toEqual(first);
  await switchProject(page,'會議資料');await expect(page.locator('#page-count')).toHaveText('3');
  await page.locator('#reset').click();await expect(page.locator('#page-count')).toHaveText('0');
  await switchProject(page,'講義');await expect(page.locator('#page-count')).toHaveText('2');expect(await pdf(page)).toEqual(first);
});

test('portable backups restore files, annotations and A4 items in a fresh browser context',{tag:'@compatibility'},async({page,browser,baseURL})=>{
  await ready(page);await load(page);await rename(page,'跨電腦專案');
  await page.locator('#free-layout').click();await expect(page.locator('#free-preview')).toBeEnabled();await page.locator('#free-add-title').click();await expect(page.locator('#free-text')).toBeVisible();await page.locator('#free-text').fill('備份保留版面');await page.locator('#free-text').blur();await page.locator('#free-close').click();
  await page.getByRole('button',{name:'標記第 1 頁',exact:true}).click();await expect(page.locator('#mark-fields')).toBeEnabled();await page.locator('[data-tool="text"]').click();await page.locator('#mark-text').fill('備份保留中文');await page.locator('#mark-center').click();await page.locator('#mark-save').click();await expect(page.locator('#file-input')).toBeEnabled();
  const expected=await pdf(page);await panel(page);const backup=await downloadBytes(page,page.locator('#project-backup'));
  const context=await browser.newContext(),next=await context.newPage();
  try{await next.goto(baseURL);await expect(next.locator('#dropzone')).toHaveAttribute('aria-disabled','false');await panel(next);
    await next.locator('#project-file').setInputFiles({name:'跨電腦.shijian',mimeType:'application/zip',buffer:backup});
    await expect(next.locator('#project-current')).toContainText('跨電腦專案');await expect(next.locator('#page-count')).toHaveText('2');await expect(next.locator('#file-input')).toBeEnabled();expect(await pdf(next)).toEqual(expected);
    await next.locator('#free-layout').click();await expect(next.locator('#free-item option')).toHaveCount(4);await expect(next.locator('#free-sheet')).toContainText('備份保留版面');
  }finally{await context.close();}
});

test('corrupt project import and disabled autosave never replace the current workspace',async({page})=>{
  await ready(page);await load(page);await panel(page);const expected=await pdf(page);
  const invalid=zipSync({'project.json':strToU8(JSON.stringify({format:'shijian-project',version:1,name:'broken',resources:[],project:{}}))});
  await page.locator('#project-file').setInputFiles({name:'bad.shijian',mimeType:'application/zip',buffer:Buffer.from(invalid)});
  await expect(page.locator('#project-status')).toHaveClass(/error/);await expect(page.locator('#file-input')).toBeEnabled();expect(await pdf(page)).toEqual(expected);
  await page.locator('#autosave-enabled').uncheck();await expect(page.locator('#autosave-status')).toContainText('已移除');await page.locator('#project-new').click();await expect(page.locator('#project-status')).toContainText('啟用自動儲存');await expect(page.locator('#page-count')).toHaveText('2');
  const backup=await downloadBytes(page,page.locator('#project-backup'));expect(backup.byteLength).toBeGreaterThan(100);
});

test('duplicate, blank insertion and replacement from a multi-page PDF support undo and redo',async({page})=>{
  await ready(page);await load(page);await page.getByRole('checkbox',{name:'選取第 2 頁',exact:true}).uncheck();await page.locator('#duplicate-pages').click();await expect(page.locator('#page-count')).toHaveText('3');
  await page.locator('#select-all').click();expect((await pdf(page)).map(p=>p.text.trim())).toEqual(['SOURCE_A_PAGE_1','SOURCE_A_PAGE_1','SOURCE_A_PAGE_2']);
  await page.locator('#undo').click();await expect(page.locator('#page-count')).toHaveText('2');await page.locator('#redo').click();await expect(page.locator('#page-count')).toHaveText('3');
  await page.locator('#select-none').click();await page.getByRole('checkbox',{name:'選取第 2 頁',exact:true}).check();await page.locator('#blank-orientation').selectOption('landscape');await page.locator('#insert-blank').click();await expect(page.locator('#page-count')).toHaveText('4');await expect(page.locator('#file-input')).toBeEnabled();
  await page.locator('#select-all').click();const withBlank=await pdf(page);expect(withBlank[2].text).toBe('');expect(withBlank[2].width).toBeCloseTo(841.89,1);
  await page.locator('#select-none').click();await page.getByRole('checkbox',{name:'選取第 3 頁',exact:true}).check();
  const {sources}=await createFixtures(),source=sources.get('B');await page.locator('#replace-file').setInputFiles({name:source.name,mimeType:'application/pdf',buffer:Buffer.from(source.bytes)});
  await expect(page.locator('#replacement-dialog')).toBeVisible();await page.locator('#replacement-index').selectOption('2');await page.locator('#replacement-use').click();await expect(page.locator('#file-input')).toBeEnabled();await page.locator('#select-all').click();
  const replaced=await pdf(page);expect(replaced.map(p=>p.text.trim())).toEqual(['SOURCE_A_PAGE_1','SOURCE_A_PAGE_1','SOURCE_B_PAGE_3','SOURCE_A_PAGE_2']);
  await page.locator('#undo').click();expect(await pdf(page)).toEqual([withBlank[2]]);await page.locator('#select-all').click();expect(await pdf(page)).toEqual(withBlank);
  await page.locator('#redo').click();await page.locator('#select-all').click();expect(await pdf(page)).toEqual(replaced);
});

test('shortcuts route undo and redo to workspace, annotations and A4 without stealing text editing',async({page})=>{
  await ready(page);await load(page);await page.getByRole('button',{name:'移除第 2 頁',exact:true}).click();await page.locator('body').click({position:{x:4,y:4}});await page.keyboard.press('Control+z');await expect(page.locator('#page-count')).toHaveText('2');await page.keyboard.press('Control+Shift+z');await expect(page.locator('#page-count')).toHaveText('1');await page.keyboard.press('Control+z');
  await page.getByRole('button',{name:'標記第 1 頁',exact:true}).click();await expect(page.locator('#mark-fields')).toBeEnabled();await page.locator('[data-tool="text"]').click();await page.locator('#mark-center').click();await expect(page.locator('#mark-overlay [data-mark]')).toHaveCount(1);await page.keyboard.press('Control+z');await expect(page.locator('#mark-overlay [data-mark]')).toHaveCount(0);await page.keyboard.press('Control+y');await expect(page.locator('#mark-overlay [data-mark]')).toHaveCount(1);
  await page.locator('#mark-text').focus();await page.keyboard.type('native');await page.keyboard.press('Control+z');await expect(page.locator('#mark-overlay [data-mark]')).toHaveCount(1);await page.locator('#mark-close').click();
  await page.locator('#free-layout').click();await expect(page.locator('#free-preview')).toBeEnabled();await page.locator('#free-add-title').click();await expect(page.locator('#free-item option')).toHaveCount(4);await page.locator('#free-sheet').focus();await page.keyboard.press('Control+z');await expect(page.locator('#free-item option')).toHaveCount(3);await page.keyboard.press('Control+Shift+z');await expect(page.locator('#free-item option')).toHaveCount(4);await page.locator('#free-close').click();
  await page.locator('body').click({position:{x:4,y:4}});await page.keyboard.press('Control+f');await expect(page.locator('#document-query')).toBeFocused();
});

test('search follows current pages and finds native text plus newly added Chinese labels',async({page})=>{
  await ready(page);await load(page,['A','B']);await page.locator('#document-query').fill('SOURCE_B_PAGE_3');await expect(page.locator('#search-status')).toContainText('找到 1 頁');await expect(page.locator('#search-results')).toContainText('第 5 頁');await page.locator('#search-results button').click();await expect(page.locator('.page-card').nth(4)).toHaveClass(/search-hit/);
  await page.getByRole('button',{name:'上移第 5 頁',exact:true}).click();await expect(page.locator('#search-results')).toContainText('第 4 頁');
  await page.locator('.batch-label-settings summary').click();await page.locator('#batch-header').fill('中文測試講義');await page.locator('#batch-apply').click();await expect(page.locator('#file-input')).toBeEnabled();await page.locator('#document-query').fill('中文測試');await expect(page.locator('#search-status')).toContainText('找到 5 頁');
});

test('batch numbering survives crop, rotation, reapplication, recovery and searchable PDF export',{tag:'@compatibility'},async({page})=>{
  await ready(page);await load(page);await page.getByRole('button',{name:'旋轉第 1 頁',exact:true}).click();await expect(page.locator('#file-input')).toBeEnabled();await page.locator('.batch-label-settings summary').click();await page.locator('#batch-header').fill('合併文件 {date}');await page.locator('#batch-start').fill('3');await page.locator('#batch-apply').click();await expect(page.locator('#file-input')).toBeEnabled();
  let output=await pdf(page);expect(output[0].text).toContain('第 3／4 頁');expect(output[1].text).toContain('第 4／4 頁');expect(output[0].text).toContain('合併文件');
  await page.locator('#batch-header').fill('更新的頁首');await page.locator('#batch-apply').click();await expect(page.locator('#file-input')).toBeEnabled();output=await pdf(page);expect(output[0].text).toContain('更新的頁首');expect(output[0].text).not.toContain('合併文件');expect(output[0].text.match(/第 3／4 頁/g)).toHaveLength(1);
  await saved(page);await page.reload();await expect(page.locator('#file-input')).toBeEnabled();expect(await pdf(page)).toEqual(output);
  await page.locator('.batch-label-settings summary').click();await page.locator('#batch-remove').click();await expect(page.locator('#file-input')).toBeEnabled();expect((await pdf(page))[0].text).not.toContain('更新的頁首');await page.locator('#undo').click();expect(await pdf(page)).toEqual(output);
});

test('new controls fit a 320px viewport and do not overflow when the project panel is expanded',async({page},testInfo)=>{
  await page.setViewportSize({width:320,height:1100});await ready(page);await load(page);await panel(page);await page.locator('.batch-label-settings summary').click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:testInfo.outputPath('productivity-mobile320.png'),fullPage:true});
});

test('search finds corrected Chinese OCR text after saving and reopening the document',async({page})=>{
  test.setTimeout(180000);await ready(page);const scan=await createScanPdf(page,[scanCases[0].pages[0]]);
  await page.locator('#file-input').setInputFiles({name:'scan.pdf',mimeType:'application/pdf',buffer:Buffer.from(scan)});await expect(page.locator('#file-input')).toBeEnabled();
  await page.locator('#ocr-start').click();await expect(page.locator('#ocr-dialog')).toBeVisible({timeout:120000});await expect(page.locator('#ocr-save')).toBeEnabled();
  await page.locator('#ocr-lines textarea').first().fill('紙間校對後的搜尋文字');await page.locator('#ocr-save').click();await page.locator('#ocr-close').click();await saved(page);await page.reload();await expect(page.locator('#file-input')).toBeEnabled();
  await page.locator('#document-query').fill('校對後的搜尋');await expect(page.locator('#search-status')).toContainText('找到 1 頁');await expect(page.locator('#search-results')).toContainText('紙間校對後的搜尋文字');
});

test('a conflicted tab can still back up its own current files and thumbnails',async({page,context,baseURL})=>{
  await ready(page);await load(page);await saved(page);const other=await context.newPage();await other.goto(baseURL);await expect(other.locator('#file-input')).toBeEnabled();
  await page.getByRole('button',{name:'旋轉第 1 頁',exact:true}).click();await saved(page);
  await other.getByRole('button',{name:'旋轉第 2 頁',exact:true}).click();await expect(other.locator('#autosave-status')).toContainText('其他分頁已更新');
  await panel(other);const bytes=await downloadBytes(other,other.locator('#project-backup')),backup=await unpackProject(new Blob([bytes]));
  expect(backup.project.pages.map(record=>record.rotation||0)).toEqual([0,90]);expect(backup.assets.size).toBe(2);
  await other.close();
});

test('cancelled replacement retains redo and deleting an inactive workspace leaves the active document intact',async({page})=>{
  await ready(page);await load(page);await rename(page,'保留文件');await page.getByRole('button',{name:'旋轉第 1 頁',exact:true}).click();await expect(page.locator('#file-input')).toBeEnabled();await page.locator('#undo').click();await expect(page.locator('#redo')).toBeEnabled();
  await page.getByRole('checkbox',{name:'選取第 2 頁',exact:true}).uncheck();const {sources}=await createFixtures(),source=sources.get('B');
  await page.locator('#replace-file').setInputFiles({name:source.name,mimeType:'application/pdf',buffer:Buffer.from(source.bytes)});await expect(page.locator('#replacement-dialog')).toBeVisible();await page.locator('#replacement-cancel').click();await expect(page.locator('#file-input')).toBeEnabled();await expect(page.locator('#source-list .source-row')).toHaveCount(1);await expect(page.locator('#redo')).toBeEnabled();
  await panel(page);await page.locator('#project-new').click();await expect(page.locator('#page-count')).toHaveText('0');await expect(page.locator('#file-input')).toBeEnabled();await rename(page,'可刪工作區');await load(page,['B']);await switchProject(page,'保留文件');
  await panel(page);const id=await page.locator('#project-list option').filter({hasText:'可刪工作區'}).getAttribute('value');await page.locator('#project-list').selectOption(id);page.once('dialog',dialog=>dialog.accept());await page.locator('#project-delete').click();await expect(page.locator('#project-status')).toContainText('已刪除');await expect(page.locator('#project-list option')).toHaveCount(1);await expect(page.locator('#page-count')).toHaveText('2');
});

test('an oversized replacement source is rejected before it can make autosave unrecoverable',async({page})=>{
  await ready(page);await load(page);await page.getByRole('checkbox',{name:'選取第 2 頁',exact:true}).uncheck();
  const source=await PDFDocument.create();for(let i=0;i<501;i++)source.addPage([100,120]);
  await page.locator('#replace-file').setInputFiles({name:'501-pages.pdf',mimeType:'application/pdf',buffer:Buffer.from(await source.save())});
  await expect(page.locator('#file-input')).toBeEnabled();await expect(page.locator('#status')).toContainText('單份來源 PDF 最多 500 頁');await expect(page.locator('#source-list .source-row')).toHaveCount(1);await saved(page);await page.reload();await expect(page.locator('#page-count')).toHaveText('2');await expect(page.locator('#file-input')).toBeEnabled();
});

test('reviewing OCR from more than one 100-page batch remains recoverable',async({page})=>{
  test.setTimeout(180000);const source=await PDFDocument.create(),font=await source.embedFont(StandardFonts.Helvetica);for(let i=0;i<101;i++){const item=source.addPage([100,120]);item.drawText(`PAGE_${i+1}`,{x:5,y:80,size:10,font});}
  await ready(page);await page.locator('#file-input').setInputFiles({name:'101-pages.pdf',mimeType:'application/pdf',buffer:Buffer.from(await source.save())});await expect(page.locator('#page-count')).toHaveText('101');await expect(page.locator('#file-input')).toBeEnabled();
  for(const range of ['1-100','101']){await page.locator('#pages').fill(range);await page.locator('#apply-range').click();await page.locator('#ocr-start').click();await expect(page.locator('#ocr-dialog')).toBeVisible({timeout:120000});await expect(page.locator('#ocr-save')).toBeEnabled();await page.locator('#ocr-close').click();}
  await page.locator('#ocr-review').click();await expect(page.locator('#ocr-page option')).toHaveCount(101);await expect(page.locator('#ocr-save')).toBeEnabled();await saved(page);await page.reload();await expect(page.locator('#ocr-dialog')).toBeVisible();await expect(page.locator('#ocr-page option')).toHaveCount(101);await expect(page.locator('#ocr-save')).toBeEnabled();
});

test('selecting an existing item and cancelling a drag preserve redo in both editors',async({page})=>{
  await ready(page);await load(page);await page.getByRole('button',{name:'標記第 1 頁',exact:true}).click();await expect(page.locator('#mark-fields')).toBeEnabled();await page.locator('[data-tool="text"]').click();await page.locator('#mark-center').click();await page.locator('#mark-center').click();await page.locator('#mark-undo').click();await page.locator('[data-tool="select"]').click();
  await page.locator('#mark-overlay [data-mark] text').click();await expect(page.locator('#mark-redo')).toBeEnabled();
  let box=await page.locator('#mark-overlay [data-mark] text').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+8,box.y+box.height/2+8);await page.locator('#mark-overlay').dispatchEvent('pointercancel');await page.mouse.up();await expect(page.locator('#mark-redo')).toBeEnabled();await page.locator('#mark-redo').click();await expect(page.locator('#mark-overlay [data-mark]')).toHaveCount(2);await page.locator('#mark-close').click();
  await page.locator('#free-layout').click();await expect(page.locator('#free-preview')).toBeEnabled();await page.locator('#free-add-title').click();await page.locator('#free-undo').click();await page.locator('#free-sheet [data-item]').first().click();await expect(page.locator('#free-redo')).toBeEnabled();
  box=await page.locator('#free-sheet [data-item]').first().boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+8,box.y+box.height/2+8);await page.locator('#free-sheet').dispatchEvent('pointercancel');await page.mouse.up();await expect(page.locator('#free-redo')).toBeEnabled();await page.locator('#free-redo').click();await expect(page.locator('#free-item option')).toHaveCount(4);
});
