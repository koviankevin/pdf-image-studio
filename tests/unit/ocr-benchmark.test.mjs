import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {cer, scorePage, readingOrder, keyFields, summarize, modes} from '../support/ocr-benchmark.mjs';
import {characterErrorRate} from '../support/scans.mjs';
import {evaluate} from '../../scripts/ocr-benchmark.mjs';

test('strict CER preserves case, punctuation and fullwidth; Unicode is codepoint based', () => {
  assert.equal(cer('Aa！', 'aa!').rate, 2 / 3);
  assert.equal(cer('𠮷宏', '𠮷紅').rate, 0.5);
  assert.equal(cer('a\r\nb', 'a\nb').rate, 0);
  assert.equal(cer('', 'x').rate, null);
  assert.equal(cer('a', 'aaaa').rate, 3);
});
test('legacy metric retains the historical normalization exactly', () => {
  for (const [reference, prediction] of [['繁體Ａ！', '繁体a'], ['ABC, 123', 'abc123'], ['𠮷宏', '𠮷紅'], ['!!!', 'abc']])
    assert.equal(scorePage({text: reference}, {text: prediction}).legacy.rate,
      characterErrorRate(reference, prediction));
});
test('micro average uses character totals, not mean of per-page CER', () => {
  const rows = [scorePage({text: 'a'}, {text: ''}), scorePage({text: 'bbbbbbbbb'}, {text: 'bbbbbbbbb'})];
  assert.equal(summarize(rows).strict.rate, 0.1);
  assert.equal(summarize(rows).fields.exactMatchRate, null);
  assert.equal(summarize(rows).readingOrder.rate, null);
});
test('reading order distinguishes inversions, missing, extra and duplicate blocks', () => {
  const result = readingOrder(['L1', 'L2', 'R1', 'R2'], ['L1', 'R1', 'L2', 'L2', 'extra']);
  assert.deepEqual(result.missing, ['R2']);
  assert.deepEqual(result.extra, ['extra']);
  assert.deepEqual(result.duplicates, ['L2']);
  assert.equal(result.inversions, 1);
  assert.ok(result.rate > 0);
  assert.equal(readingOrder(['a'], []).inversionRate, null);
  assert.equal(readingOrder(['a'], undefined), null);
  assert.throws(() => readingOrder(['a', 'a'], []), /unique/);
});
test('key fields require exact values and report missing/extra separately', () => {
  const gt = [{id: 'amount', value: '1,200'}, {id: 'name', value: '林宏'}];
  assert.deepEqual(keyFields(gt, {amount: '1200', extra: 'x'}),
    {correct: 0, total: 2, exactMatchRate: 0, missing: ['name'], extra: ['extra']});
  assert.equal(keyFields(gt, {amount: '1,200', name: '林宏'}).exactMatchRate, 1);
  assert.equal(keyFields(gt, null), null);
});

// Deliberately artificial bytes/text: exercise validation, NEVER admitted as scan data.
async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), 'ocr-benchmark-unit-'));
  const image = Buffer.from('unit-only-artificial-image'), gt = JSON.stringify({text: '甲A!'});
  const hash = data => createHash('sha256').update(data).digest('hex');
  const sample = {id: 'unit', documentId: 'unit-doc', sourceUrl: 'https://example.invalid/unit',
    license: 'unit-fixture-only', language: 'chi_tra+eng', layout: 'single-column', quality: 'clean',
    acquisition: 'physical-scan', review: {status: 'human-reviewed', reviewer: 'unit-test sentinel, no actual review', date: '2026-10-30'},
    image: {path: 'unit.bin', sha256: hash(image)}, groundTruth: {path: 'unit.json', sha256: hash(gt)}};
  const manifest = {schemaVersion: 1, samples: [sample]};
  const predictions = {schemaVersion: 1, run: {sourceCommit: 'unit', engine: 'unit', browser: 'unit',
    hardware: 'unit', languageData: 'unit'}, predictions: modes.map(mode => ({sampleId: 'unit', mode,
      imageSha256: sample.image.sha256, language: sample.language, text: '甲A!', elapsedMs: null,
      peakMemoryBytes: null, coldStart: null}))};
  const manifestPath = join(root, 'manifest.json'), predictionsPath = join(root, 'predictions.json');
  const save = async () => {
    await writeFile(manifestPath, JSON.stringify(manifest));
    await writeFile(predictionsPath, JSON.stringify(predictions));
  };
  try {
    await writeFile(join(root, 'unit.bin'), image);
    await writeFile(join(root, 'unit.json'), gt);
    await save();
    await fn({root, manifest, predictions, save, run: () => evaluate(manifestPath, predictionsPath)});
  } finally { await rm(root, {recursive: true, force: true}); }
}
test('evaluator requires full three-mode input; unknown performance stays null', () => fixture(async f => {
  const report = await f.run();
  assert.equal(report.gating, false);
  assert.equal(report.byMode.auto.strict.rate, 0);
  assert.equal(report.rows[0].elapsedMs, null);
  f.predictions.predictions.pop(); await f.save();
  await assert.rejects(f.run, /missing prediction/);
}));
test('evaluator rejects empty or unreviewed manifest rather than claiming coverage', () => fixture(async f => {
  f.manifest.samples[0].review.status = 'model-generated'; await f.save();
  await assert.rejects(f.run, /unreviewed/);
  f.manifest.samples = []; await f.save();
  await assert.rejects(f.run, /No admitted samples/);
}));
test('evaluator verifies both image and ground truth hashes', () => fixture(async f => {
  await writeFile(join(f.root, 'unit.json'), '{"text":"changed"}');
  await assert.rejects(f.run, /SHA-256 mismatch/);
}));
test('evaluator rejects duplicate, mismatched and unknown predictions', () => fixture(async f => {
  f.predictions.predictions.push({...f.predictions.predictions[0]}); await f.save();
  await assert.rejects(f.run, /duplicate prediction/);
  f.predictions.predictions.pop(); f.predictions.predictions[0].imageSha256 = '0'.repeat(64); await f.save();
  await assert.rejects(f.run, /input\/language mismatch/);
  f.predictions.predictions[0].sampleId = 'unknown'; await f.save();
  await assert.rejects(f.run, /unknown sample/);
}));
test('evaluator rejects non-real acquisition and duplicate image counts', () => fixture(async f => {
  f.manifest.samples[0].acquisition = 'synthetic'; await f.save();
  await assert.rejects(f.run, /not a real acquisition/);
  f.manifest.samples[0].acquisition = 'camera';
  f.manifest.samples.push({...f.manifest.samples[0], id: 'unit-copy'}); await f.save();
  await assert.rejects(f.run, /duplicate image/);
}));
test('evaluator rejects samples outside the manifest directory', () => fixture(async f => {
  f.manifest.samples[0].image.path = '../outside.bin'; await f.save();
  await assert.rejects(f.run); // missing or out-of-root files both fail closed
}));
