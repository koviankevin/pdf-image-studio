import {test, expect} from './fixtures.mjs';
import {createFixtures} from '../support/pdfs.mjs';
import {PDFDocument} from '../../dist/vendor/pdf-lib/pdf-lib.mjs';

const upload = source => ({name:source.name,mimeType:'application/pdf',buffer:Buffer.from(source.bytes)});
async function ready(page) {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.liveWorkerUrls = new Map();
    window.createdWorkerUrls = [];
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        liveWorkerUrls.set(this,String(args[0]));createdWorkerUrls.push(String(args[0]));
      }
      terminate() { liveWorkerUrls.delete(this); return super.terminate(); }
    };
  });
  await page.goto('/');
  await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled','false');
}
const workers = page => page.evaluate(() => liveWorkerUrls.size);
const sourceRows = page => page.locator('#source-list .source-row');

test('successful import releases sources excluded from current pages and undo, while failed import retains undo', async ({page}) => {
  const {sources} = await createFixtures();await ready(page);
  await page.locator('#file-input').setInputFiles(upload(sources.get('A')));
  await expect(page.locator('#page-count')).toHaveText('2');
  await page.locator('#delete-selected').click();
  await expect(page.locator('#undo')).toBeEnabled();
  await expect.poll(() => workers(page)).toBe(1);
  await page.locator('#file-input').setInputFiles({name:'broken.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\ninvalid')});
  await expect(page.locator('#file-input')).toBeEnabled();
  await expect(page.locator('#status')).toContainText('broken.pdf');
  await expect(page.locator('#undo')).toBeEnabled();
  await expect(sourceRows(page)).toHaveCount(1);
  await expect.poll(() => workers(page)).toBe(1);
  for(let i=0;i<5;i++) {
    await page.locator('#file-input').setInputFiles(upload(sources.get('B')));
    await expect(page.locator('#page-count')).toHaveText('3');
    await expect(page.locator('#file-input')).toBeEnabled();
    await expect(page.locator('#undo')).toBeDisabled();
    await expect(sourceRows(page)).toHaveCount(1);
    await expect(page.locator('#selection-summary')).toContainText('1 份來源');
    await expect.poll(() => workers(page)).toBe(1);
    if(i<4)await page.locator('#delete-selected').click();
  }
  await page.locator('#reset').click();
  await expect(page.locator('#page-count')).toHaveText('0');
  await expect.poll(() => workers(page)).toBe(0);
});

test('undo retains a removed source until its last snapshot expires, and remaining history still works', async ({page}) => {
  const {sources} = await createFixtures();await ready(page);
  await page.locator('#file-input').setInputFiles([...sources.values()].map(upload));
  await expect(page.locator('#page-count')).toHaveText('5');
  await page.locator('#pages').fill('1-2');await page.locator('#apply-range').click();
  await page.locator('#delete-selected').click();
  await expect(sourceRows(page)).toHaveCount(2);
  await expect.poll(() => workers(page)).toBe(2);
  await page.locator('#undo').click();
  await expect(page.locator('#page-count')).toHaveText('5');
  await page.locator('#page-grid img').evaluateAll(imgs => Promise.all(imgs.map(img => img.decode())));
  await page.locator('#delete-selected').click();
  await page.getByRole('checkbox',{name:'選取第 1 頁',exact:true}).check();
  for(let i=0;i<30;i++) {
    await page.locator('#rotate-selected').click();
    await expect(page.locator('#rotate-selected')).toBeEnabled();
    if(i===28) { await expect(sourceRows(page)).toHaveCount(2);expect(await workers(page)).toBe(2); }
  }
  await expect(sourceRows(page)).toHaveCount(1);
  await expect.poll(() => workers(page)).toBe(1);
  for(let i=0;i<30;i++)await page.locator('#undo').click();
  await expect(page.locator('#undo')).toBeDisabled();
  await expect(page.locator('#page-count')).toHaveText('3');
  await page.locator('#page-grid img').evaluateAll(imgs => Promise.all(imgs.map(img => img.decode())));
});

test('stopping a pending OCR module import unlocks immediately, starts no stale worker, and allows retry', async ({page}) => {
  const doc=await PDFDocument.create();doc.addPage([200,250]);
  let release,requested;
  const gate=new Promise(resolve => release=resolve), loading=new Promise(resolve => requested=resolve);
  await page.route('**/vendor/ocr/tesseract.mjs',async route => {
    const response=await route.fetch();requested();await gate;
    await route.fulfill({response});
  });
  await ready(page);
  await page.locator('#file-input').setInputFiles(upload({name:'blank.pdf',bytes:await doc.save()}));
  await expect(page.locator('#ocr-start')).toBeEnabled();
  await page.locator('#ocr-language').selectOption('eng');
  await page.locator('#ocr-start').click();await loading;
  try {
    await page.locator('#ocr-cancel').click();
    // Must unlock while the response is STILL held, not only when it returns.
    await expect(page.locator('#file-input')).toBeEnabled({timeout:2000});
    await expect(page.locator('#ocr-cancel')).toBeHidden();
    await expect(page.locator('#status')).toContainText('已停止');
    await page.locator('#output-name').fill('After cancellation');
  } finally { release(); }
  await page.evaluate(async () => { await import('/vendor/ocr/tesseract.mjs'); });
  expect(await page.evaluate(() => createdWorkerUrls.filter(url => url.includes('/vendor/ocr/')))).toEqual([]);
  await expect(page.locator('#ocr-dialog')).not.toBeVisible();
  await expect(page.locator('#output-name')).toHaveValue('After cancellation');
  await page.locator('#ocr-start').click();
  await expect(page.locator('#ocr-dialog')).toBeVisible({timeout:30000});
  await expect(page.locator('#ocr-page-info')).toContainText('OCR 結果');
  await page.locator('#ocr-close').click();
  await expect(page.locator('#file-input')).toBeEnabled();
  await expect.poll(() => page.evaluate(() => [...liveWorkerUrls.values()].filter(url => url.includes('/vendor/ocr/')).length)).toBe(0);
});
