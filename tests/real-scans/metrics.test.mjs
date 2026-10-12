import test from 'node:test';
import assert from 'node:assert/strict';
import {measureRegions} from './metrics.mjs';

const regions = [{id: 'L', rect: [0, 0, 40, 20], text: '左欄甲乙'},
  {id: 'R', rect: [60, 0, 100, 20], text: '右欄丙丁'}];
const boxes = [{x: 0, y: 0, width: 40, height: 20}, {x: 60, y: 0, width: 40, height: 20}];

test('correct glyphs in reversed regions retain end-to-end CER and separate the order error', () => {
  const m = measureRegions(regions, ['右欄丙丁', '左欄甲乙'], boxes.toReversed());
  assert.ok(m.selectedRegionCer > 0);
  assert.equal(m.spatialRegionCer, 0);
  assert.equal(m.readingOrder.inversions, 1);
  assert.equal(m.readingOrder.status, 'order-conflict');
});
test('merged lines are counted once and never fabricated into per-region recognition scores', () => {
  const m = measureRegions(regions, ['左欄甲乙 右欄丙丁'], [{x: 0, y: 0, width: 100, height: 20}]);
  assert.equal(m.selectedRegionCer, 0);
  assert.equal(m.spatialRegionCer, null);
  assert.equal(m.spatialScoredCharacters, 0);
  assert.equal(m.readingOrder.mergedLines.length, 1);
});
test('a missing region counts as deletion and cannot be reported as correct reading order', () => {
  const m = measureRegions(regions, ['右欄丙丁'], [boxes[1]]);
  assert.equal(m.selectedRegionCer, .5);
  assert.equal(m.spatialRegionCer, .5);
  assert.deepEqual(m.readingOrder.missing, ['L']);
  assert.equal(m.readingOrder.status, 'incomplete-detection');
});
test('unannotated page text stays outside the explicitly partial score', () => {
  const m = measureRegions(regions, ['左欄甲乙', 'outside', '右欄丙丁'],
    [boxes[0], {x: 0, y: 100, width: 50, height: 20}, boxes[1]]);
  assert.equal(m.selectedRegionCer, 0);
  assert.equal(m.readingOrder.status, 'expected-region-order');
  assert.equal(m.regions[0].boxAreaInsideAnnotatedRegion, 1);
});
