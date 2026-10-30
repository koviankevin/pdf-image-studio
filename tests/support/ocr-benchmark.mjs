import {normalizeOcrText} from './scans.mjs';

export const modes = ['auto', 'single-column', 'two-column'];
export const strictText = text => text.replace(/\r\n?/g, '\n');
export function editDistance(a, b) {
  let row = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(
      row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}
export function cer(reference, actual, normalize = strictText) {
  const expected = [...normalize(reference)], predicted = [...normalize(actual)];
  const edits = editDistance(expected, predicted);
  return {edits, referenceCharacters: expected.length,
    rate: expected.length ? edits / expected.length : null};
}
const uniqueStrings = (items, name) => {
  if (!Array.isArray(items) || items.some(x => typeof x !== 'string' || !x) ||
      new Set(items).size !== items.length) throw new Error(`${name}: expected unique nonempty IDs`);
};
export function readingOrder(expected, predicted) {
  uniqueStrings(expected, 'reference blockOrder');
  if (predicted == null || !expected.length) return null;
  if (!Array.isArray(predicted) || predicted.some(x => typeof x !== 'string' || !x))
    throw new Error('predicted blockOrder: expected ID array');
  const seen = new Set(), duplicates = [], extra = [], common = [];
  for (const id of predicted) {
    if (seen.has(id)) duplicates.push(id);
    else if (!expected.includes(id)) extra.push(id);
    else common.push(expected.indexOf(id));
    seen.add(id);
  }
  let inversions = 0;
  for (let i = 0; i < common.length; i++) for (let j = i + 1; j < common.length; j++)
    if (common[i] > common[j]) inversions++;
  const pairs = common.length * (common.length - 1) / 2;
  const edits = editDistance(expected, predicted);
  return {edits, referenceBlocks: expected.length, rate: edits / expected.length,
    missing: expected.filter(id => !seen.has(id)), extra, duplicates,
    inversions, comparablePairs: pairs, inversionRate: pairs ? inversions / pairs : null};
}
export function keyFields(expected, predicted) {
  uniqueStrings(expected.map(x => x.id), 'reference fields');
  if (expected.some(x => typeof x.value !== 'string' || !x.value)) throw new Error('empty reference field');
  if (!expected.length || predicted == null) return null;
  if (typeof predicted !== 'object' || Array.isArray(predicted) ||
      Object.values(predicted).some(x => typeof x !== 'string')) throw new Error('fields: expected string map');
  const correct = expected.filter(x => Object.hasOwn(predicted, x.id) &&
    strictText(predicted[x.id]) === strictText(x.value)).length;
  return {correct, total: expected.length, exactMatchRate: correct / expected.length,
    missing: expected.filter(x => !Object.hasOwn(predicted, x.id)).map(x => x.id),
    extra: Object.keys(predicted).filter(id => !expected.some(x => x.id === id))};
}
export function scorePage(gt, prediction) {
  if (typeof gt.text !== 'string' || !gt.text.trim() || typeof prediction.text !== 'string')
    throw new Error('expected nonempty reference text and prediction text (empty OCR is allowed)');
  const legacy = cer(gt.text, prediction.text, normalizeOcrText);
  // Keep scans.mjs's historical empty-normalized-reference denominator of one.
  legacy.referenceCharacters = Math.max(legacy.referenceCharacters, 1);
  legacy.rate = legacy.edits / legacy.referenceCharacters;
  return {strict: cer(gt.text, prediction.text), legacy,
    fields: keyFields(gt.fields || [], prediction.fields),
    readingOrder: readingOrder(gt.blockOrder || [], prediction.blockOrder)};
}
export function summarize(rows) {
  const sum = xs => xs.reduce((a, b) => a + b, 0);
  const aggregate = name => {
    const edits = sum(rows.map(x => x[name].edits));
    const referenceCharacters = sum(rows.map(x => x[name].referenceCharacters));
    return {edits, referenceCharacters, rate: referenceCharacters ? edits / referenceCharacters : null};
  };
  const fields = rows.filter(x => x.fields), order = rows.filter(x => x.readingOrder);
  const fieldTotal = sum(fields.map(x => x.fields.total));
  const fieldCorrect = sum(fields.map(x => x.fields.correct));
  const orderEdits = sum(order.map(x => x.readingOrder.edits));
  const blocks = sum(order.map(x => x.readingOrder.referenceBlocks));
  return {pages: rows.length, strict: aggregate('strict'), legacy: aggregate('legacy'),
    fields: {measuredPages: fields.length, total: fieldTotal, correct: fieldCorrect,
      exactMatchRate: fieldTotal ? fieldCorrect / fieldTotal : null},
    readingOrder: {measuredPages: order.length, edits: orderEdits, referenceBlocks: blocks,
      rate: blocks ? orderEdits / blocks : null}};
}
