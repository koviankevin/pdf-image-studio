import {readFile, writeFile} from 'node:fs/promises';
import {test, expect} from './fixtures.mjs';
import {characterErrorRate} from '../support/scans.mjs';
import {scanConditions, createConditionPdf, observeReadingOrder} from '../support/scan-conditions.mjs';

for (const layout of ['auto', 'single-column']) {
  test(`${layout}: simulated scan conditions remain reviewable and exportable`, async ({page, context, browser, serverURL}, testInfo) => {
    test.setTimeout(240_000);
    const errors = [], external = [], loaded = new Set(), failedAssets = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route(/^https?:\/\//, route => {
      if (new URL(route.request().url()).origin === serverURL) return route.continue();
      external.push(route.request().url()); return route.abort();
    });
    context.on('response', response => {
      const path = new URL(response.url()).pathname;
      if (path.includes('/vendor/ocr/')) {
        if (response.ok()) loaded.add(path); else failedAssets.push(`${response.status()} ${path}`);
      }
    });
    await page.goto('/');
    await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled', 'false');
    const fixture = await createConditionPdf(page);
    await writeFile(testInfo.outputPath('simulated-scans.pdf'), fixture.pdf);
    for (const image of fixture.images) await writeFile(testInfo.outputPath(`${image.id}.png`), image.png);
    const nativeText = await page.evaluate(async bytes => {
      const pdfjs = await import('/vendor/pdfjs/pdf.mjs');
      const task = pdfjs.getDocument({data: new Uint8Array(bytes)});
      try {
        const pdf = await task.promise, texts = [];
        for (let n = 1; n <= pdf.numPages; n++) texts.push((await (await pdf.getPage(n)).getTextContent()).items.length);
        return texts;
      } finally { await task.destroy(); }
    }, [...fixture.pdf]);
    expect(nativeText).toEqual(scanConditions.map(() => 0));
    await page.locator('#file-input').setInputFiles({name: 'simulated-scans.pdf', mimeType: 'application/pdf', buffer: fixture.pdf});
    await expect(page.locator('#page-count')).toHaveText(String(scanConditions.length));
    await expect(page.locator('#file-input')).toBeEnabled();
    await page.locator('#select-all').click();
    await page.locator('#ocr-language').selectOption('chi_tra+eng');
    await page.locator('#ocr-layout').selectOption(layout);
    await page.locator('#ocr-start').click();
    await expect(page.locator('#ocr-dialog')).toBeVisible({timeout: 180_000});
    await expect(page.locator('#status')).toContainText(`已完成 ${scanConditions.length} 頁文字處理`);
    await expect(page.locator('#status')).not.toHaveClass(/error/);
    for (const asset of ['tesseract.mjs', 'worker.min.js', 'lang/chi_tra.traineddata', 'lang/eng.traineddata'])
      expect(loaded.has(`/vendor/ocr/${asset}`)).toBe(true);
    expect([...loaded].some(path => /\/core\/tesseract-core.*\.wasm\.js$/.test(path))).toBe(true);
    const measurements = [], corrected = [];
    for (const [i, condition] of scanConditions.entries()) {
      await page.locator('#ocr-page').selectOption(String(i));
      await expect(page.locator('#ocr-save')).toBeEnabled();
      await expect(page.locator('#ocr-page-info')).toContainText('OCR 結果');
      await expect(page.locator('#ocr-image')).toHaveAttribute('src', /^blob:/);
      await expect(page.locator('#ocr-review-status')).not.toHaveClass(/error/);
      const fields = page.locator('#ocr-lines textarea');
      const raw = await fields.evaluateAll(nodes => nodes.map(node => node.value));
      // Functional contract only; spelling, CER and reading order do not gate CI.
      expect(raw.length).toBeGreaterThanOrEqual(2);
      expect(raw.every(text => text.trim().length > 0)).toBe(true);
      const boxes = [];
      for (let line = 0; line < raw.length; line++) {
        await expect(fields.nth(line)).toBeEditable(); await fields.nth(line).focus();
        const rect = page.locator('#ocr-overlay rect'); await expect(rect).toHaveCount(1);
        const box = await rect.evaluate(node => Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Number(node.getAttribute(key))])));
        expect(Object.values(box).every(Number.isFinite)).toBe(true);
        expect(box.width).toBeGreaterThan(0); expect(box.height).toBeGreaterThan(0); boxes.push(box);
      }
      const actual = raw.join('\n');
      measurements.push({...condition, sourcePngSha256: fixture.images[i].sha256,
        rawUiLines: raw, actual, boxes, characterErrorRate: characterErrorRate(condition.expected, actual),
        readingOrder: observeReadingOrder(condition, boxes)});
      console.log(`${layout} / ${condition.id}: CER=${measurements.at(-1).characterErrorRate.toFixed(6)}, order=${measurements.at(-1).readingOrder.status}`);
      await writeFile(testInfo.outputPath('ocr-accuracy.json'), JSON.stringify({
        sampleKind: 'synthetic-scan-simulation', physicalScans: 0, gating: false,
        language: 'chi_tra+eng', layout, psm: layout === 'auto' ? 3 : 4,
        browser: browser.version(), node: process.version, repeat: testInfo.repeatEachIndex,
        source: {width: 1600, height: 1000, font: 'bundled NotoSansCJKtc-Regular.otf', fontPx: 52,
          pdfPoints: [576, 360], ocrDpi: 300, maxEdge: 3500, sourceEffectiveDpi: 200},
        normalization: 'NFKC, lowercase, ignore whitespace/punctuation/symbols (unchanged)', measurements,
      }, null, 2));
      corrected[i] = raw.map((_, line) => `模擬第${i + 1}頁第${line + 1}行 人工校對 Reviewed ${100 + line}`);
      for (let line = 0; line < raw.length; line++) await fields.nth(line).fill(corrected[i][line]);
    }
    await testInfo.attach('ocr-accuracy.json', {path: testInfo.outputPath('ocr-accuracy.json'), contentType: 'application/json'});
    await page.locator('#ocr-save').click();
    await expect(page.locator('#ocr-review-status')).toContainText('已儲存校對');
    await page.locator('#ocr-close').click(); await page.locator('#ocr-review').click();
    for (let i = 0; i < scanConditions.length; i++) {
      await page.locator('#ocr-page').selectOption(String(i)); await expect(page.locator('#ocr-save')).toBeEnabled();
      const fields = page.locator('#ocr-lines textarea'); await expect(fields).toHaveCount(corrected[i].length);
      for (let j = 0; j < corrected[i].length; j++) await expect(fields.nth(j)).toHaveValue(corrected[i][j]);
    }
    const pending = page.waitForEvent('download'); await page.locator('#ocr-text-download').click();
    const download = await pending; expect(await download.failure()).toBeNull();
    const text = await readFile(await download.path()); expect([...text.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(text.toString('utf8').replace(/^\uFEFF/, '')).toBe(corrected.map((lines, i) => `第 ${i + 1} 頁\n${lines.join('\n')}`).join('\n\n'));
    expect(errors).toEqual([]); expect(external).toEqual([]); expect(failedAssets).toEqual([]);
  });
}
