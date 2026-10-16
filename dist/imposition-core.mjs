import {PDFDocument, degrees, pushGraphicsState, popGraphicsState} from './vendor/pdf-lib/pdf-lib.mjs';
import {assemblePdf} from './editor-core.mjs?v=20261016-fixes';
import {checkpoint} from './cancellation.mjs';

const MM = 72 / 25.4;

export function sheetLayout({rows = 1, columns = 2, orientation = 'landscape', margin = 10, gap = 5} = {}) {
  if (![rows, columns].every(n => Number.isInteger(n) && n >= 1 && n <= 6)) throw new Error('列數與欄數須為 1 至 6。');
  if (!['portrait', 'landscape'].includes(orientation)) throw new Error('請選擇 A4 方向。');
  if (![margin, gap].every(n => Number.isFinite(n) && n >= 0 && n <= 50)) throw new Error('邊界與間距須為 0 至 50 mm。');
  const [width, height] = (orientation === 'landscape' ? [297, 210] : [210, 297]).map(n => n * MM);
  const edge = margin * MM, space = gap * MM;
  const cellWidth = (width - 2 * edge - (columns - 1) * space) / columns;
  const cellHeight = (height - 2 * edge - (rows - 1) * space) / rows;
  if (Math.min(cellWidth, cellHeight) < 10 * MM) throw new Error('每格至少須有 10 mm，請減少邊界、間距或格數。');
  const cells = Array.from({length: rows * columns}, (_, i) => ({
    x: edge + (i % columns) * (cellWidth + space),
    y: height - edge - (Math.floor(i / columns) + 1) * cellHeight - Math.floor(i / columns) * space,
    width: cellWidth, height: cellHeight,
  }));
  return {width, height, cells};
}

// PDF /Rotate is clockwise; drawPage rotation is counterclockwise. Embed the
// visible box at the origin, then rotate it into positive cell coordinates.
export function fitPage(box, rotation, cell) {
  const angle = ((rotation % 360) + 360) % 360;
  if (![0, 90, 180, 270].includes(angle) || !(box.width > 0 && box.height > 0)) throw new Error('來源頁面的尺寸或旋轉角度無效。');
  const sideways = angle === 90 || angle === 270;
  const w = sideways ? box.height : box.width, h = sideways ? box.width : box.height;
  const scale = Math.min(cell.width / w, cell.height / h);
  let x = cell.x + (cell.width - w * scale) / 2;
  let y = cell.y + (cell.height - h * scale) / 2;
  if (angle === 180) { x += box.width * scale; y += box.height * scale; }
  if (angle === 90) y += box.width * scale;
  if (angle === 270) x += box.height * scale;
  return {x, y, width: box.width * scale, height: box.height * scale, rotate: degrees(-angle)};
}

export async function imposePdf(records, sources, settings, title = 'A4 拼版', {signal} = {}) {
  signal?.throwIfAborted();
  const layout = sheetLayout(settings);
  // Reuse the normal export path so edits, flattened forms and OCR text layers
  // are included. Embedding Form XObjects keeps text/vectors and original images.
  const prepared = await PDFDocument.load(await assemblePdf(records, sources, title, {signal}));
  await checkpoint(signal);
  const output = await PDFDocument.create();
  const pages = prepared.getPages(), boxes = [], placements = [];
  for (const [i, page] of pages.entries()) {
    if (i % 16 === 0) await checkpoint(signal);
    const crop = page.getCropBox(), media = page.getMediaBox();
    const left = Math.max(crop.x, media.x), bottom = Math.max(crop.y, media.y);
    const right = Math.min(crop.x + crop.width, media.x + media.width);
    const top = Math.min(crop.y + crop.height, media.y + media.height);
    const box = {width: right - left, height: top - bottom};
    placements.push(fitPage(box, page.getRotation().angle, layout.cells[i % layout.cells.length]));
    boxes.push({left, bottom, right, top});
    // Also handles completely blank source pages without a /Contents stream.
    page.pushOperators(pushGraphicsState(), popGraphicsState());
  }
  await checkpoint(signal);
  // One call shares pdf-lib's resource copier across all pages. Calling
  // embedPage separately duplicates shared scanned images and fonts per page.
  const embedded = await output.embedPages(pages, boxes);
  let sheet;
  for (let i = 0; i < embedded.length; i++) {
    if (i % 16 === 0) await checkpoint(signal);
    if (i % layout.cells.length === 0) sheet = output.addPage([layout.width, layout.height]);
    sheet.drawPage(embedded[i], placements[i]);
  }
  output.setTitle(title); output.setProducer('清晰 PDF'); output.setCreator('清晰 PDF');
  await checkpoint(signal);
  const bytes = await output.save(); signal?.throwIfAborted(); return bytes;
}
