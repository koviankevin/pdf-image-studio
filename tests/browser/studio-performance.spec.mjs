import {writeFile} from 'node:fs/promises';
import {test,expect} from './fixtures.mjs';
import {comparisonFiles} from '../support/comparison.mjs';
import {createFixtures} from '../support/pdfs.mjs';

test('50-page comparison stays bounded, responds to cancellation and releases workers and images',async({page,context},testInfo)=>{
  test.setTimeout(180000);
  await page.addInitScript(()=>{
    window.comparisonMetrics={workers:0,peakWorkers:0,maxEdge:0,urls:new Set(),maxGap:0};window.measureComparison=false;
    const BaseWorker=Worker;
    window.Worker=class extends BaseWorker{constructor(url,options){super(url,options);this.measured=String(url).includes('compare-worker.mjs');if(this.measured){comparisonMetrics.workers++;comparisonMetrics.peakWorkers=Math.max(comparisonMetrics.peakWorkers,comparisonMetrics.workers);}}terminate(){if(this.measured){this.measured=false;comparisonMetrics.workers--;}return super.terminate();}};
    const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
    URL.createObjectURL=value=>{const url=create(value);if(measureComparison)comparisonMetrics.urls.add(url);return url;};URL.revokeObjectURL=url=>{comparisonMetrics.urls.delete(url);return revoke(url);};
    for(const name of ['width','height']){const property=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,name);Object.defineProperty(HTMLCanvasElement.prototype,name,{...property,set(value){if(measureComparison)comparisonMetrics.maxEdge=Math.max(comparisonMetrics.maxEdge,Number(value));return property.set.call(this,value);}});}
  });
  await page.route('**/workspace.mjs*',async route=>{const response=await route.fetch(),body=(await response.text()).replace('sources.set(source.id,source);if(replaceId)',`(window.sourceWeakRefs??=[]).push(new WeakRef(source));sources.set(source.id,source);if(replaceId)`);await route.fulfill({response,body});});
  await page.goto('/');await expect(page.locator('#file-input')).toBeEnabled();await page.locator('#file-input').setInputFiles(await comparisonFiles(50,[595.28,841.89]));await expect(page.locator('#page-count')).toHaveText('99');await expect(page.locator('#file-input')).toBeEnabled();
  const session=await context.newCDPSession(page);await session.send('HeapProfiler.collectGarbage');await session.send('Performance.enable');const heap=async()=>{const {metrics}=await session.send('Performance.getMetrics');return metrics.find(item=>item.name==='JSHeapUsedSize').value;},before=await heap();
  await page.evaluate(()=>{measureComparison=true;window.lastComparisonTick=performance.now();window.comparisonTimer=setInterval(()=>{const now=performance.now();comparisonMetrics.maxGap=Math.max(comparisonMetrics.maxGap,now-lastComparisonTick);lastComparisonTick=now;},50);});
  const started=Date.now();await page.locator('#compare-open').click();await expect(page.locator('#compare-scan')).toBeEnabled();await page.locator('#compare-scan').click();await expect(page.locator('#compare-status')).toContainText('已完成 50 頁',{timeout:120000});await expect(page.locator('#compare-results button')).toHaveCount(50);
  await page.locator('#compare-scan').click();await expect(page.locator('#compare-cancel')).toBeVisible();const cancelStart=Date.now();await page.locator('#compare-cancel').click();await expect(page.locator('#compare-scan')).toBeEnabled();expect(Date.now()-cancelStart).toBeLessThan(2000);await page.locator('#compare-close').click();await expect(page.locator('#file-input')).toBeEnabled();
  for(let cycle=0;cycle<4;cycle++){await page.locator('#compare-open').click();await expect(page.locator('#compare-scan')).toBeEnabled();await page.locator('#compare-close').click();await expect(page.locator('#file-input')).toBeEnabled();}
  const metrics=await page.evaluate(()=>{clearInterval(comparisonTimer);measureComparison=false;return {...comparisonMetrics,remainingURLs:comparisonMetrics.urls.size,urls:undefined};});await session.send('HeapProfiler.collectGarbage');const growth=await heap()-before;
  expect(metrics.maxEdge).toBeLessThanOrEqual(1200);expect(metrics.peakWorkers).toBe(1);expect(metrics.workers).toBe(0);expect(metrics.remainingURLs).toBe(0);expect(metrics.maxGap).toBeLessThan(2000);expect(growth).toBeLessThan(64*1024*1024);
  await page.locator('#reset').click();await expect(page.locator('#page-count')).toHaveText('0');await expect(page.locator('#file-input')).toBeEnabled();await session.send('HeapProfiler.collectGarbage');expect(await page.evaluate(()=>sourceWeakRefs.every(reference=>!reference.deref()))).toBe(true);
  const {sources}=await createFixtures(),source=sources.get('A');await page.locator('#file-input').setInputFiles({name:source.name,mimeType:'application/pdf',buffer:Buffer.from(source.bytes)});await expect(page.locator('#file-input')).toBeEnabled();await page.locator('#compare-open').click();await expect(page.locator('#compare-dialog')).not.toBeVisible();await page.locator('#reset').click();await expect(page.locator('#file-input')).toBeEnabled();await session.send('HeapProfiler.collectGarbage');expect(await page.evaluate(()=>sourceWeakRefs.every(reference=>!reference.deref()))).toBe(true);
  const report=testInfo.outputPath('comparison-performance.json');await writeFile(report,JSON.stringify({...metrics,elapsedMs:Date.now()-started,heapGrowthBytes:growth},null,2));await testInfo.attach('comparison-performance.json',{path:report,contentType:'application/json'});
});

test('A4 duplicates reuse preview images and retain only the active sheet in the DOM',async({page},testInfo)=>{
  await page.addInitScript(()=>{window.layoutPreviewRenders=0;const create=URL.createObjectURL.bind(URL);URL.createObjectURL=value=>{if(document.querySelector('#free-dialog[open]')&&value instanceof Blob&&value.type==='image/jpeg')layoutPreviewRenders++;return create(value);};});
  await page.goto('/');await expect(page.locator('#file-input')).toBeEnabled();const {sources}=await createFixtures(),source=sources.get('A');await page.locator('#file-input').setInputFiles({name:source.name,mimeType:'application/pdf',buffer:Buffer.from(source.bytes)});await expect(page.locator('#file-input')).toBeEnabled();await page.locator('#free-layout').click();await expect(page.locator('#free-preview')).toBeEnabled();
  for(let sheet=1;sheet<10;sheet++){await page.locator('#free-sheet-add').click();await page.locator('#free-add-selected').click();await expect(page.locator('#free-controls')).toBeEnabled();await expect(page.locator('#free-sheet [data-item]')).toHaveCount(2);}
  expect(await page.evaluate(()=>layoutPreviewRenders)).toBe(2);await expect(page.locator('#free-sheet-select option')).toHaveCount(10);await expect(page.locator('#free-sheet [data-item]')).toHaveCount(2);const report=testInfo.outputPath('a4-performance.json');await writeFile(report,JSON.stringify({sheets:10,totalItems:20,visibleItems:2,previewImages:2}));await testInfo.attach('a4-performance.json',{path:report,contentType:'application/json'});
});
