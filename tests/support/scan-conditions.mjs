import {scanCases} from './scans.mjs';

// Simulations only. Freeze conditions before measurement; no tuning to OCR output.
const single = scanCases[0].pages[0];
const left = ['春天適合戶外散步', '花園種植各種植物', '閱讀可以增長知識', '今天一起練習寫字'];
const right = ['夏天注意補充水分', '公園設有休息座椅', '運動之後記得休息', '明天繼續學習中文'];
export const scanConditions = [
  {id: 'clean-control', rotation: 0, blur: 0, foreground: 0, background: 255, columns: [single]},
  {id: 'skew-plus-1.5', rotation: 1.5, blur: 0, foreground: 0, background: 255, columns: [single]},
  {id: 'skew-minus-1.5', rotation: -1.5, blur: 0, foreground: 0, background: 255, columns: [single]},
  {id: 'blur-1.2', rotation: 0, blur: 1.2, foreground: 0, background: 255, columns: [single]},
  {id: 'low-contrast', rotation: 0, blur: 0, foreground: 170, background: 210, columns: [single]},
  {id: 'two-column-chinese', rotation: 0, blur: 0, foreground: 0, background: 255, columns: [left, right]},
].map(condition => ({...condition, expected: condition.columns.flat().join('\n'),
  expectedOrder: condition.columns.flatMap((lines, c) => lines.map((_, r) => `${c ? 'R' : 'L'}${r + 1}`))}));

export async function createConditionPdf(page) {
  const result = await page.evaluate(async conditions => {
    const font = new FontFace('ConditionFixture', 'url(/vendor/fonts/NotoSansCJKtc-Regular.otf)');
    await font.load(); document.fonts.add(font);
    const hash = async buffer => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))]
      .map(x => x.toString(16).padStart(2, '0')).join('');
    try {
      const {PDFDocument} = await import('/vendor/pdf-lib/pdf-lib.mjs');
      const pdf = await PDFDocument.create(), images = [];
      for (const condition of conditions) {
        const source = document.createElement('canvas'); source.width = 1600; source.height = 1000;
        const ctx = source.getContext('2d'), gray = value => `rgb(${value},${value},${value})`;
        ctx.fillStyle = gray(condition.background); ctx.fillRect(0, 0, 1600, 1000);
        ctx.translate(800, 500); ctx.rotate(condition.rotation * Math.PI / 180); ctx.translate(-800, -500);
        ctx.fillStyle = gray(condition.foreground); ctx.font = '52px ConditionFixture'; ctx.textBaseline = 'top';
        condition.columns.forEach((lines, c) => lines.forEach((text, r) => {
          if (ctx.measureText(text).width > (condition.columns.length === 2 ? 650 : 1400))
            throw new Error(`Fixture text overflow: ${condition.id}`);
          ctx.fillText(text, c ? 850 : 100, 100 + r * 160);
        }));
        const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1000;
        const output = canvas.getContext('2d');
        output.fillStyle = gray(condition.background); output.fillRect(0, 0, 1600, 1000);
        output.filter = `blur(${condition.blur}px)`; output.drawImage(source, 0, 0);
        const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const bytes = await png.arrayBuffer(), image = await pdf.embedPng(bytes);
        pdf.addPage([576, 360]).drawImage(image, {x: 0, y: 0, width: 576, height: 360});
        images.push({id: condition.id, png: [...new Uint8Array(bytes)], sha256: await hash(bytes)});
      }
      return {pdf: [...await pdf.save()], images};
    } finally { document.fonts.delete(font); }
  }, scanConditions);
  return {pdf: Buffer.from(result.pdf), images: result.images.map(image => ({...image, png: Buffer.from(image.png)}))};
}

// Observation only, never reorder OCR or fuzzy-match characters to claim success.
export function observeReadingOrder(condition, boxes) {
  const sequence = boxes.map(box => {
    const x = box.x / 0.36, right = (box.x + box.width) / 0.36;
    const y = (box.y + box.height / 2) / 0.36, row = Math.round((y - 135) / 160);
    if (row < 0 || row > 3 || Math.abs(y - (135 + row * 160)) > 75) return 'unknown';
    if (condition.columns.length === 2 && x < 750 && right > 850) return `merged-LR${row + 1}`;
    return `${condition.columns.length === 2 && x >= 750 ? 'R' : 'L'}${row + 1}`;
  });
  const collapsed = sequence.filter((value, i) => value !== sequence[i - 1]);
  const complete = condition.expectedOrder.every(id => collapsed.includes(id));
  const status = sequence.some(id => id.startsWith('merged')) ? 'cross-column-lines'
    : !complete || sequence.includes('unknown') ? 'inconclusive-missing-or-unknown'
    : JSON.stringify(collapsed) === JSON.stringify(condition.expectedOrder) ? 'expected-order' : 'different-order';
  return {method: 'UI boxes mapped to fixed source rows/columns; consecutive fragments collapsed',
    expected: condition.expectedOrder, observed: sequence, status};
}
