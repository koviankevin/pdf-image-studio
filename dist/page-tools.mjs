import {parseSplitRanges,assemblePdf,viewportCrop,selectionToCrop} from './editor-core.mjs';
import {zipSync} from './vendor/fflate/fflate.mjs';

export function installPageTools(api){
  const {$}=api;let editor=null,editorUrl=null,working=false,pointer=null;
  function imageOptions(){const quality=Number($('jpeg-quality').value)/100,maxEdge=Number($('max-edge').value);if(!Number.isFinite(quality)||quality<.3||quality>1)throw new Error('JPG 品質須介於 30% 至 100%。');if(!Number.isInteger(maxEdge)||maxEdge<0||maxEdge>16384||(maxEdge>0&&maxEdge<64))throw new Error('長邊上限請輸入 0（不限），或 64 至 16,384 px。');return{quality,maxEdge};}
  const invalidateEstimate=()=>$('estimate-result').textContent='依頁面內容、格式與尺寸估算。';
  function splitGroups(){const pages=api.getPages();return $('split-mode').value==='each'?api.chosen().map(page=>[page]):parseSplitRanges($('split-ranges').value,pages.length).map(group=>group.map(index=>pages[index-1]));}
  function refresh(){
    $('split-fields').disabled=api.isBusy();$('estimate-size').disabled=api.isBusy()||!api.chosen().length;
    $('quality-wrap').hidden=$('format').value!=='jpeg';$('quality-value').textContent=`${$('jpeg-quality').value}%`;
    const edge=Number($('max-edge').value),dpi=Number($('dpi').value);$('size-hint').textContent=edge>0?`以 ${dpi} DPI 為上限，長邊最多 ${edge} px；實際尺寸與 DPI 會列在每張圖片下方。`:`A4 在 ${dpi} DPI 約為 ${Math.round(210/25.4*dpi)} × ${Math.round(297/25.4*dpi)} px`;
    $('split-ranges-wrap').hidden=$('split-mode').value!=='ranges';
    try{const groups=splitGroups();$('split-summary').textContent=groups.length?`將輸出 ${groups.length} 份 PDF，共 ${groups.reduce((n,g)=>n+g.length,0)} 頁。`:'請先加入並勾選頁面。';$('split-pdf').disabled=api.isBusy()||!groups.length;}catch(error){$('split-summary').textContent=error.message;$('split-pdf').disabled=true;}
  }
  for(const id of ['dpi','format','jpeg-quality','max-edge'])$(id).addEventListener('input',()=>{invalidateEstimate();refresh();});
  for(const id of ['split-mode','split-ranges'])$(id).addEventListener('input',refresh);
  $('estimate-size').onclick=async()=>{
    if(api.isBusy()||!api.chosen().length)return;let options;try{options=imageOptions();}catch(error){api.status(error.message,true);return;}
    const pages=api.chosen(),indices=[...new Set([0,Math.floor((pages.length-1)/2),pages.length-1])];api.setBusy(true);let total=0;
    try{for(let i=0;i<indices.length;i++){api.status(`正在預估圖片大小（抽樣 ${i+1} / ${indices.length}）…`);const page=pages[indices[i]],rendered=await api.renderBlob(api.getSources().get(page.sourceId),page.index,Number($('dpi').value),$('format').value,false,page,options);total+=rendered.blob.size;}
      const estimate=total/indices.length*pages.length;$('estimate-result').textContent=indices.length===pages.length?`共 ${pages.length} 張，預計 ${api.bytes(total)}（已計算全部頁面）。`:`共 ${pages.length} 張，約 ${api.bytes(estimate)}（抽樣 ${indices.length} 頁；實際大小依各頁內容而異）。`;api.status('圖片容量預估完成，尚未下載檔案。');
    }catch(error){$('estimate-result').textContent='無法完成預估，請降低解析度或長邊上限。';api.status(error.message,true);}finally{api.setBusy(false);}
  };
  $('split-pdf').onclick=async()=>{
    if(api.isBusy())return;let groups;try{groups=splitGroups();if(!groups.length)throw new Error('請先選取要拆分的頁面。');}catch(error){api.status(error.message,true);return;}api.setBusy(true);
    try{const entries={},name=api.filename();let total=0;for(let i=0;i<groups.length;i++){api.status(`正在建立拆分 PDF（${i+1} / ${groups.length}）…`);const data=await assemblePdf(groups[i],api.getSources(),`${name} ${i+1}`);total+=data.length;if(total>256*1024*1024)throw new Error('拆分結果超過 256 MB，請減少範圍後分批處理');entries[`${name}_part${String(i+1).padStart(3,'0')}.pdf`]=data;await new Promise(resolve=>setTimeout(resolve,0));}
      api.download(new Blob([zipSync(entries,{level:0})],{type:'application/zip'}),`${name}_split.zip`);api.status(`已將 ${groups.length} 份 PDF 打包下載，頁面皆已套用旋轉與裁切。`);
    }catch(error){api.status(`拆分失敗：${error.message}。工作區仍保留。`,true);}finally{api.setBusy(false);}
  };

  const dialog=$('crop-dialog'),stage=$('crop-stage'),selectionBox=$('crop-selection');
  function editorStatus(text,error=false){$('crop-status').textContent=text;$('crop-status').classList.toggle('error',error);}
  function setWorking(value){working=value;$('crop-controls').disabled=value;$('crop-close').disabled=value;stage.classList.toggle('working',value);}
  function readFields(){const selection={x:Number($('crop-x').value)/100,y:Number($('crop-y').value)/100,width:Number($('crop-width').value)/100,height:Number($('crop-height').value)/100};selectionToCrop(editor.viewport,selection);return selection;}
  function showSelection(selection){const {x,y,width,height}=selection;selectionBox.hidden=false;Object.assign(selectionBox.style,{left:`${x*100}%`,top:`${y*100}%`,width:`${width*100}%`,height:`${height*100}%`});}
  function writeFields(selection){const left=Math.round(selection.x*10000),top=Math.round(selection.y*10000),right=Math.min(10000,Math.round((selection.x+selection.width)*10000)),bottom=Math.min(10000,Math.round((selection.y+selection.height)*10000));const rounded={x:left/100,y:top/100,width:(right-left)/100,height:(bottom-top)/100};for(const [key,id] of [['x','crop-x'],['y','crop-y'],['width','crop-width'],['height','crop-height']])$(id).value=String(rounded[key]);showSelection(readFields());}
  function currentCrop(){const s=readFields();if(s.x===0&&s.y===0&&s.width===1&&s.height===1)return null;return selectionToCrop(editor.viewport,s);}
  function cropToSelection(){const rect=viewportCrop(editor.viewport,editor.crop);return{x:Math.max(0,rect.x/editor.viewport.width),y:Math.max(0,rect.y/editor.viewport.height),width:Math.min(1,rect.width/editor.viewport.width),height:Math.min(1,rect.height/editor.viewport.height)};}
  async function loadEditorImage(){
    setWorking(true);editorStatus('正在載入頁面…');selectionBox.hidden=true;
    try{const source=api.getSources().get(editor.page.sourceId),pdfPage=await source.pdf.getPage(editor.page.index+1);editor.viewport=pdfPage.getViewport({scale:1,rotation:(pdfPage.rotate+editor.rotation)%360});const rendered=await api.renderBlob(source,editor.page.index,150,'jpeg',false,{...editor.page,rotation:editor.rotation,crop:null},{quality:.85,maxEdge:1400});
      if(editorUrl)URL.revokeObjectURL(editorUrl);editorUrl=URL.createObjectURL(rendered.blob);$('crop-image').src=editorUrl;await $('crop-image').decode();writeFields(cropToSelection());editorStatus('拖曳可重新框選。套用前，工作區的頁面不會改變。');
    }catch(error){editorStatus(`無法載入預覽：${error.message}`,true);}finally{setWorking(false);}
  }
  async function openEditor(page,index){
    if(api.isBusy())return;api.setBusy(true);editor={page,position:index+1,rotation:page.rotation||0,crop:page.crop?{...page.crop}:null,viewport:null};$('crop-title').textContent=`第 ${index+1} 頁 · 框選與裁切`;
    $('crop-output-settings').textContent=`圖片使用目前的 ${$('dpi').value} DPI 與長邊上限；複製一律使用 PNG。`;
    dialog.showModal();await loadEditorImage();
  }
  const closeEditor=()=>{if(!working)dialog.close();};$('crop-close').onclick=closeEditor;dialog.addEventListener('cancel',event=>{if(working)event.preventDefault();});
  dialog.addEventListener('close',()=>{editor=null;pointer=null;$('crop-image').removeAttribute('src');if(editorUrl)URL.revokeObjectURL(editorUrl);editorUrl=null;api.setBusy(false);});
  for(const id of ['crop-x','crop-y','crop-width','crop-height'])$(id).addEventListener('input',()=>{if(!editor?.viewport||working)return;try{showSelection(readFields());editorStatus('範圍已更新。');}catch(error){editorStatus(error.message,true);}});
  $('crop-full').onclick=()=>{writeFields({x:0,y:0,width:1,height:1});editor.crop=null;editorStatus('已選取完整頁面。按「套用旋轉與裁切」可移除目前裁切。');};
  async function rotateDraft(delta){if(working||!editor?.viewport)return;try{editor.crop=currentCrop();editor.rotation=(editor.rotation+delta+360)%360;await loadEditorImage();}catch(error){editorStatus(error.message,true);}}
  $('crop-rotate-left').onclick=()=>rotateDraft(-90);$('crop-rotate-right').onclick=()=>rotateDraft(90);
  function pointerPosition(event){const rect=stage.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};}
  stage.addEventListener('pointerdown',event=>{if(working||!editor?.viewport||event.button!==0)return;event.preventDefault();stage.setPointerCapture(event.pointerId);pointer={...pointerPosition(event),id:event.pointerId,previous:{x:0,y:0,width:1,height:1}};try{pointer.previous=readFields();}catch{};});
  stage.addEventListener('pointermove',event=>{if(!pointer||event.pointerId!==pointer.id)return;const p=pointerPosition(event),selection={x:Math.min(pointer.x,p.x),y:Math.min(pointer.y,p.y),width:Math.abs(p.x-pointer.x),height:Math.abs(p.y-pointer.y)};if(selection.width>=.001&&selection.height>=.001)writeFields(selection);});
  stage.addEventListener('pointerup',event=>{if(!pointer||event.pointerId!==pointer.id)return;const p=pointerPosition(event);if(Math.abs(p.x-pointer.x)<.001||Math.abs(p.y-pointer.y)<.001)writeFields(pointer.previous);pointer=null;editorStatus('框選完成。可直接複製圖片，或將此範圍套用為頁面裁切。');});
  stage.addEventListener('pointercancel',()=>{if(pointer)writeFields(pointer.previous);pointer=null;});
  function regionRequest(type){const crop=currentCrop(),options=imageOptions();return api.renderBlob(api.getSources().get(editor.page.sourceId),editor.page.index,Number($('dpi').value),type,false,{...editor.page,rotation:editor.rotation,crop},options);}
  $('crop-copy').onclick=async()=>{
    if(working||!editor?.viewport)return;try{currentCrop();imageOptions();}catch(error){editorStatus(error.message,true);return;}setWorking(true);editorStatus('正在產生高解析度框選圖片…');
    try{if(window.isSecureContext&&navigator.clipboard?.write&&window.ClipboardItem){const png=regionRequest('png').then(result=>result.blob);await navigator.clipboard.write([new ClipboardItem({'image/png':png})]);editorStatus('已複製框選圖片，可直接貼到 Word、簡報或聊天視窗。');}
      else{const result=await regionRequest('png');api.download(result.blob,`${api.filename()}_region.png`);editorStatus('此瀏覽器不支援圖片剪貼簿，已改為下載框選 PNG。');}
    }catch{editorStatus('無法存取剪貼簿，請使用「下載框選圖片」。',true);}finally{setWorking(false);}
  };
  $('crop-download').onclick=async()=>{if(working||!editor?.viewport)return;setWorking(true);try{const type=$('format').value,result=await regionRequest(type);api.download(result.blob,`${api.filename()}_p${String(editor.position).padStart(3,'0')}_region.${type==='png'?'png':'jpg'}`);editorStatus(`已下載框選圖片：${result.width} × ${result.height} px，${api.bytes(result.blob.size)}。`);}catch(error){editorStatus(error.message,true);}finally{setWorking(false);}};
  $('crop-apply').onclick=async()=>{if(working||!editor?.viewport)return;let crop;try{crop=currentCrop();}catch(error){editorStatus(error.message,true);return;}setWorking(true);try{await api.commitEdits([{...editor.page,rotation:editor.rotation,crop}]);setWorking(false);dialog.close();}catch(error){api.setBusy(true);setWorking(false);editorStatus(`套用失敗：${error.message}`,true);}};
  return{refresh,imageOptions,invalidateEstimate,openEditor};
}
