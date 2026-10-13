import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from '../../dist/vendor/pdf-lib/pdf-lib.mjs';
import {sheetLayout, fitPage, imposePdf} from '../../dist/imposition-core.mjs';
import {createFixtures} from '../support/pdfs.mjs';

test('A4 grid validates inputs, fits content and orders cells left-to-right then top-to-bottom', () => {
  const layout = sheetLayout({rows: 2, columns: 2, orientation: 'portrait', margin: 10, gap: 5});
  assert.ok(Math.abs(layout.width - 595.27559) < .001);
  assert.ok(Math.abs(layout.height - 841.88976) < .001);
  assert.ok(layout.cells[0].x < layout.cells[1].x);
  assert.ok(layout.cells[0].y > layout.cells[2].y);
  for (const options of [{rows: 0}, {columns: 1.5}, {margin: NaN}, {gap: -1}, {orientation: 'bad'}, {rows: 6, columns: 6, gap: 50}]) {
    assert.throws(() => sheetLayout(options));
  }
  for (const rotation of [0, 90, 180, 270, -90, 450]) {
    const box = {width: 100, height: 200}, cell = {x: 10, y: 20, width: 400, height: 300};
    const placement = fitPage(box, rotation, cell), radians = placement.rotate.angle * Math.PI / 180;
    const corners = [[0,0],[placement.width,0],[0,placement.height],[placement.width,placement.height]]
      .map(([x,y]) => [placement.x + x*Math.cos(radians)-y*Math.sin(radians), placement.y+x*Math.sin(radians)+y*Math.cos(radians)]);
    for (const [x,y] of corners) { assert.ok(x >= cell.x-.001 && x <= cell.x+cell.width+.001); assert.ok(y >= cell.y-.001 && y <= cell.y+cell.height+.001); }
  }
});

test('imposition handles reordered sources, partial final sheets and blank pages without changing originals', async () => {
  const {sources, records} = await createFixtures();
  const selected = [records[4], records[0], records[2], records[1], records[3]];
  const bytes = await imposePdf(selected, sources, {rows: 2, columns: 2, orientation: 'portrait'});
  const output = await PDFDocument.load(bytes);
  assert.equal(output.getPageCount(), 2);
  assert.equal(sources.get('A').doc.getPageCount(), 2);
  assert.equal(sources.get('B').doc.getPageCount(), 3);
  assert.equal(sources.get('A').doc.getPage(0).getRotation().angle, 0);
  const blank = await PDFDocument.create(); blank.addPage([300,400]);
  const result = await imposePdf([{id:'blank',sourceId:'blank',index:0}],new Map([['blank',{doc:blank}]]),{});
  assert.equal((await PDFDocument.load(result)).getPageCount(),1);
  await assert.rejects(imposePdf([],sources,{}));
});
