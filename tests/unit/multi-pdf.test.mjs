import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument, PDFArray, PDFHexString, decodePDFRawStream} from '../../dist/vendor/pdf-lib/pdf-lib.mjs';
import {movePages, assemblePdf} from '../../dist/editor-core.mjs';
import {createFixtures, pageById} from '../support/pdfs.mjs';

// Read our controlled Helvetica fixture's text operators after saving/reloading.
// This is deliberately not a general PDF text extractor; browser tests also
// independently parse every downloaded page with the shipped PDF.js.
function fixtureText(page) {
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray() : [contents];
  return streams.flatMap(ref => {
    const stream = page.doc.context.lookup(ref);
    const decoded = new TextDecoder().decode(decodePDFRawStream(stream).decode());
    return [...decoded.matchAll(/<([\da-f]+)>\s*Tj/gi)].map(match => PDFHexString.of(match[1]).decodeText());
  }).join(' ');
}

async function assertExport(records, sources, expectedIds) {
  const bytes = await assemblePdf(records, sources, 'Synthetic regression');
  const output = await PDFDocument.load(bytes);
  assert.equal(output.getPageCount(), expectedIds.length);
  assert.equal(output.getTitle(), 'Synthetic regression');
  output.getPages().forEach((page, i) => {
    const expected = pageById(expectedIds[i]);
    assert.equal(fixtureText(page), expected.text, `exported page ${i + 1}`);
    assert.deepEqual(page.getSize(), {width: expected.width, height: expected.height});
  });
  return output;
}

test('cross-source block move preserves original indexes, identity and input order', () => {
  const records = ['A1', 'A2', 'B1', 'B2', 'B3'].map(id => {
    const {sourceId, index} = pageById(id);
    return Object.freeze({id, sourceId, index});
  });
  Object.freeze(records);
  // Selection order differs from workspace order; moving keeps workspace order.
  const moved = movePages(records, ['B3', 'A2'], 1);
  assert.deepEqual(moved.map(page => page.id), ['A2', 'B3', 'A1', 'B1', 'B2']);
  assert.deepEqual(records.map(page => page.id), ['A1', 'A2', 'B1', 'B2', 'B3']);
  for (const page of moved) assert.strictEqual(page, records.find(original => original.id === page.id));
  assert.deepEqual(movePages(moved, ['A2', 'B3'], 4).map(page => page.id), ['A1', 'B1', 'B2', 'A2', 'B3']);
});

test('invalid moves fail instead of silently producing a wrong order', () => {
  const pages = [{id: 'A1'}, {id: 'B1'}];
  for (const position of [0, -1, 3, 1.5, NaN]) {
    assert.throws(() => movePages(pages, ['A1'], position), /移動位置/);
  }
  assert.throws(() => movePages(pages, ['missing'], 1), /勾選/);
});

test('two-page and three-page PDFs export in interleaved workspace order', async () => {
  const {sources, records} = await createFixtures();
  const expected = ['B3', 'A2', 'B1', 'A1', 'B2'];
  let moved = records;
  expected.forEach((id, i) => { moved = movePages(moved, [id], i + 1); });
  assert.deepEqual(moved.map(({sourceId, index}) => [sourceId, index]),
    [['B', 2], ['A', 1], ['B', 0], ['A', 0], ['B', 1]]);
  await assertExport(moved, sources, expected);
  // Repeated export and a selected subset must not use workspace positions as
  // source indexes or mutate the original PDF documents.
  await assertExport(moved, sources, expected);
  await assertExport(moved.filter(page => ['B3', 'A1'].includes(page.id)), sources, ['B3', 'A1']);
  for (const [id, source] of sources) {
    assert.equal(source.doc.getPageCount(), id === 'A' ? 2 : 3);
    source.doc.getPages().forEach((page, i) => assert.equal(fixtureText(page), `SOURCE_${id}_PAGE_${i + 1}`));
  }
});

test('page edits stay attached to the correct source after reordering', async () => {
  const {sources, records} = await createFixtures();
  const crop = {x: 10, y: 20, width: 200, height: 300};
  const edited = records.map(page => page.id === 'B3' ? {...page, rotation: 90, crop} : page);
  const moved = movePages(edited, ['B3'], 1);
  const output = await assertExport(moved, sources, ['B3', 'A1', 'A2', 'B1', 'B2']);
  assert.equal(output.getPage(0).getRotation().angle, 90);
  assert.deepEqual(output.getPage(0).getCropBox(), crop);
  for (const page of output.getPages().slice(1)) assert.equal(page.getRotation().angle, 0);
  assert.equal(sources.get('B').doc.getPage(2).getRotation().angle, 0);
});

test('export rejects empty selection and missing source', async () => {
  await assert.rejects(assemblePdf([], new Map(), 'empty'), /至少選取一頁/);
  await assert.rejects(assemblePdf([{id: 'A1', sourceId: 'missing', index: 0}], new Map(), 'missing'), /找不到來源/);
});
