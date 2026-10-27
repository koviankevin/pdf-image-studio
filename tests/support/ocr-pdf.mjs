import {readFile} from 'node:fs/promises';
import {expect} from '@playwright/test';

export async function downloadBytes(page, button) {
  const pending = page.waitForEvent('download');
  await button.click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  return readFile(await download.path());
}

export async function inspectPdf(page, bytes, {disableFontFace = false} = {}) {
  return page.evaluate(async ({data, disableFontFace}) => {
    const pdfjs = await import('/vendor/pdfjs/pdf.mjs');
    const {pdfCanvasContext} = await import('/pdf-canvas.mjs');
    const task = pdfjs.getDocument({data: new Uint8Array(data), isEvalSupported: false, disableFontFace,
      cMapUrl: `${location.origin}/vendor/pdfjs/cmaps/`, cMapPacked: true,
      standardFontDataUrl: `${location.origin}/vendor/pdfjs/standard_fonts/`,
      wasmUrl: `${location.origin}/vendor/pdfjs/wasm/`});
    try {
      const doc = await task.promise, result = [];
      for (let i = 1; i <= doc.numPages; i++) {
        // Other preview/search documents share the bundled PDF.js page mapper.
        // Bind each request to this inspected document before yielding.
        pdfjs.PagesMapper.instance.pagesNumber = doc.numPages;
        const pdfPage = await doc.getPage(i), viewport = pdfPage.getViewport({scale: 1});
        const text = await pdfPage.getTextContent();
        const operators = await pdfPage.getOperatorList();
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width; canvas.height = viewport.height;
        const ctx = pdfCanvasContext(canvas);
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
  }, {data: [...bytes], disableFontFace});
}
