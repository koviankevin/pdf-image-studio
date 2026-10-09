import * as pdfjs from './vendor/pdfjs/pdf.mjs';
import {PDFDocument} from './vendor/pdf-lib/pdf-lib.mjs';
import {zipSync} from './vendor/fflate/fflate.mjs';
import {parsePages,withDensity,dimensions} from './utils.mjs';
import {movePages,assemblePdf,viewportCrop} from './editor-core.mjs';
import {installPageTools} from './page-tools.mjs';
import {installAnnotations} from './annotation-tools.mjs';
import {installOcr} from './ocr-tools.mjs';
import {imageToPdf} from './document-model.mjs';

pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',import.meta.url).href;
const $=id=>document.getElementById(id);
let pages=[],sources=new Map(),selected=new Set(),history=[],results=[],busy=false,stopping=false,renderTask=null,passwordResolve=null,dragId=null,serial=0,toastTimer;
const thumbnailUrls=new Set();
let pageTools,annotationTools,ocrTools;
let annotationCache=new Map();const annotationTasks=new Set();
const MAX_INPUT=150*1024*1024,MAX_PAGES=500,MAX_IMAGES=256*1024*1024;
const bytes=n=>n>=1048576?`${(n/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(n/1024))} KB`;
const chosen=()=>pages.filter(page=>selected.has(page.id));
const filename=()=>($('output-name').value.trim().replace(/\.pdf$/i,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')||'整理後的文件').slice(0,100);
function status(message,error=false){$('status').textContent=message;$('status').hidden=!message;$('status').classList.toggle('error',error);}
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function setBusy(value){busy=value;updateControls();}
function updateControls(){
  $('file-input').disabled=busy;$('dropzone').setAttribute('aria-disabled',String(busy));$('settings-fields').disabled=busy;$('editor-controls').disabled=busy;$('output-name').disabled=busy;
  $('reset').disabled=busy||!sources.size;$('undo').disabled=busy||!history.length;
  $('export-pdf').disabled=$('convert').disabled=busy||!chosen().length;$('download-all').disabled=busy||!results.length;
  for(const control of $('page-grid').querySelectorAll('button,input'))control.disabled=busy||control.dataset.edge==='true';
  $('delete-selected').disabled=$('move-selected').disabled=busy||!chosen().length;
  $('page-count').textContent=String(pages.length);$('selection-summary').textContent=pages.length?`${sources.size} 份來源 · 共 ${pages.length} 頁 · 已選取 ${chosen().length} 頁`:'加入 PDF 後，可拖曳頁面調整順序。';
  $('move-position').max=String(Math.max(1,pages.length-chosen().length+1));$('empty').hidden=pages.length>0;$('editor-controls').hidden=!pages.length;
  $('rotate-selected').disabled=busy||!chosen().length;$('image-import-fields').disabled=busy;pageTools?.refresh();ocrTools?.refresh();
}
function clearResults(){for(const result of results){URL.revokeObjectURL(result.url);URL.revokeObjectURL(result.thumbnail);}results=[];$('gallery').replaceChildren();$('image-results').hidden=true;$('result-count').textContent='0';pageTools?.invalidateEstimate();}
function snapshot(){history.push({pages:[...pages],selected:new Set(selected)});if(history.length>30)history.shift();}
function changed(){clearResults();$('pages').value='';drawPages();}
function button(text,label,handler,className='secondary'){const b=document.createElement('button');b.type='button';b.textContent=text;b.className=className;b.setAttribute('aria-label',label);b.addEventListener('click',handler);return b;}
function drawSources(){
  $('source-list').replaceChildren();for(const source of sources.values()){const row=document.createElement('div');row.className='source-row';const mark=document.createElement('span');mark.className='source-mark';mark.style.setProperty('--source-color',source.color);mark.textContent=String(source.ordinal);const name=document.createElement('span');name.textContent=source.name;name.title=source.name;const count=document.createElement('small');count.textContent=`${source.count} 頁`;row.append(mark,name,count);$('source-list').append(row);}
}
function drawPages(focusId){
  const fragment=document.createDocumentFragment();
  pages.forEach((page,index)=>{
    const source=sources.get(page.sourceId),card=document.createElement('article');card.className='page-card';card.dataset.id=page.id;card.classList.toggle('selected',selected.has(page.id));card.draggable=true;card.style.setProperty('--source-color',source.color);
    const top=document.createElement('div');top.className='page-card-top';const label=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.checked=selected.has(page.id);check.setAttribute('aria-label',`選取第 ${index+1} 頁`);check.onchange=()=>{if(busy)return;check.checked?selected.add(page.id):selected.delete(page.id);clearResults();card.classList.toggle('selected',check.checked);updateControls();};label.append(check,document.createTextNode(`第 ${index+1} 頁`));const handle=document.createElement('span');handle.textContent='⠿';handle.className='drag-handle';handle.title='拖曳此頁調整順序';top.append(label,handle);
    const preview=button('',`編輯第 ${index+1} 頁`,()=>pageTools.openEditor(page,index),'page-thumb');const img=document.createElement('img');img.src=page.thumbnail;img.alt=`${source.name} 原第 ${page.index+1} 頁`;img.loading='lazy';img.draggable=false;preview.append(img);
    const origin=document.createElement('p');origin.className='page-origin';origin.textContent=`${source.ordinal}. ${source.name}`;origin.title=source.name;const meta=document.createElement('p');meta.className='page-origin';meta.textContent=`原第 ${page.index+1} 頁${page.rotation?' · 已旋轉 '+page.rotation+'°':''}${page.crop?' · 已裁切':''}`;
    const actions=document.createElement('div');actions.className='page-actions';const up=button('上移',`上移第 ${index+1} 頁`,()=>moveOne(page.id,index-1));up.dataset.edge=String(index===0);const down=button('下移',`下移第 ${index+1} 頁`,()=>moveOne(page.id,index+1));down.dataset.edge=String(index===pages.length-1);const remove=button('移除',`移除第 ${index+1} 頁`,()=>removePages([page.id]),'secondary danger');actions.append(up,down,remove);const edits=document.createElement('div');edits.className='page-actions page-edit-actions';edits.append(button('旋轉',`旋轉第 ${index+1} 頁`,()=>rotatePages([page])),button('框選／裁切',`框選第 ${index+1} 頁`,()=>pageTools.openEditor(page,index)));edits.append(button('文字／標記',`標記第 ${index+1} 頁`,()=>annotationTools.open(page,index)));if(page.annotations?.length)meta.textContent+=' · '+page.annotations.length+' 個標記';if(page.ocr)meta.textContent+=' · 已擷取文字';card.append(top,preview,origin,meta,actions,edits);
    card.addEventListener('dragstart',event=>{if(busy||event.target.closest('input')){event.preventDefault();return;}dragId=page.id;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',page.id);card.classList.add('dragging');});
    card.addEventListener('dragover',event=>{if(!dragId||busy)return;event.preventDefault();event.dataTransfer.dropEffect='move';card.classList.add('drop-target');});
    card.addEventListener('dragleave',()=>card.classList.remove('drop-target'));
    card.addEventListener('drop',event=>{if(!dragId||busy)return;event.preventDefault();event.stopPropagation();const from=pages.findIndex(p=>p.id===dragId),to=pages.findIndex(p=>p.id===page.id);if(from!==to)moveOne(dragId,to);dragId=null;});
    card.addEventListener('dragend',()=>{dragId=null;for(const c of $('page-grid').children)c.classList.remove('dragging','drop-target');});fragment.append(card);
  });
  $('page-grid').replaceChildren(fragment);updateControls();if(focusId){const card=[...$('page-grid').children].find(c=>c.dataset.id===focusId);card?.querySelector('button')?.focus();}
}
function moveOne(id,index){if(busy||index<0||index>=pages.length)return;snapshot();pages=movePages(pages,[id],index+1);changed();status(`已移至第 ${index+1} 頁。`);}
function removePages(ids){if(busy)return;const set=new Set(ids);if(!set.size)return;snapshot();pages=pages.filter(p=>!set.has(p.id));for(const id of set)selected.delete(id);changed();status(`已移除 ${set.size} 頁，可按「復原操作」還原。`);}
function askPassword(name,incorrect){$('password-message').textContent=`${name}：${incorrect?'密碼不正確，請再試一次。':'請輸入開啟文件的密碼。'}`;$('password').value='';$('password-dialog').showModal();$('password').focus();return new Promise(resolve=>passwordResolve=resolve);}
function finishPassword(value){const resolve=passwordResolve;passwordResolve=null;$('password').value='';$('password-dialog').close();resolve?.(value);}
$('password-form').addEventListener('submit',event=>{event.preventDefault();finishPassword($('password').value);});
$('password-cancel').addEventListener('click',()=>finishPassword(null));$('password-dialog').addEventListener('cancel',event=>{event.preventDefault();finishPassword(null);});
function getSourcePage(source,index){
  // PDF.js 5.4.624 shares its page-count mapper across documents. Restore the
  // active document's count before lookup when PDFs of different sizes coexist.
  pdfjs.PagesMapper.instance.pagesNumber=source.pdf.numPages;
  return source.pdf.getPage(index+1);
}
async function renderBlob(source,index,dpi,type='png',thumbnail=false,edit={},options={}){
  if(edit.annotations?.length){
    let cached=annotationCache.get(edit.annotations);
    if(!cached){cached=(async()=>{const data=await assemblePdf([{...edit,sourceId:source.id,index,rotation:0,crop:null,ocr:null}],new Map([[source.id,source]]),'頁面標記');const task=pdfjs.getDocument({data,cMapUrl:new URL('./vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',import.meta.url).href,wasmUrl:new URL('./vendor/pdfjs/wasm/',import.meta.url).href,isEvalSupported:false});annotationTasks.add(task);return{pdf:await task.promise,task};})();annotationCache.set(edit.annotations,cached);cached.catch(()=>annotationCache.delete(edit.annotations));if(annotationCache.size>8){const [key,old]=annotationCache.entries().next().value;annotationCache.delete(key);void old.then(s=>{annotationTasks.delete(s.task);return s.task.destroy();}).catch(()=>{});}}
    source=await cached;index=0;
  }
  const page=await getSourcePage(source,index),rotation=(page.rotate+(edit.rotation||0))%360,base=page.getViewport({scale:1,rotation}),region=viewportCrop(base,edit.crop);
  let scale=thumbnail?Math.min(1,360/Math.max(region.width,region.height)):dpi/72;
  if(options.maxEdge>0)scale=Math.min(scale,options.maxEdge/Math.max(region.width,region.height));
  const viewport=page.getViewport({scale,rotation,offsetX:-region.x*scale,offsetY:-region.y*scale}),canvas=document.createElement('canvas');
  try{const ceiling=options.maxEdge||Infinity;const {width,height}=dimensions(Math.min(ceiling,region.width*scale),Math.min(ceiling,region.height*scale));canvas.width=width;canvas.height=height;renderTask=page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport,background:'#fff'});await renderTask.promise;renderTask=null;const raw=await canvasBlob(canvas,type==='png'?'image/png':'image/jpeg',options.quality??.95);const effectiveDpi=Math.max(1,Math.round(scale*72));return{blob:thumbnail?raw:await withDensity(raw,effectiveDpi,type),width,height,dpi:effectiveDpi};}
  finally{renderTask=null;canvas.width=canvas.height=0;page.cleanup();}
}
async function pageViewport(source,edit){const page=await getSourcePage(source,edit.index),rotation=(page.rotate+(edit.rotation||0))%360,base=page.getViewport({scale:1,rotation}),region=viewportCrop(base,edit.crop);const view=page.getViewport({scale:1,rotation,offsetX:-region.x,offsetY:-region.y});view.width=region.width;view.height=region.height;return view;}
function updateRecords(edits){const replacements=new Map(edits.map(p=>[p.id,p]));snapshot();pages=pages.map(p=>replacements.get(p.id)||p);changed();}
function canvasBlob(canvas,type='image/png',quality=.95){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('圖片太大，請降低解析度。')),type,quality));}
async function commitEdits(edits){
  setBusy(true);const replacements=new Map(),created=[];
  try{for(const edit of edits){const source=sources.get(edit.sourceId);const {blob}=await renderBlob(source,edit.index,72,'jpeg',true,edit);const thumbnail=URL.createObjectURL(blob);created.push(thumbnail);replacements.set(edit.id,{...edit,thumbnail});}
    snapshot();for(const url of created)thumbnailUrls.add(url);pages=pages.map(page=>replacements.get(page.id)||page);changed();status(`已更新 ${edits.length} 頁，PDF 與圖片皆會套用新設定。`);
  }catch(error){for(const url of created)URL.revokeObjectURL(url);throw error;}finally{setBusy(false);}
}
async function rotatePages(items){if(busy||!items.length)return;try{await commitEdits(items.map(page=>({...page,rotation:((page.rotation||0)+90)%360})));}catch(error){status(`旋轉失敗：${error.message}`,true);}}
$('rotate-selected').onclick=()=>rotatePages(chosen());
async function addFiles(files){
  if(busy){toast('請等待目前的處理完成。');return;}files=Array.from(files);if(!files.length)return;setBusy(true);clearResults();const errors=[];let added=0;
  try{for(const file of files){let task,pdf,source,committed=false,password='',cancelled=false;const thumbnails=[];
    try{
      const isImage=/\.(png|jpe?g)$/i.test(file.name)||['image/png','image/jpeg'].includes(file.type);
      if(!isImage&&!/\.pdf$/i.test(file.name)&&file.type!=='application/pdf')throw new Error('請加入 PDF、JPG 或 PNG 檔案');
      const total=[...sources.values()].reduce((sum,s)=>sum+s.size,0);if(file.size>100*1024*1024||total+file.size>MAX_INPUT)throw new Error('單檔上限 100 MB，工作區來源總計上限 150 MB');
      status(`正在加入 ${file.name}…`);const original=isImage?await imageToPdf(file,{mode:$('image-page-size').value,landscape:$('image-orientation').value==='landscape',margin:Number($('image-margin').value)}):new Uint8Array(await file.arrayBuffer());
      if(total+Math.max(file.size,original.length)>MAX_INPUT)throw new Error('圖片轉換後超過工作區 150 MB 上限，請縮小圖片或分批處理');
      task=pdfjs.getDocument({data:original.slice(),cMapUrl:new URL('./vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',import.meta.url).href,wasmUrl:new URL('./vendor/pdfjs/wasm/',import.meta.url).href,isEvalSupported:false});
      task.onPassword=(callback,reason)=>{askPassword(file.name,reason===pdfjs.PasswordResponses.INCORRECT_PASSWORD).then(value=>{if(value===null){cancelled=true;void task.destroy();}else{password=value;callback(value);}});};
      pdf=await task.promise;if(pages.length+pdf.numPages>MAX_PAGES)throw new Error('工作區最多 500 頁，請分批處理');
      const doc=await PDFDocument.load(original,{password,updateMetadata:false});password='';
      if(doc.getPageCount()!==pdf.numPages)throw new Error('文件頁數解析不一致，請先重新儲存這份 PDF');
      const form=doc.getForm();if(form.getFields().length)form.flatten({updateFieldAppearances:false});
      const ordinal=++serial;source={id:`s${ordinal}`,ordinal,name:file.name,size:Math.max(file.size,original.length),count:pdf.numPages,doc,pdf,task,color:['#2955df','#0b887c','#a04cab','#bd6b15'][((ordinal-1)%4)]};
      const newPages=[];for(let index=0;index<pdf.numPages;index++){status(`正在建立 ${file.name} 的縮圖（${index+1} / ${pdf.numPages}）…`);const {blob}=await renderBlob(source,index,72,'jpeg',true);const thumbnail=URL.createObjectURL(blob);thumbnails.push(thumbnail);thumbnailUrls.add(thumbnail);newPages.push({id:`${source.id}-p${index}`,sourceId:source.id,index,thumbnail});}
      sources.set(source.id,source);pages.push(...newPages);for(const page of newPages)selected.add(page.id);history=[];committed=true;added++;drawSources();drawPages();
    }catch(error){errors.push(`${file.name}：${cancelled?'已取消加入':error.message||'無法讀取這份文件'}`);}
    finally{password='';if(!committed){for(const url of thumbnails){URL.revokeObjectURL(url);thumbnailUrls.delete(url);}await task?.destroy().catch(()=>{});}}
  }
  status(`已加入 ${added} 份檔案，共 ${pages.length} 頁。${errors.length?'\n'+errors.join('\n'):'可調整頁序，或直接選擇輸出方式。'}`,errors.length>0);
  }finally{$('file-input').value='';setBusy(false);}
}
$('file-input').addEventListener('change',event=>addFiles(event.target.files));
$('dropzone').addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&!busy){event.preventDefault();$('file-input').click();}});
window.addEventListener('dragover',event=>{event.preventDefault();if(!dragId&&!busy)$('dropzone').classList.add('dragging');});
window.addEventListener('dragleave',event=>{if(!event.relatedTarget)$('dropzone').classList.remove('dragging');});
window.addEventListener('drop',event=>{event.preventDefault();$('dropzone').classList.remove('dragging');if(event.dataTransfer?.files.length)addFiles(event.dataTransfer.files);});
$('select-all').onclick=()=>{selected=new Set(pages.map(p=>p.id));clearResults();drawPages();};$('select-none').onclick=()=>{selected.clear();clearResults();drawPages();};
$('apply-range').onclick=()=>{try{const indices=parsePages($('pages').value,pages.length);selected=new Set(indices.map(i=>pages[i-1].id));clearResults();drawPages();status(`已選取 ${indices.length} 頁。`);}catch(error){status(error.message,true);}};
$('move-selected').onclick=()=>{try{const next=movePages(pages,selected,Number($('move-position').value));snapshot();pages=next;changed();status(`已移動 ${selected.size} 頁，兩種輸出都會使用新順序。`);}catch(error){status(error.message,true);}};
$('delete-selected').onclick=()=>removePages(selected);
$('undo').onclick=()=>{if(busy||!history.length)return;const previous=history.pop();pages=previous.pages;selected=previous.selected;changed();status('已復原上一次頁面操作。');};
$('reset').onclick=async()=>{if(busy)return;setBusy(true);clearResults();for(const url of thumbnailUrls)URL.revokeObjectURL(url);thumbnailUrls.clear();await Promise.all([...sources.values()].map(s=>s.task.destroy().catch(()=>{})));await Promise.all([...annotationTasks].map(t=>t.destroy().catch(()=>{})));annotationTasks.clear();annotationCache=new Map();pages=[];selected.clear();sources.clear();history=[];serial=0;$('pages').value='';drawSources();drawPages();status('已清空工作區。');setBusy(false);};
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
$('export-pdf').onclick=async()=>{if(busy||!chosen().length)return;setBusy(true);status('正在合併選取的頁面…');try{await new Promise(resolve=>setTimeout(resolve,30));const data=await assemblePdf(chosen(),sources,filename());download(new Blob([data],{type:'application/pdf'}),`${filename()}.pdf`);status(`已輸出 ${chosen().length} 頁的新 PDF，請查看瀏覽器的下載項目。`);}catch(error){status(`PDF 輸出失敗：${error.message}。工作區已保留，可重試。`,true);}finally{setBusy(false);}};

