import {readFile, writeFile} from 'node:fs/promises';
import {test, expect} from './fixtures.mjs';
import {scanCases, createScanPdf, characterErrorRate, normalizeOcrText} from '../support/scans.mjs';

async function downloadBytes(page, button) {
  const pending = page.waitForEvent('download');
  await button.click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  return readFile(await download.path());
}

async function inspectPdf(page, bytes) {
  return page.evaluate(async data => {
    const pdfjs = await import('/vendor/pdfjs/pdf.mjs');
    const task = pdfjs.getDocument({data: new Uint8Array(data), isEvalSupported: false,
      cMapUrl: `${location.origin}/vendor/pdfjs/cmaps/`, cMapPacked: true,
      standardFontDataUrl: `${location.origin}/vendor/pdfjs/standard_fonts/`,
      wasmUrl: `${location.origin}/vendor/pdfjs/wasm/`});
    try {
      const doc = await task.promise, result = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const pdfPage = await doc.getPage(i), viewport = pdfPage.getViewport({scale: 1});
        const text = await pdfPage.getTextContent();
        const operators = await pdfPage.getOperatorList();
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width; canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await pdfPage.render({canvasContext: ctx, viewport}).promise;
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const digest = await crypto.subtle.digest('SHA-256', pixels);
        result.push({text: text.items.map(item => item.str).join('\n'),
          width: viewport.width, height: viewport.height,
          // Same raster source must produce byte-identical visible pixels.
          pixelHash: [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join(''),
          hiddenModes: operators.fnArray.flatMap((fn, n) =>
            fn === pdfjs.OPS.setTextRenderingMode ? [operators.argsArray[n][0]] : []),
          textItems: text.items.filter(item => item.str?.trim()).map(item => ({
            text: item.str, x: item.transform[4], y: item.transform[5],
            width: item.width, height: item.height,
          })),
        });
      }
      return result;
    } finally { await task.destroy(); }
  }, [...bytes]);
}

async function reviewPage(page, index) {
  await page.locator('#ocr-page').selectOption(String(index));
  await expect(page.locator('#ocr-save')).toBeEnabled();
  await expect(page.locator('#ocr-image')).toHaveAttribute('src', /^blob:/);
  await expect(page.locator('#ocr-page-info')).toContainText('OCR 結果');
  await expect(page.locator('#ocr-review-status')).not.toHaveClass(/error/);
  return page.locator('#ocr-lines textarea');
}

async function expectLines(fields, expected) {
  await expect(fields).toHaveCount(expected.length);
  for (const [i, text] of expected.entries()) await expect(fields.nth(i)).toHaveValue(text);
}

