import {openProjectCatalog,projectDB} from './project-catalog.mjs?v=20261027-replace2';
import {openDraftStore} from './draft-store.mjs?v=20261027-replace2';
import {packProject,unpackProject} from './project-files.mjs?v=20261027-replace2';
import {inspectStoredWorkspace} from './storage-summary.mjs?v=20261027-replace2';

export async function installProjects(api){
  const {$}=api;
  document.querySelector('.settings').insertAdjacentHTML('afterbegin',`<section class="step project-panel"><details id="project-panel"><summary>工作區與專案備份<span id="project-badge" class="project-badge"></span></summary><p id="project-current" class="field-hint"></p><label class="field-label" for="project-name">目前工作區名稱</label><input id="project-name" maxlength="80" value="原有工作區"><button id="project-rename" class="secondary full">儲存名稱</button><label class="field-label" for="project-list">已保存的工作區</label><select id="project-list"></select><div class="free-pair"><button id="project-open" class="secondary">開啟選取</button><button id="project-new" class="secondary">新增工作區</button></div><button id="project-delete" class="secondary danger full">刪除選取工作區</button><div class="free-pair"><button id="project-backup" class="secondary">下載專案備份</button><button id="project-import" class="secondary">匯入專案備份</button></div><input id="project-file" type="file" accept=".shijian,.zip" hidden><p class="field-hint">切換前會儲存目前工作區。專案備份可在另一台電腦繼續編輯，包含文件與草稿，未加密且不含原 PDF 密碼。關閉自動儲存只清除目前工作區的草稿。</p><p id="project-status" class="field-hint" role="status"></p></details></section>`);
  let catalog,active='legacy',working=false,navigating=false,items=[];
  const say=(text,error=false)=>{$('project-status').textContent=text;$('project-status').classList.toggle('error',error);};
  function refresh(){
    const disabled=working||api.isBusy();
    for(const id of ['project-name','project-rename','project-list','project-open','project-new','project-delete','project-backup','project-import'])$(id).disabled=disabled||(!catalog&&id!=='project-backup');
    $('project-open').disabled ||= $('project-list').value===active;
    $('project-delete').disabled ||= $('project-list').value===active;
  }
  async function list(){const value=await catalog.read();items=value.projects;const selected=$('project-list').value||active;$('project-list').replaceChildren();for(const item of items){const option=new Option(`${item.name}${item.id===active?'（目前）':''}`,item.id);$('project-list').add(option);}$('project-list').value=items.some(p=>p.id===selected)?selected:active;const current=items.find(p=>p.id===active);$('project-name').value=current?.name||'工作區';$('project-badge').textContent=current?.name||'工作區';$('project-current').textContent=`目前：${current?.name||'工作區'} · ${items.length} / 20 個工作區`;refresh();}
  async function perform(action){if(working||api.isBusy())return false;working=true;api.setBusy(true);refresh();try{return await action();}catch(error){say(error.message,true);return false;}finally{if(!navigating){working=false;api.setBusy(false);refresh();}}}
  function reloadCurrent(){navigating=true;api.autosave()?.navigate();location.reload();}
  async function switchTo(id){await catalog.activate(id);reloadCurrent();}
  try{
    catalog=await openProjectCatalog();
    for(let attempt=0;attempt<3;attempt++){
      try{const value=await catalog.read();active=value.active;await catalog.activate(active);await list();break;}
      catch(error){if(attempt===2)throw error;}
    }
  }catch(error){catalog?.close();catalog=null;active=null;say(`工作區清單暫時無法使用：${error.message}。本次無法自動儲存，請下載文件或專案備份。`,true);}
  $('project-list').onchange=refresh;
  $('project-rename').onclick=()=>perform(async()=>{await catalog.rename(active,$('project-name').value);await list();say('工作區名稱已儲存。');});
  $('project-new').onclick=()=>perform(async()=>{await api.autosave().saveNow(true);const id=await catalog.add('未命名工作區');await switchTo(id);});
  $('project-open').onclick=()=>perform(async()=>{const id=$('project-list').value;await api.autosave().saveNow(true);await catalog.touch(active);await switchTo(id);});
  function deleteWorkspace(id){return perform(async()=>{const value=await catalog.read(),item=value.projects.find(p=>p.id===id);if(!item||item.id===active)return false;if(!confirm(`刪除「${item.name}」及其本機文件？這個動作無法復原，請先確認已下載需要的備份。`))return null;await catalog.remove(item.id);await list();say('已刪除選取的工作區。');return true;});}
  async function backupWorkspace(id=active){return perform(async()=>{
    say('正在打包專案…');let item,snapshot;try{item=(catalog?await catalog.read():null)?.projects.find(p=>p.id===id&&!p.deleting);}catch(error){if(id!==active)throw error;}const name=item?.name||items.find(p=>p.id===id)?.name||api.filename();
    if(id===active)snapshot=await api.autosave().backup();
    else {if(!item)throw Error('工作區已刪除或無法讀取。');const store=await openDraftStore(globalThis.indexedDB,projectDB(id));try{snapshot=await store.read();if(!snapshot.project)throw Error('此工作區沒有已保存的草稿。');}finally{store.close();}}
    const blob=await packProject(snapshot,name);api.download(blob,`${name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')}.shijian`);
    let recorded=true;if(catalog)try{await catalog.markBackup(id,snapshot.revision);}catch{recorded=false;}say(`專案備份已產生，請確認瀏覽器下載完成。${recorded?'可匯入紙間接續編輯。':'備份時間未能記錄，但不影響剛產生的檔案。'}`);return true;
  });}
  $('project-delete').onclick=()=>deleteWorkspace($('project-list').value);
  $('project-backup').onclick=()=>backupWorkspace();
  $('project-import').onclick=()=>$('project-file').click();
  $('project-file').onchange=()=>{const file=$('project-file').files[0];if(!file)return;void perform(async()=>{
    say('正在檢查專案備份…');const value=await unpackProject(file);await api.validateProject(value);
    await api.autosave().saveNow(true);const id=await catalog.add(value.name),store=await openDraftStore(globalThis.indexedDB,projectDB(id));
    try{await store.write(0,value.project,value.documents,value.assets);}catch(error){store.close();await catalog.remove(id);throw error;}finally{store.close();}
    await switchTo(id);
  }).finally(()=>{$('project-file').value='';});};
  refresh();return {databaseName:catalog?projectDB(active):null,refresh,active,reloadCurrent,backupWorkspace,deleteWorkspace,
    async storageList(){if(!catalog)throw Error('工作區清單目前無法使用，仍可從原工具下載目前文件或備份。');const value=await catalog.read(),rows=[];for(const item of value.projects){try{rows.push({...item,current:item.id===active,...await inspectStoredWorkspace(projectDB(item.id))});}catch(error){rows.push({...item,current:item.id===active,error:'無法讀取這個工作區的儲存資訊，原資料已保留。'});}}return rows;},
    isNavigating:()=>navigating,async verifyActive(){if(!catalog)return false;const value=await catalog.read();return value.projects.some(item=>item.id===active&&!item.deleting);}};
}