function showImage(url,title){$('preview-image').src=url;$('preview-title').textContent=title;if(!$('preview-dialog').open)$('preview-dialog').showModal();}
let previewUrl=null;
$('preview-close').onclick=()=>$('preview-dialog').close();$('preview-dialog').addEventListener('close',()=>{$('preview-image').removeAttribute('src');if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;});
async function pngForClipboard(result){if(result.type==='png')return result.blob;const bitmap=await createImageBitmap(result.blob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;try{canvas.getContext('2d').drawImage(bitmap,0,0);return await canvasBlob(canvas);}finally{bitmap.close();canvas.width=canvas.height=0;}}
async function copyImage(result,control){if(!window.isSecureContext||!navigator.clipboard?.write||!window.ClipboardItem){showImage(result.url,`第 ${result.position} 頁圖片`);toast('請在圖片上按右鍵或長按，選擇複製或儲存。');return;}control.disabled=true;try{await navigator.clipboard.write([new ClipboardItem({'image/png':pngForClipboard(result)})]);toast(`已複製第 ${result.position} 頁，可直接貼上。`);}catch{showImage(result.url,`第 ${result.position} 頁圖片`);toast('無法存取剪貼簿，請在圖片上按右鍵或長按複製。');}finally{control.disabled=false;}}
function appendResult(result){const card=document.createElement('article');card.className='card';const stage=button('',`放大第 ${result.position} 頁圖片`,()=>showImage(result.url,`第 ${result.position} 頁 · ${result.width} × ${result.height} px`),'image-stage');const img=document.createElement('img');img.src=result.thumbnail;img.alt=`第 ${result.position} 頁輸出圖片`;img.loading='lazy';stage.append(img);const body=document.createElement('div');body.className='card-body';const title=document.createElement('strong');title.textContent=`第 ${result.position} 頁 · ${result.type==='png'?'PNG':'JPG'}`;const meta=document.createElement('p');meta.className='card-meta';meta.textContent=`${result.width} × ${result.height} px · ${result.dpi} DPI · ${bytes(result.blob.size)}`;const actions=document.createElement('div');actions.className='card-actions';const copy=button('複製圖片',`複製第 ${result.position} 頁圖片`,()=>copyImage(result,copy),'copy');actions.append(copy,button('下載',`下載第 ${result.position} 頁圖片`,()=>download(result.blob,result.name)));body.append(title,meta,actions);card.append(stage,body);$('gallery').append(card);$('result-count').textContent=String(results.length);}
$('convert').onclick=async()=>{
  if(busy||!chosen().length)return;let options;try{options=pageTools.imageOptions();}catch(error){status(error.message,true);return;}const chosenPages=chosen(),dpi=Number($('dpi').value),type=$('format').value,name=filename();clearResults();setBusy(true);stopping=false;$('image-results').hidden=false;$('cancel').hidden=false;$('progress').hidden=false;$('progress').max=chosenPages.length;$('progress').value=0;let total=0;
  try{for(const page of chosenPages){if(stopping)break;const position=pages.indexOf(page)+1;status(`正在轉換第 ${position} 頁（${results.length+1} / ${chosenPages.length}）…`);const rendered=await renderBlob(sources.get(page.sourceId),page.index,dpi,type,false,page,options);if(stopping)break;if(total+rendered.blob.size>MAX_IMAGES)throw new Error('本次圖片超過 256 MB，請分批選取頁面轉換');const result={...rendered,position,type,name:`${name}_p${String(position).padStart(3,'0')}_${rendered.dpi}dpi.${type==='png'?'png':'jpg'}`,url:URL.createObjectURL(rendered.blob),thumbnail:URL.createObjectURL(await (await fetch(page.thumbnail)).blob())};results.push(result);total+=result.blob.size;appendResult(result);$('progress').value=results.length;await new Promise(resolve=>setTimeout(resolve,0));}status(stopping?`已停止，保留 ${results.length} 張已完成圖片。`:`完成！${results.length} 張圖片可複製或下載。`);}
  catch(error){status(stopping?`已停止，保留 ${results.length} 張已完成圖片。`:`轉換中斷：${error.message}。已完成圖片仍可下載。`,!stopping);}
  finally{$('cancel').hidden=true;$('cancel').disabled=false;$('progress').hidden=true;$('result-subtitle').textContent=`${results.length} 張 · ${type==='png'?'PNG':'JPG'} · 共 ${bytes(total)}${options.maxEdge?' · 長邊 ≤ '+options.maxEdge+' px':''}`;setBusy(false);}
};
$('cancel').onclick=()=>{stopping=true;$('cancel').disabled=true;renderTask?.cancel();status('正在停止轉換…');};
$('dpi').onchange=()=>{const dpi=Number($('dpi').value);$('size-hint').textContent=`A4 在 ${dpi} DPI 約為 ${Math.round(210/25.4*dpi)} × ${Math.round(297/25.4*dpi)} px`;};
$('download-all').onclick=async()=>{if(busy||!results.length)return;setBusy(true);status('正在打包圖片…');try{await new Promise(resolve=>setTimeout(resolve,30));const entries={};for(const result of results)entries[result.name]=new Uint8Array(await result.blob.arrayBuffer());download(new Blob([zipSync(entries,{level:0})],{type:'application/zip'}),`${filename()}_images.zip`);status(`已打包 ${results.length} 張圖片。`);}catch{status('圖片打包失敗，請逐張下載或分批轉換。',true);}finally{setBusy(false);}};

// The optional browser tool shares selection and output settings with the UI.
if(document.modelContext?.registerTool){const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});try{Promise.resolve(document.modelContext.registerTool({name:'configure_pdf_image_output',title:'選取頁面與設定圖片輸出',description:'Select current workspace page numbers and configure image resolution and format. Does not start conversion or download.',inputSchema:{type:'object',properties:{dpi:{type:'integer',enum:[150,300,450,600]},format:{type:'string',enum:['png','jpeg']},pages:{type:'string'}},required:['dpi','format','pages'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(busy)throw new Error('正在處理檔案。');if(!input||![150,300,450,600].includes(input.dpi)||!['png','jpeg'].includes(input.format)||typeof input.pages!=='string')throw new Error('無效設定。');const indices=parsePages(input.pages,pages.length);selected=new Set(indices.map(i=>pages[i-1].id));$('dpi').value=String(input.dpi);$('format').value=input.format;$('pages').value=input.pages;$('dpi').onchange();clearResults();drawPages();return{dpi:input.dpi,format:input.format,selectedPages:indices};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}}
const sharedApi={$,getPages:()=>pages,getSources:()=>sources,getSourcePage,chosen,isBusy:()=>busy,setBusy,status,toast,filename,bytes,renderBlob,pageViewport,commitEdits,updateRecords,download,showImage};
annotationTools=installAnnotations(sharedApi);ocrTools=installOcr(sharedApi);
pageTools=installPageTools({$,getPages:()=>pages,getSources:()=>sources,chosen,isBusy:()=>busy,setBusy,status,toast,filename,bytes,renderBlob,commitEdits,download,showImage});
updateControls();
