export const PRODUCT_VERSION='0.11.0';
export const RELEASE_DATE='2026-10-27';
export const RELEASE_CHANNEL='商品化驗收版';
export const issueCodes=new Set(['APP_RUNTIME','ASYNC_TASK','OPERATION_FAILED','FILE_IMPORT','PDF_EXPORT','IMAGE_EXPORT','STORAGE','BACKUP','DEMO','UPDATE']);
export function validateReleaseInfo(value){
  if(!value||typeof value!=='object'||typeof value.version!=='string'||value.version.length>64||!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(value.version)||!/^\d{4}-\d{2}-\d{2}$/.test(value.date)||!/^\w[\w -]{0,60}$/.test(value.channel)||!/^[a-f0-9]{64}$/.test(value.buildId)||!Number.isSafeInteger(value.files)||value.files<1||value.files>10000)throw Error('版本資訊格式不正確。');
  return {version:value.version,date:value.date,channel:value.channel,buildId:value.buildId,files:value.files};
}
export function diagnosticSnapshot(value={}){
  // Construct a small allowlist. Never spread app state, Error objects, browser
  // URLs, stacks, filenames, OCR, free-form descriptions or persistent IDs.
  const count=n=>Number.isSafeInteger(n)&&n>=0?Math.min(n,100000):0;
  const browser=/Firefox\//.test(value.userAgent||'')?'Firefox':/Edg\//.test(value.userAgent||'')?'Edge':/Chrome\//.test(value.userAgent||'')?'Chrome':/Safari\//.test(value.userAgent||'')?'Safari':'其他';
  const task=['all','capture','organize','layout','text'].includes(value.task)?value.task:'all';
  return {format:'shijian-diagnostic',version:1,appVersion:PRODUCT_VERSION,releaseDate:RELEASE_DATE,buildId:/^[a-f0-9]{64}$/.test(value.buildId)?value.buildId:null,browser,task,
    environment:{secureContext:value.secureContext===true,clipboard:value.clipboard===true,indexedDB:value.indexedDB===true,persistentStorage:typeof value.persistentStorage==='boolean'?value.persistentStorage:null},
    workspace:{pages:count(value.pages),sources:count(value.sources),selected:count(value.selected),autosave:value.autosave===true},
    issues:(Array.isArray(value.issues)?value.issues:[]).filter(v=>issueCodes.has(v)).slice(-10)};
}
export function storedSummary(state){
  if(!state?.project)return {revision:null,savedAt:null,pages:0,sources:0,sourceBytes:0,sheets:0,hasDraft:false};
  const project=state.project,sources=project.sources;
  if(!Array.isArray(sources)||sources.length>800||!Array.isArray(project.pages)||project.pages.length>500||!project.layout||sources.some(v=>!v||!Number.isFinite(v.size)||v.size<0))throw Error('草稿摘要格式不完整，原資料已保留。');
  return {revision:Number.isSafeInteger(state.revision)?state.revision:null,savedAt:Number.isFinite(state.updatedAt)?state.updatedAt:null,pages:Array.isArray(project.pages)?project.pages.length:0,
    sources:sources.length,sourceBytes:sources.reduce((sum,v)=>sum+(Number.isFinite(v.size)&&v.size>=0?v.size:0),0),
    sheets:project.layout?.created||project.layout?.items?.length?project.layout.sheetCount??1:0,hasDraft:true};
}
export function backupState(summary,lastBackupAt,lastBackupRevision){
  if(!summary.hasDraft)return '沒有已存草稿';
  if(!Number.isFinite(lastBackupAt)||lastBackupAt<=0)return '尚未產生專案備份';
  if(!Number.isSafeInteger(lastBackupRevision))return '已產生備份，尚未確認與已存草稿一致';
  return summary.revision!==lastBackupRevision?'備份後仍有更新':'已產生此草稿的備份';
}
export function readableBytes(value){return Number.isFinite(value)&&value>=0?value>=1048576?`${(value/1048576).toFixed(1)} MB`:`${Math.max(0,Math.round(value/1024))} KB`:'尚無資訊';}
export function readableDate(value){return Number.isFinite(value)&&value>0?new Date(value).toLocaleString('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'尚無紀錄';}
