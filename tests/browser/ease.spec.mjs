import {test,expect} from './fixtures.mjs';
import {createFixtures} from '../support/pdfs.mjs';
import {downloadBytes,inspectPdf} from '../support/ocr-pdf.mjs';

async function ready(page){await page.goto('/');await expect(page.locator('#file-input')).toBeEnabled();}
async function load(page){const {sources}=await createFixtures(),source=sources.get('A');await page.locator('#file-input').setInputFiles({name:source.name,mimeType:'application/pdf',buffer:Buffer.from(source.bytes)});await expect(page.locator('#page-count')).toHaveText('2');await expect(page.locator('#file-input')).toBeEnabled();}
const mode=(page,value)=>page.locator(`[data-task="${value}"]`).click();
const saved=page=>expect(page.locator('#autosave-status')).toContainText(/已儲存|已還原/,{timeout:20000});
async function openLayout(page){await page.locator('#free-layout').click();await expect(page.locator('#free-preview')).toBeEnabled();}
async function field(page,key,value){await page.locator('#free-'+key).fill(String(value));await page.locator('#free-'+key).blur();}
const geometry=page=>page.locator('#free-sheet [data-item]').evaluateAll(nodes=>nodes.map(node=>{
  const rect=node.querySelector('rect');
  const dimensions=Object.fromEntries(['x','y','width','height'].map(key=>[key,Number(rect.getAttribute(key))]));
  return {id:node.dataset.item,...dimensions,fontSize:Number(node.querySelector('text')?.getAttribute('font-size'))||null};
}));
async function place(page,id,x,y,width){await page.locator('#free-item').selectOption(id);if(width!==undefined)await field(page,'width',width);await field(page,'x',x);await field(page,'y',y);}
async function threeItems(page){await openLayout(page);const ids=await page.locator('#free-item option').evaluateAll(options=>options.slice(1).map(o=>o.value));await place(page,ids[0],10,20,25);await place(page,ids[1],100,70,25);await page.locator('#free-add-title').click();await page.locator('#free-text').fill('標題');await page.locator('#free-text').blur();await field(page,'x',60);await field(page,'y',45);return [...ids,await page.locator('#free-item').inputValue()];}
async function stagePoint(page,x,y){await page.locator('#free-sheet').scrollIntoViewIfNeeded();const box=await page.locator('#free-sheet').boundingBox();return {x:box.x+x/210*box.width,y:box.y+y/297*box.height};}
async function drag(page,start,end,{alt=false,cancel=false}={}){const a=await stagePoint(page,...start),b=await stagePoint(page,...end);if(alt)await page.keyboard.down('Alt');await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:6});if(cancel)await page.locator('#free-sheet').dispatchEvent('pointercancel');await page.mouse.up();if(alt)await page.keyboard.up('Alt');}

test('task modes reuse original crop, PDF, A4 and OCR paths without changing files or output settings',{tag:'@compatibility'},async({page})=>{
  await ready(page);await expect(page.locator('[data-task="all"]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#task-start')).toBeHidden();
  await load(page);await page.locator('#dpi').selectOption('600');await page.locator('#max-edge').fill('2560');await page.locator('#max-edge').blur();
  const original=await inspectPdf(page,await downloadBytes(page,page.locator('#export-pdf')));
  await mode(page,'capture');await expect(page.locator('#image-output')).toBeVisible();await expect(page.locator('#pdf-output')).toBeHidden();await expect(page.locator('.ocr-settings')).toBeHidden();await page.locator('#task-start').click();await expect(page.locator('#crop-dialog')).toBeVisible();await expect(page.locator('#crop-controls')).toBeEnabled();await expect(page.locator('#crop-output-settings')).toContainText('600');await page.locator('#crop-close').click();
  await mode(page,'organize');await expect(page.locator('#compare-open')).toBeVisible();await expect(page.locator('#image-output')).toBeHidden();await expect(page.locator('#a4-output')).toBeHidden();await page.locator('#task-start').click();await expect(page.locator('#proof-download')).toBeEnabled();expect(await inspectPdf(page,await downloadBytes(page,page.locator('#proof-download')))).toEqual(original);await page.locator('#proof-close').click();
  await mode(page,'layout');await expect(page.locator('#a4-output')).toBeVisible();await expect(page.locator('#compare-open')).toBeHidden();await page.locator('#task-start').click();await expect(page.locator('#free-preview')).toBeEnabled();await expect(page.locator('#free-sheet [data-item]')).toHaveCount(2);await page.locator('#free-close').click();
  await mode(page,'text');await expect(page.locator('.ocr-settings')).toBeVisible();await expect(page.locator('.ocr-settings')).toHaveAttribute('open','');await page.locator('#task-start').click();await expect(page.locator('#ocr-dialog')).toBeVisible();await expect(page.locator('#ocr-lines textarea').first()).toHaveValue('SOURCE_A_PAGE_1');await page.locator('#ocr-close').click();
  await mode(page,'all');await expect(page.locator('#image-output')).toBeVisible();await expect(page.locator('#compare-open')).toBeVisible();await expect(page.locator('#dpi')).toHaveValue('600');await expect(page.locator('#max-edge')).toHaveValue('2560');expect(await inspectPdf(page,await downloadBytes(page,page.locator('#export-pdf')))).toEqual(original);
  await mode(page,'capture');await saved(page);await page.reload();await expect(page.locator('#file-input')).toBeEnabled();await expect(page.locator('[data-task="capture"]')).toHaveAttribute('aria-pressed','true');await page.locator('#task-title').click();await page.keyboard.press('Control+f');await expect(page.locator('[data-task="all"]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#document-query')).toBeFocused();
});

