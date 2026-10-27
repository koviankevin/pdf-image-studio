import {pdfCanvasContext} from './pdf-canvas.mjs?v=20261028-hub1';
import * as pdfjs from './vendor/pdfjs/pdf.mjs';
import {assemblePdf} from './editor-core.mjs?v=20261028-hub1';

export function installPdfProof(api) {
  const {$} = api;
  document.body.insertAdjacentHTML('beforeend', `<dialog id="proof-dialog" class="work-dialog proof-dialog" aria-labelledby="proof-title">
    <div class="preview-header"><div><h2 id="proof-title">輸出前預覽</h2><p>逐頁確認合併、裁切、標記與文字後，再下載。</p></div><button id="proof-close" class="secondary">關閉</button></div>
    <div class="proof-toolbar"><button id="proof-prev" class="secondary" aria-label="預覽上一頁">上一頁</button><label for="proof-page">頁碼</label><select id="proof-page" aria-label="預覽頁碼"></select><span id="proof-total"></span><button id="proof-next" class="secondary" aria-label="預覽下一頁">下一頁</button><label for="proof-zoom">縮放</label><select id="proof-zoom"><option value="fit">適合視窗</option><option value="1">100%</option><option value="1.5">150%</option><option value="2">200%</option></select><button id="proof-download" class="primary">下載這份 PDF</button></div>
    <div id="proof-paper" class="proof-paper is-fit"><canvas id="proof-canvas" aria-label="即將下載的 PDF 頁面"></canvas></div><p id="proof-status" class="status" role="status"></p>
  </dialog>`);
  const dialog = $('proof-dialog');
  let queue = Promise.resolve(), serial = 0, controller, task, doc, render, data, current = 1, returnBusy = false, receipt, name;
  const say = (text, error = false) => { $('proof-status').textContent = text; $('proof-status').classList.toggle('error', error); };
  function controls(loading = false) {
    $('proof-download').disabled = loading || !data;
    $('proof-prev').disabled = loading || !doc || current <= 1;
    $('proof-next').disabled = loading || !doc || current >= doc.numPages;
    $('proof-page').disabled = $('proof-zoom').disabled = loading || !doc;
  }
  async function dispose() {
    render?.cancel(); render = null;
    const old = task; task = null; doc = null;
    if (old) await old.destroy().catch(() => {});
  }
  async function draw(version) {
    if (!doc || version !== serial || !dialog.open) return;
    controls(true); pdfjs.PagesMapper.instance.pagesNumber = doc.numPages;
    const page = await doc.getPage(current);
    if (version !== serial || !dialog.open) return;
    const base = page.getViewport({scale: 1}), zoom = $('proof-zoom').value;
    const requested = zoom === 'fit' ? 1400 / Math.max(base.width, base.height) : Number(zoom) * 96 / 72;
    const scale = Math.min(requested, Math.sqrt(8000000 / (base.width * base.height)), 5000 / Math.max(base.width, base.height));
    const viewport = page.getViewport({scale}), canvas = $('proof-canvas');
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    $('proof-paper').classList.toggle('is-fit', zoom === 'fit');
    render = page.render({canvasContext: pdfCanvasContext(canvas), viewport, background: '#fff'});
    await render.promise;
    if (version !== serial || !dialog.open) return;
    render = null; canvas.hidden = false; $('proof-page').value = String(current);
    say('預覽與下載使用同一份 PDF。預覽縮放不會改變 PDF 畫質。'); controls();
  }
  function navigate(page) {
    if (!doc || page < 1 || page > doc.numPages) return;
    current = page; const version = serial; render?.cancel();
    queue = queue.then(() => draw(version)).catch(error => { if (version === serial && dialog.open) { say(`預覽失敗：${error.message}`, true); controls(); } });
  }
  function show({build, title, onDownload}) {
    if (dialog.open) return;
    returnBusy = api.isBusy(); api.setBusy(true); data = null; receipt = onDownload; name = title;
    const version = ++serial; controller = new AbortController(); const {signal} = controller;
    $('proof-title').textContent = title; $('proof-canvas').hidden = true; $('proof-page').replaceChildren(); $('proof-total').textContent = '';
    $('proof-zoom').value = 'fit'; controls(true); say('正在建立實際輸出 PDF…'); dialog.showModal();
    queue = queue.then(async () => {
      try {
        await dispose(); signal.throwIfAborted();
        const bytes = await build(signal);
        if (version !== serial || !dialog.open) return;
        task = pdfjs.getDocument({data: bytes.slice(), isEvalSupported: false, cMapUrl: new URL('./vendor/pdfjs/cmaps/', import.meta.url).href,
          cMapPacked: true, standardFontDataUrl: new URL('./vendor/pdfjs/standard_fonts/', import.meta.url).href,
          wasmUrl: new URL('./vendor/pdfjs/wasm/', import.meta.url).href});
        const loaded = await task.promise;
        if (version !== serial || !dialog.open) return;
        doc = loaded; data = bytes; current = 1;
        for (let i = 1; i <= doc.numPages; i++) $('proof-page').add(new Option(String(i), String(i)));
        $('proof-total').textContent = `/ ${doc.numPages} 頁`; await draw(version);
      } catch (error) { if (version === serial && dialog.open) { data = null; say(`無法預覽：${error.message}`, true); controls(); } }
    });
  }
  $('proof-prev').onclick = () => navigate(current - 1); $('proof-next').onclick = () => navigate(current + 1);
  $('proof-page').onchange = () => navigate(Number($('proof-page').value)); $('proof-zoom').onchange = () => navigate(current);
  $('proof-download').onclick = () => {
    if (!data) return;
    api.download(new Blob([data], {type: 'application/pdf'}), `${name}.pdf`); receipt?.(); say('已啟動下載，請查看瀏覽器的下載項目。');
  };
  $('proof-close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    ++serial; controller?.abort(); render?.cancel(); data = null; receipt = null;
    queue = queue.then(dispose); $('proof-canvas').width = $('proof-canvas').height = 0; api.setBusy(returnBusy);
  });
  function openChosen() {
    if (api.isBusy() || !api.chosen().length) return;
    const records = [...api.chosen()], title = api.filename();
    show({title, build: signal => assemblePdf(records, api.getSources(), title, {signal}), onDownload: () => api.markExported(records)});
  }
  $('preview-pdf').onclick = openChosen;
  return {show, openChosen};
}
