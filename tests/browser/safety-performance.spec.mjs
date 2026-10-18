import {test, expect} from './fixtures.mjs';
import {createFixtures} from '../support/pdfs.mjs';

const upload = source => ({name:source.name,mimeType:'application/pdf',buffer:Buffer.from(source.bytes)});
async function ready(page) {
  await page.goto('/');
  await expect(page.locator('#dropzone')).toHaveAttribute('aria-disabled','false');
}

test('crop preview and image download work on page 3 after importing a shorter PDF', {tag: '@compatibility'}, async ({page}) => {
  const {sources} = await createFixtures();
  await ready(page);
  await page.locator('#file-input').setInputFiles([upload(sources.get('B')),upload(sources.get('A'))]);
  await expect(page.locator('#page-count')).toHaveText('5');
  await page.getByRole('button',{name:'框選第 3 頁',exact:true}).click();
  await expect(page.locator('#crop-status')).toContainText('拖曳可重新框選');
  expect(await page.locator('#crop-image').evaluate(img=>img.naturalWidth>0)).toBe(true);
  await page.locator('#crop-width').fill('50');
  const download = page.waitForEvent('download');
  await page.locator('#crop-download').click();
  expect(await (await download).failure()).toBeNull();
  // The rasterizer rounds outwards; floating-point dimensions may add 1 px.
  await expect(page.locator('#crop-status')).toContainText(/792 × 200[01] px/);
});

test('thumbnail lifetime is bounded by current pages and 30 undo states', async ({page}) => {
  test.setTimeout(120_000);
  const {sources} = await createFixtures();
  await page.addInitScript(() => {
    window.liveImages = new Set();
    const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
    URL.createObjectURL=blob=>{const url=create(blob);if(blob.type.startsWith('image/'))liveImages.add(url);return url;};
    URL.revokeObjectURL=url=>{liveImages.delete(url);return revoke(url);};
  });
  await ready(page);
  await page.locator('#file-input').setInputFiles(upload(sources.get('A')));
  await expect(page.locator('#page-count')).toHaveText('2');
  await page.getByRole('checkbox',{name:'選取第 2 頁',exact:true}).uncheck();
  for(let i=0;i<40;i++){
    await page.locator('#rotate-selected').click();
    await expect(page.locator('#rotate-selected')).toBeEnabled();
  }
  expect(await page.evaluate(()=>liveImages.size)).toBe(32);
  for(let i=0;i<30;i++){
    await page.locator('#undo').click();
    await page.locator('#page-grid img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
  }
  await expect(page.locator('#undo')).toBeDisabled();
  expect(await page.evaluate(()=>liveImages.size)).toBe(2);
  await page.locator('#rotate-selected').click();
  await expect(page.locator('#rotate-selected')).toBeEnabled();
  await page.locator('#file-input').setInputFiles(upload(sources.get('B')));
  await expect(page.locator('#page-count')).toHaveText('5');
  expect(await page.evaluate(()=>liveImages.size)).toBe(5);
  await page.locator('#reset').click();
  await expect(page.locator('#page-count')).toHaveText('0');
  expect(await page.evaluate(()=>liveImages.size)).toBe(0);
});

test('CSP blocks injected inline scripts and off-site script / fetch while retaining local modules', async ({page}) => {
  await page.route('https://csp-probe.invalid/**', route=>route.fulfill({body:'window.remoteRan=true;',contentType:'text/javascript'}));
  await ready(page);
  await page.evaluate(async()=>{
    window.violations=[];
    document.addEventListener('securitypolicyviolation',e=>violations.push(e.effectiveDirective));
    const inline=document.createElement('script');inline.textContent='window.inlineRan=true';document.head.append(inline);
    const remote=document.createElement('script');remote.src='https://csp-probe.invalid/probe.js';document.head.append(remote);
    window.fetchBlocked=false;
    try{await fetch('https://csp-probe.invalid/probe.txt');}catch{window.fetchBlocked=true;}
  });
  await expect.poll(()=>page.evaluate(()=>violations)).toEqual(expect.arrayContaining(['script-src-elem','connect-src']));
  expect(await page.evaluate(()=>({inline:!!window.inlineRan,remote:!!window.remoteRan,blocked:fetchBlocked}))).toEqual({inline:false,remote:false,blocked:true});
});

test('preview builds are serialized, obsolete settings cancel, and close/reopen cannot resurrect a build', {tag: '@compatibility'}, async ({page}) => {
  const {sources} = await createFixtures();
  // Hold the real core at its entry point to exercise settings/close races
  // deterministically. The underlying PDF generation and rendering are real.
  await page.route('**/imposition-core.mjs*',async route=>{
    const response=await route.fetch();
    const original=(await response.text()).replace('export async function imposePdf(', 'async function buildPdf(');
    await route.fulfill({response,body:original+`
      export async function imposePdf(...args){
        const state=window.buildState??={active:0,max:0,jobs:[]};
        const job={signal:args[4]?.signal};state.jobs.push(job);
        state.active++;state.max=Math.max(state.max,state.active);
        try{await new Promise(resolve=>job.release=resolve);return await buildPdf(...args);}
        finally{state.active--;}
      }
    `});
  });
  await ready(page);
  await page.locator('#file-input').setInputFiles(upload(sources.get('A')));
  await expect(page.locator('#impose-pdf')).toBeEnabled();
  await page.locator('#impose-pdf').click();
  await expect.poll(()=>page.evaluate(()=>window.buildState?.jobs.length)).toBe(1);
  await page.locator('#nup-preset').selectOption('4');
  await page.waitForTimeout(250); // let the documented 200 ms debounce expire
  expect(await page.evaluate(()=>buildState.jobs[0].signal?.aborted)).toBe(true);
  expect(await page.evaluate(()=>buildState.jobs.length)).toBe(1);
  await page.evaluate(()=>buildState.jobs[0].release());
  await expect.poll(()=>page.evaluate(()=>buildState.jobs.length)).toBe(2);
  await page.evaluate(()=>buildState.jobs[1].release());
  await expect(page.locator('#nup-download')).toBeEnabled();
  await expect(page.locator('#nup-summary')).toContainText('每張 4 頁');
  await page.locator('#nup-preset').selectOption('2');
  await expect.poll(()=>page.evaluate(()=>buildState.jobs.length)).toBe(3);
  await page.locator('#nup-close').click();
  await page.locator('#impose-pdf').click();
  await page.waitForTimeout(250);
  expect(await page.evaluate(()=>buildState.jobs[2].signal?.aborted)).toBe(true);
  expect(await page.evaluate(()=>buildState.jobs.length)).toBe(3);
  await page.evaluate(()=>buildState.jobs[2].release());
  await expect.poll(()=>page.evaluate(()=>buildState.jobs.length)).toBe(4);
  await page.evaluate(()=>buildState.jobs[3].release());
  await expect(page.locator('#nup-download')).toBeEnabled();
  expect(await page.evaluate(()=>buildState.max)).toBe(1);
  expect(await page.evaluate(()=>buildState.active)).toBe(0);
});
