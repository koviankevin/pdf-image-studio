import {writeFile} from 'node:fs/promises';
import {test, expect} from './fixtures.mjs';
import {scanConditions, createConditionPdf, observeReadingOrder} from '../support/scan-conditions.mjs';
import {characterErrorRate} from '../support/scans.mjs';
import {downloadBytes, inspectPdf} from '../support/ocr-pdf.mjs';

const condition = scanConditions.find(item => item.id === 'two-column-chinese');
const compact = text => text.replace(/\s/gu, '');

for (const layout of ['auto', 'single-column', 'two-column']) {
  test(`${layout}: PR4 two-column scan, reading order, review coordinates and hidden PDF`, async ({page, context, serverURL, browser}, testInfo) => {
    test.setTimeout(180_000);
    const errors = [], external = [], loaded = new Set();
    page.on('pageerror', error => errors.push(error.message));
    await context.route(/^https?:\/\//, route => {
      if (new URL(route.request().url()).origin === serverURL) return route.continue();
      external.push(route.request().url()); return route.abort();
    });
    context.on('response', response => {
      if (response.ok()) loaded.add(new URL(response.url()).pathname);
    });
    await page.goto('/');
    await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled', 'false');
    // Exact PR #4 generator, unchanged. Extract its sixth page without rerendering.
    const fixture = await createConditionPdf(page);
    const input = Buffer.from(await page.evaluate(async bytes => {
      const {PDFDocument} = await import('/vendor/pdf-lib/pdf-lib.mjs');
      const source = await PDFDocument.load(new Uint8Array(bytes)), doc = await PDFDocument.create();
      const [page] = await doc.copyPages(source, [5]); doc.addPage(page);
      return [...await doc.save()];
    }, [...fixture.pdf]));
    const [original] = await inspectPdf(page, input);
    expect(original.text).toBe('');
    await page.locator('#file-input').setInputFiles({name: 'PR4-two-column.pdf', mimeType: 'application/pdf', buffer: input});
    await expect(page.locator('#page-count')).toHaveText('1');
    await expect(page.locator('#file-input')).toBeEnabled();
    await expect(page.locator('#ocr-layout')).toHaveValue('auto');
    await page.locator('#ocr-layout').selectOption(layout);
    await page.locator('#ocr-start').click();
    await expect(page.locator('#ocr-dialog')).toBeVisible({timeout: 120_000});
    await expect(page.locator('#ocr-save')).toBeEnabled();
    await expect(page.locator('#status')).toContainText('已完成 1 頁文字處理');
    for (const asset of ['tesseract.mjs', 'worker.min.js', 'lang/chi_tra.traineddata', 'lang/eng.traineddata'])
      expect(loaded.has(`/vendor/ocr/${asset}`)).toBe(true);
    const fields = page.locator('#ocr-lines textarea');
    const raw = await fields.evaluateAll(nodes => nodes.map(node => node.value)), boxes = [];
    expect(raw.length).toBeGreaterThan(0);
    for (let i = 0; i < raw.length; i++) {
      await fields.nth(i).focus();
      const rect = page.locator('#ocr-overlay rect'); await expect(rect).toHaveCount(1);
      boxes.push(await rect.evaluate(node => Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Number(node.getAttribute(key))]))));
    }
    const measurement = {sampleKind: 'synthetic-scan-simulation', physicalScans: 0,
      fixtureSource: 'PR #4, 4b435401c3f06e32c6d4edd47e94803b2a92af55',
      sourcePngSha256: fixture.images[5].sha256, browser: browser.version(), node: process.version,
      layout, repeat: testInfo.repeatEachIndex, rawUiLines: raw, boxes,
      expected: condition.expected, actual: raw.join('\n'),
      characterErrorRate: characterErrorRate(condition.expected, raw.join('\n')),
      readingOrder: observeReadingOrder(condition, boxes)};
    await writeFile(testInfo.outputPath('ocr-accuracy.json'), JSON.stringify(measurement, null, 2));
    console.log(`${layout}: CER=${measurement.characterErrorRate}, order=${measurement.readingOrder.status}`);
    if (layout === 'two-column') {
      // A fixed regression fixture, not a general OCR accuracy claim or CER gate.
      expect(raw).toHaveLength(8);
      expect(raw.map(compact)).toEqual(condition.columns.flat());
      expect(measurement.readingOrder.observed).toEqual(condition.expectedOrder);
      for (const [i, box] of boxes.entries()) {
        const c = i < 4 ? 0 : 1, r = i % 4;
        // Independent ground truth from the source's 100/850 x and 160 row pitch.
        expect(Math.abs(box.x - (c ? 850 : 100) * .36)).toBeLessThan(5);
        expect(Math.abs(box.y - (100 + r * 160) * .36)).toBeLessThan(5);
        expect(box.width).toBeGreaterThan(140); expect(box.width).toBeLessThan(160);
        expect(box.height).toBeGreaterThan(15); expect(box.height).toBeLessThan(25);
        expect(box.x + box.width).toBeLessThan(c ? 576 : 288);
      }
    }
    // Both unedited and edited exports must preserve the UI's column order.
    const txt = await downloadBytes(page, page.locator('#ocr-text-download'));
    expect(txt.toString('utf8')).toBe('\uFEFF第 1 頁\n' + raw.join('\n'));
    await page.locator('#ocr-save').click(); await page.locator('#ocr-close').click();
    const [unreviewed] = await inspectPdf(page, await downloadBytes(page, page.locator('#export-pdf')));
    expect(compact(unreviewed.text)).toBe(compact(raw.join('')));
    expect(unreviewed.pixelHash).toBe(original.pixelHash);
    expect(unreviewed.hiddenModes).toContain(3);
    await page.locator('#ocr-review').click();
    await expect(page.locator('#ocr-save')).toBeEnabled();
    const corrected = raw.map((_, i) => `校對第${i + 1}行`);
    for (let i = 0; i < corrected.length; i++) await fields.nth(i).fill(corrected[i]);
    await page.locator('#ocr-save').click(); await page.locator('#ocr-close').click();
    await page.locator('#ocr-review').click(); await expect(page.locator('#ocr-save')).toBeEnabled();
    expect(await fields.evaluateAll(nodes => nodes.map(node => node.value))).toEqual(corrected);
    const editedTxt = await downloadBytes(page, page.locator('#ocr-text-download'));
    expect(editedTxt.toString('utf8')).toBe('\uFEFF第 1 頁\n' + corrected.join('\n'));
    // Keep a visual QA artifact showing the right column's actual focus box.
    if (layout === 'two-column') { await fields.nth(4).focus(); await page.screenshot({path: testInfo.outputPath('right-column-review.png')}); }
    await page.locator('#ocr-close').click();
    const bytes = await downloadBytes(page, page.locator('#export-pdf'));
    const [output] = await inspectPdf(page, bytes);
    expect(compact(output.text)).toBe(corrected.join(''));
    expect(output.hiddenModes).toContain(3);
    expect(output.pixelHash).toBe(original.pixelHash);
    expect(output.textItems).toHaveLength(corrected.length);
    for (const [i, item] of output.textItems.entries()) {
      // PDF bottom-origin baseline must agree with the displayed top-origin box.
      expect(Math.abs(item.x - boxes[i].x)).toBeLessThan(.1);
      expect(Math.abs(item.y - (360 - boxes[i].y - boxes[i].height * .85))).toBeLessThan(.1);
      expect(Math.abs(item.width - boxes[i].width)).toBeLessThan(.1);
    }
    await writeFile(testInfo.outputPath('two-column-reviewed.pdf'), bytes);
    expect(errors).toEqual([]); expect(external).toEqual([]);
  });
}

