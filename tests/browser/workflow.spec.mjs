import {test, expect,expectControlEnabled} from './fixtures.mjs';
import {createFixtures} from '../support/pdfs.mjs';
import {downloadBytes, inspectPdf} from '../support/ocr-pdf.mjs';

async function ready(page, ids = ['A']) {
  await page.goto('/'); await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled', 'false');
  const {sources} = await createFixtures();
  await page.locator('#file-input').setInputFiles(ids.map(id => ({name: sources.get(id).name, mimeType: 'application/pdf', buffer: Buffer.from(sources.get(id).bytes)})));
  await expect(page.locator('#file-input')).toBeEnabled();
}
test.beforeEach(async ({page})=>{await page.addInitScript(()=>localStorage.setItem('shijian.autosave.enabled','false'));});
const pending = page => page.evaluate(() => !window.dispatchEvent(new Event('beforeunload', {cancelable: true})));

test('output presets restore only safe settings and allow opting out', {tag: '@compatibility'}, async ({page}) => {
  await page.goto('/'); await expect(page.locator('#output-preset')).toBeEnabled();
  await page.locator('#output-preset').selectOption('sharp');
  await expect(page.locator('#dpi')).toHaveValue('600'); await expect(page.locator('#max-edge')).toHaveValue('0');
  await page.locator('#output-name').fill('private-name');
  await page.reload(); await expect(page.locator('#output-preset')).toHaveValue('sharp');
  await expect(page.locator('#output-name')).not.toHaveValue('private-name');
  await page.locator('#output-preset').selectOption('small');
  await expect(page.locator('#quality-wrap')).toBeVisible(); await expect(page.locator('#jpeg-quality')).toHaveValue('80');
  await page.locator('#max-edge').fill('512'); await page.locator('#max-edge').blur();
  await expect(page.locator('#output-preset')).toHaveValue('custom');
  await page.reload(); await expect(page.locator('#max-edge')).toHaveValue('512');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('shijian.output.v1')));
  expect(Object.keys(stored.settings).sort()).toEqual(['dpi', 'format', 'maxEdge', 'quality']);
  await page.locator('#remember-output').uncheck(); await page.reload();
  await expect(page.locator('#remember-output')).not.toBeChecked(); await expect(page.locator('#dpi')).toHaveValue('300');
  await page.evaluate(() => localStorage.setItem('shijian.output.v1', '{bad json'));
  await page.reload(); await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled', 'false');
});

test('fixed actions, exact PDF proof and export receipts handle partial output and later edits', async ({page}) => {
  await ready(page);
  await expect(page.locator('#quick-actions')).toBeVisible(); await expect(page.locator('#quick-count')).toHaveText('已選 2 / 2 頁');
  expect(await pending(page)).toBe(true);
  await page.getByRole('checkbox', {name: '選取第 2 頁', exact: true}).uncheck();
  await page.locator('#quick-pdf').click(); await expect(page.locator('#proof-download')).toBeEnabled();
  await expect(page.locator('#proof-total')).toHaveText('/ 1 頁');
  const partial = await downloadBytes(page, page.locator('#proof-download'));
  expect((await inspectPdf(page, partial))[0].text).toContain('SOURCE_A_PAGE_1');
  await page.locator('#proof-close').click(); expect(await pending(page)).toBe(true);
  await page.locator('#select-all').click(); await page.locator('#preview-pdf').click();
  await expect(page.locator('#proof-download')).toBeEnabled(); await page.locator('#proof-next').click();
  await expect(page.locator('#proof-page')).toHaveValue('2'); await page.locator('#proof-zoom').selectOption('1.5');
  await expect(page.locator('#proof-download')).toBeEnabled();
  const output = await downloadBytes(page, page.locator('#proof-download'));
  expect((await inspectPdf(page, output)).map(p => p.text.trim())).toEqual(['SOURCE_A_PAGE_1', 'SOURCE_A_PAGE_2']);
  await page.locator('#proof-close').click(); expect(await pending(page)).toBe(false);
  await page.getByRole('button', {name: '旋轉第 1 頁', exact: true}).click();
  await expect(page.locator('#file-input')).toBeEnabled(); expect(await pending(page)).toBe(true);
  const shown = page.waitForEvent('dialog'); const click = page.locator('.brand').click({noWaitAfter: true});
  const dialog = await shown; expect(dialog.type()).toBe('beforeunload'); await dialog.dismiss(); await click;
  await expect(page.locator('#page-count')).toHaveText('2');
  await page.locator('#reset').click(); await expect(page.locator('#quick-actions')).toBeHidden(); expect(await pending(page)).toBe(false);
});

