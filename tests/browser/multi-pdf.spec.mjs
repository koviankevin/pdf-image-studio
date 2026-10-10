import {readFile} from 'node:fs/promises';
import {test, expect} from './fixtures.mjs';
import {createFixtures, fixturePages, pageById} from '../support/pdfs.mjs';

const interleaved = ['B3', 'A2', 'B1', 'A1', 'B2'];

async function assertOrigins(page, ids) {
  const cards = page.locator('.page-card');
  await expect(cards).toHaveCount(ids.length);
  for (const [i, id] of ids.entries()) {
    const spec = pageById(id);
    await expect(cards.nth(i).locator('.page-thumb img')).toHaveAttribute('alt',
      `source-${spec.sourceId}.pdf 原第 ${spec.index + 1} 頁`);
    await expect(cards.nth(i).locator('.page-origin').nth(1)).toHaveText(`原第 ${spec.index + 1} 頁`);
  }
}

async function selectPositions(page, positions) {
  await page.locator('#pages').fill(positions.join(','));
  await page.locator('#apply-range').click();
}

async function downloadedBytes(page, action) {
  const pending = page.waitForEvent('download');
  await action();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  return readFile(await download.path());
}

async function inspectPdf(page, bytes) {
  return page.evaluate(async data => {
    const pdfjs = await import('/vendor/pdfjs/pdf.mjs');
    const task = pdfjs.getDocument({data: new Uint8Array(data),
      standardFontDataUrl: `${location.origin}/vendor/pdfjs/standard_fonts/`,
      isEvalSupported: false});
    try {
      const doc = await task.promise;
      const pages = [];
      for (let index = 1; index <= doc.numPages; index++) {
        const pdfPage = await doc.getPage(index);
        const content = await pdfPage.getTextContent();
        const viewport = pdfPage.getViewport({scale: 1});
        pages.push({text: content.items.map(item => item.str).join(' ').trim(),
          width: viewport.width, height: viewport.height});
      }
      return pages;
    } finally { await task.destroy(); }
  }, [...bytes]);
}

async function assertPdf(page, bytes, ids) {
  expect(await inspectPdf(page, bytes)).toEqual(ids.map(id => {
    const spec = pageById(id);
    return {text: spec.text, width: spec.width, height: spec.height};
  }));
}

async function imageColor(page, image) {
  return page.evaluate(async input => {
    const blob = typeof input === 'string' ? await (await fetch(input)).blob()
      : new Blob([new Uint8Array(input)], {type: 'image/png'});
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2), 1, 1, 0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
    } finally { bitmap.close(); }
  }, image);
}

function assertColor(actual, id) {
  pageById(id).color.forEach((channel, i) => expect(Math.abs(actual[i] - channel)).toBeLessThanOrEqual(4));
}

