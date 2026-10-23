import {sheetSize, arrangeItems, composeFreePdf, validateFreeLayout, MAX_SHEETS, MAX_LAYOUT_ITEMS, MM} from './free-layout-core.mjs?v=20261023-studio1';

export function installFreeLayout(api) {
  const {$} = api, NS = 'http://www.w3.org/2000/svg';
  document.body.insertAdjacentHTML('beforeend', `<dialog id="free-dialog" class="work-dialog free-dialog" aria-labelledby="free-title">
    <div class="preview-header"><div><h2 id="free-title">A4 自由排版</h2><p>拖曳安排多張 A4；右下角可等比例縮放，也可輸入毫米精確調整。</p></div><button id="free-close" class="secondary">關閉</button></div>
    <div class="free-layout"><fieldset id="free-controls"><legend class="sr-only">自由排版設定</legend>
      <label class="field-label" for="free-sheet-select">目前紙張</label><select id="free-sheet-select"></select><div class="free-pair"><button id="free-sheet-add" class="secondary">新增紙張</button><button id="free-sheet-remove" class="secondary danger">移除這張紙</button></div>
      <label class="field-label" for="free-orientation">紙張方向</label><select id="free-orientation"><option value="portrait">A4 直式</option><option value="landscape">A4 橫式</option></select>
      <label class="field-label" for="free-source">加入工作區頁面</label><select id="free-source"></select><div class="free-pair"><button id="free-add-page" class="secondary">加入這頁</button><button id="free-add-selected" class="secondary">加入勾選頁</button></div>
      <div class="free-pair"><button id="free-add-title" class="secondary">加入標題</button><button id="free-arrange" class="secondary">自動排齊</button></div>
      <label class="field-label" for="free-item">選取版面項目</label><select id="free-item"></select>
      <fieldset id="free-inspector"><legend class="sr-only">選取項目的屬性</legend>
        <label class="field-label" for="free-move-sheet">移至紙張</label><select id="free-move-sheet"></select><button id="free-move-item" class="secondary full">移動選取項目到這張紙</button>
        <div class="free-coordinates"><label>左側 mm<input id="free-x" type="number" min="0" step=".1"></label><label>上方 mm<input id="free-y" type="number" min="0" step=".1"></label><label>寬度 mm<input id="free-width" type="number" min="1" step=".1"></label><label>高度 mm<input id="free-height" type="number" min="1" step=".1"></label></div>
        <p class="field-hint">頁面保持原始比例。選中紙面項目後，可用方向鍵移動；Shift 加方向鍵每次移動 5 mm。</p>
        <div class="free-align" role="group" aria-label="項目對齊"><button class="secondary" data-align="left">靠左</button><button class="secondary" data-align="center">水平置中</button><button class="secondary" data-align="right">靠右</button><button class="secondary" data-align="top">靠上</button><button class="secondary" data-align="middle">垂直置中</button><button class="secondary" data-align="bottom">靠下</button></div>
        <div id="free-text-fields" hidden><label class="field-label" for="free-text">標題文字（最多 4 行）</label><textarea id="free-text" rows="3" maxlength="200"></textarea><div class="free-coordinates"><label>字級 pt<input id="free-font-size" type="number" min="6" max="72" value="22"></label><label>文字顏色<input id="free-color" type="color" value="#302f2b"></label></div></div>
        <div class="free-pair"><button id="free-back" class="secondary">往下一層</button><button id="free-front" class="secondary">往上一層</button></div>
        <div class="free-pair"><button id="free-duplicate" class="secondary">複製項目</button><button id="free-delete" class="secondary danger">移除項目</button></div>
      </fieldset>
      <div class="free-pair"><button id="free-undo" class="secondary">復原版面</button><button id="free-redo" class="secondary">重做版面</button><button id="free-clear" class="secondary">清空版面</button></div>
      <button id="free-preview" class="primary full">預覽並下載 A4 PDF</button>
      <p class="field-hint">可回到原稿「框選／裁切」，把局部加入這張 A4。版面保留加入當時的裁切與標記，每張最多 30 個項目、共 20 張與 300 個項目；開啟自動儲存後可在這台裝置接續編輯。裁切外內容未永久刪除。</p>
    </fieldset><div class="free-preview"><p id="free-sheet-label" class="free-sheet-label"></p><div class="free-desk"><svg id="free-sheet" role="group" aria-label="可拖曳與縮放的 A4 排版紙面" tabindex="0"></svg></div><p id="free-status" class="status" role="status"></p></div></div>
  </dialog>`);
  const dialog = $('free-dialog'), stage = $('free-sheet'), previews = new Map(),previewSizes=new Map();
  let items = [], orientation = 'portrait', selected = null, history = [], future = [], working = false, drag = null, saved = '', sheetCount=1, activeSheet=0;
  const current = () => items.find(item => item.id === selected);
  const visible=()=>items.filter(item=>(item.sheet??0)===activeSheet);
  const layout = () => ({orientation,sheetCount, items: structuredClone(items)});
  const signature = value => JSON.stringify(value);
  const say = (text, error = false) => { $('free-status').textContent = text; $('free-status').classList.toggle('error', error); };
  const round = value => String(Math.round(value * 10) / 10);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function remember() { future=[]; history.push({items: structuredClone(items), orientation, selected,sheetCount,activeSheet}); if (history.length > 30) history.shift(); }
  const retainedItems=()=>[items,...history.map(state=>state.items),...future.map(state=>state.items)].flat();
  const previewBytes=urls=>[...new Set(urls)].reduce((total,url)=>total+(previewSizes.get(url)||0),0);
  function collect() {
    // Keep undo bounded by preview memory as well as operation count.
    while(history.length&&previewBytes(retainedItems().map(item=>previews.get(item.id)))>64*1024*1024)history.shift();
    while(future.length&&previewBytes(retainedItems().map(item=>previews.get(item.id)))>64*1024*1024)future.shift();
    const live=new Set(retainedItems().map(item=>item.id)),oldUrls=new Set(previews.values());
    for(const id of previews.keys())if(!live.has(id))previews.delete(id);
    const kept=new Set(previews.values());for(const url of oldUrls)if(!kept.has(url)){URL.revokeObjectURL(url);previewSizes.delete(url);}
    api.layoutChanged();
  }
  const previewKey=record=>`${record.sourceId}:${record.index}:${record.thumbnail}:${record.rotation||0}:${JSON.stringify(record.crop||null)}`;
  function cachedPreviews(){const cache=new Map();for(const item of retainedItems())if(item.type==='page'&&previews.has(item.id))cache.set(previewKey(item.record),previews.get(item.id));return cache;}
  async function previewFor(record,cache,created,liveUrls,signal){
    signal?.throwIfAborted();const key=previewKey(record);let url=cache.get(key);
    if(url){if(previewBytes([...liveUrls,url])>32*1024*1024)throw Error('目前排版預覽超過 32 MB，請減少項目或拆成不同工作區。');return url;}
    const result=await api.renderBlob(api.getSources().get(record.sourceId),record.index,96,'jpeg',false,record,{maxEdge:900,quality:.85});signal?.throwIfAborted();
    if(previewBytes(liveUrls)+result.blob.size>32*1024*1024)throw Error('目前排版預覽超過 32 MB，請減少項目或拆成不同工作區。');
    url=URL.createObjectURL(result.blob);previewSizes.set(url,result.blob.size);cache.set(key,url);created.add(url);return url;
  }
  const node = (tag, attrs = {}) => { const el = document.createElementNS(NS, tag); for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value)); return el; };
  function label(item, index) { return item.type === 'text' ? `${index + 1}. 標題：${item.text.slice(0, 18)}` : `${index + 1}. ${api.getSources().get(item.record.sourceId)?.name || '來源頁面'} · 原第 ${item.record.index + 1} 頁${item.record.crop ? '（框選）' : ''}`; }
  function inspector() {
    const item = current(); $('free-item').replaceChildren(new Option('點選紙面項目', ''));
    visible().forEach((item, i) => $('free-item').add(new Option(label(item, i), item.id))); $('free-item').value = selected || '';
    $('free-inspector').disabled = working || !item; $('free-text-fields').hidden = item?.type !== 'text';
    for (const [key, id] of [['x', 'free-x'], ['y', 'free-y'], ['width', 'free-width'], ['height', 'free-height']]) $(id).value = item ? round(item[key]) : '';
    $('free-width').disabled = $('free-height').disabled = item?.type === 'text';
    if (item?.type === 'text') { $('free-text').value = item.text; $('free-font-size').value = item.fontSize; $('free-color').value = item.color; }
    $('free-undo').disabled = working || !history.length; $('free-redo').disabled = working || !future.length; $('free-preview').disabled = working || !items.length;
    for(const id of ['free-sheet-select','free-move-sheet']){const selectedValue=$(id).value;$(id).replaceChildren(...Array.from({length:sheetCount},(_,i)=>new Option(`第 ${i+1} 張 A4`,String(i))));$(id).value=id==='free-sheet-select'?String(activeSheet):Number(selectedValue)<sheetCount?selectedValue:String(activeSheet);}
    $('free-sheet-add').disabled=working||sheetCount>=MAX_SHEETS;$('free-sheet-remove').disabled=working||sheetCount===1;
    $('free-clear').disabled = $('free-arrange').disabled = working || !visible().length;
  }
  function render(sync = true) {
    const size = sheetSize(orientation); stage.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`);
    stage.style.aspectRatio = `${size.width}/${size.height}`; $('free-sheet-label').textContent = `第 ${activeSheet+1} / ${sheetCount} 張 A4 · ${size.width} × ${size.height} mm · ${visible().length} 個項目`;
    const fragment = document.createDocumentFragment();
    visible().forEach((item, index) => {
      const group = node('g', {'data-item': item.id, tabindex: 0, role: 'button', 'aria-label': label(item, index), 'aria-pressed': item.id === selected});
      group.append(node('rect', {x: item.x, y: item.y, width: item.width, height: item.height, fill: 'transparent'}));
      if (item.type === 'page') group.append(node('image', {href: previews.get(item.id) || '', x: item.x, y: item.y, width: item.width, height: item.height, preserveAspectRatio: 'xMidYMid meet', 'pointer-events': 'none'}));
      else {
        const text = node('text', {x: item.x, y: item.y + item.fontSize / MM, fill: item.color, 'font-family': 'PDFChinese, sans-serif', 'font-size': item.fontSize / MM, 'pointer-events': 'none'});
        item.text.split('\n').forEach((line, i) => { const span = node('tspan', {x: item.x, dy: i ? item.fontSize / MM * 1.3 : 0}); span.textContent = line; text.append(span); }); group.append(text);
      }
      if (selected === item.id) {
        group.append(node('rect', {x: item.x, y: item.y, width: item.width, height: item.height, fill: 'none', stroke: '#3b5685', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none'}));
        if (item.type === 'page') group.append(node('rect', {'data-resize': 'true', x: item.x + item.width - 3, y: item.y + item.height - 3, width: 6, height: 6, rx: 1, fill: '#3b5685'}));
      }
      fragment.append(group);
    });
    stage.replaceChildren(fragment); if (sync) inspector();
  }
  function commit() { render(); collect(); }
  function setWorking(value) { working = value; $('free-controls').disabled = value; $('free-close').disabled = value; stage.classList.toggle('working', value); inspector(); }
  function sourceChoices() {
    $('free-source').replaceChildren(); api.getPages().forEach((record, index) => $('free-source').add(new Option(`第 ${index + 1} 頁 · ${api.getSources().get(record.sourceId)?.name || ''}`, record.id)));
    $('free-add-page').disabled = !api.getPages().length; $('free-add-selected').disabled = !api.chosen().length;
  }
  function open() {
    if (api.isBusy()) return false;
    api.setBusy(true); sourceChoices(); dialog.showModal(); render(); say('拖曳移動項目；右下角方塊可等比例縮放。先選項目，再使用左側對齊與位置設定。'); return true;
  }
  async function addRecords(records) {
    if (!records.length) return;
    if (visible().length + records.length > 30 || items.length+records.length>MAX_LAYOUT_ITEMS) { say('每張 A4 最多 30 個項目、總計 300 個；請新增紙張或減少勾選頁面。', true); return; }
    const initiallyEmpty = !visible().length,cache=cachedPreviews(),created=new Set(); remember(); setWorking(true);
    try {
      for (const record of records) {
        say(`正在加入版面（${items.length + 1} 個項目）…`);
        const source = api.getSources().get(record.sourceId), viewport = await api.pageViewport(source, record);
        const id = crypto.randomUUID(), width = Math.min(80, 100 * viewport.width / viewport.height), height = width * viewport.height / viewport.width;
        if (Math.min(width, height) < 1) throw new Error('頁面比例過長，請先框選需要的範圍。');
        const item = {id, sheet:activeSheet, type: 'page', record: structuredClone(record), x: 10, y: 10, width, height};
        if (!initiallyEmpty) {
          const size = sheetSize(orientation), xs = [...new Set([10, ...visible().map(i => i.x + i.width + 5)])].sort((a,b) => a-b), ys = [...new Set([10, ...visible().map(i => i.y + i.height + 5)])].sort((a,b) => a-b);
          let placed = false;
          for (const y of ys) { for (const x of xs) {
            if (x + width <= size.width - 5 && y + height <= size.height - 5 && visible().every(i => x + width + 3 <= i.x || i.x + i.width + 3 <= x || y + height + 3 <= i.y || i.y + i.height + 3 <= y)) { item.x = x; item.y = y; placed = true; break; }
          } if (placed) break; }
          if (!placed) { item.x = Math.min(size.width - width, 10 + items.length * 5); item.y = Math.min(size.height - height, 10 + items.length * 5); }
        }
        previews.set(id,await previewFor(record,cache,created,items.map(item=>previews.get(item.id)))); items.push(item); selected = id;
      }
      if (initiallyEmpty) arrangeActive(); say('已加入並保留既有位置。可自由調整；「預覽並下載」會顯示實際 PDF。');
    } catch (error) { say(`無法加入：${error.message}`, true); }
    finally { setWorking(false); sourceChoices(); commit(); }
  }
  function titleGeometry(item) {
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d'); ctx.font = `${item.fontSize}px PDFChinese`;
    return {...item, width: Math.max(1, ...item.text.split('\n').map(line => ctx.measureText(line).width / MM)), height: item.text.split('\n').length * item.fontSize / MM * 1.3};
  }
  async function addTitle() {
    if (visible().length >= 30 || items.length>=MAX_LAYOUT_ITEMS) { say('每張 A4 最多 30 個項目。', true); return; }
    setWorking(true);
    try { await document.fonts.load('22px PDFChinese'); remember(); const item = titleGeometry({id: crypto.randomUUID(), sheet:activeSheet, type: 'text', text: '在這裡輸入標題', fontSize: 22, color: '#302f2b', x: 10, y: 10}); items.push(item); selected = item.id; say('在左側修改標題、字級與顏色；可拖曳移動標題。'); }
    catch (error) { say(`無法加入標題：${error.message}`, true); }
    finally { setWorking(false); commit(); }
  }
  function edit(change) {
    const item = current(); if (!item || working) return;
    try {
      const next = change({...item}), size = sheetSize(orientation);
      if (![next.x, next.y, next.width, next.height].every(Number.isFinite) || Math.min(next.width, next.height) < 1 || next.width > size.width || next.height > size.height) throw new Error('尺寸超出 A4，請縮小項目。');
      next.x = clamp(next.x, 0, size.width - next.width); next.y = clamp(next.y, 0, size.height - next.height);
      remember(); items = items.map(i => i.id === next.id ? next : i); commit();
    } catch (error) { say(error.message, true); inspector(); }
  }
  for (const key of ['x', 'y', 'width', 'height']) $(`free-${key}`).onchange = () => edit(item => {
    const value = Number($(`free-${key}`).value); if ($(`free-${key}`).value === '') throw new Error('請輸入位置或尺寸。');
    if (key === 'width') item.height *= value / item.width; if (key === 'height') item.width *= value / item.height; item[key] = value; return item;
  });
  for (const id of ['free-text', 'free-font-size', 'free-color']) $(id).onchange = () => edit(item => {
    const text = $('free-text').value, fontSize = Number($('free-font-size').value);
    if (!text.trim() || text.length > 200 || text.split('\n').length > 4 || !Number.isFinite(fontSize) || fontSize < 6 || fontSize > 72) throw new Error('標題最多 200 字、4 行，字級須為 6 至 72 pt。');
    return titleGeometry({...item, text, fontSize, color: $('free-color').value});
  });
  for (const control of dialog.querySelectorAll('[data-align]')) control.onclick = () => edit(item => {
    const size = sheetSize(orientation), action = control.dataset.align;
    if (action === 'left') item.x = Math.min(10, size.width - item.width);
    if (action === 'right') item.x = Math.max(0, size.width - item.width - 10);
    if (action === 'center') item.x = (size.width - item.width) / 2;
    if (action === 'top') item.y = Math.min(10, size.height - item.height);
    if (action === 'bottom') item.y = Math.max(0, size.height - item.height - 10);
    if (action === 'middle') item.y = (size.height - item.height) / 2; return item;
  });
  $('free-item').onchange = () => { selected = $('free-item').value || null; render(); };
  function undo() { if (working || drag || !history.length) return; future.push({items:structuredClone(items),orientation,selected,sheetCount,activeSheet}); const last = history.pop(); ({items, orientation, selected,sheetCount,activeSheet} = last); $('free-orientation').value = orientation; commit(); say('已復原版面操作。'); }
  function redo() { if(working||drag||!future.length)return;history.push({items:structuredClone(items),orientation,selected,sheetCount,activeSheet});const next=future.pop();({items,orientation,selected,sheetCount,activeSheet}=next);$('free-orientation').value=orientation;commit();say('已重做版面操作。');}
  function remove() { if (!current() || working) return; remember(); items = items.filter(i => i.id !== selected); selected = null; commit(); }
  $('free-delete').onclick = remove; $('free-undo').onclick = undo; $('free-redo').onclick=redo;
  $('free-clear').onclick = () => { remember();items=items.filter(item=>(item.sheet??0)!==activeSheet);selected=null;commit(); };
  $('free-duplicate').onclick = () => {
    const item = current(); if (!item || working) return; if (visible().length >= 30 || items.length>=MAX_LAYOUT_ITEMS) { say('每張 A4 最多 30 個項目。', true); return; }
    remember(); const size = sheetSize(orientation), copy = {...structuredClone(item), id: crypto.randomUUID(), x: Math.min(size.width - item.width, item.x + 5), y: Math.min(size.height - item.height, item.y + 5)};
    if (previews.has(item.id)) previews.set(copy.id, previews.get(item.id));
    items.push(copy); selected = copy.id; commit();
  };
  for (const [id, step] of [['free-back', -1], ['free-front', 1]]) $(id).onclick = () => {
    const list=visible(),position=list.findIndex(i=>i.id===selected),target=list[position+step];if(!target)return;const index=items.findIndex(i=>i.id===selected),to=items.indexOf(target);
    remember();const next=[...items];[next[index],next[to]]=[next[to],next[index]];items=next;commit();
  };
  $('free-add-title').onclick = addTitle;
  $('free-add-page').onclick = () => { const record = api.getPages().find(p => p.id === $('free-source').value); if (record) void addRecords([record]); };
  $('free-add-selected').onclick = () => void addRecords(api.chosen());
  function arrangeActive(){const next=new Map(arrangeItems(visible(),orientation).map(item=>[item.id,item]));items=items.map(item=>next.get(item.id)||item);}
  $('free-arrange').onclick = () => { try { const next = arrangeItems(visible(), orientation); remember();const replacements=new Map(next.map(item=>[item.id,item]));items=items.map(item=>replacements.get(item.id)||item); commit(); } catch (error) { say(error.message, true); } };
  $('free-orientation').onchange = () => {
    try { const nextOrientation = $('free-orientation').value, next = Array.from({length:sheetCount},(_,sheet)=>arrangeItems(items.filter(item=>(item.sheet??0)===sheet),nextOrientation)).flat(); remember(); orientation = nextOrientation; items = next; commit(); }
    catch (error) { $('free-orientation').value = orientation; say(error.message, true); }
  };
  $('free-sheet-select').onchange=()=>{if(working||drag)return;activeSheet=Number($('free-sheet-select').value);selected=null;render();api.autosaveChanged();};
  $('free-sheet-add').onclick=()=>{if(working||drag||sheetCount>=MAX_SHEETS)return;remember();activeSheet=sheetCount++;selected=null;commit();};
  $('free-sheet-remove').onclick=()=>{if(working||drag||sheetCount===1)return;remember();items=items.filter(item=>(item.sheet??0)!==activeSheet).map(item=>({...item,sheet:(item.sheet??0)>activeSheet?(item.sheet??0)-1:item.sheet??0}));sheetCount--;activeSheet=Math.min(activeSheet,sheetCount-1);selected=null;commit();say('已移除此張紙及其項目，可復原。');};
  $('free-move-item').onclick=()=>{const item=current(),target=Number($('free-move-sheet').value);if(!item||working||drag||target===activeSheet)return;if(items.filter(i=>(i.sheet??0)===target).length>=30){say('目標紙張已有 30 個項目。',true);return;}remember();items=items.map(i=>i.id===selected?{...i,sheet:target}:i);activeSheet=target;commit();say('已移到指定紙張，可復原。');};
  const point = event => { const rect = stage.getBoundingClientRect(), size = sheetSize(orientation); return {x: (event.clientX - rect.left) / rect.width * size.width, y: (event.clientY - rect.top) / rect.height * size.height}; };
  stage.addEventListener('pointerdown', event => {
    if (working || drag || event.button !== 0) return; const target = event.target.closest('[data-item]'); selected = target?.dataset.item || null;
    if (!selected) { render(); return; } event.preventDefault();const historyBefore=[...history],futureBefore=[...future]; remember(); drag = {start: point(event), original: {...current()}, resize: event.target.hasAttribute('data-resize'), previous: history.at(-1),historyBefore,futureBefore}; stage.setPointerCapture(event.pointerId); render(); stage.focus();
  });
  stage.addEventListener('pointermove', event => {
    if (!drag) return; const p = point(event), original = drag.original, size = sheetSize(orientation), next = {...original};
    if (drag.resize) {
      const ratio = original.width / original.height, dx = p.x - drag.start.x, dy = (p.y - drag.start.y) * ratio;
      next.width = clamp(original.width + (Math.abs(dx) >= Math.abs(dy) ? dx : dy), Math.min(5, original.width), Math.min(size.width - original.x, (size.height - original.y) * ratio)); next.height = next.width / ratio;
    } else { next.x = clamp(original.x + p.x - drag.start.x, 0, size.width - original.width); next.y = clamp(original.y + p.y - drag.start.y, 0, size.height - original.height); }
    items = items.map(i => i.id === next.id ? next : i); render(false);
  });
  stage.addEventListener('pointerup', () => { if (drag) {if(JSON.stringify(items)===JSON.stringify(drag.previous.items)){history=drag.historyBefore;future=drag.futureBefore;} drag = null; commit(); } });
  stage.addEventListener('pointercancel', () => { if (drag) {items=drag.previous.items;history=drag.historyBefore;future=drag.futureBefore; drag = null; commit(); } });
  stage.addEventListener('keydown', event => {
    if (working || drag) return;
    const item = event.target.closest('[data-item]'); if (item) selected = item.dataset.item;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); render(); stage.focus(); }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove(); }
    const step = event.shiftKey ? 5 : 1, delta = {ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step]}[event.key];
    if (delta) { event.preventDefault(); edit(i => ({...i, x: i.x + delta[0], y: i.y + delta[1]})); stage.focus(); }
  });
  $('free-preview').onclick = () => {
    if (working || !items.length) return; const snapshot = layout(), title = `${api.filename()}_A4自由排版`;
    api.showProof({title, build: signal => composeFreePdf(snapshot, api.getSources(), title, {signal}), onDownload: () => {
      saved = signature(snapshot); api.markExported(snapshot.items.filter(i => i.type === 'page').map(i => i.record)); api.layoutChanged();
    }});
  };
  $('free-close').onclick = () => dialog.close(); dialog.addEventListener('cancel', event => { if (working) event.preventDefault(); });
  dialog.addEventListener('close', () => { drag = null; api.setBusy(false); });
  $('free-layout').onclick = () => { if (open() && !items.length) void addRecords(api.chosen()); };
  return {
    undo,redo,
    template:()=>({...layout(),items:items.map(({record,preview,id,...item})=>item)}),
    async applyTemplate(value,records,{signal,onProgress}={}){
      const slots=value.items.filter(item=>item.type==='page');if(records.length>slots.length)throw Error(`此版型可放 ${slots.length} 頁，目前勾選 ${records.length} 頁。`);
      const prepared=[],urls=new Map(),cache=cachedPreviews(),created=new Set();let index=0;
      try{
        for(const slot of value.items){signal?.throwIfAborted();onProgress?.(prepared.length+1,value.items.length);
          const id=crypto.randomUUID();if(slot.type==='text'){prepared.push({...slot,id});continue;}
          const record=records[index++];if(!record)continue;
          const source=api.getSources().get(record.sourceId),viewport=await api.pageViewport(source,record),scale=Math.min(slot.width/viewport.width,slot.height/viewport.height),width=viewport.width*scale,height=viewport.height*scale;
          urls.set(id,await previewFor(record,cache,created,[...urls.values()],signal));
          prepared.push({...slot,id,record:structuredClone(record),x:slot.x+(slot.width-width)/2,y:slot.y+(slot.height-height)/2,width,height});
        }
        signal?.throwIfAborted();validateFreeLayout({...value,items:prepared},{allowEmpty:true});
      }catch(error){for(const url of created){URL.revokeObjectURL(url);previewSizes.delete(url);}throw error;}
      remember();items=prepared;orientation=value.orientation;sheetCount=value.sheetCount??1;activeSheet=items[0]?.sheet??0;selected=items[0]?.id??null;for(const [id,url]of urls)previews.set(id,url);$('free-orientation').value=orientation;commit();
    },
    capture() { return {...layout(), activeSheet, selected, exported:signature(layout())===saved, open:dialog.open, fieldChanges:current()?['x','y','width','height'].filter(key=>$('free-'+key).value!==round(current()[key])).map(key=>'free-'+key).concat(current().type==='text'?['free-text','free-font-size','free-color'].filter(id=>$(id).value!==String(id==='free-text'?current().text:id==='free-font-size'?current().fontSize:current().color)):[]):[], fields:dialog.open&&current()?Object.fromEntries(['free-x','free-y','free-width','free-height','free-text','free-font-size','free-color'].map(id=>[id,$(id).value])):null, items:structuredClone(items).map(item=>item.type==='page'?{...item,preview:previews.get(item.id)}:item)}; },
    restore(value,record,asset,assetSize=()=>0) { items=value.items.map(item=>item.type==='page'?{...item,record:record(item.record)}:item);for(const item of value.items)if(item.type==='page'){const url=asset(item.preview);previews.set(item.id,url);previewSizes.set(url,assetSize(item.preview));}if(previewBytes(previews.values())>32*1024*1024)throw Error('排版預覽超過 32 MB。');orientation=value.orientation;selected=items.some(item=>item.id===value.selected)?value.selected:null;sheetCount=value.sheetCount??1;activeSheet=value.activeSheet??0;if(selected)activeSheet=items.find(item=>item.id===selected).sheet??0;history=[];future=[];$('free-orientation').value=orientation;saved=value.exported?signature(layout()):'';render(); },
    resume(value) { if(value.open&&open()&&value.fields){for(const id of value.fieldChanges||[])if(['free-x','free-y','free-width','free-height','free-text','free-font-size','free-color'].includes(id)){$(id).value=value.fields[id];$(id).dispatchEvent(new Event('change'));}history=[];future=[];} },
    refresh() { $('free-layout').disabled = api.isBusy() || !items.length && !api.chosen().length; },
    retainedRecords: () => [items, ...history.map(h => h.items), ...future.map(h => h.items)].flat().filter(i => i.type === 'page').map(i => i.record),
    hasPending: () => {
      if (items.length > 0 && signature(layout()) !== saved) return true;
      const item = current(); if (!dialog.open || !item) return false;
      return ['x','y','width','height'].some(key => $('free-'+key).value !== round(item[key])) || item.type === 'text' && ($('free-text').value !== item.text || Number($('free-font-size').value) !== item.fontSize || $('free-color').value !== item.color);
    },
    addPiece(record) { if (open()) void addRecords([record]); },
    clear() { items = []; history = []; future=[]; selected = null; orientation = 'portrait';sheetCount=1;activeSheet=0; saved = ''; for (const url of previews.values()) URL.revokeObjectURL(url); previews.clear();previewSizes.clear(); $('free-orientation').value = orientation; render(); },
  };
}