test('mixed selections align, distribute, scale, move across sheets and export searchable vector PDF with one-step undo',{tag:'@compatibility'},async({page})=>{
  await ready(page);await load(page);await threeItems(page);await page.locator('#free-select-all').click();await expect(page.locator('#free-selection-count')).toContainText('已選 3');
  const before=await geometry(page);await page.locator('#free-distribute-x').click();const distributed=await geometry(page),byX=[...distributed].sort((a,b)=>a.x-b.x),gap=byX[1].x-byX[0].x-byX[0].width;expect(byX[2].x-byX[1].x-byX[1].width).toBeCloseTo(gap,6);expect(byX[0].x).toBe(10);expect(byX[2].x+byX[2].width).toBe(125);
  await page.locator('#free-undo').click();expect(await geometry(page)).toEqual(before);await page.locator('#free-redo').click();expect(await geometry(page)).toEqual(distributed);
  await page.locator('[data-align="top"]').click();expect((await geometry(page)).every(i=>i.y===20)).toBe(true);const old=await geometry(page);await field(page,'width',57.5);const scaled=await geometry(page);for(let i=0;i<old.length;i++){expect(scaled[i].width/old[i].width).toBeCloseTo(.5,6);expect(scaled[i].height/old[i].height).toBeCloseTo(.5,6);if(old[i].fontSize)expect(scaled[i].fontSize/old[i].fontSize).toBeCloseTo(.5,6);}
  await page.locator('#free-sheet').focus();await page.keyboard.press('Shift+ArrowRight');const moved=await geometry(page);for(let i=0;i<moved.length;i++)expect(moved[i].x-scaled[i].x).toBe(5);
  await page.locator('#free-sheet-add').click();await page.locator('#free-sheet-select').selectOption('0');await page.locator('#free-select-all').click();await page.locator('#free-move-sheet').selectOption('1');await page.locator('#free-move-item').click();await expect(page.locator('#free-sheet-select')).toHaveValue('1');await expect(page.locator('#free-selection-count')).toContainText('已選 3');expect(await geometry(page)).toEqual(moved);
  await saved(page);await page.reload();await expect(page.locator('#free-dialog')).toBeVisible();await expect(page.locator('#free-selection-count')).toContainText('已選 3');expect(await geometry(page)).toEqual(moved);
  await page.locator('#free-preview').click();await expect(page.locator('#proof-download')).toBeEnabled();const result=await inspectPdf(page,await downloadBytes(page,page.locator('#proof-download')));expect(result).toHaveLength(2);expect(result[0].text).toBe('');for(const text of ['SOURCE_A_PAGE_1','SOURCE_A_PAGE_2','標題'])expect(result[1].text).toContain(text);expect(result[1].textItems.find(i=>i.text==='標題').height).toBeCloseTo(11,1);await page.locator('#proof-close').click();await page.locator('#free-close').click();expect((await inspectPdf(page,await downloadBytes(page,page.locator('#export-pdf')))).map(p=>p.text.trim())).toEqual(['SOURCE_A_PAGE_1','SOURCE_A_PAGE_2']);
});

