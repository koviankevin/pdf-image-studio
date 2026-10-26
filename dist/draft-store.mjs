import {validateFreeLayout} from './free-layout-core.mjs?v=20261027-product1';
import {validateRecord,validateEditor} from './draft-validation.mjs?v=20261027-product1';
export const DRAFT_DB = 'shijian.workspace.v1';
export class DraftConflict extends Error {
  constructor() { super('其他分頁已更新草稿，這個分頁已暫停自動儲存，避免覆蓋。請先下載這裡的內容，或重新整理接續最新草稿。'); this.name = 'DraftConflict'; }
}

// The revision check, document/thumbnail writes and old-resource collection share
// one transaction: a failed/quota-limited write never damages the previous draft.
export async function openDraftStore(factory = globalThis.indexedDB, name = DRAFT_DB, onUnavailable = () => {}) {
  if (!factory) throw new Error('此瀏覽器不支援本機草稿儲存。');
  const db = await new Promise((resolve, reject) => {
    let blocked = false;
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => { for (const name of ['state', 'documents', 'assets']) request.result.createObjectStore(name); };
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error('其他分頁正在使用舊草稿資料庫，請先關閉它再重試。')); };
  });
  db.onversionchange = () => {db.close();onUnavailable();};
  const done = transaction => new Promise((resolve, reject) => {
    let failure;
    transaction.oncomplete = resolve;
    transaction.onerror = event => { failure = event.target.error; };
    transaction.onabort = () => reject(transaction.error || failure || new Error('草稿寫入中斷。'));
  });
  // Store plain byte arrays, avoiding WebKit's file-backed Blob serialization
  // path. All conversion finishes before opening the atomic write transaction.
  const encode = async records => new Map(await Promise.all([...records].map(async ([key,blob])=>[key,{bytes:new Uint8Array(await blob.arrayBuffer()),type:blob.type}])));
  const decode = value => value?.bytes && ArrayBuffer.isView(value.bytes) && typeof value.type === 'string' ? new Blob([value.bytes],{type:value.type}) : value;
  return {
    async read() {
      const transaction = db.transaction(['state', 'documents', 'assets'], 'readonly'), completion = done(transaction);
      const get = (store, key) => new Promise((resolve, reject) => { const request = transaction.objectStore(store).get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      try {
      const state = await get('state', 'current') || {revision: 0, project: null};
      const documents = new Map(), assets = new Map();
      if (state.project) {
        // Enqueue within the request callback's microtasks, keeping the readonly
        // transaction live in all supported browsers.
        await Promise.all([
          ...state.project.sources.map(source => get('documents', source.key).then(data => documents.set(source.key, decode(data)))),
          ...state.project.assetKeys.map(key => get('assets', key).then(data => assets.set(key, decode(data)))),
        ]);
      }
      await completion; return {...state, documents, assets};
      } catch (error) { await completion.catch(() => {}); throw error; }
    },
    async write(expectedRevision, project, documents = new Map(), assets = new Map()) {
      [documents,assets] = await Promise.all([encode(documents),encode(assets)]);
      const transaction = db.transaction(['state', 'documents', 'assets'], 'readwrite'), completion = done(transaction);
      let conflict = false, failure;
      const state = transaction.objectStore('state'), request = state.get('current');
      request.onsuccess = () => {
        if ((request.result?.revision || 0) !== expectedRevision) { conflict = true; transaction.abort(); return; }
        try {
        const liveDocuments = new Set(project?.sources.map(source => source.key) || []), liveAssets = new Set(project?.assetKeys || []);
        for (const [name, records, live] of [['documents', documents, liveDocuments], ['assets', assets, liveAssets]]) {
          const store = transaction.objectStore(name);
          for (const [key, data] of records) store.put(data, key);
          const cursor = store.openKeyCursor(); cursor.onsuccess = () => { const entry = cursor.result; if (!entry) return; if (!live.has(entry.key)) store.delete(entry.key); entry.continue(); };
        }
        state.put({revision: expectedRevision + 1, project, updatedAt: Date.now()}, 'current');
        } catch (error) { failure = error; transaction.abort(); }
      };
      try { await completion; } catch (error) { if (conflict) throw new DraftConflict(); throw failure || error; }
      return expectedRevision + 1;
    },
    async clear() {
      // An explicit user deletion applies to the browser's shared latest draft,
      // even after a conflict. Advancing its revision still blocks stale writers.
      const transaction = db.transaction(['state','documents','assets'],'readwrite'), completion = done(transaction);
      let revision, failure; const request = transaction.objectStore('state').get('current');
      request.onsuccess = () => { try {
        revision = (Number.isSafeInteger(request.result?.revision) ? request.result.revision : 0) + 1;
        transaction.objectStore('documents').clear(); transaction.objectStore('assets').clear();
        transaction.objectStore('state').put({revision,project:null,updatedAt:Date.now()},'current');
      } catch (error) { failure = error; transaction.abort(); } };
      try { await completion; } catch (error) { throw failure || error; } return revision;
    },
    close() { db.close(); },
  };
}

// Treat persisted data as input. Never restore URLs, HTML, credentials or an
// unbounded number of records from browser storage.
export function validateDraftMetadata(project) {
  if (!project || project.version !== 1 || !Array.isArray(project.pages) || project.pages.length > 500
    || !Array.isArray(project.sources) || project.sources.length > 800 || !Array.isArray(project.assetKeys) || project.assetKeys.length > 1100
    || !Array.isArray(project.selected) || project.selected.length > 500 || typeof project.name !== 'string' || project.name.length > 200
    || !project.layout || !Array.isArray(project.layout.items) || project.layout.items.length > 300 || !['portrait','landscape'].includes(project.layout.orientation)) throw new Error('草稿格式不正確，原有草稿已保留。');
  validateFreeLayout(project.layout,{allowEmpty:true});
  if(project.layout.fieldChanges!==undefined&&(!Array.isArray(project.layout.fieldChanges)||project.layout.fieldChanges.length>7||project.layout.fieldChanges.some(id=>!['free-x','free-y','free-width','free-height','free-text','free-font-size','free-color'].includes(id)))
    ||project.layout.fields&&Object.values(project.layout.fields).some(value=>typeof value!=='string'||value.length>2000))throw Error('A4 編輯欄位格式不正確。');
  if(project.pageOptions&&(typeof project.pageOptions!=='object'||Array.isArray(project.pageOptions)||Object.keys(project.pageOptions).length>8||Object.values(project.pageOptions).some(value=>typeof value!=='string'||value.length>120)))throw Error('頁面設定格式不正確。');
  const sources = new Map(project.sources.map(source => [source.id, source]));
  if (sources.size !== project.sources.length || project.sources.some(source => typeof source.id !== 'string' || typeof source.key !== 'string'
    || typeof source.name !== 'string' || !Number.isFinite(source.size) || source.size < 0 || !Number.isInteger(source.count) || source.count < 1 || source.count > 500)) throw new Error('草稿來源文件不完整，原有草稿已保留。');
  const records = [...project.pages, ...(project.layout?.items || []).filter(item => item.type === 'page').map(item => item.record)];
  for (const record of records) {
    validateRecord(record);
    const source = sources.get(record?.sourceId);
    if (!source || typeof record.id !== 'string' || !Number.isInteger(record.index) || record.index < 0 || record.index >= source.count || !project.assetKeys.includes(record.thumbnail)) throw new Error('草稿頁面不完整。');
  }
  if (new Set(project.pages.map(page => page.id)).size !== project.pages.length) throw new Error('草稿頁面重複。');
  if (!Array.isArray(project.receipts) || project.receipts.length > 1000 || project.receipts.some(entry=>!Array.isArray(entry)||entry.length!==2||entry.some(value=>typeof value!=='string'))) throw new Error('草稿輸出記錄格式不正確。');
  for (const item of project.layout.items) if (item.type === 'page' && !project.assetKeys.includes(item.preview)) throw new Error('A4 草稿預覽遺失。');
  validateEditor(project.editor,new Set(project.pages.map(page=>page.id)));
  return project;
}

export function validateDraft(project,documents,assets){
  validateDraftMetadata(project);
  for(const source of project.sources)if(!(documents.get(source.key) instanceof Blob))throw Error('草稿來源文件不完整。');
  for(const key of project.assetKeys)if(!assets.has(key))throw Error('草稿縮圖遺失。');
  let total = 0; for (const blob of documents.values()) total += blob.size;
  for (const blob of assets.values()) { if (!(blob instanceof Blob) || !['image/jpeg','image/png'].includes(blob.type)) throw new Error('草稿縮圖損壞。'); total += blob.size; }
  const previewKeys=new Set(project.layout.items.filter(item=>item.type==='page').map(item=>item.preview));
  if([...previewKeys].reduce((sum,key)=>sum+assets.get(key).size,0)>32*1024*1024)throw Error('A4 排版預覽超過 32 MB，請減少項目。');
  if (total > 250 * 1024 * 1024) throw new Error('草稿超過 250 MB，請改為分批處理。');
  return project;
}
