import {readFile, realpath, writeFile} from 'node:fs/promises';
import {resolve, dirname, relative, isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {modes, scorePage, summarize} from '../tests/support/ocr-benchmark.mjs';

const sha256 = data => createHash('sha256').update(data).digest('hex');
function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}: required`);
}
async function pinnedFile(root, file) {
  if (!file || typeof file.path !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256))
    throw new Error('file path and SHA-256 are required');
  const path = await realpath(resolve(root, file.path));
  const rel = relative(root, path);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('sample path escapes manifest directory');
  const bytes = await readFile(path);
  if (sha256(bytes) !== file.sha256) throw new Error(`SHA-256 mismatch: ${file.path}`);
  return bytes;
}
export async function evaluate(manifestPath, predictionsPath) {
  const manifestBytes = await readFile(manifestPath), predictionBytes = await readFile(predictionsPath);
  const manifest = JSON.parse(manifestBytes), input = JSON.parse(predictionBytes);
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.samples) || !manifest.samples.length)
    throw new Error('No admitted samples: real-scan benchmark is not complete');
  if (input.schemaVersion !== 1 || !Array.isArray(input.predictions)) throw new Error('invalid predictions');
  for (const key of ['sourceCommit', 'engine', 'browser', 'hardware', 'languageData'])
    requireText(input.run?.[key], `run.${key}`);
  const root = await realpath(dirname(resolve(manifestPath))), ids = new Set(), keys = new Set(), imageHashes = new Set();
  const expected = new Map();
  for (const sample of manifest.samples) {
    for (const key of ['id', 'documentId', 'sourceUrl', 'license', 'language', 'layout', 'quality'])
      requireText(sample[key], `sample.${key}`);
    if (!/^https?:\/\//.test(sample.sourceUrl)) throw new Error('sourceUrl must identify original source');
    if (ids.has(sample.id)) throw new Error(`duplicate sample: ${sample.id}`);
    ids.add(sample.id);
    if (!['physical-scan', 'camera'].includes(sample.acquisition)) throw new Error('not a real acquisition');
    if (sample.review?.status !== 'human-reviewed') throw new Error(`unreviewed ground truth: ${sample.id}`);
    requireText(sample.review.reviewer, 'review.reviewer');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sample.review.date || '')) throw new Error('review.date required');
    await pinnedFile(root, sample.image);
    if (imageHashes.has(sample.image.sha256)) throw new Error('duplicate image: do not inflate page coverage');
    imageHashes.add(sample.image.sha256);
    const gt = JSON.parse((await pinnedFile(root, sample.groundTruth)).toString('utf8'));
    expected.set(sample.id, {sample, gt});
  }
  const rows = [];
  for (const prediction of input.predictions) {
    const entry = expected.get(prediction.sampleId);
    if (!entry || !modes.includes(prediction.mode)) throw new Error('unknown sample or mode');
    const key = `${prediction.sampleId}/${prediction.mode}`;
    if (keys.has(key)) throw new Error(`duplicate prediction: ${key}`);
    keys.add(key);
    if (prediction.imageSha256 !== entry.sample.image.sha256 || prediction.language !== entry.sample.language)
      throw new Error(`input/language mismatch: ${key}`);
    for (const metric of ['elapsedMs', 'peakMemoryBytes']) {
      if (!(metric in prediction) || !(prediction[metric] === null ||
          (Number.isFinite(prediction[metric]) && prediction[metric] >= 0)))
        throw new Error(`${metric}: nonnegative number or explicit null required`);
    }
    if (prediction.peakMemoryBytes !== null) requireText(prediction.memoryScope, 'memoryScope');
    if (typeof prediction.coldStart !== 'boolean' && prediction.coldStart !== null)
      throw new Error('coldStart: boolean or null required');
    rows.push({sampleId: prediction.sampleId, mode: prediction.mode, language: prediction.language,
      layout: entry.sample.layout, quality: entry.sample.quality, ...scorePage(entry.gt, prediction),
      elapsedMs: prediction.elapsedMs, peakMemoryBytes: prediction.peakMemoryBytes,
      memoryScope: prediction.memoryScope || null, coldStart: prediction.coldStart});
  }
  for (const id of ids) for (const mode of modes)
    if (!keys.has(`${id}/${mode}`)) throw new Error(`missing prediction: ${id}/${mode}`);
  return {schemaVersion: 1, gating: false, measuredAt: new Date().toISOString(),
    manifestSha256: sha256(manifestBytes), predictionsSha256: sha256(predictionBytes), run: input.run,
    coverage: {realScanPages: ids.size, sourceDocuments: new Set(manifest.samples.map(x => x.documentId)).size},
    normalization: {strict: 'CRLF/CR to LF only; Unicode code points; preserve case, whitespace, punctuation and symbols',
      legacy: 'existing scans.mjs: NFKC, lowercase, ignore whitespace/punctuation/symbols'},
    byMode: Object.fromEntries(modes.map(mode => [mode, summarize(rows.filter(x => x.mode === mode))])), rows};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [manifest, predictions, output] = process.argv.slice(2);
    if (!manifest || !predictions || !output) throw new Error('Usage: node scripts/ocr-benchmark.mjs MANIFEST PREDICTIONS OUTPUT');
    const report = await evaluate(manifest, predictions);
    await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    console.log(`Scored ${report.coverage.realScanPages} real pages; informational only`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
