// Optional authoring tool; no extra dependencies or fonts are loaded by the site.
import {readFile, writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';

const root = new URL('../', import.meta.url);
let svg = await readFile(new URL('scripts/social-preview.svg', root), 'utf8');
const font = (await readFile(new URL('dist/vendor/fonts/NotoSansCJKtc-Regular.otf', root))).toString('base64');
svg = svg.replace('<title>', `<style>@font-face {font-family:'Noto Sans CJK TC';src:url(data:font/otf;base64,${font})}</style><title>`);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport: {width: 1200, height: 630}, deviceScaleFactor: 1});
  await page.setContent(`<style>body{margin:0}svg{display:block}</style>${svg}`);
  await page.evaluate(() => document.fonts.ready);
  if (!await page.evaluate(() => document.fonts.check('44px "Noto Sans CJK TC"'))) throw new Error('Brand font unavailable');
  await writeFile(new URL('dist/social-preview-20261022.png', root), await page.screenshot({type: 'png'}));
} finally {
  await browser.close();
}
