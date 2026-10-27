import {outputPresets, validSettings, matchingPreset, readPreferences, createExportReceipts} from './workflow-core.mjs?v=20261027-replace1';

export function installWorkflow(api) {
  const {$} = api, key = 'shijian.output.v1', receipts = createExportReceipts();
  document.body.insertAdjacentHTML('beforeend', `<nav id="quick-actions" class="quick-actions" aria-label="選取頁面的快捷操作" hidden>
    <div class="quick-summary"><strong id="quick-count"></strong><span id="unsaved-note"></span></div>
    <div class="quick-buttons"><button id="quick-pdf" class="primary">預覽 PDF</button><button id="quick-images" class="secondary">轉成圖片</button><button id="quick-a4" class="secondary">A4 拼版</button></div></nav>`);
  const fields = ['dpi', 'format', 'max-edge', 'jpeg-quality'];
  const settings = () => ({dpi: Number($('dpi').value), format: $('format').value,
    maxEdge: Number($('max-edge').value), quality: Number($('jpeg-quality').value) / 100});
  const storage = {
    get() { try { return localStorage.getItem(key); } catch { return null; } },
    put(value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage is optional in private/restricted browsing. */ } },
  };
  let applying = false;
  function updatePreset() { $('output-preset').value = matchingPreset(settings()); }
  function savePreferences() {
    if (applying) return;
    const value = settings(); updatePreset();
    if (!$('remember-output').checked) storage.put({version: 1, remember: false});
    else if (validSettings(value)) storage.put({version: 1, remember: true, settings: value});
  }
  function apply(value) {
    applying = true;
    $('dpi').value = String(value.dpi); $('format').value = value.format;
    $('max-edge').value = String(value.maxEdge); $('jpeg-quality').value = String(value.quality * 100);
    for (const id of fields) { $(id).dispatchEvent(new Event('input', {bubbles: true})); $(id).dispatchEvent(new Event('change', {bubbles: true})); }
    applying = false; updatePreset();
  }
  const remembered = readPreferences(storage.get());
  if (remembered) { $('remember-output').checked = remembered.remember; if (remembered.settings) apply(remembered.settings); }
  $('output-preset').onchange = () => { const preset = outputPresets[$('output-preset').value]; if (preset) { apply(preset); savePreferences(); api.toast(`已套用「${preset.label}」。`); } };
  for (const id of fields) { $(id).addEventListener('input', savePreferences); $(id).addEventListener('change', savePreferences); }
  $('remember-output').onchange = savePreferences; updatePreset();
  const pending = () => receipts.pending(api.getPages()) || api.hasLayoutDraft() || api.hasEditorDraft();
  window.addEventListener('beforeunload', event => { if (api.needsLeaveWarning?.(pending()) ?? pending()) { event.preventDefault(); event.returnValue = ''; } });
  function refresh() {
    const total = api.getPages().length, count = api.chosen().length, disabled = api.isBusy() || !count;
    $('quick-actions').hidden = !total; document.body.classList.toggle('has-quick-actions', total > 0);
    $('quick-count').textContent = `已選 ${count} / ${total} 頁`;
    $('unsaved-note').textContent = pending() ? '尚有未輸出的內容' : '目前內容已輸出';
    for (const id of ['quick-pdf', 'quick-images', 'quick-a4', 'preview-pdf']) $(id).disabled = disabled;
    $('output-preset').disabled = $('remember-output').disabled = api.isBusy();
  }
  $('quick-pdf').onclick = () => api.previewChosen();
  $('quick-images').onclick = () => { $('convert').click(); $('image-results').scrollIntoView({block: 'start'}); };
  $('quick-a4').onclick = () => $('impose-pdf').click();
  if (window.ResizeObserver) new ResizeObserver(entries => {
    const height = entries[0].target.getBoundingClientRect().height;
    if (height) document.body.style.setProperty('--quick-actions-height', `${height}px`);
  }).observe($('quick-actions'));
  return {
    refresh, savePreferences, hasPending: pending,
    captureReceipts:()=>{const live=new Set(api.getPages().map(page=>page.id));return receipts.capture().filter(([id])=>live.has(id));},restoreReceipts(value){receipts.restore(value);refresh();},
    markExported(records) { receipts.mark(records, api.getPages()); refresh(); },
    clear() { receipts.clear(); refresh(); },
  };
}
