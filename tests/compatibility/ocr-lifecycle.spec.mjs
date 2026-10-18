import {test, expect} from '../browser/fixtures.mjs';
import {createScanPdf} from '../support/scans.mjs';
import {inspectPdf} from '../support/ocr-pdf.mjs';

// The first recognize message is held at the native Worker boundary. Engine,
// WASM, language loading and all subsequent recognition are real and local.
// This removes the race between the Cancel click and a fast one-page result.
test('real OCR worker cancels at recognition dispatch and restarts for two scanned pages', async ({page}, testInfo) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.ocrProbe = {created: 0, live: 0, held: false, dispatches: 0};
    window.Worker = class extends NativeWorker {
      constructor(url, ...args) {
        super(url, ...args);
        this.isOcr = String(url).includes('/vendor/ocr/worker.min.js');
        if (this.isOcr) { ocrProbe.created++; ocrProbe.live++; }
      }
      postMessage(message, ...args) {
        if (this.isOcr && message.action === 'recognize') {
          ocrProbe.dispatches++;
          if (!ocrProbe.held) { ocrProbe.held = true; return; }
        }
        return super.postMessage(message, ...args);
      }
      terminate() {
        if (this.isOcr && !this.ended) { this.ended = true; ocrProbe.live--; }
        return super.terminate();
      }
    };
  });
  await page.goto('/');
  await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled', 'false');
  const input = await createScanPdf(page, [
    ['SYNTHETIC WORKER TEST', 'Read this first page'],
    ['SECOND WORKER PAGE', 'Reuse the same engine'],
  ]);
  const original = await inspectPdf(page, input);
  expect(original.map(p => p.text)).toEqual(['', '']);
  await testInfo.attach('synthetic-worker-pages.pdf', {body: input, contentType: 'application/pdf'});
  await page.locator('#file-input').setInputFiles({
    name: 'synthetic-worker-pages.pdf', mimeType: 'application/pdf', buffer: input,
  });
  await expect(page.locator('#page-count')).toHaveText('2');
  await expect(page.locator('#file-input')).toBeEnabled();
  await page.locator('#ocr-language').selectOption('eng');
  await page.locator('#ocr-layout').selectOption('single-column');
  await page.locator('#ocr-start').click();
  await expect.poll(() => page.evaluate(() => ocrProbe.held), {timeout: 30_000}).toBe(true);
  expect(await page.evaluate(() => ocrProbe.live)).toBe(1);
  await page.locator('#ocr-cancel').click();
  await expect(page.locator('#file-input')).toBeEnabled({timeout: 2000});
  await expect(page.locator('#ocr-cancel')).toBeHidden();
  await expect(page.locator('#status')).toContainText('已停止');
  await expect(page.locator('#ocr-dialog')).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => ocrProbe.live)).toBe(0);

  await page.locator('#ocr-start').click();
  await expect(page.locator('#ocr-dialog')).toBeVisible({timeout: 45_000});
  await expect(page.locator('#status')).toContainText('已完成 2 頁文字處理');
  await expect(page.locator('#ocr-page option')).toHaveCount(2);
  for (const index of [0, 1]) {
    await page.locator('#ocr-page').selectOption(String(index));
    await expect(page.locator('#ocr-save')).toBeEnabled();
    await expect(page.locator('#ocr-page-info')).toContainText('OCR 結果');
    await expect(page.locator('#ocr-review-status')).not.toHaveClass(/error/);
    await expect.poll(() => page.locator('#ocr-lines textarea').evaluateAll(
      fields => fields.map(field => field.value).join('').trim().length,
    )).toBeGreaterThan(0);
    await page.locator('#ocr-image').evaluate(img => img.decode());
  }
  // One worker was cancelled; one replacement recognized BOTH pages and ended.
  expect(await page.evaluate(() => ({...ocrProbe}))).toEqual({
    created: 2, live: 0, held: true, dispatches: 3,
  });
  await page.locator('#ocr-close').click();
  await expect(page.locator('#file-input')).toBeEnabled();
});
