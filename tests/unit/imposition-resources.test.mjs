import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument, PDFRawStream, PDFName} from '../../dist/vendor/pdf-lib/pdf-lib.mjs';
import {imposePdf} from '../../dist/imposition-core.mjs';

async function fixture() {
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'));
  const records = Array.from({length: 40}, (_, index) => {
    doc.addPage([300, 400]).drawImage(image, {x: 10, y: 10, width: 100, height: 100});
    return {id: String(index), sourceId: 's', index};
  });
  return {doc, records, sources: new Map([['s', {doc}]])};
}

test('40 imposed pages retain one shared image resource', async () => {
  const {records, sources} = await fixture();
  const output = await PDFDocument.load(await imposePdf(records, sources, {}));
  const images = output.context.enumerateIndirectObjects().filter(([, v]) =>
    v instanceof PDFRawStream && v.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'));
  assert.equal(images.length, 1);
  assert.equal(output.getPageCount(), 20);
});

test('imposition stops before processing an already cancelled request', async () => {
  const {records, sources} = await fixture(), controller = new AbortController();
  controller.abort();
  await assert.rejects(imposePdf(records, sources, {}, 'Cancelled', {signal: controller.signal}), {name: 'AbortError'});
});

test('imposition yields to cancellation while assembling pages', async () => {
  const {records, sources} = await fixture(), controller = new AbortController();
  const running = imposePdf(records, sources, {}, 'Cancelled', {signal: controller.signal});
  setTimeout(() => controller.abort(), 0);
  await assert.rejects(running, {name: 'AbortError'});
});
