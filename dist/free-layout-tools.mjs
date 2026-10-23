import {sheetSize, arrangeItems, composeFreePdf, validateFreeLayout, MAX_SHEETS, MAX_LAYOUT_ITEMS, MM} from './free-layout-core.mjs?v=20261024-ease1';

import {selectionBounds, moveSelection, scaleSelection, alignSelection, distributeSelection, snapSelection} from './layout-selection.mjs?v=20261024-ease1';

export function installFreeLayout(api) {
  const {$} = api, NS = 'http://www.w3.org/2000/svg';
  document.body.insertAdjacentHTML('beforeend', `<dialog id="free-dialog" class="work-dialog free-dialog" aria-labelledby="free-title">
    <div class="preview-header"><div><h2 id="free-title">A4 自由排版</h2><p>拖曳安排多張 A4；支援磁吸、多選、整組等比例縮放與等距排列。</p></div><button id="free-close" class="secondary">關閉</button></div>
    <div class="free-layout"><fieldset id="free-controls"><legend class="sr-only">自由排版設定</legend>
      <label class="field-label" for="free-sheet-select">目前紙張</label><select id="free-sheet-select"></select><div class="free-pair"><button id="free-sheet-add" class="secondary">新增紙張</button><button id="free-sheet-remove" class="secondary danger">移除這張紙</button></div>
      <label class="field-label" for="free-orientation">紙張方向</label><select id="free-orientation"><option value="portrait">A4 直式</option><option value="landscape">A4 橫式</option></select>
      <label class="field-label" for="free-source">加入工作區頁面</label><select id="free-source"></select><div class="free-pair"><button id="free-add-page" class="secondary">加入這頁</button><button id="free-add-selected" class="secondary">加入勾選頁</button></div>
      <div class="free-pair"><button id="free-add-title" class="secondary">加入標題</button><button id="free-arrange" class="secondary">自動排齊</button></div>
      <div class="free-selection-options"><label class="remember-output"><input id="free-snap" type="checkbox" checked>拖曳時磁吸對齊</label><label class="remember-output"><input id="free-multi" type="checkbox">多選模式（適合觸控）</label></div>
      <div class="free-pair"><button id="free-select-all" class="secondary">選取這張全部項目</button><button id="free-select-none" class="secondary">取消選取</button></div>
      <p id="free-selection-count" class="field-hint" role="status"></p>
      <p class="field-hint">Shift／Ctrl／⌘ 點擊可多選，也可從紙面空白處拖曳框選。觸控多選後，關閉多選模式即可整組拖曳。按住 Alt 暫停磁吸。</p>
      <label class="field-label" for="free-item">選取版面項目</label><select id="free-item"></select>
      <fieldset id="free-inspector"><legend class="sr-only">選取項目的屬性</legend>
        <label class="field-label" for="free-move-sheet">移至紙張</label><select id="free-move-sheet"></select><button id="free-move-item" class="secondary full">移動選取項目到這張紙</button>
        <div class="free-coordinates"><label>左側 mm<input id="free-x" type="number" min="0" step=".1"></label><label>上方 mm<input id="free-y" type="number" min="0" step=".1"></label><label>寬度 mm<input id="free-width" type="number" min="1" step=".1"></label><label>高度 mm<input id="free-height" type="number" min="1" step=".1"></label></div>
        <p class="field-hint">多選時位置與尺寸表示整組範圍；縮放會保持比例並調整標題字級。方向鍵移動 1 mm，Shift 加方向鍵移動 5 mm。單項對齊紙張，多項對齊選取範圍。</p>
        <div class="free-align" role="group" aria-label="項目對齊"><button class="secondary" data-align="left">靠左</button><button class="secondary" data-align="center">水平置中</button><button class="secondary" data-align="right">靠右</button><button class="secondary" data-align="top">靠上</button><button class="secondary" data-align="middle">垂直置中</button><button class="secondary" data-align="bottom">靠下</button></div>
        <div class="free-pair"><button id="free-distribute-x" class="secondary">水平等距</button><button id="free-distribute-y" class="secondary">垂直等距</button></div>
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
  let items = [], orientation = 'portrait', selected = null, history = [], future = [], working = false, drag = null, saved = '', sheetCount=1, activeSheet=0,created=false;
  let selection = new Set(), guides = [], marquee = null, pendingPointer = null, pointerFrame = 0;
  const current = () => items.find(item => item.id === selected);
  const selectedItems = () => visible().filter(item => selection.has(item.id));
  const selectedGeometry = () => selectionBounds(selectedItems());
  function select(id, toggle = false) {
    if (toggle) { if (selection.has(id)) selection.delete(id); else selection.add(id); selected = selection.has(id) ? id : [...selection].at(-1) || null; }
    else { selected = id; selection = new Set(id ? [id] : []); }
  }
  function normalizeSelection() {
    const ids = new Set(visible().map(item => item.id)); selection = new Set([...selection].filter(id => ids.has(id)));
    if (!selected) selection.clear();
    else if (!selection.has(selected)) selection = new Set(ids.has(selected) ? [selected] : []);
    if (!ids.has(selected)) selected = [...selection].at(-1) || null;
  }
  const state = () => ({items:cloneItems(), orientation, selected, selection:[...selection], sheetCount, activeSheet, created});
  function adopt(value) { ({items, orientation, selected, sheetCount, activeSheet, created} = value); selection = new Set(value.selection || (selected ? [selected] : [])); }
  const replaceItems = next => {const changes = new Map(next.map(item => [item.id, item])); items = items.map(item => changes.get(item.id) || item);};
  const visible=()=>items.filter(item=>(item.sheet??0)===activeSheet);
  // Page records are immutable snapshots. Geometry/history may share them safely.
  const cloneItems=()=>items.map(item=>({...item})),recordSnapshots=new WeakMap(),recordVersions=new WeakMap();let nextVersion=0;
  const pageSnapshot=record=>{if(!recordSnapshots.has(record))recordSnapshots.set(record,structuredClone(record));return recordSnapshots.get(record);};
  const layout = () => ({orientation,sheetCount,created,items:cloneItems()});
  const signature=value=>JSON.stringify({...value,items:value.items.map(item=>{if(item.type!=='page')return item;if(!recordVersions.has(item.record))recordVersions.set(item.record,++nextVersion);return {...item,record:recordVersions.get(item.record)};})});
  const say = (text, error = false) => { $('free-status').textContent = text; $('free-status').classList.toggle('error', error); };
  const round = value => String(Math.round(value * 10) / 10);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function remember() { future=[]; history.push(state()); if (history.length > 30) history.shift(); }
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
  async function previewFor(record,cache,createdUrls,liveUrls,signal){
    signal?.throwIfAborted();const key=previewKey(record);let url=cache.get(key);
    if(url){if(previewBytes([...liveUrls,url])>32*1024*1024)throw Error('目前排版預覽超過 32 MB，請減少項目或拆成不同工作區。');return url;}
    const result=await api.renderBlob(api.getSources().get(record.sourceId),record.index,96,'jpeg',false,record,{maxEdge:900,quality:.85});signal?.throwIfAborted();
    if(previewBytes(liveUrls)+result.blob.size>32*1024*1024)throw Error('目前排版預覽超過 32 MB，請減少項目或拆成不同工作區。');
    url=URL.createObjectURL(result.blob);previewSizes.set(url,result.blob.size);cache.set(key,url);createdUrls.add(url);return url;
  }
  const node = (tag, attrs = {}) => { const el = document.createElementNS(NS, tag); for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value)); return el; };
  function label(item, index) { return item.type === 'text' ? `${index + 1}. 標題：${item.text.slice(0, 18)}` : `${index + 1}. ${api.getSources().get(item.record.sourceId)?.name || '來源頁面'} · 原第 ${item.record.index + 1} 頁${item.record.crop ? '（框選）' : ''}`; }
  function inspector() {
    const chosen = selectedItems(), box = selectedGeometry(), item = chosen.length === 1 ? chosen[0] : null; $('free-item').replaceChildren(new Option('點選紙面項目', ''));
    visible().forEach((item, i) => $('free-item').add(new Option(label(item, i), item.id))); $('free-item').value = selected || '';
    $('free-inspector').disabled = working || !chosen.length; $('free-selection-count').textContent = `已選 ${chosen.length} / ${visible().length} 個項目`; $('free-distribute-x').disabled = $('free-distribute-y').disabled = working || chosen.length < 3; $('free-text-fields').hidden = item?.type !== 'text';
    for (const [key, id] of [['x', 'free-x'], ['y', 'free-y'], ['width', 'free-width'], ['height', 'free-height']]) $(id).value = box ? round(box[key]) : '';
    $('free-width').disabled = $('free-height').disabled = item?.type === 'text';
    if (item?.type === 'text') { $('free-text').value = item.text; $('free-font-size').value = item.fontSize; $('free-color').value = item.color; }
    $('free-undo').disabled = working || !history.length; $('free-redo').disabled = working || !future.length; $('free-preview').disabled = working || !created;
    for(const id of ['free-sheet-select','free-move-sheet']){const selectedValue=$(id).value;$(id).replaceChildren(...Array.from({length:sheetCount},(_,i)=>new Option(`第 ${i+1} 張 A4`,String(i))));$(id).value=id==='free-sheet-select'?String(activeSheet):selectedValue!==''&&Number(selectedValue)<sheetCount?selectedValue:String(activeSheet);}
    $('free-sheet-add').disabled=working||sheetCount>=MAX_SHEETS;$('free-sheet-remove').disabled=working||sheetCount===1;
    $('free-clear').disabled = $('free-arrange').disabled = working || !visible().length;
  }
  function render(sync = true) {
    normalizeSelection(); const size = sheetSize(orientation); stage.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`);
    stage.style.aspectRatio = `${size.width}/${size.height}`; $('free-sheet-label').textContent = `第 ${activeSheet+1} / ${sheetCount} 張 A4 · ${size.width} × ${size.height} mm · ${visible().length} 個項目`;
    const fragment = document.createDocumentFragment();
    visible().forEach((item, index) => {
      const group = node('g', {'data-item': item.id, tabindex: 0, role: 'button', 'aria-label': label(item, index), 'aria-pressed': selection.has(item.id)});
      group.append(node('rect', {x: item.x, y: item.y, width: item.width, height: item.height, fill: 'transparent'}));
      if (item.type === 'page') group.append(node('image', {href: previews.get(item.id) || '', x: item.x, y: item.y, width: item.width, height: item.height, preserveAspectRatio: 'xMidYMid meet', 'pointer-events': 'none'}));
      else {
        const text = node('text', {x: item.x, y: item.y + item.fontSize / MM, fill: item.color, 'font-family': 'PDFChinese, sans-serif', 'font-size': item.fontSize / MM, 'pointer-events': 'none'});
        item.text.split('\n').forEach((line, i) => { const span = node('tspan', {x: item.x, dy: i ? item.fontSize / MM * 1.3 : 0}); span.textContent = line; text.append(span); }); group.append(text);
      }
      if (selection.has(item.id)) {
        group.append(node('rect', {x: item.x, y: item.y, width: item.width, height: item.height, fill: 'none', stroke: '#3b5685', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none'}));
        if (selection.size === 1 && item.type === 'page') group.append(node('rect', {'data-resize': 'true', x: item.x + item.width - 3, y: item.y + item.height - 3, width: 6, height: 6, rx: 1, fill: '#3b5685'}));
      }
      fragment.append(group);
    });
    const box = selectedGeometry();
    if (selection.size > 1 && box) {
      fragment.append(node('rect', {'data-selection-box':'true', ...box, fill:'none', stroke:'#3b5685', 'stroke-width':1.5, 'stroke-dasharray':'5 3', 'vector-effect':'non-scaling-stroke', 'pointer-events':'none'}));
      fragment.append(node('rect', {'data-group-handle':'true', 'data-resize':'true', x:box.x+box.width-3, y:box.y+box.height-3, width:6, height:6, rx:1, fill:'#3b5685', 'aria-hidden':'true'}));
    }
    for (const guide of guides) fragment.append(node('line', {'data-snap-guide':guide.axis, x1:guide.axis==='x'?guide.value:0, x2:guide.axis==='x'?guide.value:size.width, y1:guide.axis==='y'?guide.value:0, y2:guide.axis==='y'?guide.value:size.height, stroke:'#a46d35', 'stroke-width':1, 'stroke-dasharray':'4 3', 'vector-effect':'non-scaling-stroke', 'pointer-events':'none'}));
    if (marquee) fragment.append(node('rect', {'data-marquee':'true', ...marquee, fill:'#3b568519', stroke:'#3b5685', 'stroke-width':1, 'vector-effect':'non-scaling-stroke', 'pointer-events':'none'}));
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
    api.setBusy(true);created=true; sourceChoices(); dialog.showModal(); render(); say('拖曳移動項目；右下角方塊可等比例縮放。按住 Shift／Ctrl／⌘ 點擊可多選；也可使用觸控多選模式或拖曳空白處框選。'); return true;
  }
  async function addRecords(records) {
    if (!records.length) return;
    if (visible().length + records.length > 30 || items.length+records.length>MAX_LAYOUT_ITEMS) { say('每張 A4 最多 30 個項目、總計 300 個；請新增紙張或減少勾選頁面。', true); return; }
    const initiallyEmpty = !visible().length,cache=cachedPreviews(),createdUrls=new Set(); remember(); setWorking(true);
    try {
      for (const record of records) {
        say(`正在加入版面（${items.length + 1} 個項目）…`);
        const source = api.getSources().get(record.sourceId), viewport = await api.pageViewport(source, record);
        const id = crypto.randomUUID(), width = Math.min(80, 100 * viewport.width / viewport.height), height = width * viewport.height / viewport.width;
        if (Math.min(width, height) < 1) throw new Error('頁面比例過長，請先框選需要的範圍。');
        const item = {id, sheet:activeSheet, type: 'page', record:pageSnapshot(record), x: 10, y: 10, width, height};
        if (!initiallyEmpty) {
          const size = sheetSize(orientation), xs = [...new Set([10, ...visible().map(i => i.x + i.width + 5)])].sort((a,b) => a-b), ys = [...new Set([10, ...visible().map(i => i.y + i.height + 5)])].sort((a,b) => a-b);
          let placed = false;
          for (const y of ys) { for (const x of xs) {
            if (x + width <= size.width - 5 && y + height <= size.height - 5 && visible().every(i => x + width + 3 <= i.x || i.x + i.width + 3 <= x || y + height + 3 <= i.y || i.y + i.height + 3 <= y)) { item.x = x; item.y = y; placed = true; break; }
          } if (placed) break; }
          if (!placed) { item.x = Math.min(size.width - width, 10 + items.length * 5); item.y = Math.min(size.height - height, 10 + items.length * 5); }
        }
        previews.set(id,await previewFor(record,cache,createdUrls,items.map(item=>previews.get(item.id)))); items.push(item); selected = id;
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
  function editSelection(change) {
    if (!selectedItems().length || working || drag) return;
    try {
      const next = change(selectedItems(), sheetSize(orientation));
      const changes = new Map(next.map(item => [item.id,item]));
      validateFreeLayout({...layout(), items:items.map(item=>changes.get(item.id)||item)}, {allowEmpty:true});
      if (next.every(item=>{const old=items.find(i=>i.id===item.id);return ['x','y','width','height','fontSize','text','color'].every(key=>old[key]===item[key]);})) return;
      remember(); replaceItems(next); commit();
    } catch (error) { say(error.message, true); inspector(); }
  }
  function edit(change) { if (selectedItems().length === 1) editSelection(list=>[change({...list[0]})]); }
  for (const key of ['x', 'y', 'width', 'height']) $(`free-${key}`).onchange = () => editSelection((list,size) => {
    const raw=$(`free-${key}`).value, value=Number(raw), box=selectionBounds(list);
    if (raw==='' || !Number.isFinite(value)) throw Error('請輸入有效的位置或尺寸。');
    return key==='x'||key==='y' ? moveSelection(list,key==='x'?value-box.x:0,key==='y'?value-box.y:0,size) : scaleSelection(list,value/box[key],size);
  });
  for (const id of ['free-text', 'free-font-size', 'free-color']) $(id).onchange = () => edit(item => {
    const text = $('free-text').value, fontSize = Number($('free-font-size').value);
    if (!text.trim() || text.length > 200 || text.split('\n').length > 4 || !Number.isFinite(fontSize) || fontSize < 6 || fontSize > 72) throw new Error('標題最多 200 字、4 行，字級須為 6 至 72 pt。');
    return titleGeometry({...item, text, fontSize, color: $('free-color').value});
  });
  for (const control of dialog.querySelectorAll('[data-align]')) control.onclick = () => editSelection((list,size)=>alignSelection(list,control.dataset.align,size));
  for (const axis of ['x','y']) $('free-distribute-'+axis).onclick = () => editSelection(list=>distributeSelection(list,axis));
  $('free-item').onchange = () => { select($('free-item').value || null); render(); api.autosaveChanged(); };
  $('free-select-all').onclick = () => { selection = new Set(visible().map(i=>i.id)); selected=[...selection].at(-1)||null; render(); api.autosaveChanged(); };
  $('free-select-none').onclick = () => { select(null); render(); api.autosaveChanged(); };
  function undo() { if (working || drag || !history.length) return; future.push(state()); adopt(history.pop()); $('free-orientation').value = orientation; commit(); say('已復原版面操作。'); }
  function redo() { if (working || drag || !future.length) return; history.push(state()); adopt(future.pop()); $('free-orientation').value = orientation; commit(); say('已重做版面操作。'); }
  function remove() { if (!selection.size || working || drag) return; remember(); items = items.filter(i => !selection.has(i.id)); select(null); commit(); }
  $('free-delete').onclick = remove; $('free-undo').onclick = undo; $('free-redo').onclick=redo;
  $('free-clear').onclick = () => { remember();items=items.filter(item=>(item.sheet??0)!==activeSheet);select(null);commit(); };
  $('free-duplicate').onclick = () => {
    const chosen=selectedItems(); if (!chosen.length || working || drag) return;
    if (visible().length + chosen.length > 30 || items.length + chosen.length > MAX_LAYOUT_ITEMS) { say('複製後每張 A4 須在 30 個項目以內，總計最多 300 個。', true); return; }
    remember(); const copies=moveSelection(chosen,5,5,sheetSize(orientation)).map(item=>{
      const copy={...item,id:crypto.randomUUID()}; if(previews.has(item.id))previews.set(copy.id,previews.get(item.id)); return copy;
    });
    items.push(...copies); selection=new Set(copies.map(i=>i.id)); selected=copies.at(-1).id; commit();
  };
  for (const [id, step] of [['free-back', -1], ['free-front', 1]]) $(id).onclick = () => {
    const list=visible(), order=step<0?list:[...list].reverse(); let moved=false;
    for(const item of order)if(selection.has(item.id)){
      const position=list.indexOf(item), target=list[position+step];
      if(target&&!selection.has(target.id)){[list[position],list[position+step]]=[target,item];moved=true;}
    }
    if(!moved)return;remember();let index=0;items=items.map(item=>(item.sheet??0)===activeSheet?list[index++]:item);commit();
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
  $('free-move-item').onclick=()=>{
    const chosen=selectedItems(),target=Number($('free-move-sheet').value);
    if(!chosen.length||working||drag||target===activeSheet)return;
    if(items.filter(i=>(i.sheet??0)===target).length+chosen.length>30){say('移動後目標紙張最多只能有 30 個項目。',true);return;}
    remember();items=items.map(i=>selection.has(i.id)?{...i,sheet:target}:i);activeSheet=target;commit();say('已將選取項目移到指定紙張，可復原。');
  };
  const point = event => { const rect = stage.getBoundingClientRect(), size = sheetSize(orientation); return {x: (event.clientX - rect.left) / rect.width * size.width, y: (event.clientY - rect.top) / rect.height * size.height}; };
  function applyPointer(event) {
    if(!drag)return;
    const p=point(event), size=sheetSize(orientation);
    if(drag.kind==='marquee'){
      const x=clamp(Math.min(p.x,drag.start.x),0,size.width),y=clamp(Math.min(p.y,drag.start.y),0,size.height);
      marquee={x,y,width:clamp(Math.max(p.x,drag.start.x),0,size.width)-x,height:clamp(Math.max(p.y,drag.start.y),0,size.height)-y};
      const hits=visible().filter(i=>i.x<marquee.x+marquee.width&&i.x+i.width>marquee.x&&i.y<marquee.y+marquee.height&&i.y+i.height>marquee.y);
      selection=new Set([...drag.baseSelection,...hits.map(i=>i.id)]);selected=[...selection].at(-1)||null;
    }else{
      let next;
      if(drag.resize){
        const box=selectionBounds(drag.original),dx=(p.x-drag.start.x)/box.width,dy=(p.y-drag.start.y)/box.height;
        const min=Math.max(...drag.original.map(i=>Math.max(1/i.width,1/i.height,i.type==='text'?6/i.fontSize:0)));
        const max=Math.min((size.width-box.x)/box.width,(size.height-box.y)/box.height,...drag.original.filter(i=>i.type==='text').map(i=>72/i.fontSize));
        next=scaleSelection(drag.original,clamp(1+(Math.abs(dx)>=Math.abs(dy)?dx:dy),min,max),size);
      }else if($('free-snap').checked&&!event.altKey){
        const result=snapSelection(drag.original,visible().filter(i=>!selection.has(i.id)),p.x-drag.start.x,p.y-drag.start.y,size,drag.threshold); next=result.items;guides=result.guides;
      }else {next=moveSelection(drag.original,p.x-drag.start.x,p.y-drag.start.y,size);guides=[];}
      replaceItems(next);
    }
    render(false);
  }
  function finishPointer(cancel=false) {
    if(!drag)return;
    cancelAnimationFrame(pointerFrame);pointerFrame=0;
    if(pendingPointer&&!cancel)applyPointer(pendingPointer);pendingPointer=null;
    const previous=drag;
    if(previous.kind==='items'){
      const changed=previous.original.some(old=>{const next=items.find(i=>i.id===old.id);return ['x','y','width','height','fontSize'].some(key=>next[key]!==old[key]);});
      if(cancel){adopt(previous.previous);}
      if(cancel||!changed){history=previous.historyBefore;future=previous.futureBefore;}
    }else if(cancel){selection=new Set(previous.beforeSelection);selected=previous.beforeSelected;}
    drag=null;guides=[];marquee=null;commit();
  }
  stage.addEventListener('pointerdown', event => {
    if(working||drag||event.button!==0)return;
    const target=event.target.closest('[data-item]'),resize=event.target.hasAttribute('data-resize'),toggle=event.shiftKey||event.ctrlKey||event.metaKey||$('free-multi').checked;
    if(!target&&!resize){
      event.preventDefault();drag={kind:'marquee',start:point(event),beforeSelection:[...selection],beforeSelected:selected,baseSelection:toggle?[...selection]:[]};
      if(!toggle)select(null);stage.setPointerCapture(event.pointerId);stage.focus();render();return;
    }
    if(target){
      const id=target.dataset.item;
      if(toggle&&!resize){select(id,true);render();api.autosaveChanged();return;}
      if(!selection.has(id))select(id);else selected=id;
    }
    event.preventDefault();const historyBefore=[...history],futureBefore=[...future];remember();
    drag={kind:'items',start:point(event),original:selectedItems().map(i=>({...i})),resize,previous:history.at(-1),historyBefore,futureBefore,threshold:Math.min(3,6*sheetSize(orientation).width/stage.getBoundingClientRect().width)};
    stage.setPointerCapture(event.pointerId);render();stage.focus();
  });
  stage.addEventListener('pointermove',event=>{if(!drag)return;pendingPointer={clientX:event.clientX,clientY:event.clientY,altKey:event.altKey};if(!pointerFrame)pointerFrame=requestAnimationFrame(()=>{pointerFrame=0;const value=pendingPointer;pendingPointer=null;if(value&&drag)applyPointer(value);});});
  stage.addEventListener('pointerup',event=>{if(drag&&pendingPointer)pendingPointer={clientX:event.clientX,clientY:event.clientY,altKey:event.altKey};finishPointer();});
  stage.addEventListener('pointercancel',()=>finishPointer(true));
  stage.addEventListener('lostpointercapture',()=>finishPointer(true));
  stage.addEventListener('keydown', event => {
    if(working||drag)return;
    const item=event.target.closest('[data-item]');
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'){event.preventDefault();$('free-select-all').click();stage.focus();return;}
    if(event.key==='Escape'){event.preventDefault();select(null);render();api.autosaveChanged();return;}
    if(event.key==='Enter'||event.key===' '){event.preventDefault();if(item)select(item.dataset.item,event.shiftKey||event.ctrlKey||event.metaKey||$('free-multi').checked);render();stage.focus();api.autosaveChanged();return;}
    if(item&&!selection.has(item.dataset.item))select(item.dataset.item);
    if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();remove();}
    const step=event.shiftKey?5:1,delta={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[event.key];
    if(delta){event.preventDefault();editSelection((list,size)=>moveSelection(list,...delta,size));stage.focus();}
  });
  $('free-preview').onclick = () => {
    if (working || !created) return; const snapshot = layout(), title = `${api.filename()}_A4自由排版`;
    api.showProof({title, build: signal => composeFreePdf(snapshot, api.getSources(), title, {signal}), onDownload: () => {
      saved = signature(snapshot); api.markExported(snapshot.items.filter(i => i.type === 'page').map(i => i.record)); api.layoutChanged();
    }});
  };
  $('free-close').onclick = () => dialog.close(); dialog.addEventListener('cancel', event => { if (working) event.preventDefault(); });
  dialog.addEventListener('close', () => { finishPointer(true); api.setBusy(false); });
  $('free-layout').onclick = () => { const initialize=!created;if(open()&&initialize)void addRecords(api.chosen()); };
  return {
    undo,redo,isInteracting:()=>!!drag,
    template:()=>({...layout(),items:items.map(({record,preview,id,...item})=>item)}),
    async applyTemplate(value,records,{signal,onProgress}={}){
      const slots=value.items.filter(item=>item.type==='page');if(records.length>slots.length)throw Error(`此版型可放 ${slots.length} 頁，目前勾選 ${records.length} 頁。`);
      const prepared=[],urls=new Map(),cache=cachedPreviews(),createdUrls=new Set();let index=0;
      try{
        for(const slot of value.items){signal?.throwIfAborted();onProgress?.(prepared.length+1,value.items.length);
          const id=crypto.randomUUID();if(slot.type==='text'){prepared.push({...slot,id});continue;}
          const record=records[index++];if(!record)continue;
          const source=api.getSources().get(record.sourceId),viewport=await api.pageViewport(source,record),scale=Math.min(slot.width/viewport.width,slot.height/viewport.height),width=viewport.width*scale,height=viewport.height*scale;
          urls.set(id,await previewFor(record,cache,createdUrls,[...urls.values()],signal));
          prepared.push({...slot,id,record:pageSnapshot(record),x:slot.x+(slot.width-width)/2,y:slot.y+(slot.height-height)/2,width,height});
        }
        signal?.throwIfAborted();validateFreeLayout({...value,items:prepared},{allowEmpty:true});
      }catch(error){for(const url of createdUrls){URL.revokeObjectURL(url);previewSizes.delete(url);}throw error;}
      remember();created=true;items=prepared;orientation=value.orientation;sheetCount=value.sheetCount??1;activeSheet=items[0]?.sheet??0;selected=items[0]?.id??null;for(const [id,url]of urls)previews.set(id,url);$('free-orientation').value=orientation;commit();
    },
    capture() { return {...layout(), activeSheet, selected, selection:[...selection], exported:signature(layout())===saved, open:dialog.open, fieldChanges:current()?['x','y','width','height'].filter(key=>$('free-'+key).value!==round(selectedGeometry()[key])).map(key=>'free-'+key).concat(selection.size===1&&current().type==='text'?['free-text','free-font-size','free-color'].filter(id=>$(id).value!==String(id==='free-text'?current().text:id==='free-font-size'?current().fontSize:current().color)):[]):[], fields:dialog.open&&current()?Object.fromEntries(['free-x','free-y','free-width','free-height','free-text','free-font-size','free-color'].map(id=>[id,$(id).value])):null, items:structuredClone(items).map(item=>item.type==='page'?{...item,preview:previews.get(item.id)}:item)}; },
    restore(value,record,asset,assetSize=()=>0) { items=value.items.map(item=>item.type==='page'?{...item,record:record(item.record)}:item);for(const item of value.items)if(item.type==='page'){const url=asset(item.preview);previews.set(item.id,url);previewSizes.set(url,assetSize(item.preview));}if(previewBytes(previews.values())>32*1024*1024)throw Error('排版預覽超過 32 MB。');orientation=value.orientation;created=value.created??!!(items.length||(value.sheetCount??1)>1);selected=items.some(item=>item.id===value.selected)?value.selected:null;selection=new Set(value.selection||(selected?[selected]:[]));sheetCount=value.sheetCount??1;activeSheet=value.activeSheet??0;if(selected)activeSheet=items.find(item=>item.id===selected).sheet??0;history=[];future=[];$('free-orientation').value=orientation;saved=value.exported?signature(layout()):'';render(); },
    resume(value) { if(value.open&&open()&&value.fields){for(const id of value.fieldChanges||[])if(['free-x','free-y','free-width','free-height','free-text','free-font-size','free-color'].includes(id)){$(id).value=value.fields[id];$(id).dispatchEvent(new Event('change'));}history=[];future=[];} },
    refresh() { $('free-layout').disabled = api.isBusy()||!created&&!api.chosen().length; },isCreated:()=>created,
    retainedRecords: () => [items, ...history.map(h => h.items), ...future.map(h => h.items)].flat().filter(i => i.type === 'page').map(i => i.record),
    hasPending: () => {
      if (created && signature(layout()) !== saved) return true;
      const item = current(); if (!dialog.open || !item) return false;
      return ['x','y','width','height'].some(key => $('free-'+key).value !== round(selectedGeometry()[key])) || selection.size === 1 && item.type === 'text' && ($('free-text').value !== item.text || Number($('free-font-size').value) !== item.fontSize || $('free-color').value !== item.color);
    },
    addPiece(record) { if (open()) void addRecords([record]); },
    clear() { items = []; history = []; future=[]; selected = null; selection.clear(); orientation = 'portrait';sheetCount=1;activeSheet=0;created=false; saved = ''; for (const url of previews.values()) URL.revokeObjectURL(url); previews.clear();previewSizes.clear(); $('free-orientation').value = orientation; render(); },
  };
}
