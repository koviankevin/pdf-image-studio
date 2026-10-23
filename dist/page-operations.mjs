import {PDFDocument} from './vendor/pdf-lib/pdf-lib.mjs';
import {embedChineseFont,inverse} from './document-model.mjs';

export function installPageOperations(api){
  const {$}=api;
  $('editor-controls').insertAdjacentHTML('beforebegin',`<div class="page-operation-bar" role="group" aria-label="新增與替換頁面"><button id="duplicate-pages" class="secondary" disabled>複製勾選頁</button><label class="sr-only" for="blank-orientation">空白頁方向</label><select id="blank-orientation"><option value="portrait">A4 直式空白頁</option><option value="landscape">A4 橫式空白頁</option></select><button id="insert-blank" class="secondary">插入空白頁</button><button id="replace-page" class="secondary" disabled>替換勾選單頁</button><input id="replace-file" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" hidden></div>`);
  $('export-pdf').insertAdjacentHTML('afterend',`<details class="batch-label-settings"><summary>批次頁碼／頁首頁尾</summary><fieldset id="batch-label-fields"><legend class="sr-only">頁首頁尾設定</legend><label class="field-label" for="batch-header">頁首文字</label><input id="batch-header" maxlength="120" placeholder="例如：{name} · {date}"><label class="field-label" for="batch-footer">頁尾文字</label><input id="batch-footer" maxlength="120" value="第 {page}／{pages} 頁"><div class="free-pair"><label>起始頁碼<input id="batch-start" type="number" min="1" max="9999" value="1"></label><label>字級 pt<input id="batch-size" type="number" min="8" max="24" value="10"></label></div><div class="free-pair"><label>對齊<select id="batch-align"><option value="center">置中</option><option value="left">靠左</option><option value="right">靠右</option></select></label><label>邊距 mm<input id="batch-margin" type="number" min="3" max="30" value="8"></label></div><label class="field-label" for="batch-color">文字顏色</label><input id="batch-color" type="color" value="#454545"><p class="field-hint">只套用勾選頁。{page} 為目前頁序的編號，{pages} 為最後頁碼；也可用 {date}、{name}。再次套用會取代上次批次頁首頁尾，保留其他標記。</p><p id="batch-example" class="field-hint"></p><button id="batch-apply" class="secondary full">套用到勾選頁</button><button id="batch-remove" class="secondary full">移除勾選頁的頁首頁尾</button></fieldset></details>`);
  document.body.insertAdjacentHTML('beforeend',`<dialog id="replacement-dialog" class="work-dialog compact-dialog" aria-labelledby="replacement-title"><h2 id="replacement-title">選擇替換頁面</h2><p id="replacement-source"></p><label for="replacement-index">使用新文件的哪一頁？</label><select id="replacement-index"></select><p class="field-hint">替換原本勾選的單頁；原頁的裁切、標記與 OCR 不會帶到新頁。完成後仍可復原。</p><div class="free-pair"><button id="replacement-cancel" class="secondary">取消</button><button id="replacement-use" class="primary">使用這頁</button></div></dialog>`);
  let replacementResolve;
  const finish=value=>{const resolve=replacementResolve;replacementResolve=null;$('replacement-dialog').close();resolve?.(value);};
  $('replacement-cancel').onclick=()=>finish(null);$('replacement-use').onclick=()=>finish(Number($('replacement-index').value));
  $('replacement-dialog').addEventListener('cancel',event=>{event.preventDefault();finish(null);});
  $('duplicate-pages').onclick=()=>api.duplicatePages();
  $('insert-blank').onclick=async()=>{if(api.isBusy())return;const landscape=$('blank-orientation').value==='landscape',selected=api.chosen(),position=selected.length?api.getPages().indexOf(selected.at(-1))+1:api.getPages().length;await api.addFiles(async()=>{const document=await PDFDocument.create();document.addPage(landscape?[841.89,595.28]:[595.28,841.89]);return [new File([await document.save()],'空白頁.pdf',{type:'application/pdf'})];},{insertAt:position});};
  $('replace-page').onclick=()=>$('replace-file').click();
  $('replace-file').onchange=async()=>{const file=$('replace-file').files[0],selected=api.chosen();$('replace-file').value='';if(file&&selected.length===1)await api.addFiles([file],{replaceId:selected[0].id});};
  const date=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  function text(template,index,start){return template.replace(/\{(page|pages|name|date)\}/g,(_,key)=>({page:start+index,pages:start+api.getPages().length-1,name:api.filename(),date:date()})[key]);}
  async function apply(remove=false){
    if(api.isBusy()||!api.chosen().length)return;
    const start=Number($('batch-start').value),size=Number($('batch-size').value),margin=Number($('batch-margin').value)*72/25.4,align=$('batch-align').value,color=$('batch-color').value;
    if(!remove&&(!Number.isInteger(start)||start<1||start>9999||!Number.isFinite(size)||size<8||size>24||!Number.isFinite(margin)||margin<3*72/25.4||margin>30*72/25.4||!['left','center','right'].includes(align)||!/^#[\da-f]{6}$/i.test(color))){api.status('請檢查頁碼、字級與邊距範圍。',true);return;}
    if(!remove&&!$('batch-header').value.trim()&&!$('batch-footer').value.trim()){api.status('請輸入頁首或頁尾文字。',true);return;}
    api.setBusy(true);
    try{
      let font;if(!remove)font=await embedChineseFont(await PDFDocument.create());const edits=[];
      for(const record of api.chosen()){
        const annotations=(record.annotations||[]).filter(mark=>!mark.batchLabel);
        if(!remove){const viewport=await api.pageViewport(api.getSources().get(record.sourceId),record),index=api.getPages().indexOf(record);
          for(const [position,template]of [['header',$('batch-header').value],['footer',$('batch-footer').value]]){
            const value=text(template,index,start).trim();if(!value)continue;
            const available=viewport.width-2*margin,actual=Math.min(size,size*available/Math.max(1,font.widthOfTextAtSize(value,size))),width=font.widthOfTextAtSize(value,actual);
            if(actual<6||viewport.height<2*margin+actual*2.6)throw Error(`第 ${index+1} 頁空間不足，請縮短文字或減少邊距。`);
            annotations.push({id:crypto.randomUUID(),type:'text',batchLabel:true,frame:inverse(viewport.transform),x:align==='left'?margin:align==='right'?viewport.width-margin-width:(viewport.width-width)/2,y:position==='header'?margin:viewport.height-margin-actual*1.3,width,height:actual*1.3,fontSize:actual,thickness:1,color,text:value});
          }
        }
        edits.push({...record,annotations});
      }
      await api.commitEdits(edits);api.status(remove?'已移除勾選頁的批次頁首頁尾，可復原。':'已套用頁首頁尾，PDF 與圖片都會保留，可復原。');
    }catch(error){api.status(error.message,true);}finally{api.setBusy(false);}
  }
  $('batch-apply').onclick=()=>void apply();$('batch-remove').onclick=()=>void apply(true);
  const example=()=>{$('batch-example').textContent=`範例：${text($('batch-header').value||$('batch-footer').value,0,Math.max(1,Number($('batch-start').value)||1))}`;};
  for(const id of ['batch-header','batch-footer','batch-start'])$(id).addEventListener('input',example);
  const optionIds=['blank-orientation','batch-header','batch-footer','batch-start','batch-size','batch-align','batch-margin','batch-color'];
  return {capture:()=>Object.fromEntries(optionIds.map(id=>[id,$(id).value])),restore(value){for(const id of optionIds)if(typeof value?.[id]==='string')$(id).value=value[id];example();},refresh(){const busy=api.isBusy(),count=api.chosen().length;$('duplicate-pages').disabled=busy||!count||api.getPages().length+count>500;$('insert-blank').disabled=$('blank-orientation').disabled=busy||api.getPages().length>=500;$('replace-page').disabled=busy||count!==1;$('batch-label-fields').disabled=busy||!count;example();},
    chooseReplacement(source){$('replacement-source').textContent=`${source.name} · ${source.count} 頁`;$('replacement-index').replaceChildren();for(let i=0;i<source.count;i++)$('replacement-index').add(new Option(`第 ${i+1} 頁`,i));$('replacement-dialog').showModal();return new Promise(resolve=>replacementResolve=resolve);}};
}
