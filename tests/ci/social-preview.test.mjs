import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {checkLocalPreview, checkPreview, imageURL} from '../../scripts/check-social-preview.mjs';

const html = await readFile(new URL('../../dist/index.html', import.meta.url), 'utf8');
const png = await readFile(new URL('../../dist/social-preview-20261022.png', import.meta.url));

test('share metadata resolves to the correctly sized PNG inside the uploaded dist', async () => {
  const result = await checkLocalPreview();
  assert.equal(result.image, imageURL);
  assert.equal(result.width / result.height, 1200 / 630);
});

test('missing image, wrong project path, relative URL and corrupt dimensions fail the gate', async () => {
  await assert.rejects(checkPreview(html, async () => { throw new Error('ENOENT'); }), /ENOENT/);
  for (const url of ['./social-preview-20261022.png',
    'https://koviankevin.github.io/social-preview-20261022.png',
    'https://example.invalid/social-preview-20261022.png']) {
    await assert.rejects(checkPreview(html.replaceAll(imageURL, url), async () => png), /canonical HTTPS/);
  }
  const broken = Buffer.from(png);
  broken.writeUInt32BE(32, 16);
  await assert.rejects(checkPreview(html, async () => broken));
  await assert.rejects(checkPreview(html, async () => Buffer.from('<html>404</html>')), /PNG/);
});

test('the deployment checks the published HTTP metadata and image after Pages publish', async () => {
  const {parse} = await import('yaml');
  const workflow = parse(await readFile(new URL('../../.github/workflows/tests.yml', import.meta.url), 'utf8'));
  const steps = workflow.jobs.deploy.steps;
  const probe = steps.findIndex(step => step.run?.includes('scripts/check-social-preview.mjs --url'));
  const publish = steps.findIndex(step => step.uses?.startsWith('actions/deploy-pages@'));
  assert.ok(probe > publish && publish >= 0);
  assert.equal(steps[probe].env.PAGES_URL, '${{ steps.deployment.outputs.page_url }}');
  assert.equal(steps[probe].if, "steps.current.outputs.publish == 'true'");
  assert.ok(!steps[probe]['continue-on-error']);
});
