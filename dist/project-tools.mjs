import {openProjectCatalog,projectDB} from './project-catalog.mjs';
import {openDraftStore} from './draft-store.mjs?v=20261024-studio1';
import {packProject,unpackProject} from './project-files.mjs?v=20261024-studio1';

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
  async function perform(action){if(working||api.isBusy())return;working=true;api.setBusy(true);refresh();try{await action();}catch(error){say(error.message,true);}finally{if(!navigating){working=false;api.setBusy(false);refresh();}}}
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
  $('project-delete').onclick=()=>perform(async()=>{const item=items.find(p=>p.id===$('project-list').value);if(!item||item.id===active)return;if(!confirm(`刪除「${item.name}」及其本機文件？這個動作無法復原，請先確認已下載需要的備份。`))return;await catalog.remove(item.id);await list();say('已刪除選取的工作區。');});
  $('project-backup').onclick=()=>perform(async()=>{say('正在打包專案…');const snapshot=await api.autosave().backup(),name=items.find(p=>p.id===active)?.name||api.filename();api.download(await packProject(snapshot,name),`${name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')}.shijian`);say('專案備份已下載，可匯入紙間接續編輯。');});
  $('project-import').onclick=()=>$('project-file').click();
  $('project-file').onchange=()=>{const file=$('project-file').files[0];if(!file)return;void perform(async()=>{
    say('正在檢查專案備份…');const value=await unpackProject(file);await api.validateProject(value);
    await api.autosave().saveNow(true);const id=await catalog.add(value.name),store=await openDraftStore(globalThis.indexedDB,projectDB(id));
    try{await store.write(0,value.project,value.documents,value.assets);}catch(error){store.close();await catalog.remove(id);throw error;}finally{store.close();}
    await switchTo(id);
  }).finally(()=>{$('project-file').value='';});};
  refresh();return {databaseName:catalog?projectDB(active):null,refresh,active,reloadCurrent,isNavigating:()=>navigating,async verifyActive(){if(!catalog)return false;const value=await catalog.read();return value.projects.some(item=>item.id===active&&!item.deleting);}};
}
