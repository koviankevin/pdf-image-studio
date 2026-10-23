import {writeFile} from 'node:fs/promises';
import {test,expect} from './fixtures.mjs';
import {createFixtures} from '../support/pdfs.mjs';

test('30 selected layout items move in animation frames without rendering more page previews',async({page},testInfo)=>{
  test.setTimeout(120000);
  await page.addInitScript(()=>{
    window.easeMetrics={previews:0,updates:0,maxGap:0};window.measureEase=false;
    const create=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{if(blob instanceof Blob&&blob.type==='image/jpeg'&&document.querySelector('#free-dialog[open]'))easeMetrics.previews++;return create(blob);};
  });
  await page.goto('/');await expect(page.locator('#file-input')).toBeEnabled();const {sources}=await createFixtures(),source=sources.get('A');await page.locator('#file-input').setInputFiles({name:source.name,mimeType:'application/pdf',buffer:Buffer.from(source.bytes)});await expect(page.locator('#file-input')).toBeEnabled();await page.locator('#free-layout').click();await expect(page.locator('#free-preview')).toBeEnabled();
  for(let i=1;i<15;i++){await page.locator('#free-add-selected').click();await expect(page.locator('#free-controls')).toBeEnabled();}
  await expect(page.locator('#free-sheet [data-item]')).toHaveCount(30);await page.locator('#free-select-all').click();await expect(page.locator('#free-selection-count')).toContainText('已選 30');
  const initialWidth=Number(await page.locator('#free-width').inputValue());await page.locator('#free-width').fill(String(initialWidth*.5));await page.locator('#free-width').blur();
  await page.locator('#free-sheet').scrollIntoViewIfNeeded();
  await page.locator('#free-sheet').focus();await page.keyboard.press('ArrowRight');
  await page.evaluate(()=>{const stage=document.querySelector('#free-sheet');window.easeObserver=new MutationObserver(()=>easeMetrics.updates++);easeObserver.observe(stage,{childList:true});window.easeTick=performance.now();window.easeTimer=setInterval(()=>{const now=performance.now();easeMetrics.maxGap=Math.max(easeMetrics.maxGap,now-easeTick);easeTick=now;},50);});
  const box=await page.locator('#free-sheet').boundingBox(),rect=await page.locator('#free-sheet [data-item] > rect').last().evaluate(el=>({x:Number(el.getAttribute('x')),y:Number(el.getAttribute('y'))}));
  const x=box.x+(rect.x+1)/210*box.width,y=box.y+(rect.y+1)/297*box.height;
  await page.mouse.move(x,y);await page.mouse.down();
  // Hold long enough for the autosave timer to fire during the gesture. It must
  // wait for the atomic pointer commit instead of recording stale inspector fields.
  await page.mouse.move(x+20,y+10,{steps:20});
  await expect(page.locator('#autosave-status')).toContainText('儲存中');
  for(let i=0;i<80;i++)await page.mouse.move(x+20+i%20,y+10+i%10);
  await expect(page.locator('#autosave-status')).not.toContainText('已儲存');
  await page.mouse.up();await expect(page.locator('#autosave-status')).toContainText('已儲存',{timeout:20000});
  const metrics=await page.evaluate(()=>{clearInterval(easeTimer);easeObserver.disconnect();return {...easeMetrics,visibleItems:document.querySelectorAll('#free-sheet [data-item]').length};});
  expect(metrics.previews).toBe(2);expect(metrics.visibleItems).toBe(30);expect(metrics.updates).toBeLessThanOrEqual(103);expect(metrics.maxGap).toBeLessThan(2000);
  const positions=await page.locator('#free-sheet [data-item]>rect:first-child').evaluateAll(nodes=>nodes.map(el=>[el.getAttribute('x'),el.getAttribute('y')]));await page.reload();await expect(page.locator('#free-dialog')).toBeVisible();await expect(page.locator('#free-selection-count')).toContainText('已選 30');expect(await page.locator('#free-sheet [data-item]>rect:first-child').evaluateAll(nodes=>nodes.map(el=>[el.getAttribute('x'),el.getAttribute('y')]))).toEqual(positions);
  const report=testInfo.outputPath('layout-interaction-performance.json');await writeFile(report,JSON.stringify(metrics,null,2));await testInfo.attach('layout-interaction-performance.json',{path:report,contentType:'application/json'});
});
