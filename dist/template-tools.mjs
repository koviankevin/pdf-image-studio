import {templateFields,cleanTemplate,readTemplates,encodeTemplates} from './template-core.mjs?v=20261024-ease1';

export function installTemplates(api){
  const {$}=api,key='shijian.templates.v1';
  document.querySelector('.settings').insertAdjacentHTML('beforeend',`<section class="step template-panel"><details id="template-panel"><summary>我的工作範本</summary><label class="field-label" for="template-list">已儲存的範本</label><select id="template-list"></select><label class="field-label" for="template-name">範本名稱</label><input id="template-name" maxlength="60" placeholder="例如：講義四合一"><div class="free-pair"><button id="template-save" class="secondary">儲存為新範本</button><button id="template-update" class="secondary">更新選取範本</button></div><label class="remember-output"><input id="template-layout" type="checkbox" checked>一併套用 A4 自由排版版型</label><p id="template-info" class="field-hint"></p><button id="template-apply" class="primary full">套用範本</button><button id="template-delete" class="secondary danger full">刪除選取範本</button><button id="template-cancel" class="secondary full" hidden>停止套用範本</button><button id="template-reset" class="secondary full" hidden>清除無法讀取的範本資料</button><p class="field-hint">保存圖片解析度、拼版邊距、頁碼、OCR 與圖片匯入設定，以及 A4 版型和標題。依勾選頁序填入版型，保持原比例；取代目前排版後可復原。套用頁碼設定後，仍須按「套用到勾選頁」。不保存來源文件、縮圖、OCR 內容或密碼。最多 20 份，保存在這個瀏覽器。</p><p id="template-status" class="field-hint" role="status"></p></details></section>`);
  let templates=[],failed=false,controller,storing=false;
  const say=(message,error=false)=>{$('template-status').textContent=message;$('template-status').classList.toggle('error',error);};
  const selected=()=>templates.find(item=>item.id===$('template-list').value);
  function refresh(){const busy=api.isBusy()||storing;for(const id of ['template-list','template-name','template-save','template-update','template-apply','template-delete','template-layout'])$(id).disabled=busy||failed||!selected()&&['template-update','template-apply','template-delete'].includes(id);$('template-save').disabled ||= templates.length>=20;}
  function list(id){$('template-list').replaceChildren(...templates.map(item=>new Option(item.name,item.id)));if(id)$('template-list').value=id;const value=selected();$('template-info').textContent=value?`${value.layout.sheetCount} 張 A4，可填入 ${value.layout.items.filter(item=>item.type==='page').length} 頁 · ${value.settings.dpi} DPI`:'先調整常用設定與 A4 版面，再儲存範本。';refresh();}
  async function write(change,id){
    if(storing)return;storing=true;refresh();
    const update=()=>{const next=change(readTemplates(localStorage.getItem(key))),encoded=encodeTemplates(next);localStorage.setItem(key,encoded);templates=next;list(id);};
    try{if(navigator.locks?.request)await navigator.locks.request('shijian.templates',{mode:'exclusive',signal:AbortSignal.timeout(3000)},update);else update();}
    finally{storing=false;refresh();}
  }
  function capture(){return cleanTemplate({settings:Object.fromEntries(Object.keys(templateFields).map(id=>[id,$(id).value])),layout:api.layoutTemplate()});}
  async function save(update){if(api.isBusy()||failed||storing)return;try{const name=$('template-name').value.trim();if(!name||name.length>60)throw Error('請輸入 1 至 60 字的範本名稱。');if(!update&&templates.length>=20)throw Error('最多保留 20 份範本。');const old=selected();if(update&&!old)return;const value={id:update?old.id:crypto.randomUUID(),name,...capture()},next=current=>{if(update){if(!current.some(item=>item.id===old.id))throw Error('此範本已被其他分頁刪除。');return current.map(item=>item.id===old.id?value:item);}if(current.length>=20)throw Error('最多保留 20 份範本。');return [...current,value];};await write(next,value.id);say('範本已儲存。');}catch(error){say(`未儲存範本：${error.message}`,true);}}
  $('template-save').onclick=()=>save(false);$('template-update').onclick=()=>save(true);
  $('template-list').onchange=()=>{$('template-name').value=selected()?.name||'';list($('template-list').value);};
  $('template-delete').onclick=async()=>{if(api.isBusy()||storing||!selected())return;const id=selected().id;try{await write(current=>current.filter(item=>item.id!==id));say('已刪除選取範本。');}catch(error){say(error.message,true);}};
  $('template-cancel').onclick=()=>{controller?.abort();api.cancelRendering();};
  $('template-apply').onclick=async()=>{
    if(api.isBusy()||!selected()||failed)return;const control=new AbortController();controller=control;api.setBusy(true);$('template-cancel').hidden=false;
    try{const value=cleanTemplate(selected());if($('template-layout').checked&&value.layout.created){const slots=value.layout.items.filter(item=>item.type==='page'),records=slots.length?api.chosen():[];if(slots.length&&!records.length)throw Error('請先勾選要放入 A4 版型的頁面。');await api.applyLayoutTemplate(value.layout,records,{signal:control.signal,onProgress:(index,total)=>say(`正在套用版型 ${index} / ${total}…`)});}
      control.signal.throwIfAborted();for(const [id,field]of Object.entries(value.settings))$(id).value=field;
      // Dispatch only after every field is present, so dependent settings see a coherent snapshot.
      for(const id of Object.keys(value.settings)){$(id).value=value.settings[id];for(const type of ['input','change'])$(id).dispatchEvent(new Event(type,{bubbles:true}));}
      say('已套用範本；A4 版型可開啟自由排版檢查，頁碼仍須手動套用。');
    }catch(error){say(control.signal.aborted?'已停止套用，原有排版與設定保留。':`無法套用：${error.message}`,!control.signal.aborted);}
    finally{controller=null;$('template-cancel').hidden=true;api.setBusy(false);refresh();}
  };
  $('template-reset').onclick=()=>{try{localStorage.removeItem(key);templates=[];failed=false;$('template-reset').hidden=true;list();say('已清除無法讀取的範本資料，可重新儲存。');}catch(error){say(error.message,true);}};
  try{templates=readTemplates(localStorage.getItem(key));}catch(error){failed=true;say(`無法讀取範本，原資料未覆寫：${error.message}`,true);$('template-reset').hidden=false;}
  window.addEventListener('storage',event=>{if(event.key!==key||storing)return;try{templates=readTemplates(localStorage.getItem(key));failed=false;$('template-reset').hidden=true;list($('template-list').value);}catch(error){failed=true;$('template-reset').hidden=false;say(`其他分頁的範本無法讀取：${error.message}`,true);refresh();}});
  list();return {refresh};
}
