import {zipSync, unzipSync, strToU8, strFromU8} from './vendor/fflate/fflate.mjs';
import {validateDraft} from './draft-store.mjs?v=20261023-studio1';
import {validateFreeLayout} from './free-layout-core.mjs?v=20261023-studio1';

const LIMIT = 250 * 1024 * 1024, MANIFEST_LIMIT = 20 * 1024 * 1024;
const safeKey = key => typeof key === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(key);
export async function packProject(snapshot, name) {
  validateDraft(snapshot.project, snapshot.documents, snapshot.assets);
  const entries = {}, resources = [];
  for (const [folder, records] of [['documents', snapshot.documents], ['assets', snapshot.assets]]) {
    for (const [key, blob] of records) {
      if (!safeKey(key)) throw Error('專案資源名稱不正確。');
      const path = `${folder}/${key}`;
      entries[path] = new Uint8Array(await blob.arrayBuffer());
      resources.push({path, key, type: blob.type});
    }
  }
  entries['project.json'] = strToU8(JSON.stringify({format:'shijian-project', version:1, name:String(name).slice(0,80), project:snapshot.project, resources}));
  if (entries['project.json'].length > MANIFEST_LIMIT || Object.values(entries).reduce((n,v)=>n+v.length,0) > LIMIT) throw Error('專案備份超過 250 MB，請分批處理。');
  const blob=new Blob([zipSync(entries,{level:0})],{type:'application/zip'});
  if(blob.size>LIMIT)throw Error('專案備份超過 250 MB，請分批處理。');return blob;
}
export async function unpackProject(file) {
  if (!file.size || file.size > LIMIT) throw Error('專案檔須小於 250 MB。');
  let total=0; const paths=new Set();
  // Inspect each central-directory entry before decompression, including its
  // declared expanded size. Reject duplicates, traversal and oversized archives.
  const entries=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter(entry){
    if (paths.has(entry.name) || !(entry.name==='project.json' || /^(documents|assets)\/[a-zA-Z0-9_-]{1,100}$/.test(entry.name))) throw Error('專案包含重複或不支援的資源。');
    paths.add(entry.name);total+=entry.originalSize;
    if (!Number.isSafeInteger(entry.originalSize) || entry.originalSize<0 || !Number.isSafeInteger(entry.size) || entry.size<0 || entry.size>file.size || entry.compression!==0 || entry.compression===0&&entry.size!==entry.originalSize || total>LIMIT || paths.size>1901 || entry.name==='project.json'&&entry.originalSize>MANIFEST_LIMIT) throw Error('專案過大或格式不正確，請使用紙間下載的原始專案備份。');
    return true;
  }});
  if (!entries['project.json']) throw Error('找不到紙間專案資料。');
  const value=JSON.parse(strFromU8(entries['project.json']));
  if(value.format!=='shijian-project'||value.version!==1||typeof value.name!=='string'||!Array.isArray(value.resources)||value.resources.length>1900) throw Error('不是支援的紙間專案檔。');
  const documents=new Map(),assets=new Map(),used=new Set(['project.json']);
  for(const item of value.resources){
    if(!item||!safeKey(item.key)||!['application/pdf','image/jpeg','image/png'].includes(item.type)||typeof item.path!=='string'||used.has(item.path)||!entries[item.path]) throw Error('專案資源不完整。');
    const folder=item.type==='application/pdf'?'documents':'assets';
    if(item.path!==`${folder}/${item.key}`)throw Error('專案資源類型不正確。');
    used.add(item.path);(folder==='documents'?documents:assets).set(item.key,new Blob([entries[item.path]],{type:item.type}));
  }
  if(used.size!==paths.size)throw Error('專案含有未列出的資源。');
  validateDraft(value.project,documents,assets);
  if(value.project.layout.items.length)validateFreeLayout(value.project.layout);
  return {name:value.name.slice(0,80)||'匯入的專案',project:value.project,documents,assets};
}