test('pointer multi-selection, marquee, snapping, Alt bypass and cancelled group gestures preserve undo',async({page})=>{
  await ready(page);await load(page);const ids=await threeItems(page);await page.locator('#free-select-none').click();
  const a=await stagePoint(page,15,25);await page.mouse.click(a.x,a.y);const b=await stagePoint(page,105,75);await page.keyboard.down('Shift');await page.mouse.click(b.x,b.y);await page.keyboard.up('Shift');await expect(page.locator('#free-selection-count')).toContainText('已選 2');
  const before=await geometry(page);await page.locator('#free-snap').uncheck();await drag(page,[15,25],[30,35]);const moved=await geometry(page);for(const i of [0,1]){expect(moved[i].x-before[i].x).toBeCloseTo(15,4);expect(moved[i].y-before[i].y).toBeCloseTo(10,4);}expect(moved[2]).toEqual(before[2]);await page.locator('#free-undo').click();expect(await geometry(page)).toEqual(before);await expect(page.locator('#free-selection-count')).toContainText('已選 2');
  await drag(page,[15,25],[40,55],{cancel:true});expect(await geometry(page)).toEqual(before);
  await page.locator('#free-select-none').click();await drag(page,[5,5],[150,130]);await expect(page.locator('#free-selection-count')).toContainText('已選 3');
  await page.locator('#free-item').selectOption(ids[0]);await page.locator('#free-snap').check();await place(page,ids[0],20,20);await drag(page,[25,25],[16,25]);expect((await geometry(page))[0].x).toBeCloseTo(10,4);await expect(page.locator('[data-snap-guide]')).toHaveCount(0);
  await place(page,ids[0],20,20);await drag(page,[25,25],[16,25],{alt:true});expect((await geometry(page))[0].x).toBeCloseTo(11,4);
  await page.locator('#free-multi').check();await page.locator('#free-select-none').click();const one=await stagePoint(page,16,25);await page.mouse.click(one.x,one.y);const two=await stagePoint(page,105,75);await page.mouse.click(two.x,two.y);await expect(page.locator('#free-selection-count')).toContainText('已選 2');
  // Group handle scales both pages together, without requiring modifier keys.
  await page.locator('#free-multi').uncheck();const old=await geometry(page),handle=await page.locator('[data-group-handle]').boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x-20,handle.y-20,{steps:6});await page.mouse.up();const resized=await geometry(page);expect(resized[0].width/old[0].width).toBeCloseTo(resized[1].width/old[1].width,6);expect(resized[0].width).toBeLessThan(old[0].width);await page.locator('#free-undo').click();expect(await geometry(page)).toEqual(old);
});

test('unfinished group fields restore as a group and duplication/deletion stay atomic',async({page})=>{
  await ready(page);await load(page);await openLayout(page);await page.locator('#free-select-all').click();const before=await geometry(page);await page.locator('#free-x').fill('15');await saved(page);await page.reload();await expect(page.locator('#free-dialog')).toBeVisible();await expect(page.locator('#free-selection-count')).toContainText('已選 2');expect((await geometry(page))[1].x-(await geometry(page))[0].x).toBeCloseTo(before[1].x-before[0].x,6);await expect(page.locator('#free-x')).toHaveValue('15');
  await page.locator('#free-duplicate').click();await expect(page.locator('#free-sheet [data-item]')).toHaveCount(4);await expect(page.locator('#free-selection-count')).toContainText('已選 2');await page.locator('#free-delete').click();await expect(page.locator('#free-sheet [data-item]')).toHaveCount(2);await page.locator('#free-undo').click();await expect(page.locator('#free-sheet [data-item]')).toHaveCount(4);await expect(page.locator('#free-selection-count')).toContainText('已選 2');await page.locator('#free-undo').click();await expect(page.locator('#free-sheet [data-item]')).toHaveCount(2);
});

test('task cards and touch selection controls fit a 320px viewport',{tag:'@compatibility'},async({page})=>{
  await page.setViewportSize({width:320,height:740});await ready(page);for(const task of ['capture','organize','layout','text','all']){await mode(page,task);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await load(page);await mode(page,'layout');await page.locator('#task-start').click();await expect(page.locator('#free-preview')).toBeEnabled();await page.locator('#free-select-all').click();await expect(page.locator('#free-selection-count')).toContainText('已選 2');expect(await page.locator('#free-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});

for(const task of ['capture','all'])test(`regional OCR from ${task} keeps cancellation visible while the real engine loads`,async({page})=>{
  let release,requested;const gate=new Promise(resolve=>release=resolve),loading=new Promise(resolve=>requested=resolve);
  await page.route('**/vendor/ocr/tesseract.mjs',async route=>{const response=await route.fetch();requested();await gate;await route.fulfill({response});});
  await ready(page);await load(page);await mode(page,task);
  if(task==='all'){await page.locator('.ocr-settings summary').click();await page.getByRole('button',{name:'框選第 1 頁',exact:true}).click();}else await page.locator('#task-start').click();
  await expect(page.locator('#crop-controls')).toBeEnabled();await page.locator('#crop-ocr').click();await loading;
  try{
    await expect(page.locator(`[data-task="${task==='all'?'all':'text'}"]`)).toHaveAttribute('aria-pressed','true');await expect(page.locator('#ocr-cancel')).toBeVisible();await page.locator('#ocr-cancel').click();await expect(page.locator('#file-input')).toBeEnabled({timeout:2000});await expect(page.locator('#status')).toContainText('已停止');
  }finally{release();}
  await page.evaluate(async()=>{await import('/vendor/ocr/tesseract.mjs');});await mode(page,'capture');await expect(page.locator('#image-output')).toBeVisible();await expect(page.locator('#page-count')).toHaveText('2');
});
