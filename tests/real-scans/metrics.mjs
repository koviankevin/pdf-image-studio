import {characterErrorRate, normalizeOcrText} from '../support/scans.mjs';

// Fixed human annotations, not a general layout detector. Keep the production
// output order; never edit or reorder it to lower the primary CER.
export function measureRegions(regions, lines, boxes) {
  const matches = boxes.map(box => regions.flatMap((region, i) => {
    const [x0, y0, x1, y1] = region.rect;
    const ox = Math.max(0, Math.min(box.x + box.width, x1) - Math.max(box.x, x0));
    const oy = Math.max(0, Math.min(box.y + box.height, y1) - Math.max(box.y, y0));
    return oy / Math.max(box.height, .01) >= .5 &&
      ox / Math.max(Math.min(box.width, x1 - x0), .01) >= .25 ? [i] : [];
  }));
  const indices = matches.flatMap((ids, i) => ids.length ? [i] : []);
  const expected = regions.map(r => r.text).join('\n');
  const actual = indices.map(i => lines[i]).join('\n');
  const regionScores = regions.map((region, id) => {
    const selected = indices.filter(i => matches[i].includes(id));
    const ambiguous = selected.some(i => matches[i].length > 1);
    const actual = selected.map(i => lines[i]).join('\n');
    const [x0, y0, x1, y1] = region.rect;
    const insideArea = selected.reduce((sum, i) => {
      const b = boxes[i];
      return sum + Math.max(0, Math.min(b.x + b.width, x1) - Math.max(b.x, x0)) *
        Math.max(0, Math.min(b.y + b.height, y1) - Math.max(b.y, y0));
    }, 0);
    const totalArea = selected.reduce((sum, i) => sum + boxes[i].width * boxes[i].height, 0);
    return {id: region.id, expected: region.text, actual, lineIndices: selected,
      boxAreaInsideAnnotatedRegion: totalArea ? insideArea / totalArea : null,
      status: ambiguous ? 'merged-with-another-annotated-region' : selected.length ? 'localized' : 'missing',
      // Do not assign a merged line's text to both regions or silently split it.
      cer: ambiguous ? null : characterErrorRate(region.text, actual),
      expectedCharacters: [...normalizeOcrText(region.text)].length};
  });
  const unique = regionScores.filter(r => r.cer !== null);
  const observed = indices.map(i => ({line: i, regions: matches[i].map(n => regions[n].id)}));
  const order = observed.flatMap(o => o.regions);
  let inversions = 0, comparablePairs = 0;
  for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) {
    const a = regions.findIndex(r => r.id === order[i]), b = regions.findIndex(r => r.id === order[j]);
    if (a === b) continue;
    comparablePairs++; if (a > b) inversions++;
  }
  return {scope: 'human-annotated-regions-only', expected, actual,
    annotatedCharacters: [...normalizeOcrText(expected)].length,
    selectedRegionCer: characterErrorRate(expected, actual),
    // Supplementary recognition+detection observation in fixed spatial regions.
    // Missing regions count as deletions; ambiguously merged regions are excluded
    // with coverage reported. This is not a replacement for selectedRegionCer.
    spatialRegionCer: unique.length ? unique.reduce((n, r) => n + r.cer * r.expectedCharacters, 0) /
      unique.reduce((n, r) => n + r.expectedCharacters, 0) : null,
    spatialScoredCharacters: unique.reduce((n, r) => n + r.expectedCharacters, 0),
    regions: regionScores, readingOrder: {expected: regions.map(r => r.id), observed,
      status: regionScores.some(r => r.status === 'missing') ? 'incomplete-detection' :
        inversions ? 'order-conflict' : observed.some(o => o.regions.length > 1) ?
          'merged-regions-inspect-text' : 'expected-region-order',
      inversions, comparablePairs, missing: regionScores.filter(r => r.status === 'missing').map(r => r.id),
      mergedLines: observed.filter(o => o.regions.length > 1)}};
}
