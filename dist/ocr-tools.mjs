import {inverse,multiply,transformPoint} from './document-model.mjs';

export function installOcr(api){
  document.body.insertAdjacentHTML('beforeend',`<dialog id="ocr-dialog" class="work-dialog" aria-labelledby="ocr-title"><div class="preview-header"><h2 id="ocr-title">文字辨識與校對</h2><button id="ocr-close" class="secondary">關閉</button></div><div class="ocr-toolbar"><label for="ocr-page">校對頁面</label><select id="ocr-page"></select><button id="ocr-copy" class="copy">複製此頁文字</button><button id="ocr-text-download" class="secondary">下載全部文字 TXT</button><button id="ocr-save" class="primary">儲存校對</button></div><p class="field-hint">掃描頁可逐行修改；儲存後的 OCR 文字會加入 PDF 的隱藏文字層，原稿外觀不變。原本已有文字的頁面直接擷取，僅供複製。</p><div class="document-layout ocr-layout"><div class="document-scroll"><div id="ocr-stage" class="document-stage"><img id="ocr-image" alt="對照辨識文字的原稿"><svg id="ocr-overlay" aria-hidden="true"></svg></div></div><div><p id="ocr-page-info" class="status"></p><div id="ocr-lines" class="ocr-lines"></div></div></div><p id="ocr-review-status" class="status" role="status"></p></dialog>`);
  const {$}=api,dialog=$('ocr-dialog');let cancelJob=null,review=[],active=0,reviewUrl=null,loading=false,loadSerial=0;
  function refresh(){const items=api.chosen();$('ocr-start').disabled=api.isBusy()||!items.length;$('ocr-review').disabled=api.isBusy()||!api.getPages().some(p=>p.ocr);$('ocr-language').disabled=api.isBusy();}
  async function nativeText(source,page,viewport){
    const pdfPage=await api.getSourcePage(source,page.index),content=await pdfPage.getTextContent();
    const lines=[];
    for(const item of content.items){if(!item.str?.trim())continue;const [a,b,c,d,x,y]=item.transform,w=Math.max(1,item.width),h=Math.max(1,item.height||Math.hypot(c,d)),u=Math.hypot(a,b)||1,v=Math.hypot(c,d)||1;
      const corners=[[x,y],[x+a/u*w,y+b/u*w],[x+c/v*h,y+d/v*h],[x+a/u*w+c/v*h,y+b/u*w+d/v*h]].map(p=>transformPoint(viewport.transform,...p));
      const left=Math.min(...corners.map(p=>p[0])),top=Math.min(...corners.map(p=>p[1])),right=Math.max(...corners.map(p=>p[0])),bottom=Math.max(...corners.map(p=>p[1]));
      if(right<0||left>viewport.width||bottom<0||top>viewport.height)continue;
      lines.push({text:item.str,x:left,y:top,width:Math.max(1,right-left),height:Math.max(1,bottom-top),confidence:100});
    }
    return lines;
  }
  $('ocr-start').onclick=async()=>{
    const items=api.chosen();if(api.isBusy()||!items.length)return;if(items.length>100){api.status('OCR 一次最多 100 頁，請分批勾選。',true);return;}
    api.setBusy(true);$('ocr-cancel').hidden=false;$('ocr-cancel').disabled=false;$('progress').hidden=false;$('progress').max=items.length;$('progress').value=0;
    let worker=null,stopped=false,completed=[],rejectCancel,jobLabel='';const abort=new Promise((_,reject)=>rejectCancel=reject);abort.catch(()=>{});
    cancelJob=()=>{stopped=true;rejectCancel(new Error('已停止辨識'));void worker?.terminate();$('ocr-cancel').disabled=true;};
    const race=p=>Promise.race([p,abort]);
    try{
      for(let i=0;i<items.length;i++){
        if(stopped)break;const page=items[i],source=api.getSources().get(page.sourceId),viewport=await api.pageViewport(source,page);jobLabel=`文字辨識 ${i+1} / ${items.length}`;api.status(`${jobLabel}：檢查原始文字…`);
        let lines=await race(nativeText(source,page,viewport)),mode='native';
        if(!lines.length){
          mode='ocr';if(!worker){api.status('首次使用正在載入辨識引擎與語言資料，文件不會上傳…');const {createWorker}=(await import('./vendor/ocr/tesseract.mjs')).default;
            const pending=createWorker($('ocr-language').value,1,{workerPath:new URL('./vendor/ocr/worker.min.js',import.meta.url).href,corePath:new URL('./vendor/ocr/core/',import.meta.url).href,langPath:new URL('./vendor/ocr/lang',import.meta.url).href,gzip:false,cacheMethod:'none',workerBlobURL:false,logger:m=>{if(!stopped)api.status(m.status==='recognizing text'?`${jobLabel}：辨識中 ${Math.round((m.progress||0)*100)}%`:`${jobLabel}：正在準備辨識引擎…`);}});
            pending.then(w=>{if(stopped)void w.terminate();}).catch(()=>{});worker=await race(pending);await race(worker.setParameters({tessedit_pageseg_mode:'3',preserve_interword_spaces:'1'}));
          }
          const rendered=await race(api.renderBlob(source,page.index,300,'png',false,{...page,annotations:[]},{maxEdge:3500}));
          const {data}=await race(worker.recognize(rendered.blob,{user_defined_dpi:String(rendered.dpi)},{text:true,blocks:true}));
          const sx=viewport.width/rendered.width,sy=viewport.height/rendered.height;
          lines=(data.blocks||[]).flatMap(b=>b.paragraphs||[]).flatMap(p=>p.lines||[]).filter(l=>l.text?.trim()).map(l=>({text:l.text.trim(),x:l.bbox.x0*sx,y:l.bbox.y0*sy,width:(l.bbox.x1-l.bbox.x0)*sx,height:(l.bbox.y1-l.bbox.y0)*sy,confidence:l.confidence??data.confidence??0}));
          if(!lines.length&&data.text.trim())lines=[{text:data.text.trim(),x:0,y:0,width:viewport.width,height:viewport.height,confidence:0}];
        }
        completed.push({...page,ocr:{mode,frame:inverse(viewport.transform),lines}});$('progress').value=i+1;
      }
      api.status(`已完成 ${completed.length} 頁文字處理。請校對姓名、數字及標示需確認的內容。`);
    }catch(e){api.status(stopped?`已停止，保留 ${completed.length} 頁已完成的辨識結果。`:`辨識中斷：${e.message}。已完成 ${completed.length} 頁，仍可校對。`,!stopped);}
    finally{cancelJob=null;await worker?.terminate().catch(()=>{});if(completed.length)api.updateRecords(completed);$('progress').hidden=true;$('ocr-cancel').hidden=true;api.setBusy(false);if(completed.length)await openReview(completed.map(p=>p.id));}
  };
  $('ocr-cancel').onclick=()=>cancelJob?.();
  const textOf=p=>p.ocr.lines.map(l=>l.text).join('\n');
  const say=(text,error=false)=>{$('ocr-review-status').textContent=text;$('ocr-review-status').classList.toggle('error',error);};
  async function showPage(){
    const serial=++loadSerial,item=review[active];loading=true;$('ocr-save').disabled=true;$('ocr-lines').replaceChildren();$('ocr-overlay').replaceChildren();$('ocr-image').removeAttribute('src');if(reviewUrl)URL.revokeObjectURL(reviewUrl);reviewUrl=null;
    $('ocr-page-info').textContent=item.ocr.mode==='native'?'原稿已有文字：直接擷取，不做 OCR。':'OCR 結果：標示需確認的文字請優先校對，高信心也可能有錯字。';
    item.ocr.lines.forEach((line,i)=>{const label=document.createElement('label');label.className='ocr-line'+(line.confidence<80?' uncertain':'');const title=document.createElement('span');title.textContent=`第 ${i+1} 行${item.ocr.mode==='ocr'?(line.confidence<80?' · 需確認':'')+' · 信心 '+Math.round(line.confidence)+'%':''}`;const input=document.createElement('textarea');input.rows=Math.max(1,Math.ceil(line.text.length/35));input.value=line.text;input.readOnly=item.ocr.mode==='native';input.maxLength=4000;input.setAttribute('aria-label',`第 ${i+1} 行文字`);input.oninput=()=>{line.text=input.value;say('校對尚未儲存。完成後按「儲存校對」。');};input.onfocus=()=>highlight(line);label.append(title,input);$('ocr-lines').append(label);});
    if(!item.ocr.lines.length)$('ocr-lines').textContent='這一頁沒有辨識到文字。請確認頁面方向與清晰度。';
    try{const viewport=await api.pageViewport(api.getSources().get(item.sourceId),item),result=await api.renderBlob(api.getSources().get(item.sourceId),item.index,120,'jpeg',false,item,{maxEdge:1800});if(serial!==loadSerial||!dialog.open)return;item.reviewViewport=viewport;reviewUrl=URL.createObjectURL(result.blob);$('ocr-image').src=reviewUrl;$('ocr-overlay').setAttribute('viewBox',`0 0 ${viewport.width} ${viewport.height}`);}
    catch(e){say(`原稿預覽失敗：${e.message}`,true);}finally{if(serial===loadSerial){loading=false;$('ocr-save').disabled=false;}}
  }
  function highlight(line){const item=review[active];if(!item.reviewViewport)return;const g=document.createElementNS('http://www.w3.org/2000/svg','g'),rect=document.createElementNS('http://www.w3.org/2000/svg','rect');g.setAttribute('transform',`matrix(${multiply(item.reviewViewport.transform,item.ocr.frame).join(' ')})`);for(const [key,value]of Object.entries({x:line.x,y:line.y,width:line.width,height:line.height,fill:'#ffe234','fill-opacity':'.25',stroke:'#d47a00','stroke-width':'1'}))rect.setAttribute(key,value);g.append(rect);$('ocr-overlay').replaceChildren(g);}
  async function openReview(ids){if(api.isBusy())return;review=api.getPages().filter(p=>p.ocr&&(!ids||ids.includes(p.id))).map(p=>({...p,ocr:structuredClone(p.ocr)}));if(!review.length)return;api.setBusy(true);active=0;$('ocr-page').replaceChildren();review.forEach((p,i)=>$('ocr-page').add(new Option(`第 ${api.getPages().findIndex(v=>v.id===p.id)+1} 頁`,i)));dialog.showModal();say('文字只在此裝置處理。可逐行校對，再複製或儲存。');await showPage();}
  $('ocr-page').onchange=()=>{active=Number($('ocr-page').value);void showPage();};
  $('ocr-review').onclick=()=>openReview();
  $('ocr-copy').onclick=async()=>{try{await navigator.clipboard.writeText(textOf(review[active]));say('已複製此頁文字。');}catch{say('無法存取剪貼簿，請下載 TXT 或直接選取文字複製。',true);}};
  $('ocr-text-download').onclick=()=>api.download(new Blob(['\ufeff'+review.map(p=>`第 ${api.getPages().findIndex(v=>v.id===p.id)+1} 頁\n${textOf(p)}`).join('\n\n')],{type:'text/plain;charset=utf-8'}),`${api.filename()}_文字.txt`);
  $('ocr-save').onclick=()=>{if(loading)return;api.updateRecords(review.map(({reviewViewport,...p})=>({...p,ocr:structuredClone(p.ocr)})));say('已儲存校對。關閉後按「下載新 PDF」，即可取得含 OCR 文字層的文件。');};
  $('ocr-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{++loadSerial;if(reviewUrl)URL.revokeObjectURL(reviewUrl);reviewUrl=null;review=[];$('ocr-image').removeAttribute('src');$('ocr-lines').replaceChildren();api.setBusy(false);});
  return{refresh,openReview};
}
