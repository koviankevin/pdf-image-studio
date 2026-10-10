import {PDFDocument, StandardFonts, rgb} from '../../dist/vendor/pdf-lib/pdf-lib.mjs';

// Entirely synthetic: no uploaded documents, fonts, personal data or network.
// Distinct text, sizes and solid colors let tests detect plausible wrong pages.
export const fixturePages = [
  {id: 'A1', sourceId: 'A', index: 0, width: 300, height: 400, color: [220, 40, 40]},
  {id: 'A2', sourceId: 'A', index: 1, width: 320, height: 420, color: [30, 170, 60]},
  {id: 'B1', sourceId: 'B', index: 0, width: 340, height: 440, color: [40, 70, 220]},
  {id: 'B2', sourceId: 'B', index: 1, width: 360, height: 460, color: [220, 160, 20]},
  {id: 'B3', sourceId: 'B', index: 2, width: 380, height: 480, color: [170, 40, 190]},
].map(page => ({...page, text: `SOURCE_${page.sourceId}_PAGE_${page.index + 1}`}));

export const pageById = id => fixturePages.find(page => page.id === id);

export async function createFixtures() {
  const sources = new Map();
  for (const sourceId of ['A', 'B']) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.setCreationDate(new Date('2020-01-01T00:00:00Z'));
    doc.setModificationDate(new Date('2020-01-01T00:00:00Z'));
    for (const spec of fixturePages.filter(page => page.sourceId === sourceId)) {
      const page = doc.addPage([spec.width, spec.height]);
      page.drawRectangle({x: 0, y: 0, width: spec.width, height: spec.height,
        color: rgb(...spec.color.map(channel => channel / 255))});
      page.drawText(spec.text, {x: 24, y: spec.height - 48, size: 16, font, color: rgb(0, 0, 0)});
    }
    const bytes = await doc.save();
    sources.set(sourceId, {
      doc: await PDFDocument.load(bytes), bytes,
      name: `source-${sourceId}.pdf`,
    });
  }
  const records = fixturePages.map(({id, sourceId, index}) => ({id, sourceId, index}));
  return {sources, records};
}
