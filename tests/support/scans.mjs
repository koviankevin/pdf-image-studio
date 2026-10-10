// Fixed, non-personal text rendered with the bundled font, never an OS font.
export const scanCases = [
  {language: 'chi_tra+eng', pages: [
    ['繁體中文掃描測試', '圖書館今天開放閱讀', '學習文字辨識與校對', 'Synthetic scan page one'],
    ['這是第二頁測試資料', '文字校對完成後儲存', '所有內容都是合成資料', 'Synthetic scan page two'],
  ]},
  {language: 'eng', pages: [
    ['SYNTHETIC SCAN TEST', 'The library is open today', 'Read and review every line', 'Sample page one number 12345'],
    ['SECOND SCANNED PAGE', 'Save the corrected document', 'All content is synthetic', 'Sample page two number 67890'],
  ]},
];

export async function createScanPdf(page, linesByPage) {
  const bytes = await page.evaluate(async pages => {
    const font = new FontFace('ScanFixture',
      'url(/vendor/fonts/NotoSansCJKtc-Regular.otf)');
    await font.load();
    document.fonts.add(font);
    try {
      const {PDFDocument} = await import('/vendor/pdf-lib/pdf-lib.mjs');
      const doc = await PDFDocument.create();
      for (const lines of pages) {
        const canvas = document.createElement('canvas');
        canvas.width = 1600;
        canvas.height = 1000;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'black';
        ctx.font = '52px ScanFixture';
        ctx.textBaseline = 'top';
        lines.forEach((text, i) => ctx.fillText(text, 100, 100 + i * 160));
        const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const image = await doc.embedPng(await png.arrayBuffer());
        // Only an image is embedded: no PDF text, invisible font or OCR metadata.
        doc.addPage([576, 360]).drawImage(image, {x: 0, y: 0, width: 576, height: 360});
      }
      return [...await doc.save()];
    } finally { document.fonts.delete(font); }
  }, linesByPage);
  return Buffer.from(bytes);
}

export const normalizeOcrText = text => text.normalize('NFKC')
  .replace(/[\s\p{P}\p{S}]+/gu, '').toLowerCase();

// Informational character error rate (may exceed 1 with many insertions).
// Never use raw OCR text as the oracle for correction/export assertions.
export function characterErrorRate(expected, actual) {
  const a = [...normalizeOcrText(expected)], b = [...normalizeOcrText(actual)];
  let row = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(
      row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length] / Math.max(a.length, 1);
}