for (const scenario of scanCases) {
  test(`${scenario.language}: real scanned OCR, line correction, TXT and invisible PDF text`, async ({page, context}, testInfo) => {
    // Actual worker/WASM startup and recognition need more time than native text.
    test.setTimeout(180_000);
    const errors = [], external = [], failedAssets = [], loaded = new Set(), workers = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('worker', worker => workers.push(worker.url()));
    // Context routes include dedicated worker requests. No OCR mocks or stubs.
    await context.route(/^https?:\/\//, route => {
      if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
      external.push(route.request().url());
      return route.abort();
    });
    context.on('response', response => {
      const path = new URL(response.url()).pathname;
      if (!path.includes('/vendor/ocr/')) return;
      if (response.ok()) loaded.add(path);
      else failedAssets.push(`${response.status()} ${path}`);
    });

    await page.goto('/');
    await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled', 'false');
    const input = await createScanPdf(page, scenario.pages);
    const original = await inspectPdf(page, input);
    expect(original).toHaveLength(2);
    original.forEach(p => expect(p.text).toBe(''));
    await page.locator('#file-input').setInputFiles({name: 'synthetic-scans.pdf',
      mimeType: 'application/pdf', buffer: input});
    await expect(page.locator('#page-count')).toHaveText('2');
    await expect(page.locator('#file-input')).toBeEnabled();
    await page.locator('#select-all').click();
    await page.locator('#ocr-language').selectOption(scenario.language);

    await test.step('Real Tesseract recognition (no native text shortcut)', async () => {
      await page.locator('#ocr-start').click();
      await expect(page.locator('#ocr-dialog')).toBeVisible({timeout: 120_000});
      await expect(page.locator('#status')).toContainText('已完成 2 頁文字處理');
      await expect(page.locator('#status')).not.toHaveClass(/error/);
      await expect(page.locator('#ocr-page option')).toHaveCount(2);
      expect(workers.some(url => url.endsWith('/vendor/ocr/worker.min.js'))).toBe(true);
      expect(loaded.has('/vendor/ocr/tesseract.mjs')).toBe(true);
      expect(loaded.has('/vendor/ocr/worker.min.js')).toBe(true);
      expect([...loaded].some(path => /\/core\/tesseract-core.*\.wasm\.js$/.test(path))).toBe(true);
      for (const language of scenario.language.split('+')) {
        expect(loaded.has(`/vendor/ocr/lang/${language}.traineddata`)).toBe(true);
      }
    });

    const corrected = [], accuracy = [];
    await test.step('Record recognition accuracy separately, then correct every line', async () => {
      for (let i = 0; i < 2; i++) {
        const fields = await reviewPage(page, i);
        const raw = await fields.evaluateAll(nodes => nodes.map(node => node.value));
        // Do not pin line segmentation, confidence scores or exact OCR spelling.
        expect(raw.length, 'The multiline scan must expose editable lines').toBeGreaterThanOrEqual(2);
        expect(raw.every(text => text.trim().length > 0)).toBe(true);
        accuracy.push({page: i + 1, expected: scenario.pages[i].join('\n'), actual: raw.join('\n'),
          characterErrorRate: characterErrorRate(scenario.pages[i].join('\n'), raw.join('\n'))});
        corrected[i] = [];
        for (let line = 0; line < raw.length; line++) {
          await expect(fields.nth(line)).toBeEditable();
          const value = `第${i + 1}頁第${line + 1}行 校對完成 Reviewed ${100 + i * 10 + line}`;
          corrected[i].push(value);
          await fields.nth(line).fill(value);
          await expect(page.locator('#ocr-review-status')).toContainText('校對尚未儲存');
          const box = page.locator('#ocr-overlay rect');
          await expect(box).toHaveCount(1);
          const geometry = await box.evaluate(el => ['x', 'y', 'width', 'height'].map(k => Number(el.getAttribute(k))));
          expect(geometry.every(Number.isFinite)).toBe(true);
          expect(geometry[2]).toBeGreaterThan(0);
          expect(geometry[3]).toBeGreaterThan(0);
        }
      }
      // Informational metric only: engine/font upgrades can alter spelling and
      // segmentation without breaking the editing/export contract.
      const accuracyPath = testInfo.outputPath('ocr-accuracy.json');
      await writeFile(accuracyPath, JSON.stringify({
        language: scenario.language, gating: false, normalization: 'NFKC, lowercase, ignore whitespace/punctuation/symbols',
        pages: accuracy,
      }, null, 2));
      await testInfo.attach('ocr-accuracy.json', {path: accuracyPath, contentType: 'application/json'});
      console.log(`OCR accuracy (${scenario.language}, informational CER): ${accuracy.map(p => p.characterErrorRate.toFixed(3)).join(', ')}`);
    });

    await test.step('Save, reopen and download exact corrected UTF-8 text', async () => {
      // Switching pages must keep pending edits; one save persists both pages.
      const fields = await reviewPage(page, 0);
      await expectLines(fields, corrected[0]);
      await page.locator('#ocr-save').click();
      await expect(page.locator('#ocr-review-status')).toContainText('已儲存校對');
      await page.locator('#ocr-close').click();
      await page.locator('#ocr-review').click();
      for (let i = 0; i < 2; i++) {
        await expectLines(await reviewPage(page, i), corrected[i]);
      }
      const txt = await downloadBytes(page, page.locator('#ocr-text-download'));
      expect([...txt.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      expect(txt.toString('utf8').replace(/^\uFEFF/, '')).toBe(corrected
        .map((lines, i) => `第 ${i + 1} 頁\n${lines.join('\n')}`).join('\n\n'));
      // Closing without save must not accidentally commit a later correction.
      await page.locator('#ocr-lines textarea').first().fill('UNSAVED SENTINEL');
      await page.locator('#ocr-close').click();
      await page.locator('#ocr-review').click();
      await expectLines(await reviewPage(page, 1), corrected[1]);
      await page.locator('#ocr-close').click();
    });

    await test.step('Download PDF: searchable corrected text, invisible layer, unchanged scan', async () => {
      const bytes = await downloadBytes(page, page.locator('#export-pdf'));
      const output = await inspectPdf(page, bytes);
      expect(output).toHaveLength(2);
      for (const [i, result] of output.entries()) {
        // PDF.js can split glyph runs and insert layout spaces; compare all
        // characters (including punctuation/case), ignoring only whitespace.
        expect(result.text.replace(/\s/gu, '')).toBe(corrected[i].join('').replace(/\s/gu, ''));
        expect(result.hiddenModes).toContain(3);
        expect(result.pixelHash).toBe(original[i].pixelHash);
        expect([result.width, result.height]).toEqual([original[i].width, original[i].height]);
        for (const item of result.textItems) {
          expect(item.x).toBeGreaterThanOrEqual(0);
          expect(item.y).toBeGreaterThanOrEqual(0);
          expect(item.x).toBeLessThan(result.width);
          expect(item.y).toBeLessThan(result.height);
          expect(item.width).toBeGreaterThan(0);
          expect(item.height).toBeGreaterThan(0);
        }
      }
      // Reimport through the UI: exported text must take the native path and
      // must not invoke another OCR worker or lose the saved corrections.
      await page.locator('#reset').click();
      await expect(page.locator('#page-count')).toHaveText('0');
      await page.locator('#file-input').setInputFiles({name: 'corrected-scans.pdf',
        mimeType: 'application/pdf', buffer: bytes});
      await expect(page.locator('#page-count')).toHaveText('2');
      await expect(page.locator('#file-input')).toBeEnabled();
      const workerCount = workers.length;
      await page.locator('#ocr-start').click();
      await expect(page.locator('#ocr-dialog')).toBeVisible();
      for (let i = 0; i < 2; i++) {
        await page.locator('#ocr-page').selectOption(String(i));
        await expect(page.locator('#ocr-save')).toBeEnabled();
        await expect(page.locator('#ocr-page-info')).toContainText('原稿已有文字');
        const fields = page.locator('#ocr-lines textarea');
        expect(normalizeOcrText((await fields.evaluateAll(nodes => nodes.map(n => n.value))).join('')))
          .toBe(normalizeOcrText(corrected[i].join('')));
        expect(await fields.evaluateAll(nodes => nodes.every(n => n.readOnly))).toBe(true);
      }
      expect(workers).toHaveLength(workerCount);
    });
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
    expect(failedAssets).toEqual([]);
  });
}
