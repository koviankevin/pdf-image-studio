import {PDFDocument, rgb, pushGraphicsState, popGraphicsState} from './vendor/pdf-lib/pdf-lib.mjs';
import {assemblePdf} from './editor-core.mjs?v=20261028-hub5';
import {fitPage} from './imposition-core.mjs?v=20261028-hub5';
import {embedChineseFont} from './document-model.mjs?v=20261028-hub5';
import {checkpoint} from './cancellation.mjs';

export const MM = 72 / 25.4;
export const sheetSize = orientation => {
  if (!['portrait', 'landscape'].includes(orientation)) throw new Error('請選擇 A4 方向。');
  return orientation === 'landscape' ? {width: 297, height: 210} : {width: 210, height: 297};
};
export const MAX_SHEETS=20, MAX_LAYOUT_ITEMS=300;
export function validateFreeLayout(layout,{allowEmpty=false}={}) {
  const size = sheetSize(layout.orientation);
  if(layout.created!==undefined&&typeof layout.created!=='boolean')throw Error('排版狀態格式不正確。');
  const count=layout.sheetCount??1;
  if(!Number.isInteger(count)||count<1||count>MAX_SHEETS||layout.activeSheet!==undefined&&(!Number.isInteger(layout.activeSheet)||layout.activeSheet<0||layout.activeSheet>=count))throw Error('A4 紙張數須為 1 至 20 張。');
  if (!Array.isArray(layout.items) || !allowEmpty&&!layout.items.length || layout.items.length > MAX_LAYOUT_ITEMS) throw new Error('版面最多 300 個項目，且至少需要一個項目。');
  const counts=Array(count).fill(0);
  const ids = new Set();
  for (const item of layout.items) {
    const sheet=item.sheet??0;if(!Number.isInteger(sheet)||sheet<0||sheet>=count||++counts[sheet]>30)throw Error('每張 A4 最多 30 個項目，項目須位於現有紙張。');
    if (!item.id || ids.has(item.id)) throw new Error('排版項目重複。'); ids.add(item.id);
    if (!['page', 'text'].includes(item.type)) throw new Error('不支援的排版項目。');
    if (![item.x, item.y, item.width, item.height].every(Number.isFinite) || item.x < 0 || item.y < 0 || item.width < 1 || item.height < 1
      || item.x + item.width > size.width + .001 || item.y + item.height > size.height + .001) throw new Error('項目須位於 A4 紙張內，請調整位置或尺寸。');
    if (item.type === 'page' && (!item.record?.sourceId || !Number.isInteger(item.record.index) || item.record.index < 0)) throw new Error('找不到排版項目的來源頁面。');
    if (item.type === 'text' && (typeof item.text !== 'string' || !item.text.trim() || item.text.length > 200 || item.text.split('\n').length > 4
      || !Number.isFinite(item.fontSize) || item.fontSize < 6 || item.fontSize > 72 || !/^#[\da-f]{6}$/i.test(item.color))) throw new Error('標題最多 200 字、4 行，字級須為 6 至 72 pt。');
  }
  if (layout.selection !== undefined) {
    if (!Array.isArray(layout.selection) || layout.selection.length > 30 || new Set(layout.selection).size !== layout.selection.length
      || layout.selection.some(id => typeof id !== 'string' || !layout.items.some(item => item.id === id && (item.sheet ?? 0) === (layout.activeSheet ?? 0)))) throw Error('排版多選資料格式不正確。');
  }
  return size;
}

export function arrangeItems(items, orientation) {
  const size = sheetSize(orientation), pages = items.filter(i => i.type === 'page'), titles = items.filter(i => i.type === 'text');
  const start = 10 + titles.reduce((height, item) => height + item.height + 4, 0);
  let titleY = 10;
  const placements = new Map();
  for (const title of titles) { placements.set(title.id, {...title, x: 10, y: titleY}); titleY += title.height + 4; }
  if (pages.length) {
    const columns = Math.ceil(Math.sqrt(pages.length * (size.width - 20) / Math.max(10, size.height - start - 10))), rows = Math.ceil(pages.length / columns);
    const cw = (size.width - 20 - (columns - 1) * 5) / columns, ch = (size.height - start - 10 - (rows - 1) * 5) / rows;
    if (Math.min(cw, ch) < 5) throw new Error('空間不足，請減少項目或縮小標題。');
    pages.forEach((item, i) => {
      const scale = Math.min(cw / item.width, ch / item.height), width = item.width * scale, height = item.height * scale;
      placements.set(item.id, {...item, x: 10 + i % columns * (cw + 5) + (cw - width) / 2,
        y: start + Math.floor(i / columns) * (ch + 5) + (ch - height) / 2, width, height});
    });
  }
  const arranged = items.map(item => placements.get(item.id));
  if (arranged.length) validateFreeLayout({items:arranged.map(item=>({...item,sheet:0})),orientation});
  return arranged;
}

export async function composeFreePdf(layout, sources, title = 'A4 自由排版', {signal} = {}) {
  signal?.throwIfAborted(); const size = validateFreeLayout(layout,{allowEmpty:layout.created===true||(layout.sheetCount??1)>1});
  const output = await PDFDocument.create(), sheets = Array.from({length:layout.sheetCount??1},()=>output.addPage([size.width * MM, size.height * MM]));
  const pieces = layout.items.filter(i => i.type === 'page'), embeddedById = new Map();
  if (pieces.length) {
    const records = pieces.map(item => ({...item.record, id: `free-${item.id}`}));
    const prepared = await PDFDocument.load(await assemblePdf(records, sources, title, {signal}));
    const pages = prepared.getPages(), boxes = [];
    for (const page of pages) {
      await checkpoint(signal); const crop = page.getCropBox(), media = page.getMediaBox();
      const box = {left: Math.max(crop.x, media.x), bottom: Math.max(crop.y, media.y),
        right: Math.min(crop.x + crop.width, media.x + media.width), top: Math.min(crop.y + crop.height, media.y + media.height)};
      if (box.right <= box.left || box.top <= box.bottom) throw new Error('裁切範圍不在來源頁面內。');
      boxes.push(box); page.pushOperators(pushGraphicsState(), popGraphicsState());
    }
    const embedded = await output.embedPages(pages, boxes);
    pieces.forEach((item, i) => embeddedById.set(item.id, {page: embedded[i], box: boxes[i], rotation: pages[i].getRotation().angle}));
  }
  let font;
  for (const item of layout.items) {
    await checkpoint(signal);const sheet=sheets[item.sheet??0];
    if (item.type === 'page') {
      const source = embeddedById.get(item.id), box = {width: source.box.right - source.box.left, height: source.box.top - source.box.bottom};
      sheet.drawPage(source.page, fitPage(box, source.rotation, {x: item.x * MM, y: (size.height - item.y - item.height) * MM, width: item.width * MM, height: item.height * MM}));
    } else {
      font ??= await embedChineseFont(output);
      const lines = item.text.split('\n');
      if (lines.some(line => item.x * MM + font.widthOfTextAtSize(line, item.fontSize) > size.width * MM + .1)
        || (item.y * MM + lines.length * item.fontSize * 1.3) > size.height * MM + .1) throw new Error('標題超出 A4，請移動或縮小文字。');
      sheet.drawText(item.text, {x: item.x * MM, y: (size.height - item.y) * MM - item.fontSize,
        font, size: item.fontSize, lineHeight: item.fontSize * 1.3, color: rgb(...item.color.slice(1).match(/../g).map(s => parseInt(s, 16) / 255))});
    }
  }
  output.setTitle(title); output.setProducer('紙間'); output.setCreator('紙間');
  await checkpoint(signal); const bytes = await output.save(); signal?.throwIfAborted(); return bytes;
}
