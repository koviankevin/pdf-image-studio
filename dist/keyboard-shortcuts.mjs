export function installShortcuts(api){
  const {$}=api;
  $('undo').title='Ctrl+Z / ⌘Z';
  $('editor-controls').insertAdjacentHTML('beforeend','<p class="field-hint">快捷鍵：Ctrl／⌘ + Z 復原、Shift + Z 或 Ctrl + Y 重做；Delete 移除勾選頁、Ctrl／⌘ + F 搜尋、Ctrl／⌘ + S 儲存。文字欄位保留原生編輯快捷鍵。</p>');
  document.addEventListener('keydown',event=>{
    if(event.defaultPrevented||event.isComposing||event.altKey)return;
    const typing=event.target.closest('input,textarea,select,[contenteditable="true"]'),modified=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();
    if(modified&&key==='s'){event.preventDefault();if(!api.isBusy())void api.autosave()?.saveNow().catch(error=>api.toast(error.message));return;}
    if(typing)return;
    const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);
    if(modified&&(key==='z'||key==='y')){
      const redo=key==='y'||event.shiftKey;
      if(dialog&&dialog.id!=='mark-dialog'&&dialog.id!=='free-dialog')return;
      event.preventDefault();const target=dialog?.id==='mark-dialog'?api.annotations:dialog?.id==='free-dialog'?api.layout:api;
      target[redo?'redo':'undo']();return;
    }
    if(dialog)return;
    if(modified&&key==='f'){event.preventDefault();api.showAllTools();api.search.focus();}
    else if(!modified&&(key==='delete'||key==='backspace')&&!api.isBusy()&&api.chosen().length){event.preventDefault();$('delete-selected').click();}
  });
}
