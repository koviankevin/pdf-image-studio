import {PRODUCT_VERSION,RELEASE_DATE,RELEASE_CHANNEL,diagnosticSnapshot,backupState,readableBytes,readableDate,issueCodes,validateReleaseInfo} from './product-core.mjs?v=20261027-native1';
import {release} from './release-info.mjs?v=20261027-native1';

let installed;
export function installProductShell(){
  if(installed)return installed;
  const $=id=>document.getElementById(id);let api,working=false,controller,persistent=null,serial=0,diagnostic=null,returnFocus=null,bootFailed=false,checkingUpdate=false;
  const issues=[];
  document.querySelector('.topbar').insertAdjacentHTML('beforeend',`<nav class="product-nav" aria-label="紙間使用與支援"><span class="product-version">v${PRODUCT_VERSION}</span><button id="product-help" class="secondary">使用說明</button><button id="product-data" class="secondary">資料管理</button><button id="product-support" class="secondary">版本與回報</button></nav>`);
  $('empty').insertAdjacentHTML('beforeend','<div class="product-empty-actions"><button id="try-handout" data-demo="handout" class="secondary">試用講義範例</button><button id="try-office" data-demo="office" class="secondary">試用辦公範例</button><button id="try-guide" class="secondary">查看操作說明</button></div>');
  document.body.insertAdjacentHTML('beforeend',`<dialog id="product-dialog" class="product-dialog" aria-labelledby="product-title">
    <div class="preview-header"><div><h2 id="product-title">紙間使用與資料中心</h2><p class="product-note">整理每一頁，也照顧每一次保存。</p></div><button id="product-close" class="secondary">關閉</button></div>
    <div class="product-tabs" role="group" aria-label="使用與資料中心分類"><button class="secondary" data-product-panel="guide">開始使用</button><button class="secondary" data-product-panel="data">本機資料</button><button class="secondary" data-product-panel="privacy">隱私與限制</button><button class="secondary" data-product-panel="support">版本與回報</button></div>
    <section id="product-guide" aria-label="開始使用"><p>第一次使用可以先加入示範文件。範例在這台裝置產生，不含真實個人資料；會加入目前工作區並保留原文件。</p>
      <div class="product-columns"><article class="product-card"><h3>教師與講義整理</h3><ol><li>加入講義與補充資料，勾選需要的頁面。</li><li>拖曳排序，開啟「排成 A4」選擇拼版或自由排版。</li><li>預覽後下載，或框選局部複製到簡報。</li></ol><button id="demo-handout" data-demo="handout" class="secondary">加入講義示範文件</button></article>
      <article class="product-card"><h3>辦公文件整理</h3><ol><li>加入會議資料與附件，調整頁序。</li><li>點「文字／標記」加備註，按「儲存此頁標記」。</li><li>預覽合併結果並下載 PDF，重要工作另存專案備份。</li></ol><button id="demo-office" data-demo="office" class="secondary">加入辦公示範文件</button></article></div>
      <h3>清晰截圖與文字辨識</h3><p>點頁面開啟框選，拖出範圍後按複製或下載。圖片使用左側 DPI 與長邊上限；A4 PDF 排版則保留原始文字與向量。掃描文件可做 OCR，再對照原稿校對姓名、數字與閱讀順序。</p>
      <h3>保存與接續</h3><p>自動儲存只保存在同一裝置、同一瀏覽器。看到「已儲存」後再離開；跨電腦請從工作區下載 .shijian 專案備份，再到另一台匯入。PDF 是輸出成果，專案備份才包含可接續編輯的內容。</p>
    </section>
    <section id="product-data-panel" aria-label="本機資料" hidden><p id="product-storage-summary" class="product-intro">正在讀取本機儲存資訊…</p><p id="product-storage-permission" class="product-note"></p><div class="product-card-actions"><button id="product-storage-refresh" class="secondary">重新整理資料清單</button><button id="product-persist" class="secondary">申請保留網站資料</button></div><p class="product-note">瀏覽器用量包含同一網站來源的所有資料，可能包含其他 GitHub Pages 工具；各工作區列出的來源大小不含預覽與編輯資料。備份時間代表產生備份檔，請另確認下載完成。清除瀏覽器資料仍可能刪除草稿。</p><div id="product-workspaces"></div></section>
    <section id="product-privacy" aria-label="隱私與限制" hidden>
      <h3>檔案存在哪裡？</h3><p>PDF、圖片、密碼與辨識工作在你的裝置處理，不上傳文件。網站程式、字型及 OCR 語言資料由網站下載，沒有分析追蹤程式。GitHub Pages 提供網站連線服務。</p>
      <p>開啟自動儲存後，已解鎖文件內容、檔名、裁切、標記、OCR 與排版草稿會存到本機 IndexedDB；原 PDF 密碼不保存。輸出偏好、任務模式與工作範本保存在 localStorage。範本可能含你輸入的標題與頁首頁尾。</p>
      <h3>如何清除或備份？</h3><p>共用電腦使用完畢，可關閉自動儲存並清除目前草稿；其他工作區需從資料管理逐一備份或刪除。下載的專案備份未加密，包含已解鎖文件內容，請放在合適位置。瀏覽器清理、無痕模式與空間不足可能使本機資料消失，重要工作請另外備份。</p>
      <h3>目前支援與限制</h3><ul><li>加入 PDF、JPG、PNG；加密 PDF 需提供可開啟的密碼。特殊、損毀或過大的文件可能無法處理，遇到限制請分批或降低圖片 DPI。</li><li>OCR 可能有錯字與閱讀順序問題；可校對，但不是 Word／Excel 版面還原。</li><li>裁切與方框標記不是永久遮蔽，敏感內容可能仍在 PDF 中。紙間目前沒有永久刪除敏感資訊的功能。</li><li>Word 類 PDF 可用「原文編輯」修改可識別的單行、同字型水平區塊，移除原字再以內附黑體／明體寫入；特殊結構會提示不支援，不自動重排段落或表格。原始資料仍保存在本機來源與專案，非永久遮蔽。</li><li>可用「文字替換」框選覆蓋原字並輸入新文字；不是 Word 式原稿重排，原稿與既有 OCR 文字仍可能被擷取。新 PDF 不加密，表單會固定化，不保留有效數位簽章、書籤或附件。</li><li>剪貼簿能力依瀏覽器與權限而異；無法直接複製時，可下載或開啟圖片後右鍵／長按儲存。</li></ul>
      <h3>授權與回報</h3><p>紙間自有程式採 MIT 授權；PDF、OCR、字型等第三方資源依各自授權提供。你的文件權利不受程式授權影響。問題回報由你確認後自行送出，請避免在公開問題中附上敏感文件。</p><p><a href="https://github.com/koviankevin/pdf-image-studio/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">查看 MIT 授權（GitHub）</a> · <a href="https://github.com/koviankevin/pdf-image-studio/tree/main/dist/vendor" target="_blank" rel="noopener noreferrer">第三方授權資料（GitHub）</a></p>
    </section>
    <section id="product-support-panel" aria-label="版本與回報" hidden><h3>目前版本</h3><p id="product-release">v${PRODUCT_VERSION} · ${RELEASE_CHANNEL} · ${RELEASE_DATE}</p><p>這次加入掃描文字替換，支援黑體／明體、底色、範圍與留白調整，並隨專案保存。裝置與真人使用驗收仍持續進行。</p><h3>建立問題診斷</h3><p>診斷只包含版本、瀏覽器類別、功能支援、頁數／來源數與固定問題代碼；不包含檔案、檔名、文件文字、密碼、網址、工作區名稱、自由輸入或錯誤堆疊。先預覽再決定是否下載或回報。</p><button id="product-diagnostic-create" class="secondary">建立診斷預覽</button><textarea id="product-diagnostic" class="product-diagnostic" aria-label="可檢查並複製的診斷資料" readonly hidden></textarea><div class="product-card-actions"><button id="product-diagnostic-copy" class="secondary" disabled>複製診斷</button><button id="product-diagnostic-download" class="secondary" disabled>下載診斷 JSON</button></div><p><a id="product-issue-link" href="https://github.com/koviankevin/pdf-image-studio/issues/new" target="_blank" rel="noopener noreferrer">前往 GitHub 回報問題</a>（會離開紙間，由你確認內容後送出）</p></section>
    <button id="product-demo-cancel" class="secondary" hidden>停止準備範例</button><p id="product-status" class="status" role="status" hidden></p>
  </dialog>`);
  const dialog=$('product-dialog');
  $('product-release').insertAdjacentHTML('afterend',`<p class="product-note" id="product-build">產物識別 ${release.buildId.slice(0,12)}</p><button id="product-update-check" class="secondary">檢查網站版本</button><p id="product-update-status" class="product-note" role="status"></p><div id="product-update-actions" hidden><p>重新載入前先保存或備份目前工作。本按鈕不會在背景自動更新頁面。</p><label class="remember-output"><input id="product-update-backed-up" type="checkbox">我已下載並確認需要的備份</label><button id="product-update-reload" class="secondary">保存後重新載入</button></div>`);
  $('product-storage-refresh').insertAdjacentHTML('beforebegin','<button id="product-backup-active" class="secondary">備份目前工作區</button>');
  const say=(text,error=false)=>{$('product-status').hidden=!text;$('product-status').textContent=text;$('product-status').classList.toggle('error',error);};
  function refresh(){
    const busy=!api||api.isBusy()||working;
    for(const el of document.querySelectorAll('[data-demo]'))el.disabled=busy;
    for(const id of ['product-help','product-data','product-support'])$(id).disabled=!api&&!bootFailed||!!api?.isBusy();
    for(const el of dialog.querySelectorAll('[data-product-panel]'))el.disabled=working||!!controller;
    for(const el of dialog.querySelectorAll('#product-storage-refresh,#product-persist,[data-workspace-action]'))el.disabled=busy||el.dataset.unavailable==='true';
    $('product-backup-active').disabled=busy;
    $('product-update-check').disabled=checkingUpdate||working||!!controller;
    $('product-update-reload').disabled=!!api?.isBusy()||working;
    $('product-close').disabled=!!controller;
    $('product-demo-cancel').hidden=!controller;
    $('product-diagnostic-download').disabled=$('product-diagnostic-copy').disabled=!diagnostic;
  }
  function recordIssue(code){if(issueCodes.has(code)){issues.push(code);if(issues.length>10)issues.shift();}}
  async function storage(){
    const ticket=++serial;$('product-workspaces').replaceChildren();$('product-storage-summary').textContent='正在讀取本機儲存資訊…';
    try{
      let estimate;try{estimate=await navigator.storage?.estimate?.();}catch{/* Storage estimates are optional; workspace access remains independent. */}if(ticket!==serial||!dialog.open)return;
      $('product-storage-summary').textContent=estimate?`同源網站目前約使用 ${readableBytes(estimate.usage)}，可用配額約 ${readableBytes(estimate.quota)}。`:'瀏覽器未提供儲存用量資訊；不影響原有編輯與下載。';
      try{persistent=typeof navigator.storage?.persisted==='function'?await navigator.storage.persisted():null;}catch{persistent=null;}
      $('product-storage-permission').textContent=persistent?'瀏覽器已授予持久儲存。主動清除網站資料仍會移除草稿。':'資料可能被瀏覽器自動回收。可申請保留網站資料，重要工作仍請下載專案備份。';
      $('product-persist').hidden=persistent||!navigator.storage?.persist;
      if(!api)throw Error('文件工具尚未就緒，請稍後重試。');
      const rows=await api.projects().storageList();if(ticket!==serial||!dialog.open)return;
      for(const row of rows){
        const card=document.createElement('article');card.className='product-card';card.dataset.workspace=row.id;
        const heading=document.createElement('h3');heading.textContent=row.name+(row.current?'（目前）':'');card.append(heading);
        for(const text of row.error?[row.error]:[`已存 ${row.pages} 頁 · ${row.sources} 份來源 · ${row.sheets} 張 A4 排版 · 來源約 ${readableBytes(row.sourceBytes)}`,`最後儲存：${readableDate(row.savedAt)}`,`最後產生備份：${readableDate(row.lastBackupAt)} · ${backupState(row,row.lastBackupAt,row.lastBackupRevision)}`]){const p=document.createElement('p');p.textContent=text;card.append(p);}
        const actions=document.createElement('div');actions.className='product-card-actions';
        for(const [action,label]of [['backup','下載專案備份'],['delete','刪除此工作區']]){
          const button=document.createElement('button');button.className='secondary'+(action==='delete'?' danger':'');button.textContent=label;button.dataset.workspaceAction=action;
          button.dataset.unavailable=String(action==='delete'&&(row.current||row.deleting)||action==='backup'&&(row.deleting||!row.current&&!row.hasDraft||!!row.error));
          button.onclick=()=>workspaceAction(action,row.id);actions.append(button);
        }
        card.append(actions);$('product-workspaces').append(card);
      }
    }catch(error){if(ticket===serial&&dialog.open){say(error.message,true);recordIssue('STORAGE');}}
    finally{refresh();}
  }
  async function workspaceAction(action,id){
    if(!api||api.isBusy()||working)return;working=true;refresh();say(action==='backup'?'正在產生專案備份…':'正在刪除選取工作區…');
    try{const result=await api.projects()[action==='backup'?'backupWorkspace':'deleteWorkspace'](id);if(result===true){say(action==='backup'?'備份已產生，請確認瀏覽器下載完成。':'已刪除選取工作區。');await storage();}else if(result===null)say('已取消，工作區保留。');else say('操作未完成，原有資料已保留。請查看工作區面板的提示。',true);}
    catch(error){recordIssue(action==='backup'?'BACKUP':'STORAGE');say(error.message,true);}finally{working=false;refresh();}
  }
  function open(panel='guide',trigger){
    if(document.querySelector('dialog[open]')&& !dialog.open)return;
    if(!dialog.open){returnFocus=trigger||document.activeElement;dialog.showModal();}
    for(const name of ['guide','data','privacy','support'])$(name==='data'?'product-data-panel':name==='support'?'product-support-panel':'product-'+name).hidden=name!==panel;
    for(const button of dialog.querySelectorAll('[data-product-panel]'))button.setAttribute('aria-pressed',String(button.dataset.productPanel===panel));
    if(panel==='support')$('product-update-backed-up').checked=false;
    say('');if(panel==='data')void storage();else serial++;refresh();
  }
  async function raceAbort(promise,signal){let abort;const stopped=new Promise((_,reject)=>{abort=()=>reject(new DOMException('已停止','AbortError'));signal.addEventListener('abort',abort,{once:true});});try{signal.throwIfAborted();return await Promise.race([promise,stopped]);}finally{signal.removeEventListener('abort',abort);}}
  async function demo(kind){
    if(!api||api.isBusy()||working)return;
    if(api.getPages().length&&!confirm('示範文件會加入目前工作區，原文件會保留。要繼續嗎？也可以取消後先新增空白工作區。'))return;
    open('guide');controller=new AbortController();const signal=controller.signal;api.setBusy(true);refresh();say('正在準備示範文件與中文字型，可隨時停止…');
    try{
      const {createDemoDocuments}=await raceAbort(import('./demo-documents.mjs?v=20261027-native1'),signal);
      const files=await raceAbort(createDemoDocuments(kind,{signal}),signal);signal.throwIfAborted();controller=null;dialog.close();api.setBusy(false);await api.addFiles(files);api.showTask(kind==='handout'?'layout':'organize');
    }catch(error){if(error.name==='AbortError')say('已停止準備範例，原文件保留。');else{recordIssue('DEMO');say('範例暫時無法準備，請重試；也可以直接加入自己的 PDF。',true);}}
    finally{controller=null;api.setBusy(false);refresh();}
  }
  const available=read=>{try{return !!read();}catch{return false;}};
  function createDiagnostic(){
    diagnostic=diagnosticSnapshot({buildId:release.buildId,userAgent:navigator.userAgent,secureContext:window.isSecureContext,clipboard:available(()=>navigator.clipboard?.write),indexedDB:available(()=>globalThis.indexedDB),persistentStorage:persistent,
      task:document.querySelector('[data-task][aria-pressed=true]')?.dataset.task,pages:api?.getPages().length,sources:api?.getSources().size,selected:api?.chosen().length,autosave:api?.autosave()?.isEnabled(),issues});
    const text=JSON.stringify(diagnostic,null,2);$('product-diagnostic').value=text;$('product-diagnostic').hidden=false;
    const url=new URL('https://github.com/koviankevin/pdf-image-studio/issues/new');url.searchParams.set('title','紙間問題回報');url.searchParams.set('body','請描述操作步驟、預期與實際結果。請勿附上敏感文件。\n\n診斷資料：\n```json\n'+text+'\n```');$('product-issue-link').href=url.href;refresh();
  }
  for(const el of document.querySelectorAll('[data-demo]'))el.onclick=()=>demo(el.dataset.demo);
  for(const [id,panel]of [['product-help','guide'],['try-guide','guide'],['product-data','data'],['product-support','support']])$(id).onclick=()=>open(panel,$(id));
  for(const button of dialog.querySelectorAll('[data-product-panel]'))button.onclick=()=>open(button.dataset.productPanel);
  $('product-close').onclick=()=>dialog.close();dialog.addEventListener('cancel',event=>{if(controller)event.preventDefault();});dialog.addEventListener('close',()=>{serial++;if(returnFocus?.isConnected&&!returnFocus.disabled&&!document.querySelector('dialog[open]'))returnFocus.focus({preventScroll:true});});
  $('product-demo-cancel').onclick=()=>controller?.abort();$('product-storage-refresh').onclick=()=>storage();
  $('product-backup-active').onclick=()=>workspaceAction('backup',api?.projects().active);
  $('product-update-check').onclick=async()=>{
    if(checkingUpdate)return;checkingUpdate=true;$('product-update-actions').hidden=true;$('product-update-backed-up').checked=false;refresh();$('product-update-status').textContent='正在核對網站版本…';
    try{
      const url=new URL('./release.json',import.meta.url);url.searchParams.set('check',String(Date.now()));
      const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('unavailable');
      const text=await response.text();if(text.length>16384)throw Error('invalid');const latest=validateReleaseInfo(JSON.parse(text));
      const different=latest.buildId!==release.buildId;$('product-update-actions').hidden=!different;
      $('product-update-status').textContent=different?`網站目前是 v${latest.version}（${latest.buildId.slice(0,12)}），與本分頁不同。請先保存或備份後重新載入。`:'目前分頁與網站版本一致。';
    }catch{recordIssue('UPDATE');$('product-update-status').textContent='目前無法確認網站版本，可能處於離線或連線不完整；目前文件與編輯保持不變。';}
    finally{checkingUpdate=false;refresh();}
  };
  $('product-update-reload').onclick=async()=>{
    if(api?.isBusy()||working)return;
    try{
      if(api?.autosave()?.isEnabled())await api.autosave().saveNow(true);
      else if(api&&(api.getPages().length||api.hasLayoutContent())&&!$('product-update-backed-up').checked){$('product-update-status').textContent='自動儲存已關閉。請先下載並確認備份，再勾選備份確認後重新載入。';return;}
      location.reload();
    }catch{recordIssue('STORAGE');$('product-update-status').textContent='目前工作尚未成功儲存，請先下載專案備份；沒有重新載入頁面。';}
  };
  $('product-persist').onclick=async()=>{try{const granted=await navigator.storage.persist();persistent=granted;say(granted?'瀏覽器已授予持久儲存；仍請另外備份重要工作。':'瀏覽器尚未授予持久儲存，仍可正常使用並下載備份。');await storage();}catch{say('瀏覽器未提供持久儲存權限；請下載重要工作備份。',true);}};
  $('product-diagnostic-create').onclick=createDiagnostic;
  $('product-diagnostic-copy').onclick=async()=>{if(!diagnostic)return;try{await navigator.clipboard.writeText(JSON.stringify(diagnostic,null,2));say('已複製診斷資料。');}catch{$('product-diagnostic').focus();$('product-diagnostic').select();say('請直接複製選取的診斷文字，或下載 JSON。');}};
  $('product-diagnostic-download').onclick=()=>{if(!diagnostic)return;const blob=new Blob([JSON.stringify(diagnostic,null,2)],{type:'application/json'});if(api)api.download(blob,'紙間_診斷.json');else{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='紙間_診斷.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}};
  window.addEventListener('error',event=>{try{if(new URL(event.filename,location.href).origin===location.origin)recordIssue('APP_RUNTIME');}catch{/* Do not retain external or malformed error details. */}});
  window.addEventListener('unhandledrejection',()=>recordIssue('ASYNC_TASK'));
  installed={connect(value){api=value;refresh();},unavailable(){bootFailed=true;recordIssue('APP_RUNTIME');refresh();},refresh,recordIssue,open};refresh();return installed;
}