test('stopping when the right column starts discards the unfinished page', async ({page}) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled', 'false');
  const fixture = await createConditionPdf(page);
  const input = Buffer.from(await page.evaluate(async bytes => {
    const {PDFDocument} = await import('/vendor/pdf-lib/pdf-lib.mjs');
    const source = await PDFDocument.load(new Uint8Array(bytes)), doc = await PDFDocument.create();
    const [page] = await doc.copyPages(source, [5]); doc.addPage(page); return [...await doc.save()];
  }, [...fixture.pdf]));
  await page.locator('#file-input').setInputFiles({name: 'cancel-columns.pdf', mimeType: 'application/pdf', buffer: input});
  await expect(page.locator('#file-input')).toBeEnabled();
  await page.locator('#ocr-layout').selectOption('two-column');
  // React to the visible status in the same browser turn: polling from Node can
  // miss this short phase on fast machines. Click the real cancel button once.
  await page.evaluate(() => {
    const status = document.querySelector('#status');
    const observer = new MutationObserver(() => {
      if (status.textContent.includes('右欄')) {
        observer.disconnect(); document.querySelector('#ocr-cancel').click();
      }
    });
    observer.observe(status, {childList: true, subtree: true, characterData: true});
  });
  await page.locator('#ocr-start').click();
  await expect(page.locator('#status')).toContainText('已停止，保留 0 頁', {timeout: 90_000});
  await expect(page.locator('#ocr-start')).toBeEnabled();
  await expect(page.locator('#ocr-review')).toBeDisabled();
  await expect(page.locator('#ocr-dialog')).not.toBeVisible();
  // A fresh worker after cancellation must still complete both columns.
  await page.locator('#ocr-start').click();
  await expect(page.locator('#ocr-dialog')).toBeVisible({timeout: 90_000});
  expect((await page.locator('#ocr-lines textarea').evaluateAll(nodes => nodes.map(node => node.value))).map(compact))
    .toEqual(condition.columns.flat());
});

