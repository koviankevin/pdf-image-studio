import {openDraftStore, validateDraft, validateDraftMetadata, DraftConflict} from './draft-store.mjs?v=20261024-studio1';

export function installAutosave(api) {
  const {$} = api, preference = 'shijian.autosave.enabled';
  $('source-list').insertAdjacentHTML('afterend', `<section class="autosave-panel" aria-label="本機自動儲存"><label class="remember-output"><input id="autosave-enabled" type="checkbox" checked>自動儲存工作區到這台裝置</label><p id="autosave-status" class="field-hint" role="status" aria-live="polite">正在檢查本機草稿…</p><div class="free-pair"><button id="autosave-now" class="secondary" disabled>立即儲存</button><button id="autosave-delete" class="secondary" disabled>刪除已存草稿</button></div><p class="field-hint">同一瀏覽器、同一裝置可接續編輯。已解鎖的文件內容也會保存在此裝置，密碼不會保存。刪除或關閉自動儲存會清除目前工作區共用的草稿；清除瀏覽器資料或無痕模式可能無法保留。</p></section>`);
  let enabled = true; try { enabled = localStorage.getItem(preference) !== 'false'; } catch { /* Optional preference only. */ }
  $('autosave-enabled').checked = enabled;
  let store, revision = 0, initializing = true, saving = false, dirty = false, failed = false, conflict = false, timer, generation = 0, last = '', lastRaw = '', hasStored = false, pendingClear = false, paused = false, unavailable = false;
  const unavailableMessage='其他分頁已刪除或更新此工作區的儲存空間。請先下載這裡的 PDF 或專案備份，再重新整理。';
  let knownDocuments = new Set(), knownAssets = new Set();
  let documentSizes = new Map(), assetSizes = new Map();
  const documents = new WeakMap(), assetIds = new Map();
  const say = (message, error = false) => { $('autosave-status').textContent = message; $('autosave-status').classList.toggle('error', error); };
  function controls() { $('autosave-now').disabled = initializing || saving || !enabled || !store || conflict; $('autosave-delete').disabled = initializing || saving || !store || !hasStored; }
  const setPreference = () => { try { localStorage.setItem(preference, String(enabled)); } catch { /* IndexedDB remains the document store. */ } };
  function asset(url, newAssets, live, complete) {
    if (!assetIds.has(url)) assetIds.set(url, crypto.randomUUID());
    const key = assetIds.get(url); live.add(key);
    // Start fetching while the snapshot's object URLs are still live. Documents
    // are normalized only once, outside the IndexedDB transaction.
    if ((complete || !knownAssets.has(key)) && !newAssets.has(key)) newAssets.set(key, fetch(url).then(r => { if (!r.ok) throw new Error('縮圖讀取失敗。'); return r.blob(); }));
    return key;
  }
  async function prepare(snapshot, complete = false) {
    const newAssets = new Map(), liveAssets = new Set(), newDocuments = new Map();
    const record = page => ({...page, thumbnail: asset(page.thumbnail, newAssets, liveAssets, complete)});
    const project = {...snapshot.project, version: 1, pages: snapshot.project.pages.map(record)};
    if (project.layout) project.layout = {...project.layout, items: project.layout.items.map(item => item.type === 'page'
      ? {...item, record: record(item.record), preview: asset(item.preview, newAssets, liveAssets, complete)} : item)};
    project.assetKeys = [...liveAssets];
    // Attach rejection handlers immediately, including when another resource fails.
    const assetsReady = Promise.all([...newAssets].map(async ([key, promise]) => [key, await promise]));
    const docsReady = Promise.all(snapshot.sources.map(async source => {
      if (!complete && knownDocuments.has(source.storageKey)) return;
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
    validateDraftMetadata(project);if(new TextEncoder().encode(JSON.stringify(project)).length>20*1024*1024)throw Error('編輯資料超過 20 MB，請分批處理或下載 PDF。');
    return {project, newDocuments, newAssets: new Map(resolvedAssets)};
  }
  async function flush(force = false) {
    clearTimeout(timer);
    if (paused || initializing || saving || !store || conflict && !pendingClear || !enabled && !pendingClear) return;
    if (!pendingClear && !force && !api.canCapture()) { dirty = true; timer = setTimeout(flush, 350); return; }
    saving = true; controls();
    const currentGeneration = generation;
    try {
      if (pendingClear) {
        revision = await store.clear(); pendingClear = false; hasStored = false; last = ''; lastRaw = ''; knownDocuments.clear(); knownAssets.clear(); assetIds.clear(); documentSizes.clear(); assetSizes.clear();
        say(enabled ? '已刪除本機草稿；繼續編輯時會重新儲存。' : '自動儲存已關閉，已移除本機草稿。');
      } else {
        dirty = false; const snapshot = api.capture();
        // Do not create an empty draft during initial page load.
        if (!snapshot.project.pages.length && !snapshot.project.layout.items.length&&!snapshot.project.layout.created&&(snapshot.project.layout.sheetCount??1)===1) {
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
      if(unavailable)throw Error(unavailableMessage);
      failed = false;
    } catch (error) {
      failed = true; dirty = true; conflict = unavailable || error instanceof DraftConflict;
      say(unavailable ? unavailableMessage : conflict ? error.message : `尚未儲存：${error.name === 'QuotaExceededError' ? '瀏覽器儲存空間不足' : error.message}。請先下載文件；原有草稿已保留。`, true);
    } finally {
      saving = false; controls();
      if ((pendingClear || dirty) && !failed && !conflict) timer = setTimeout(flush, 350);
    }
  }
  function changed() {
    if (paused || initializing || !enabled || conflict) return;
    if (!store) { failed = true; return; }
    dirty = true; failed = false; clearTimeout(timer); say('變更尚在儲存中…'); timer = setTimeout(flush, 450);
  }
  async function clear() {
    conflict = false;
    generation++; pendingClear = true; dirty = false; failed = false; clearTimeout(timer); say('正在刪除本機草稿…');
    // A previous write may finish first; the deletion must be the last write.
    while (saving) await new Promise(resolve => setTimeout(resolve, 15));
    conflict = false; failed = false; dirty = false; clearTimeout(timer); await flush(); return !pendingClear;
  }
  $('autosave-now').onclick = () => { dirty = true; failed = false; void flush(); };
  $('autosave-delete').onclick = () => void clear();
  $('autosave-enabled').onchange = async () => { enabled = $('autosave-enabled').checked; setPreference(); if (!enabled) await clear(); else { changed(); controls(); } };
  // Passwords and transient output/proof controls never enter the snapshot.
  for (const type of ['input', 'change', 'click', 'pointerup', 'keyup']) document.addEventListener(type, event => {
    if (event.target.closest('#password-dialog,.autosave-panel,.project-panel,.document-search,#proof-dialog,#preview-dialog')) return;
    changed();
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty) void flush(); });
  window.addEventListener('pagehide', () => { if (dirty) void flush(); });
  return {
    changed, clear,
    isEnabled:()=>enabled,
    async saveNow(force = false) {
      if (!enabled || !store || conflict) throw Error('請先啟用自動儲存並排除草稿錯誤，再切換工作區。');
      while(saving) await new Promise(resolve=>setTimeout(resolve,15));
      dirty=true;failed=false;await flush(force);
      if(failed||dirty||pendingClear)throw Error('最新變更尚未儲存，請先下載專案備份，或在自動儲存區重試。');
    },
    async backup() {
      while(saving) await new Promise(resolve=>setTimeout(resolve,15));
      const prepared=await prepare(api.capture(),true);
      return {project:prepared.project,documents:prepared.newDocuments,assets:prepared.newAssets};
    },
    navigate(){paused=true;clearTimeout(timer);store?.close();},
    needsWarning(fallback) {
      if (paused) return false;
      if (pendingClear && store) return true;
      if (!enabled || !store) return fallback;
      if (failed || conflict || saving || !api.canCapture()) return true;
      if (!hasStored) return fallback;
      return JSON.stringify(api.capture().project) !== lastRaw;
    },
    async init() {
      try {
        if(api.databaseName===null)throw Error('工作區清單無法使用，本次不會建立草稿。');
        store = await openDraftStore(globalThis.indexedDB, api.databaseName,()=>{unavailable=true;generation++;failed=true;conflict=true;dirty=true;clearTimeout(timer);say(unavailableMessage,true);controls();}); const saved = await store.read(); if(unavailable)throw Error(unavailableMessage); revision = saved.revision; hasStored = !!saved.project;
        // The catalog may change while this tab is opening its document database.
        if(api.isWorkspaceValid&&!await api.isWorkspaceValid()){store.close();store=null;paused=true;api.onWorkspaceMissing();return;}
        if (!enabled) { if (hasStored) { revision = await store.write(revision, null); hasStored = false; } if(unavailable)throw Error(unavailableMessage); say('自動儲存已關閉。'); return; }
        if (saved.project) {
          validateDraft(saved.project, saved.documents, saved.assets);
          await api.restore(saved.project, saved.documents, saved.assets);if(unavailable)throw Error(unavailableMessage);
          knownDocuments = new Set(saved.documents.keys()); knownAssets = new Set(saved.assets.keys());
          documentSizes = new Map([...saved.documents].map(([key,blob])=>[key,blob.size])); assetSizes = new Map([...saved.assets].map(([key,blob])=>[key,blob.size]));
          for (const [url, key] of api.restoredAssets()) assetIds.set(url, key);
          last = JSON.stringify(saved.project); lastRaw = JSON.stringify(api.capture().project); say('已還原上次的本機草稿，可繼續編輯。');
        } else say('自動儲存已開啟，加入文件後會開始儲存。');
      } catch (error) {
        failed = true; dirty = true;
        // A failed restoration must never overwrite the only recoverable draft.
        if (store) { hasStored = true; conflict = true; }
        say(unavailable?unavailableMessage:`無法還原／儲存本機草稿：${error.message}。請先下載目前內容。`, true);
      } finally { initializing = false; controls(); }
    },
  };
}
