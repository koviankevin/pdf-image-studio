import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {test, expect} from '../browser/fixtures.mjs';
import {downloadBytes, inspectPdf} from '../support/ocr-pdf.mjs';
import {measureRegions} from './metrics.mjs';

const manifest = JSON.parse(await readFile(new URL('./manifest.json', import.meta.url)));
const cache = new URL('../../.cache/real-scans/', import.meta.url);
// Missing data is an explicit setup failure, never a skipped test.
const prepared = JSON.parse(await readFile(new URL('prepared.json', cache)));
const compact = s => s.replace(/\s/gu, '');
const sha = data => createHash('sha256').update(data).digest('hex');
const assetPaths = ['dist/vendor/ocr/tesseract.mjs', 'dist/vendor/ocr/worker.min.js',
  'dist/vendor/ocr/lang/chi_tra.traineddata', 'dist/vendor/ocr/lang/eng.traineddata'];
const assets = Object.fromEntries(await Promise.all(assetPaths.map(async path =>
  [path, sha(await readFile(new URL('../../' + path, import.meta.url)))])));

for (const sample of manifest.pages) for (const layout of ['auto', 'single-column', 'two-column']) {
  test(`${sample.id} / ${layout}`, async ({page, context, serverURL, browser}, testInfo) => {
    const metadata = prepared.find(p => p.id === sample.id);
    const png = await readFile(new URL(sample.id + '.png', cache));
    expect(sha(png)).toBe(metadata.pngSha256);
    const errors = [], external = [], loaded = new Set();
    page.on('pageerror', e => errors.push(e.message));
    await context.route(/^https?:\/\//, route => {
      if (new URL(route.request().url()).origin === serverURL) return route.continue();
      external.push(route.request().url()); return route.abort();
    });
    context.on('response', response => {
      if (response.ok()) loaded.add(new URL(response.url()).pathname);
    });
    await page.goto('/');
    await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled', 'false');
    const input = Buffer.from(await page.evaluate(async ({png, width, height}) => {
      const {PDFDocument} = await import('/vendor/pdf-lib/pdf-lib.mjs');
      const doc = await PDFDocument.create();
      const image = await doc.embedPng(Uint8Array.from(atob(png), c => c.charCodeAt(0)));
      doc.addPage([width, height]).drawImage(image, {x: 0, y: 0, width, height});
      return [...await doc.save()];
    }, {...metadata, png: png.toString('base64')}));
    const [original] = await inspectPdf(page, input);
    expect(original.text).toBe('');
    await writeFile(testInfo.outputPath('input-image-only.pdf'), input);
    await page.locator('#file-input').setInputFiles({name: `${sample.id}.pdf`, mimeType: 'application/pdf', buffer: input});
    await expect(page.locator('#page-count')).toHaveText('1');
    await expect(page.locator('#file-input')).toBeEnabled();
    await page.locator('#ocr-language').selectOption(sample.language);
    await page.locator('#ocr-layout').selectOption(layout);
    await page.locator('#ocr-start').click();
    await expect(page.locator('#ocr-dialog')).toBeVisible({timeout: 180_000});
    await expect(page.locator('#ocr-save')).toBeEnabled();
    await expect(page.locator('#ocr-page-info')).toContainText('OCR 結果');
    for (const asset of ['tesseract.mjs', 'worker.min.js', 'lang/eng.traineddata'])
      expect(loaded.has(`/vendor/ocr/${asset}`)).toBe(true);
    if (sample.language.includes('chi_tra')) expect(loaded.has('/vendor/ocr/lang/chi_tra.traineddata')).toBe(true);
    const fields = page.locator('#ocr-lines textarea');
    const raw = await fields.evaluateAll(nodes => nodes.map(n => n.value));
    expect(raw.length).toBeGreaterThan(0);
    const boxes = [];
    for (let i = 0; i < raw.length; i++) {
      await fields.nth(i).focus();
      const rect = page.locator('#ocr-overlay rect');
      await expect(rect).toHaveCount(1);
      boxes.push(await rect.evaluate(n => Object.fromEntries(['x', 'y', 'width', 'height'].map(k => [k, Number(n.getAttribute(k))]))));
    }
    const measurements = measureRegions(sample.regions, raw, boxes);
    const bounds = boxes.every(b => b.width > 0 && b.height > 0 && b.x >= 0 && b.y >= 0 &&
      b.x + b.width <= metadata.width + .1 && b.y + b.height <= metadata.height + .1);
    const result = {sourceBase: '4d697df9ac4e0288f0178ffd0b51630e7247e0de',
      codeCommit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
      sample: sample.id, sampleKind: 'real-paper-scan', layout, language: sample.language,
      repeat: testInfo.repeatEachIndex, browser: browser.version(), node: process.version,
      metadata, assets, rawUiLines: raw, boxes, boxesWithinPage: bounds, measurements};
    const save = () => writeFile(testInfo.outputPath('comparison.json'), JSON.stringify(result, null, 2));
    await save();
    console.log(`${sample.id} / ${layout}: annotated CER=${measurements.selectedRegionCer.toFixed(6)}, spatial CER=${measurements.spatialRegionCer?.toFixed(6)}, inversions=${measurements.readingOrder.inversions}`);
    expect(bounds).toBe(true);
    const txt = await downloadBytes(page, page.locator('#ocr-text-download'));
    expect(txt.toString('utf8')).toBe('\uFEFF第 1 頁\n' + raw.join('\n'));
    await writeFile(testInfo.outputPath('raw.txt'), txt);
    await page.locator('#ocr-save').click(); await page.locator('#ocr-close').click();
    const outputBytes = await downloadBytes(page, page.locator('#export-pdf'));
    await writeFile(testInfo.outputPath('raw-output.pdf'), outputBytes);
    const [output] = await inspectPdf(page, outputBytes);
    result.rawPdf = output;
    result.rawPdfTextMatchesUi = compact(output.text) === compact(raw.join(''));
    result.pixelsUnchanged = output.pixelHash === original.pixelHash;
    await save();
    expect(result.rawPdfTextMatchesUi).toBe(true);
    expect(result.pixelsUnchanged).toBe(true);
    expect(output.hiddenModes).toContain(3);
    expect([output.width, output.height]).toEqual([original.width, original.height]);
    // Independent known strings verify editing/export, not OCR accuracy.
    await page.locator('#ocr-review').click(); await expect(page.locator('#ocr-save')).toBeEnabled();
    // Cover the beginning, middle, end and every annotated region without
    // spending minutes retyping every line of a dense historical page.
    const editedIndices = [...new Set([0, Math.floor(raw.length / 2), raw.length - 1,
      ...measurements.readingOrder.observed.map(o => o.line)])];
    const corrected = [...raw];
    for (const i of editedIndices) {
      corrected[i] = `核對第${i + 1}行`;
      await fields.nth(i).fill(corrected[i]);
    }
    await page.locator('#ocr-save').click(); await page.locator('#ocr-close').click();
    await page.locator('#ocr-review').click(); await expect(page.locator('#ocr-save')).toBeEnabled();
    expect(await fields.evaluateAll(nodes => nodes.map(n => n.value))).toEqual(corrected);
    const editedTxt = await downloadBytes(page, page.locator('#ocr-text-download'));
    expect(editedTxt.toString('utf8')).toBe('\uFEFF第 1 頁\n' + corrected.join('\n'));
    await page.locator('#ocr-close').click();
    const reviewed = await downloadBytes(page, page.locator('#export-pdf'));
    const [reviewedPdf] = await inspectPdf(page, reviewed);
    expect(compact(reviewedPdf.text)).toBe(compact(corrected.join('')));
    expect(reviewedPdf.pixelHash).toBe(original.pixelHash);
    expect(reviewedPdf.hiddenModes).toContain(3);
    for (const i of editedIndices) {
      const matches = reviewedPdf.textItems.filter(item => item.text === corrected[i]);
      expect(matches).toHaveLength(1);
      const [item] = matches;
      expect(Math.abs(item.x - boxes[i].x)).toBeLessThan(.1);
      expect(Math.abs(item.y - (metadata.height - boxes[i].y - boxes[i].height * .85))).toBeLessThan(.1);
      expect(Math.abs(item.width - boxes[i].width)).toBeLessThan(.1);
    }
    await writeFile(testInfo.outputPath('reviewed-output.pdf'), reviewed);
    result.reviewedPdfCoordinatesMatchUi = true;
    result.reviewedLineIndices = editedIndices;
    result.reviewedTextAndPixelsPass = true;
    result.externalRequests = external;
    result.pageErrors = errors;
    await save();
    expect(errors).toEqual([]); expect(external).toEqual([]);
  });
}
