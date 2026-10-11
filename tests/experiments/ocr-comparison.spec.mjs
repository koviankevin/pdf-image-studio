import {readFile, writeFile} from 'node:fs/promises';
import {test, expect} from '../browser/fixtures.mjs';
import {scanCases, createScanPdf, characterErrorRate} from '../support/scans.mjs';

const variants = [
  {name: 'baseline', psm: 3, dpi: 300},
  {name: 'single-column', psm: 4, dpi: 300},
  {name: 'single-block', psm: 6, dpi: 300},
  {name: 'sparse', psm: 11, dpi: 300},
  {name: 'dpi200', psm: 3, dpi: 200},
  {name: 'dpi400', psm: 3, dpi: 400},
  {name: 'chinese-only', psm: 3, dpi: 300, language: 'chi_tra'},
  {name: 'english-first', psm: 3, dpi: 300, language: 'eng+chi_tra'},
  {name: 'sauvola', psm: 3, dpi: 300, parameters: {thresholding_method: '2'}},
  {name: 'no-vertical', psm: 3, dpi: 300, parameters: {textord_tabfind_vertical_text: '0'}},
  {name: 'no-tables', psm: 3, dpi: 300, parameters: {textord_tabfind_find_tables: '0'}},
  {name: 'single-column-repeat2', psm: 4, dpi: 300},
  {name: 'single-column-repeat3', psm: 4, dpi: 300},
];

// Fail if the experiment injection points change, rather than silently measuring
// a different configuration. Only the served copy changes, never the source file.
function replaceOnce(source, before, after) {
  expect(source.split(before).length - 1).toBe(1);
  return source.replace(before, after);
}

for (const scenario of scanCases) test(`${scenario.language}: OCR parameter comparison (informational)`, async ({browser, serverURL}, testInfo) => {
  const source = await readFile(new URL('../../dist/ocr-tools.mjs', import.meta.url), 'utf8');
  const results = [];
  // English is the control for the proposed mode, not for Chinese-only models.
  for (const variant of scenario.language === 'eng' ? variants.slice(0, 2) : variants) {
    const context = await browser.newContext();
    try {
      const external = [], errors = [];
      await context.route(/^https?:\/\//, route => {
        if (new URL(route.request().url()).origin === serverURL) return route.continue();
        external.push(route.request().url());
        return route.abort();
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      // Real UI, PDF.js rendering, Tesseract worker, WASM and bundled language
      // files. Route interception changes only parameters and records results;
      // it never supplies recognition text, geometry or confidence.
      let code = replaceOnce(source, 'const rendered=await race(api.renderBlob(',
        `await race(worker.setParameters(${JSON.stringify({tessedit_pageseg_mode: String(variant.psm), ...variant.parameters})}));const rendered=await race(api.renderBlob(`);
      code = replaceOnce(code, "page.index,300,'png'", `page.index,${variant.dpi},'png'`);
      if (variant.language) code = replaceOnce(code, "createWorker($('ocr-language').value,1,", `createWorker('${variant.language}',1,`);
      code = replaceOnce(code, 'const sx=viewport.width/rendered.width', `
        window.ocrMeasurements??=[];
        window.ocrMeasurements.push({text:data.text,confidence:data.confidence,
          width:rendered.width,height:rendered.height,dpi:rendered.dpi,
          imageSha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',await rendered.blob.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join(''),
          lines:(data.blocks||[]).flatMap(b=>b.paragraphs||[]).flatMap(p=>p.lines||[]).filter(l=>l.text?.trim()).map(l=>({text:l.text.trim(),bbox:l.bbox,confidence:l.confidence}))});
        const sx=viewport.width/rendered.width`);
      await page.route('**/ocr-tools.mjs*', route => route.fulfill({contentType: 'text/javascript', body: code}));
      await page.goto(serverURL);
      await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled', 'false');
      const input = await createScanPdf(page, scenario.pages);
      await page.locator('#file-input').setInputFiles({name: 'synthetic-scans.pdf', mimeType: 'application/pdf', buffer: input});
      await expect(page.locator('#page-count')).toHaveText('2');
      await expect(page.locator('#file-input')).toBeEnabled();
      await page.locator('#select-all').click();
      await page.locator('#ocr-language').selectOption(scenario.language);
      await page.locator('#ocr-start').click();
      await expect(page.locator('#ocr-dialog')).toBeVisible({timeout: 120_000});
      const raw = await page.evaluate(() => window.ocrMeasurements);
      expect(raw).toHaveLength(2);
      const pages = raw.map((measurement, i) => {
        const expected = scenario.pages[i].join('\n');
        const actual = measurement.lines.map(line => line.text).join('\n');
        return {...measurement, page: i + 1, expected, actual, characterErrorRate: characterErrorRate(expected, actual)};
      });
      results.push({...variant, language: variant.language || scenario.language, pages});
      console.log(`${scenario.language} / ${variant.name}: ${pages.map(p => p.characterErrorRate.toFixed(6)).join(', ')}`);
      expect(errors).toEqual([]);
      expect(external).toEqual([]);
      await writeFile(testInfo.outputPath('comparison.json'), JSON.stringify({
        browser: browser.version(), gating: false,
        normalization: 'NFKC, lowercase, ignore whitespace/punctuation/symbols',
        results,
      }, null, 2));
    } finally { await context.close(); }
  }
  await testInfo.attach('comparison.json', {path: testInfo.outputPath('comparison.json'), contentType: 'application/json'});
});
