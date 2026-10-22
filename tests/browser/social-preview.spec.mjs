import {test, expect} from './fixtures.mjs';

test('share PNG is served and decodes at the advertised dimensions', async ({page}) => {
  await page.goto('/');
  const image = await page.locator('meta[property="og:image"]').getAttribute('content');
  // Map the canonical project URL to the local dist server; never fetch production.
  const path = new URL(image).pathname.replace('/pdf-image-studio/', '/');
  const result = await page.evaluate(async path => {
    const response = await fetch(path);
    const image = new Image();
    image.src = URL.createObjectURL(await response.blob());
    try {
      await image.decode();
      return {status: response.status, type: response.headers.get('content-type'),
        width: image.naturalWidth, height: image.naturalHeight};
    } finally { URL.revokeObjectURL(image.src); }
  }, path);
  expect(result).toEqual({status: 200, type: 'image/png', width: 1200, height: 630});
});