for (const width of [1440, 390]) test(`free A4 at ${width}px preserves edits, title, layout and searchable vectors`,
  width === 390 ? {tag: '@compatibility'} : {}, async ({page}, testInfo) => {
    test.setTimeout(180_000); await page.setViewportSize({width, height: 1100}); await ready(page);
    await page.locator('#free-layout').click(); await expect(page.locator('#free-preview')).toBeEnabled();
    await expect(page.locator('#free-item option')).toHaveCount(3);
    const movable = await page.locator('#free-sheet [aria-pressed="true"]').boundingBox();
    const initialX = Number(await page.locator('#free-x').inputValue());
    await page.mouse.move(movable.x + movable.width / 2, movable.y + movable.height / 2);
    await page.mouse.down(); await page.mouse.move(movable.x + movable.width / 2 - 18, movable.y + movable.height / 2 + 15, {steps: 4}); await page.mouse.up();
    expect(Number(await page.locator('#free-x').inputValue())).toBeLessThan(initialX);
    const handle = await page.locator('#free-sheet [data-resize]').boundingBox(), initialWidth = Number(await page.locator('#free-width').inputValue());
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 - 16, handle.y + handle.height / 2 - 16, {steps: 4}); await page.mouse.up();
    expect(Number(await page.locator('#free-width').inputValue())).toBeLessThan(initialWidth);
    await page.locator('#free-x').fill('12'); await page.locator('#free-x').blur();
    await page.locator('[data-align="center"]').click();
    await page.locator('#free-sheet').focus(); await page.keyboard.press('ArrowDown');
    const oldY = Number(await page.locator('#free-y').inputValue()); expect(oldY).toBeGreaterThan(0);
    await page.locator('#free-add-title').click(); await expect(page.locator('#free-text')).toBeVisible();
    await page.locator('#free-text').fill('紙間自由排版測試'); await page.locator('#free-text').blur();
    await page.locator('#free-arrange').click();
    await page.locator('#free-duplicate').click(); await expect(page.locator('#free-item option')).toHaveCount(5);
    await page.locator('#free-delete').click(); await expect(page.locator('#free-item option')).toHaveCount(4);
    await page.locator('#free-undo').click(); await expect(page.locator('#free-item option')).toHaveCount(5);
    await page.locator('#free-delete').click();
    await page.locator('#free-preview').click(); await expect(page.locator('#proof-download')).toBeEnabled();
    const bytes = await downloadBytes(page, page.locator('#proof-download')), [sheet] = await inspectPdf(page, bytes);
    expect(sheet.width).toBeCloseTo(595.28, 1); expect(sheet.height).toBeCloseTo(841.89, 1);
    expect(sheet.text).toContain('紙間自由排版測試'); expect(sheet.text).toContain('SOURCE_A_PAGE_1'); expect(sheet.text).toContain('SOURCE_A_PAGE_2');
    await page.locator('#proof-close').click(); await expect(page.locator('#free-dialog')).toBeVisible();
    await page.locator('#free-close').click(); expect(await pending(page)).toBe(false);
    await page.locator('#free-layout').click(); await expect(page.locator('#free-item option')).toHaveCount(4);
    await page.locator('#free-orientation').selectOption('landscape'); expect(await pending(page)).toBe(true);
    expect(await page.locator('#free-dialog').evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
    await page.screenshot({path: testInfo.outputPath('free-a4.png')});
    await page.locator('#free-close').click(); await page.locator('#reset').click();
    await expect(page.locator('#free-layout')).toBeDisabled();
  });