for (const order of [['A', 'B'], ['B', 'A']]) {
  for (const mode of ['batch', 'sequential']) {
    test(`${order.join(' then ')} / ${mode}: import, reorder, text and actual exports`, async ({page}) => {
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      // Tests must work entirely locally; catch accidental remote dependencies.
      const external = [];
      await page.route(/^https?:\/\//, route => {
        const url = new URL(route.request().url());
        if (url.hostname === '127.0.0.1') return route.continue();
        external.push(url.href);
        return route.abort();
      });
      // Native text is deliberate: running Tesseract would mask a bad lookup.
      const ocrRequests = [];
      page.on('request', request => {
        if (request.url().includes('/vendor/ocr/')) ocrRequests.push(request.url());
      });
      const {sources} = await createFixtures();
      const payloads = order.map(id => ({name: sources.get(id).name,
        mimeType: 'application/pdf', buffer: Buffer.from(sources.get(id).bytes)}));
      await page.goto('/');
      // index.html dynamically imports the workspace; the load event can precede
      // its event handlers. This attribute is set by the final updateControls().
      await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled', 'false');
      let current = order.flatMap(sourceId => fixturePages.filter(p => p.sourceId === sourceId).map(p => p.id));
      if (mode === 'batch') {
        await page.locator('#file-input').setInputFiles(payloads);
      } else {
        for (const [i, payload] of payloads.entries()) {
          await page.locator('#file-input').setInputFiles(payload);
          await expect(page.locator('#page-count')).toHaveText(String(order.slice(0, i + 1).reduce((n, id) => n + (id === 'A' ? 2 : 3), 0)));
          await expect(page.locator('#file-input')).toBeEnabled();
        }
      }
      await expect(page.locator('#page-count')).toHaveText('5');
      await expect(page.locator('#file-input')).toBeEnabled();
      await expect(page.locator('#status')).not.toHaveClass(/error/);
      await expect(page.locator('#source-list .source-row')).toHaveCount(2);
      await assertOrigins(page, current);
      for (const [i, id] of current.entries()) {
        assertColor(await imageColor(page, await page.locator('.page-thumb img').nth(i).getAttribute('src')), id);
      }

      // Drag across documents, then exercise the keyboard-accessible move UI.
      await page.locator('.page-card').nth(current.indexOf('B3')).locator('.drag-handle')
        .dragTo(page.locator('.page-card').first().locator('.drag-handle'));
      current = ['B3', ...current.filter(id => id !== 'B3')];
      await assertOrigins(page, current);
      for (const [i, id] of interleaved.entries()) {
        await selectPositions(page, [current.indexOf(id) + 1]);
        await page.locator('#move-position').fill(String(i + 1));
        await page.locator('#move-selected').click();
        current = current.filter(value => value !== id);
        current.splice(i, 0, id);
      }
      await assertOrigins(page, interleaved);
      await page.locator('#select-all').click();

      // B3 is above the smaller document's page count. Alternating sources
      // exercises getSourcePage in nativeText, pageViewport and renderBlob.
      await page.locator('#ocr-start').click();
      await expect(page.locator('#status')).toContainText('已完成 5 頁文字處理');
      await expect(page.locator('#ocr-dialog')).toBeVisible();
      await expect(page.locator('#ocr-page option')).toHaveCount(5);
      for (const [i, id] of interleaved.entries()) {
        await page.locator('#ocr-page').selectOption(String(i));
        await expect(page.locator('#ocr-lines textarea')).toHaveCount(1);
        await expect(page.locator('#ocr-lines textarea')).toHaveValue(pageById(id).text);
        await expect(page.locator('#ocr-page-info')).toContainText('原稿已有文字');
        await expect(page.locator('#ocr-save')).toBeEnabled();
        await expect(page.locator('#ocr-image')).toHaveAttribute('src', /^blob:/);
        assertColor(await imageColor(page, await page.locator('#ocr-image').getAttribute('src')), id);
        await expect(page.locator('#ocr-review-status')).not.toHaveClass(/error/);
      }
      const txt = await downloadedBytes(page, () => page.locator('#ocr-text-download').click());
      expect(txt.toString('utf8').replace(/^\uFEFF/, '')).toBe(interleaved.map((id, i) => `第 ${i + 1} 頁\n${pageById(id).text}`).join('\n\n'));
      await page.locator('#ocr-close').click();

      // Validate rendered output bytes, not gallery thumbnails reused from input.
      await page.locator('#dpi').selectOption('150');
      await page.locator('#max-edge').fill('500');
      await page.locator('#convert').click();
      await expect(page.locator('#result-count')).toHaveText('5');
      await expect(page.locator('#convert')).toBeEnabled();
      await expect(page.locator('#status')).not.toHaveClass(/error/);
      for (const [i, id] of interleaved.entries()) {
        const png = await downloadedBytes(page, () => page.getByRole('button', {name: `下載第 ${i + 1} 頁圖片`, exact: true}).click());
        assertColor(await imageColor(page, [...png]), id);
      }
      const full = await downloadedBytes(page, () => page.locator('#export-pdf').click());
      await assertPdf(page, full, interleaved);
      await selectPositions(page, [1, 4]);
      const subset = await downloadedBytes(page, () => page.locator('#export-pdf').click());
      await assertPdf(page, subset, ['B3', 'A1']);
      expect(errors).toEqual([]);
      expect(external).toEqual([]);
      expect(ocrRequests).toEqual([]);
    });
  }
}
