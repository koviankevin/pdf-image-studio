import {openDraftStore, validateDraft, DraftConflict} from './draft-store.mjs';

export function installAutosave(api) {
  const {$} = api, preference = 'shijian.autosave.enabled';
  $('source-list').insertAdjacentHTML('afterend', `<section class="autosave-panel" aria-label="本機自動儲存"><label class="remember-output"><input id="autosave-enabled" type="checkbox" checked>自動儲存工作區到這台裝置</label><p id="autosave-status" class="field-hint" role="status" aria-live="polite">正在檢查本機草稿…</p><div class="free-pair"><button id="autosave-now" class="secondary" disabled>立即儲存</button><button id="autosave-delete" class="secondary" disabled>刪除已存草稿</button></div><p class="field-hint">同一瀏覽器、同一裝置可接續編輯。已解鎖的文件內容也會保存在此裝置，密碼不會保存。關閉自動儲存會刪除已存草稿；清除瀏覽器資料或無痕模式可能無法保留。</p></section>`);
  let enabled = true; try { enabled = localStorage.getItem(preference) !== 'false'; } catch { /* Optional preference only. */ }
  $('autosave-enabled').checked = enabled;
  let store, revision = 0, initializing = true, saving = false, dirty = false, failed = false, conflict = false, restoreFailed = false, timer, generation = 0, last = '', lastRaw = '', hasStored = false, pendingClear = false;
  let knownDocuments = new Set(), knownAssets = new Set();
  let documentSizes = new Map(), assetSizes = new Map();
  const documents = new WeakMap(), assetIds = new Map();
  const say = (message, error = false) => { $('autosave-status').textContent = message; $('autosave-status').classList.toggle('error', error); };
  function controls() { $('autosave-now').disabled = initializing || saving || !enabled || !store || conflict; $('autosave-delete').disabled = initializing || saving || !store || !hasStored || conflict && !restoreFailed; }
  const setPreference = () => { try { localStorage.setItem(preference, String(enabled)); } catch { /* IndexedDB remains the document store. */ } };
  function asset(url, newAssets, live) {
    if (!assetIds.has(url)) assetIds.set(url, crypto.randomUUID());
    const key = assetIds.get(url); live.add(key);
    // Start fetching while the snapshot's object URLs are still live. Documents
    // are normalized only once, outside the IndexedDB transaction.
    if (!knownAssets.has(key) && !newAssets.has(key)) newAssets.set(key, fetch(url).then(r => { if (!r.ok) throw new Error('縮圖讀取失敗。'); return r.blob(); }));
    return key;
  }
  async function prepare(snapshot) {
    const newAssets = new Map(), liveAssets = new Set(), newDocuments = new Map();
    const record = page => ({...page, thumbnail: asset(page.thumbnail, newAssets, liveAssets)});
    const project = {...snapshot.project, version: 1, pages: snapshot.project.pages.map(record)};
    if (project.layout) project.layout = {...project.layout, items: project.layout.items.map(item => item.type === 'page'
      ? {...item, record: record(item.record), preview: asset(item.preview, newAssets, liveAssets)} : item)};
    project.assetKeys = [...liveAssets];
    // Attach rejection handlers immediately, including when another resource fails.
    const assetsReady = Promise.all([...newAssets].map(async ([key, promise]) => [key, await promise]));
    const docsReady = Promise.all(snapshot.sources.map(async source => {
      if (knownDocuments.has(source.storageKey)) return;
      if (!documents.has(source.doc)) documents.set(source.doc, api.serializeSource(source));
      const blob = await documents.get(source.doc); newDocuments.set(source.storageKey, blob);
      source.size = Math.max(source.size, blob.size);
      project.sources.find(saved => saved.key === source.storageKey).size = source.size;
    }));
    const [resolvedAssets] = await Promise.all([assetsReady, docsReady]);
    const resolved = new Map(resolvedAssets);
    const size = snapshot.sources.reduce((sum, source) => sum + (newDocuments.get(source.storageKey)?.size ?? documentSizes.get(source.storageKey) ?? source.size), 0)
      + [...liveAssets].reduce((sum,key)=>sum+(resolved.get(key)?.size ?? assetSizes.get(key) ?? 0),0);
    if (size > 250 * 1024 * 1024) throw new Error('草稿過大，請分批處理或下載 PDF。');
    return {project, newDocuments, newAssets: new Map(resolvedAssets)};
  }
  async function flush() {
    clearTimeout(timer);
    if (initializing || saving || !store || conflict || !enabled && !pendingClear) return;
    if (!pendingClear && !api.canCapture()) { dirty = true; timer = setTimeout(flush, 350); return; }
    saving = true; controls();
    const currentGeneration = generation;
    try {
      if (pendingClear) {
        revision = await store.write(revision, null); pendingClear = false; hasStored = false; last = ''; lastRaw = ''; knownDocuments.clear(); knownAssets.clear(); assetIds.clear();
        say(enabled ? '已刪除本機草稿；繼續編輯時會重新儲存。' : '自動儲存已關閉，已移除本機草稿。');
      } else {
        dirty = false; const snapshot = api.capture();
        // Do not create an empty draft during initial page load.
        if (!snapshot.project.pages.length && !snapshot.project.layout.items.length) {
          if (hasStored) { revision = await store.write(revision, null); hasStored = false; knownDocuments.clear(); knownAssets.clear(); assetIds.clear(); }
          last = ''; say('自動儲存已開啟，加入文件後會開始儲存。');
        } else {
          say('正在儲存到這台裝置…');
          const prepared = await prepare(snapshot), fingerprint = JSON.stringify(prepared.project);
          if (currentGeneration !== generation || pendingClear) { dirty = true; return; }
          if (fingerprint !== last) {
            revision = await store.write(revision, prepared.project, prepared.newDocuments, prepared.newAssets);
            last = fingerprint; hasStored = true;
            knownDocuments = new Set(prepared.project.sources.map(s => s.key)); knownAssets = new Set(prepared.project.assetKeys);
            documentSizes = new Map([...knownDocuments].map(key=>[key,prepared.newDocuments.get(key)?.size ?? documentSizes.get(key)]));
            assetSizes = new Map([...knownAssets].map(key=>[key,prepared.newAssets.get(key)?.size ?? assetSizes.get(key)]));
            for (const [url, key] of assetIds) if (!knownAssets.has(key)) assetIds.delete(url);
          }
          lastRaw = JSON.stringify(snapshot.project); failed = false;
          dirty = JSON.stringify(api.capture().project) !== lastRaw;
          say(dirty ? '變更尚在儲存中…' : `已儲存到這台裝置 · ${new Date().toLocaleTimeString('zh-TW', {hour: '2-digit', minute: '2-digit', second: '2-digit'})}`);
        }
      }
      failed = false;
    } catch (error) {
      failed = true; dirty = true; conflict = error instanceof DraftConflict;
      say(conflict ? error.message : `尚未儲存：${error.name === 'QuotaExceededError' ? '瀏覽器儲存空間不足' : error.message}。請先下載文件；原有草稿已保留。`, true);
    } finally {
      saving = false; controls();
      if ((pendingClear || dirty) && !failed && !conflict) timer = setTimeout(flush, 350);
    }
  }
  function changed() {
    if (initializing || !enabled || conflict) return;
    if (!store) { failed = true; return; }
    dirty = true; failed = false; clearTimeout(timer); say('變更尚在儲存中…'); timer = setTimeout(flush, 450);
  }
  async function clear() {
    if (restoreFailed) { conflict = false; restoreFailed = false; }
    generation++; pendingClear = true; dirty = false; failed = false; clearTimeout(timer);
    // A previous write may finish first; the deletion must be the last write.
    while (saving) await new Promise(resolve => setTimeout(resolve, 15));
    dirty = false; clearTimeout(timer); await flush();
  }
  $('autosave-now').onclick = () => { dirty = true; failed = false; void flush(); };
  $('autosave-delete').onclick = () => void clear();
  $('autosave-enabled').onchange = async () => { enabled = $('autosave-enabled').checked; setPreference(); if (!enabled) await clear(); else { changed(); controls(); } };
  // Passwords and transient output/proof controls never enter the snapshot.
  for (const type of ['input', 'change', 'click', 'pointerup', 'keyup']) document.addEventListener(type, event => {
    if (event.target.closest('#password-dialog,.autosave-panel,#proof-dialog,#preview-dialog')) return;
    changed();
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty) void flush(); });
  window.addEventListener('pagehide', () => { if (dirty) void flush(); });
  return {
    changed, clear,
    needsWarning(fallback) {
      if (!enabled || !store) return fallback;
      if (failed || conflict || saving || !api.canCapture()) return true;
      if (!hasStored) return fallback;
      return JSON.stringify(api.capture().project) !== lastRaw;
    },
    async init() {
      try {
        store = await openDraftStore(); const saved = await store.read(); revision = saved.revision; hasStored = !!saved.project;
        if (!enabled) { if (hasStored) { revision = await store.write(revision, null); hasStored = false; } say('自動儲存已關閉。'); return; }
        if (saved.project) {
          validateDraft(saved.project, saved.documents, saved.assets);
          await api.restore(saved.project, saved.documents, saved.assets);
          knownDocuments = new Set(saved.documents.keys()); knownAssets = new Set(saved.assets.keys());
          documentSizes = new Map([...saved.documents].map(([key,blob])=>[key,blob.size])); assetSizes = new Map([...saved.assets].map(([key,blob])=>[key,blob.size]));
          for (const [url, key] of api.restoredAssets()) assetIds.set(url, key);
          last = JSON.stringify(saved.project); lastRaw = JSON.stringify(api.capture().project); say('已還原上次的本機草稿，可繼續編輯。');
        } else say('自動儲存已開啟，加入文件後會開始儲存。');
      } catch (error) {
        failed = true; dirty = true;
        // A failed restoration must never overwrite the only recoverable draft.
        if (hasStored) { conflict = true; restoreFailed = true; }
        say(`無法還原／儲存本機草稿：${error.message}。請先下載目前內容。`, true);
      } finally { initializing = false; controls(); }
    },
  };
}