test('a crop can enter free A4 without changing the original workspace crop', async ({page}) => {
  await ready(page); await page.getByRole('button', {name: '框選第 1 頁', exact: true}).click();
  await expectControlEnabled(page.locator('#crop-controls'));
  await page.locator('#crop-width').fill('75'); await page.locator('#crop-height').fill('50');
  await page.locator('#crop-add-layout').click(); await expect(page.locator('#free-preview')).toBeEnabled();
  await expect(page.locator('#free-item option')).toHaveCount(2);
  await expect(page.locator('#free-item')).toContainText('框選');
  await page.locator('#free-preview').click(); await expect(page.locator('#proof-download')).toBeEnabled();
  const [sheet] = await inspectPdf(page, await downloadBytes(page, page.locator('#proof-download')));
  expect(sheet.text).toContain('SOURCE_A_PAGE_1');
  await page.locator('#proof-close').click(); await page.locator('#free-close').click();
  await expect(page.locator('.page-card').first()).not.toContainText('已裁切');
  expect(await pending(page)).toBe(true);
});

test('closing and reopening PDF proof cannot show a superseded page selection', async ({page}) => {
  await ready(page, ['A', 'B']); await page.locator('#preview-pdf').click();
  await page.locator('#proof-close').click(); await page.locator('#select-none').click();
  await page.getByRole('checkbox', {name: '選取第 5 頁', exact: true}).check();
  await page.locator('#preview-pdf').click(); await expect(page.locator('#proof-download')).toBeEnabled();
  await expect(page.locator('#proof-total')).toHaveText('/ 1 頁');
  const [result] = await inspectPdf(page, await downloadBytes(page, page.locator('#proof-download')));
  expect(result.text.trim()).toBe('SOURCE_B_PAGE_3');
  await page.locator('#proof-close').click(); await expect(page.locator('#file-input')).toBeEnabled();
});

test('adding another crop preserves manually positioned pieces and keyboard selection', async ({page}) => {
  await ready(page);
  await page.getByRole('button', {name:'框選第 1 頁', exact:true}).click();
  await expectControlEnabled(page.locator('#crop-controls'));
  await page.locator('#crop-width').fill('75'); await page.locator('#crop-height').fill('50');
  await page.locator('#crop-add-layout').click(); await expect(page.locator('#free-preview')).toBeEnabled();
  await page.locator('#free-width').fill('70'); await page.locator('#free-width').blur();
  await page.locator('#free-x').fill('22'); await page.locator('#free-x').blur();
  await page.locator('#free-y').fill('27'); await page.locator('#free-y').blur();
  const first=await page.locator('#free-item').inputValue();
  const before=await page.locator('#free-sheet [data-item]').first().locator('rect').first().evaluate(e=>['x','y','width','height'].map(k=>e.getAttribute(k)));
  await page.locator('#free-close').click();
  await page.getByRole('button', {name:'框選第 2 頁', exact:true}).click();
  await expectControlEnabled(page.locator('#crop-controls'));
  await page.locator('#crop-add-layout').click(); await expect(page.locator('#free-item option')).toHaveCount(3);
  const original=page.locator(`#free-sheet [data-item="${first}"]`);
  expect(await original.locator('rect').first().evaluate(e=>['x','y','width','height'].map(k=>e.getAttribute(k)))).toEqual(before);
  await original.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#free-sheet')).toBeFocused();
  await page.keyboard.press('ArrowRight'); await expect(page.locator('#free-x')).toHaveValue('23');
});

test('unapplied annotation and crop edits warn even after the workspace was exported', async ({page}) => {
  await ready(page); await page.locator('#preview-pdf').click(); await expect(page.locator('#proof-download')).toBeEnabled();
  await downloadBytes(page,page.locator('#proof-download')); await page.locator('#proof-close').click();
  expect(await pending(page)).toBe(false);
  await page.getByRole('button',{name:'標記第 1 頁',exact:true}).click();
  await expectControlEnabled(page.locator('#mark-fields')); expect(await pending(page)).toBe(false);
  await page.locator('[data-tool="text"]').click(); await page.locator('#mark-center').click();
  expect(await pending(page)).toBe(true);
  await page.locator('#mark-close').click(); expect(await pending(page)).toBe(false);
  await page.getByRole('button',{name:'框選第 1 頁',exact:true}).click();
  await expectControlEnabled(page.locator('#crop-controls')); expect(await pending(page)).toBe(false);
  await page.locator('#crop-width').fill('50'); expect(await pending(page)).toBe(true);
  await page.locator('#crop-close').click(); expect(await pending(page)).toBe(false);
});
