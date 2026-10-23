import * as pdfjs from './vendor/pdfjs/pdf.mjs';
import {imposePdf, sheetLayout} from './imposition-core.mjs?v=20261023-workflow';

export function installImposition(api) {
  const {$} = api;
  document.body.insertAdjacentHTML('beforeend', `<dialog id="nup-dialog" class="work-dialog nup-dialog" aria-labelledby="nup-title">
    <div class="preview-header"><div><h2 id="nup-title">A4 拼版</h2><p>把選取的多個頁面排進同一張 A4，直接下載 PDF。</p></div><div class="dialog-header-actions"><button id="nup-free" class="secondary">自由排版</button><button id="nup-close" class="secondary">關閉</button></div></div>
    <div class="nup-layout"><div class="nup-options">
      <label class="field-label" for="nup-preset">每張 A4 放幾頁</label><select id="nup-preset"><option value="2">2 頁 · 左右並排</option><option value="4">4 頁 · 2 × 2</option><option value="6">6 頁 · 3 × 2</option><option value="custom">自訂列與欄</option></select>
      <div id="nup-custom" class="nup-pair" hidden><label for="nup-rows">列數（上下）<input id="nup-rows" type="number" min="1" max="6" step="1" value="1"></label><label for="nup-columns">欄數（左右）<input id="nup-columns" type="number" min="1" max="6" step="1" value="2"></label></div>
      <label class="field-label" for="nup-orientation">A4 方向</label><select id="nup-orientation"><option value="landscape">橫式 · 297 × 210 mm</option><option value="portrait">直式 · 210 × 297 mm</option></select>
      <div class="nup-pair"><label for="nup-margin">外圍邊界 mm<input id="nup-margin" type="number" min="0" max="50" step="0.5" value="10"></label><label for="nup-gap">頁面間距 mm<input id="nup-gap" type="number" min="0" max="50" step="0.5" value="5"></label></div>
      <p id="nup-summary" class="status" aria-live="polite"></p>
      <p class="field-hint">依工作區目前順序，由左到右、由上到下排列。最後一張未滿的格子留白。要調整順序，請關閉後移動頁面。</p>
      <button id="nup-download" class="primary full" disabled>下載 A4 拼版 PDF</button>
      <p class="field-hint">保留文字、向量與原始圖片，不經截圖壓縮。沿用旋轉、裁切與標記；原本模糊的掃描不會變清晰。裁切外內容未永久刪除。</p>
    </div><div class="nup-preview"><div class="nup-navigation"><button id="nup-prev" class="secondary" disabled aria-label="上一張 A4">上一張</button><span id="nup-page-label">準備預覽</span><button id="nup-next" class="secondary" disabled aria-label="下一張 A4">下一張</button></div><div class="nup-paper"><canvas id="nup-canvas" aria-label="實際輸出 PDF 預覽"></canvas></div><p id="nup-status" class="status" role="status">正在準備預覽…</p></div></div>
  </dialog>`);
  const dialog = $('nup-dialog');
  let records = [], data = null, task = null, doc = null, render = null, current = 1, serial = 0, timer;
  // Keep the chain across dialog close/reopen: obsolete builds must finish
  // cancelling before another build can begin or dispose a newer preview.
  let queue = Promise.resolve(), controller = null;
  const settings = () => ({rows: Number($('nup-rows').value), columns: Number($('nup-columns').value),
    orientation: $('nup-orientation').value, margin: $('nup-margin').value === '' ? NaN : Number($('nup-margin').value),
    gap: $('nup-gap').value === '' ? NaN : Number($('nup-gap').value)});
  function say(message, error = false) { $('nup-status').textContent = message; $('nup-status').classList.toggle('error', error); }
  function navigation(loading = false) {
    $('nup-prev').disabled = loading || !doc || current <= 1;
    $('nup-next').disabled = loading || !doc || current >= doc.numPages;
    $('nup-download').disabled = loading || !data;
  }
  async function dispose() {
    render?.cancel(); render = null;
    const old = task; task = null; doc = null;
    if (old) await old.destroy().catch(() => {});
  }
  async function draw(version) {
    navigation(true);
    pdfjs.PagesMapper.instance.pagesNumber = doc.numPages;
    const page = await doc.getPage(current);
    if (version !== serial || !dialog.open) return;
    const base = page.getViewport({scale: 1}), viewport = page.getViewport({scale: 1000 / Math.max(base.width, base.height)});
    const canvas = $('nup-canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    render = page.render({canvasContext: canvas.getContext('2d'), viewport, background: '#fff'});
    await render.promise;
    if (version !== serial || !dialog.open) return;
    render = null; canvas.hidden = false;
    $('nup-page-label').textContent = `第 ${current} / ${doc.numPages} 張 A4`;
    say('預覽與下載使用同一份 PDF；預覽畫素不限制 PDF 畫質。'); navigation();
  }
  async function generate(version, signal) {
    try {
      if (signal.aborted || version !== serial || !dialog.open) return;
      await dispose(); if (version !== serial || !dialog.open) return;
      const options = settings(), layout = sheetLayout(options);
      $('nup-summary').textContent = `${records.length} 頁 → ${Math.ceil(records.length / layout.cells.length)} 張 A4 · 每張 ${layout.cells.length} 頁`;
      const bytes = await imposePdf(records, api.getSources(), options, `${api.filename()}_A4拼版`, {signal});
      if (version !== serial || !dialog.open) return;
      task = pdfjs.getDocument({data: bytes.slice(), isEvalSupported: false,
        cMapUrl: new URL('./vendor/pdfjs/cmaps/', import.meta.url).href, cMapPacked: true,
        standardFontDataUrl: new URL('./vendor/pdfjs/standard_fonts/', import.meta.url).href,
        wasmUrl: new URL('./vendor/pdfjs/wasm/', import.meta.url).href});
      const loaded = await task.promise;
      if (version !== serial || !dialog.open) return;
      doc = loaded; data = bytes; current = 1; await draw(version);
    } catch (error) {
      if (version !== serial || !dialog.open) return;
      data = null; navigation(true); say(`無法產生拼版：${error.message}`, true);
    }
  }
  function schedule() {
    const version = ++serial; clearTimeout(timer); render?.cancel(); data = null;
    controller?.abort(); controller = new AbortController(); const {signal} = controller;
    navigation(true); $('nup-canvas').hidden = true; $('nup-summary').textContent = '';
    $('nup-page-label').textContent = '更新預覽'; say('正在產生 A4 拼版…');
    timer = setTimeout(() => { queue = queue.then(() => generate(version, signal)); }, 200);
  }
  $('nup-preset').onchange = () => {
    const preset = $('nup-preset').value; $('nup-custom').hidden = preset !== 'custom';
    if (preset !== 'custom') {
      $('nup-rows').value = preset === '2' ? '1' : preset === '4' ? '2' : '3';
      $('nup-columns').value = '2'; $('nup-orientation').value = preset === '2' ? 'landscape' : 'portrait';
    }
    schedule();
  };
  for (const id of ['nup-rows', 'nup-columns', 'nup-orientation', 'nup-margin', 'nup-gap']) $(id).addEventListener('input', schedule);
  for (const [id, delta] of [['nup-prev', -1], ['nup-next', 1]]) $(id).onclick = async () => {
    if (!doc) return; current += delta; const version = serial;
    try { await draw(version); } catch (error) { if (version === serial && dialog.open) say(`預覽失敗：${error.message}`, true); }
  };
  $('nup-download').onclick = () => { if (data) { api.download(new Blob([data], {type: 'application/pdf'}), `${api.filename()}_A4拼版.pdf`); api.markExported(records);say('已下載 A4 拼版 PDF，請查看瀏覽器的下載項目。'); } };
  $('nup-free').onclick=()=>{dialog.addEventListener('close',()=>api.openFreeLayout(),{once:true});dialog.close();};
  $('nup-close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { ++serial; clearTimeout(timer); controller?.abort(); data = null; records = []; render?.cancel(); queue = queue.then(dispose); $('nup-canvas').width = $('nup-canvas').height = 0; api.setBusy(false); });
  $('impose-pdf').onclick = () => {
    if (api.isBusy() || !api.chosen().length) return;
    records = [...api.chosen()]; api.setBusy(true); dialog.showModal(); schedule();
  };
  return {refresh: () => { $('impose-pdf').disabled = api.isBusy() || !api.chosen().length; }};
}
