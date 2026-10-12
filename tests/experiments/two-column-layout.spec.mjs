import {readFile, writeFile} from 'node:fs/promises';
import {test, expect} from '../browser/fixtures.mjs';
import {createConditionPdf} from '../support/scan-conditions.mjs';

// Optional raw hierarchy inspection. Instrument only the served copy, forwarding
// real worker results unchanged. No synthetic OCR answers, geometry or stubs.
test('inspect raw Tesseract blocks, paragraphs, lines and words on PR4 columns', async ({page}, testInfo) => {
  const source = await readFile(new URL('../../dist/ocr-tools.mjs', import.meta.url), 'utf8');
  const marker = 'const sx=viewport.width/rendered.width';
  expect(source.split(marker)).toHaveLength(2);
  await page.route('**/ocr-tools.mjs*', route => route.fulfill({contentType: 'text/javascript',
    body: source.replace(marker, 'window.rawOcrLayouts.push({text:data.text,blocks:data.blocks});' + marker)}));
  await page.goto('/');
  await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled', 'false');
  const fixture = await createConditionPdf(page);
  const input = Buffer.from(await page.evaluate(async bytes => {
    const {PDFDocument} = await import('/vendor/pdf-lib/pdf-lib.mjs');
    const source = await PDFDocument.load(new Uint8Array(bytes)), doc = await PDFDocument.create();
    const [page] = await doc.copyPages(source, [5]); doc.addPage(page); return [...await doc.save()];
  }, [...fixture.pdf]));
  const results = [];
  for (const layout of ['auto', 'single-column']) {
    if (results.length) await page.locator('#reset').click();
    await page.evaluate(() => {window.rawOcrLayouts = [];});
    await page.locator('#file-input').setInputFiles({name: 'PR4.pdf', mimeType: 'application/pdf', buffer: input});
    await expect(page.locator('#file-input')).toBeEnabled();
    await page.locator('#ocr-layout').selectOption(layout); await page.locator('#ocr-start').click();
    await expect(page.locator('#ocr-dialog')).toBeVisible({timeout: 120_000});
    results.push({layout, ...(await page.evaluate(() => window.rawOcrLayouts[0]))});
    await page.locator('#ocr-close').click();
  }
  await writeFile(testInfo.outputPath('raw-layouts.json'), JSON.stringify({sourcePngSha256: fixture.images[5].sha256, results}, null, 2));
});
