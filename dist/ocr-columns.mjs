// Explicit horizontal two-column mode: split the displayed scan at its centre.
// No gutter detection, deskewing, vertical text or spanning-heading inference.
export function columnLines(data, region, scale) {
  const lines = (data.blocks || []).flatMap(b => b.paragraphs || [])
    .flatMap(p => p.lines || []).filter(line => line.text?.trim())
    .map(line => ({text: line.text.trim(),
      x: (region.x + line.bbox.x0) * scale.x, y: line.bbox.y0 * scale.y,
      width: (line.bbox.x1 - line.bbox.x0) * scale.x,
      height: (line.bbox.y1 - line.bbox.y0) * scale.y,
      confidence: line.confidence ?? data.confidence ?? 0}));
  // Sort only within a separately recognized column; never split a merged line.
  lines.sort((a, b) => a.y - b.y || a.x - b.x);
  if (!lines.length && data.text?.trim()) lines.push({text: data.text.trim(),
    x: region.x * scale.x, y: 0, width: region.width * scale.x,
    height: region.height * scale.y, confidence: 0});
  return lines;
}

export async function recognizeTwoColumns(worker, rendered, viewport, race, onColumn) {
  const bitmap = await createImageBitmap(rendered.blob);
  const canvas = document.createElement('canvas');
  try {
    const split = Math.floor(bitmap.width / 2);
    if (split < 1) throw new Error('頁面太窄，無法分成兩欄');
    const scale = {x: viewport.width / bitmap.width, y: viewport.height / bitmap.height};
    const lines = [];
    for (const [index, region] of [
      {x: 0, width: split, height: bitmap.height},
      {x: split, width: bitmap.width - split, height: bitmap.height},
    ].entries()) {
      onColumn(index);
      canvas.width = region.width; canvas.height = region.height;
      canvas.getContext('2d').drawImage(bitmap, region.x, 0, region.width, region.height,
        0, 0, region.width, region.height);
      const blob = await race(new Promise((resolve, reject) => canvas.toBlob(
        value => value ? resolve(value) : reject(new Error('無法產生分欄影像')), 'image/png')));
      const {data} = await race(worker.recognize(blob,
        {user_defined_dpi: String(rendered.dpi)}, {text: true, blocks: true}));
      lines.push(...columnLines(data, region, scale));
    }
    return lines;
  } finally {
    bitmap.close(); canvas.width = canvas.height = 0;
  }
}
