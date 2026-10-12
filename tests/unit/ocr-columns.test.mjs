import test from 'node:test';
import assert from 'node:assert/strict';
import {columnLines} from '../../dist/ocr-columns.mjs';

test('right-column coordinates use full-page scale and offset, and sort top to bottom', () => {
  const data = {confidence: 90, blocks: [{paragraphs: [{lines: [
    {text: ' 下行 ', bbox: {x0: 10, y0: 90, x1: 80, y1: 110}},
    {text: ' 上行 ', bbox: {x0: 12, y0: 20, x1: 82, y1: 40}, confidence: 75},
  ]}]}]};
  assert.deepEqual(columnLines(data, {x: 500, width: 501, height: 700}, {x: .5, y: .25}), [
    {text: '上行', x: 256, y: 5, width: 35, height: 5, confidence: 75},
    {text: '下行', x: 255, y: 22.5, width: 35, height: 5, confidence: 90},
  ]);
});

test('missing blocks fall back only to their column; empty columns add no text', () => {
  const region = {x: 500, width: 501, height: 700}, scale = {x: .5, y: .25};
  assert.deepEqual(columnLines({text: ' 右欄\n內容 '}, region, scale), [
    {text: '右欄\n內容', x: 250, y: 0, width: 250.5, height: 175, confidence: 0},
  ]);
  assert.deepEqual(columnLines({text: '  ', blocks: []}, region, scale), []);
  assert.deepEqual(columnLines({}, region, scale), []);
});
