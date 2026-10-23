import test from 'node:test';
import assert from 'node:assert/strict';
import {readPreferences, matchingPreset, outputPresets, validSettings, createExportReceipts} from '../../dist/workflow-core.mjs';
import {sheetSize, validateFreeLayout, arrangeItems, composeFreePdf} from '../../dist/free-layout-core.mjs';
import {PDFDocument, PDFRawStream, PDFName} from '../../dist/vendor/pdf-lib/pdf-lib.mjs';
import {createFixtures} from '../support/pdfs.mjs';

test('remembered settings whitelist values and exclude documents, names and passwords', () => {
  const settings = {...outputPresets.sharp, filename: 'private.pdf', password: 'secret', bytes: [1, 2]};
  assert.deepEqual(readPreferences(JSON.stringify({version: 1, remember: true, settings})),
    {version: 1, remember: true, settings: {dpi: 600, format: 'png', maxEdge: 0, quality: .95}});
  for (const value of ['{', 'null', '{}', JSON.stringify({version: 1, settings: {...settings, dpi: 999}}),
    JSON.stringify({version: 1, settings: {...settings, maxEdge: -1}}), JSON.stringify({version: 1, settings: {...settings, format: 'svg'}})]) assert.equal(readPreferences(value), null);
  assert.deepEqual(readPreferences(JSON.stringify({version: 1, remember: false, settings})), {version: 1, remember: false});
  assert.equal(validSettings({...settings, quality: NaN}), false);
  assert.equal(matchingPreset({...outputPresets.sharp, quality: .5}), 'sharp');
  assert.equal(matchingPreset({...outputPresets.small, maxEdge: 512}), 'custom');
});

test('export receipts distinguish partial output, reordering, edits and stale previews', () => {
  const a = {id: 'a', sourceId: 'A', index: 0}, b = {id: 'b', sourceId: 'A', index: 1}, receipts = createExportReceipts();
  assert.equal(receipts.pending([]), false); assert.equal(receipts.pending([a, b]), true);
  receipts.mark([a], [a, b]); assert.equal(receipts.pending([a, b]), true);
  receipts.mark([b], [a, b]); assert.equal(receipts.pending([a, b]), false);
  assert.equal(receipts.pending([a]), true, 'removing the last page changes the output document');
  assert.equal(receipts.pending([b, a]), true);
  const edited = {...a, rotation: 90}; assert.equal(receipts.pending([edited, b]), true);
  receipts.mark([a], [edited, b]); assert.equal(receipts.pending([edited, b]), true);
  receipts.mark([edited], [edited, b]); assert.equal(receipts.pending([edited, b]), false);
  assert.equal(receipts.pending([{...edited, annotations: [{text: 'new'}]}, b]), true);
  receipts.clear(); assert.equal(receipts.pending([a]), true);
});

const piece = (id, record, extra = {}) => ({id, type: 'page', record, x: 10, y: 10, width: 60, height: 80, ...extra});
test('free A4 validates finite geometry, bounds, item identity and title input', () => {
  const item = piece('a', {sourceId: 'A', index: 0});
  assert.deepEqual(sheetSize('portrait'), {width: 210, height: 297});
  for (const changed of [{x: -1}, {width: NaN}, {height: 0}, {x: 200}, {record: {sourceId: 'A', index: -1}}]) assert.throws(() => validateFreeLayout({orientation: 'portrait', items: [{...item, ...changed}]}));
  assert.throws(() => validateFreeLayout({orientation: 'portrait', items: [item, item]}));
  assert.throws(() => validateFreeLayout({orientation: 'portrait', items: []}));
  const title = {id: 'text', type: 'text', x: 10, y: 10, width: 100, height: 12, text: 'title', fontSize: 20, color: '#302f2b'};
  for (const changed of [{text: ''}, {text: 'x'.repeat(201)}, {fontSize: 200}, {color: 'url(x)'}]) assert.throws(() => validateFreeLayout({orientation: 'portrait', items: [{...title, ...changed}]}));
});

test('auto arrangement preserves aspect ratio, order and input records on both A4 orientations', () => {
  const original = Array.from({length: 12}, (_, i) => piece(String(i), {sourceId: 'A', index: 0}));
  for (const orientation of ['portrait', 'landscape']) {
    const items = arrangeItems(original, orientation); validateFreeLayout({items, orientation});
    assert.deepEqual(items.map(i => i.id), original.map(i => i.id));
    for (const item of items) assert.ok(Math.abs(item.width / item.height - .75) < 1e-10);
  }
  assert.equal(original[0].x, 10); assert.equal(original[0].width, 60);
});

test('free PDF keeps vector page content, crops, rotation, repeated sources and a blank page', async () => {
  const {sources, records} = await createFixtures(), blank = await PDFDocument.create(); blank.addPage([300, 400]);
  sources.set('blank', {doc: blank});
  const items = [piece('a', {...records[0], crop: {x: 10, y: 20, width: 120, height: 180}, rotation: 90}),
    piece('b', records[0]), piece('c', records[4]), piece('blank', {id: 'blank', sourceId: 'blank', index: 0})];
  const data = await composeFreePdf({orientation: 'landscape', items: arrangeItems(items, 'landscape')}, sources);
  const output = await PDFDocument.load(data, {updateMetadata: false});
  assert.equal(output.getPageCount(), 1); assert.equal(output.getProducer(), '紙間');
  assert.ok(Math.abs(output.getPage(0).getWidth() - 841.88976) < .001);
  const forms = output.context.enumerateIndirectObjects().filter(([, value]) => value instanceof PDFRawStream && value.dict.get(PDFName.of('Subtype')) === PDFName.of('Form'));
  const images = output.context.enumerateIndirectObjects().filter(([, value]) => value instanceof PDFRawStream && value.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'));
  assert.equal(forms.length, 4); assert.equal(images.length, 0);
  assert.equal(sources.get('A').doc.getPage(0).getRotation().angle, 0);
  assert.equal(sources.get('A').doc.getPage(0).getCropBox().width, 300);
  assert.ok(data.length > 1000);
});

test('repeated free-layout pieces share their original image resource', async () => {
  const doc = await PDFDocument.create(), image = await doc.embedPng(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'));
  doc.addPage([300, 400]).drawImage(image, {x: 0, y: 0, width: 300, height: 400});
  const record = {id: 'original', sourceId: 's', index: 0}, items = arrangeItems(Array.from({length: 30}, (_, i) => piece(String(i), record)), 'portrait');
  const output = await PDFDocument.load(await composeFreePdf({orientation: 'portrait', items}, new Map([['s', {doc}]])));
  const images = output.context.enumerateIndirectObjects().filter(([, value]) => value instanceof PDFRawStream && value.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'));
  assert.equal(images.length, 1);
});

test('free PDF rejects an already aborted export without modifying sources', async () => {
  const {sources, records} = await createFixtures(), controller = new AbortController(); controller.abort();
  await assert.rejects(composeFreePdf({orientation: 'portrait', items: [piece('a', records[0])]}, sources, 'cancel', {signal: controller.signal}), {name: 'AbortError'});
  assert.equal(sources.get('A').doc.getPageCount(), 2);
});
