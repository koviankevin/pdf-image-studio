import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

export const siteURL = 'https://koviankevin.github.io/pdf-image-studio/';
export const imageURL = `${siteURL}social-preview-20261022.png`;
const dist = new URL('../dist/', import.meta.url);

export async function checkPreview(html, readImage) {
  // Read server-rendered head tags, as a crawler does; no application JS needed.
  const tags = [...html.split(/<\/head\s*>/i)[0].matchAll(/<meta\s+[^>]*>/gi)].map(([tag]) =>
    Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map(([, key, , value]) => [key.toLowerCase(), value])));
  const meta = key => {
    const found = tags.filter(tag => (tag.property || tag.name) === key);
    assert.equal(found.length, 1, `Expected one ${key} tag`);
    assert.ok(found[0].content, `Empty ${key}`);
    return found[0].content;
  };
  assert.equal(meta('og:url'), siteURL);
  assert.equal(meta('og:type'), 'website');
  assert.ok(meta('og:title').startsWith('紙間'));
  assert.ok(meta('og:description').includes('PDF'));
  assert.equal(meta('og:image'), imageURL, 'Image must use the canonical HTTPS project path');
  assert.equal(meta('og:image:type'), 'image/png');
  assert.equal(meta('og:image:width'), '1200');
  assert.equal(meta('og:image:height'), '630');
  assert.ok(meta('og:image:alt').includes('紙間'));
  assert.equal(meta('twitter:card'), 'summary_large_image');
  assert.equal(meta('twitter:image'), imageURL);
  assert.equal(meta('twitter:title'), meta('og:title'));
  assert.equal(meta('twitter:description'), meta('og:description'));
  assert.ok(meta('twitter:image:alt').includes('紙間'));
  const bytes = await readImage(imageURL);
  assert.ok(bytes.length >= 33 && bytes.length < 300_000, 'Share PNG must be present and under 300 KB');
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 'Invalid PNG signature');
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR');
  assert.equal(bytes.readUInt32BE(16), 1200);
  assert.equal(bytes.readUInt32BE(20), 630);
  return {image: imageURL, width: 1200, height: 630, bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex')};
}

export async function checkLocalPreview() {
  return checkPreview(await readFile(new URL('index.html', dist), 'utf8'), url =>
    readFile(new URL(url.slice(siteURL.length), dist)));
}

async function checkPublished(url) {
  assert.equal(new URL(url).href, siteURL, 'Only verify the maintained Pages URL');
  const expected = await checkLocalPreview();
  const get = async (url, type) => {
    const response = await fetch(url, {signal: AbortSignal.timeout(20_000), cache: 'no-store'});
    assert.equal(response.status, 200, `${url}: HTTP ${response.status}`);
    assert.equal(new URL(response.url).href, url, 'Unexpected redirect');
    assert.equal(response.headers.get('content-type')?.split(';')[0], type, `Wrong Content-Type: ${url}`);
    return response;
  };
  const html = await (await get(siteURL, 'text/html')).text();
  const result = await checkPreview(html, async url => Buffer.from(await (await get(url, 'image/png')).arrayBuffer()));
  assert.deepEqual(result, expected, 'Published PNG must match this tested commit');
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--url'), 'Usage: node scripts/check-social-preview.mjs [--url PAGES_URL]');
  // Pages/CDN can briefly serve the previous homepage after deployment completes.
  const attempts = args.length ? 6 : 1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = args.length ? await checkPublished(args[1]) : await checkLocalPreview();
      console.log(JSON.stringify({scope: args.length ? 'published HTTP metadata + PNG (not platform cache)' : 'local dist', ...result}));
      break;
    } catch (error) {
      if (attempt === attempts) throw error;
      console.warn(`Published preview not ready (${attempt}/${attempts}): ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 5_000));
    }
  }
}
