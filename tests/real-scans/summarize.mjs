import {readdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {measureRegions} from './metrics.mjs';

const manifest = JSON.parse(await readFile(new URL('./manifest.json', import.meta.url)));
const roots = process.argv.slice(2);
if (!roots.length) roots.push('real-scan-results');
const sha = b => createHash('sha256').update(b).digest('hex');
async function walk(dir) {
  return (await Promise.all((await readdir(dir, {withFileTypes: true})).map(async e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.name === 'comparison.json' ? [p] : [];
  }))).flat();
}
const records = [];
for (const root of roots) for (const file of await walk(root)) {
  const result = JSON.parse(await readFile(file));
  if (!result.reviewedTextAndPixelsPass || !result.reviewedPdfCoordinatesMatchUi)
    throw new Error(`Incomplete functional checks: ${file}`);
  result.measurements = measureRegions(manifest.pages.find(s => s.id === result.sample).regions,
    result.rawUiLines, result.boxes);
  result.outputHashes = {};
  for (const name of ['input-image-only.pdf', 'raw-output.pdf', 'reviewed-output.pdf', 'raw.txt'])
    result.outputHashes[name] = sha(await readFile(path.join(path.dirname(file), name)));
  records.push(result);
}
const results = [];
for (const sample of manifest.pages) for (const layout of ['auto', 'single-column', 'two-column']) {
  const runs = records.filter(r => r.sample === sample.id && r.layout === layout).sort((a,b) => a.repeat - b.repeat);
  if (runs.length !== 2 || runs[0].repeat !== 0 || runs[1].repeat !== 1)
    throw new Error(`Need exactly two independent runs: ${sample.id} / ${layout}`);
  const stable = ['rawUiLines', 'boxes', 'measurements'].every(k => JSON.stringify(runs[0][k]) === JSON.stringify(runs[1][k]));
  const first = runs[0];
  results.push({...first, repeats: runs.map(r => ({repeat: r.repeat, outputHashes: r.outputHashes,
    browser: r.browser, pngSha256: r.metadata.pngSha256,
    reviewedLineIndices: r.reviewedLineIndices ?? r.rawUiLines.map((_,i)=>i),
    rawPdfTextMatchesUi: r.rawPdfTextMatchesUi, pixelsUnchanged: r.pixelsUnchanged,
    reviewedPdfCoordinatesMatchUi: r.reviewedPdfCoordinatesMatchUi,
    reviewedTextAndPixelsPass: r.reviewedTextAndPixelsPass})), stableAcrossRepeats: stable});
}
const summary = {baseCommit: '4d697df9ac4e0288f0178ffd0b51630e7247e0de',
  physicalPages: 3, distinctWorks: 2, pairedDerivatives: 1, inputCases: 4, runs: records.length,
  normalization: 'Existing characterErrorRate from tests/support/scans.mjs; NFKC, lowercase, ignore whitespace/punctuation/symbols; no cap, no changes.',
  scoreScope: 'Only fixed human-transcribed regions. Full pages are recognized and exported; the remainder has no accuracy ground truth.',
  results};
await writeFile('tests/reports/ocr-real-scans-20261012.json', JSON.stringify(summary, null, 2) + '\n');
for (const r of results) console.log([r.sample, r.layout, r.measurements.selectedRegionCer.toFixed(6),
  r.measurements.spatialRegionCer?.toFixed(6) ?? 'N/A', r.measurements.readingOrder.status,
  r.measurements.readingOrder.inversions, r.stableAcrossRepeats].join('\t'));