test('column crops cover odd-width pixels exactly and fail without returning partial results', async ({page}) => {
  await page.goto('/');
  // Isolated crop/coordinate contract only; this worker spy is not an OCR test.
  const result = await page.evaluate(async () => {
    const {recognizeTwoColumns} = await import('/ocr-columns.mjs');
    const canvas = document.createElement('canvas'); canvas.width = 101; canvas.height = 40;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'red'; ctx.fillRect(0, 0, 50, 40);
    ctx.fillStyle = 'blue'; ctx.fillRect(50, 0, 51, 40);
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    const calls = [], worker = {recognize: async (blob, options) => {
      const bitmap = await createImageBitmap(blob), c = document.createElement('canvas');
      c.width = bitmap.width; c.height = bitmap.height; c.getContext('2d').drawImage(bitmap, 0, 0);
      const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      calls.push({width: c.width, height: c.height, first: [...pixels.slice(0, 4)], last: [...pixels.slice(-4)], options});
      bitmap.close(); return {data: {text: calls.length === 1 ? '' : 'right only'}};
    }};
    const lines = await recognizeTwoColumns(worker, {blob, dpi: 300}, {width: 202, height: 80}, p => p, () => {});
    let failed = false, count = 0;
    try { await recognizeTwoColumns({recognize: async () => {
      if (++count === 2) throw new Error('right failed'); return {data: {text: 'left'}};
    }}, {blob, dpi: 300}, {width: 202, height: 80}, p => p, () => {}); }
    catch (error) { failed = error.message === 'right failed'; }
    return {calls, lines, failed, count};
  });
  expect(result.calls).toEqual([
    {width: 50, height: 40, first: [255, 0, 0, 255], last: [255, 0, 0, 255], options: {user_defined_dpi: '300'}},
    {width: 51, height: 40, first: [0, 0, 255, 255], last: [0, 0, 255, 255], options: {user_defined_dpi: '300'}},
  ]);
  expect(result.lines).toEqual([{text: 'right only', x: 100, y: 0, width: 102, height: 80, confidence: 0}]);
  expect(result.failed).toBe(true); expect(result.count).toBe(2);
});
