import test from 'node:test';
import assert from 'node:assert/strict';
import {scanConditions, observeReadingOrder} from '../support/scan-conditions.mjs';
import {characterErrorRate} from '../support/scans.mjs';

const condition = scanConditions.find(item => item.id === 'two-column-chinese');
const box = (column, row, width = 420) => ({x: (column ? 850 : 100) * 0.36,
  y: (110 + row * 160) * 0.36, width: width * 0.36, height: 50 * 0.36});
const columns = [0, 1].flatMap(c => [0, 1, 2, 3].map(r => box(c, r)));

test('reading-order observations distinguish columns, row interleaving and merged lines', () => {
  assert.equal(observeReadingOrder(condition, columns).status, 'expected-order');
  const interleaved = [0, 1, 2, 3].flatMap(r => [box(0, r), box(1, r)]);
  assert.equal(observeReadingOrder(condition, interleaved).status, 'different-order');
  const merged = [0, 1, 2, 3].map(r => box(0, r, 1170));
  assert.equal(observeReadingOrder(condition, merged).status, 'cross-column-lines');
  assert.equal(observeReadingOrder(condition, columns.slice(1)).status, 'inconclusive-missing-or-unknown');
  assert.equal(observeReadingOrder(condition, []).status, 'inconclusive-missing-or-unknown');
  assert.equal(observeReadingOrder(condition, [{...box(0, 0), y: 340}, ...columns]).status, 'inconclusive-missing-or-unknown');
  assert.equal(observeReadingOrder(condition, [columns[0], ...columns]).status, 'expected-order');
});

test('existing CER preserves ordering errors and insertions without new normalization rules', () => {
  assert.equal(characterErrorRate('甲乙丙丁', '甲乙丙丁'), 0);
  assert.equal(characterErrorRate('甲乙丙丁', '甲丙乙丁'), 0.5);
  assert.equal(characterErrorRate('甲', '甲乙丙'), 2);
  assert.equal(characterErrorRate('Ａ，B。', 'a b'), 0);
});
