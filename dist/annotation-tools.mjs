import {replacementBrowserFont,replacementFontMetrics,inverse,multiply,transformPoint} from './document-model.mjs?v=20261027-replace2';
import {replacementFonts,replacementLayout,replacementMeasure} from './replacement-core.mjs?v=20261027-replace2';
const numberLabel=value=>String(Math.round(value*100)/100);
const fieldIds=['mark-text','mark-color','mark-size','mark-stroke','mark-font','mark-background','mark-width','mark-height','mark-padding-x','mark-padding-y'];
const NS='http://www.w3.org/2000/svg';
const node=(name,attrs={})=>{const el=document.createElementNS(NS,name);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);return el;};
export function installAnnotations(api){
  document.body.insertAdjacentHTML('beforeend',`<dialog id="mark-dialog" class="work-dialog" aria-labelledby="mark-title"><div class="preview-header"><h2 id="mark-title">文字與標記</h2><button id="mark-close" class="secondary">取消</button></div><div class="mark-toolbar" role="group" aria-label="標記工具"><button data-tool="select" class="secondary" aria-pressed="true">選取／移動</button><button data-tool="text" class="secondary" aria-pressed="false">文字</button><button data-tool="replace" class="secondary" aria-pressed="false">文字替換</button><button data-tool="highlight" class="secondary" aria-pressed="false">螢光筆</button><button data-tool="arrow" class="secondary" aria-pressed="false">箭頭</button><button data-tool="box" class="secondary" aria-pressed="false">方框</button></div><p class="field-hint" id="mark-help">選「文字替換」後拖曳框住舊字，再輸入新文字；選取後可拖動整個替換框。</p><div class="document-layout"><div class="document-scroll"><div id="mark-stage" class="document-stage"><img id="mark-image" alt="正在編輯的 PDF 頁面" draggable="false"><svg id="mark-overlay" aria-label="頁面標記"></svg></div></div><fieldset id="mark-fields"><legend class="sr-only">標記屬性</legend><label class="field-label" for="mark-text">文字內容</label><textarea id="mark-text" rows="3" maxlength="2000" placeholder="輸入要加入的文字">請填寫文字</textarea><label class="field-label" for="mark-color">顏色</label><input id="mark-color" type="color" value="#2955df"><label class="field-label" for="mark-size">文字大小（pt）</label><input id="mark-size" type="number" min="6" max="120" value="20"><label id="mark-stroke-label" class="field-label" for="mark-stroke">線條粗細（pt）</label><input id="mark-stroke" type="number" min="1" max="16" value="2"><div id="mark-replace-fields" hidden><label class="field-label" for="mark-font">替換字型</label><select id="mark-font"><option value="sans">黑體</option><option value="serif">明體</option></select><label class="field-label" for="mark-background">覆蓋底色</label><input id="mark-background" type="color" value="#ffffff"><div class="mark-replace-pair"><label>替換框寬（pt）<input id="mark-width" type="number" min="3" max="10000" step="0.1" value="160"></label><label>替換框高（pt）<input id="mark-height" type="number" min="3" max="10000" step="0.1" value="60"></label><label>文字左留白（pt）<input id="mark-padding-x" type="number" min="0" max="1000" step="0.1" value="2"></label><label>文字上留白（pt）<input id="mark-padding-y" type="number" min="0" max="1000" step="0.1" value="2"></label></div><button id="mark-font-retry" class="secondary full" hidden>重新載入字型</button><p class="field-hint">新文字會自動換行，超出時請縮小字級或擴大框。這是外觀覆蓋，原稿與既有 OCR 文字仍可能被擷取，不能用來永久刪除敏感內容。</p></div><p id="mark-replacement-status" class="field-hint" role="status"></p><button id="mark-center" class="secondary full">在頁面中央加入</button><label class="field-label" for="mark-list">已加入的標記</label><select id="mark-list"><option value="">尚未加入</option></select><button id="mark-delete" class="secondary danger full">刪除選取標記</button><button id="mark-undo" class="secondary full">復原標記操作</button><button id="mark-redo" class="secondary full">重做標記操作</button><button id="mark-save" class="primary full">儲存此頁標記</button><p class="field-hint">標記會一起輸出到 PDF 與圖片。這裡新增的文字可編輯；文字替換會以底色與新字覆蓋原稿。</p></fieldset></div><p id="mark-status" class="status" role="status"></p></dialog>`);
  const {$}=api,dialog=$('mark-dialog'),svg=$('mark-overlay');let state=null,tool='select',selected=null,drag=null,history=[],future=[],working=false,url=null;
  const fonts=new Map(),fontLoading=new Set(),fontErrors=new Set();
  const say=(text,error=false)=>{$('mark-status').textContent=text;$('mark-status').classList.toggle('error',error);};
  const saveUndo=()=>{future=[];history.push(structuredClone(state.marks));if(history.length>40)history.shift();};
  function setWorking(value){working=value;$('mark-fields').disabled=value;$('mark-close').disabled=value;for(const b of dialog.querySelectorAll('[data-tool]'))b.disabled=value;}
  function selectTool(value){tool=value;for(const b of dialog.querySelectorAll('[data-tool]'))b.setAttribute('aria-pressed',String(b.dataset.tool===value));svg.style.cursor=value==='select'?'default':'crosshair';}
  for(const b of dialog.querySelectorAll('[data-tool]'))b.onclick=()=>{
    try{applyFields();}catch(error){say(error.message,true);return;}
    selectTool(b.dataset.tool);if(tool!=='select')selected=null;
    if(tool==='highlight')$('mark-color').value='#ffe234';else if(tool==='replace'){$('mark-color').value='#18253e';if($('mark-text').value==='請填寫文字')$('mark-text').value='';}else if(tool!=='select')$('mark-color').value='#2955df';
    if(state)render();
  };
  function current(){return state?.marks.find(m=>m.id===selected);}
  function readFields(mark){
    const value={...mark,color:$('mark-color').value,fontSize:Number($('mark-size').value),thickness:Number($('mark-stroke').value)};
    if(!(value.fontSize>=6&&value.fontSize<=120&&value.thickness>=1&&value.thickness<=16))throw Error('文字大小請設 6–120 pt，線條請設 1–16 pt。');
    if(['text','replace'].includes(mark.type))value.text=$('mark-text').value;
    if(mark.type==='replace'){
      Object.assign(value,{font:$('mark-font').value,background:$('mark-background').value,width:Number($('mark-width').value),height:Number($('mark-height').value),paddingX:Number($('mark-padding-x').value),paddingY:Number($('mark-padding-y').value)});
      for(const [id,key]of [['mark-width','width'],['mark-height','height'],['mark-padding-x','paddingX'],['mark-padding-y','paddingY']])if($(id).value===numberLabel(mark[key]))value[key]=mark[key];
      if(!Object.hasOwn(replacementFonts,value.font)||![value.width,value.height].every(n=>Number.isFinite(n)&&n>=3&&n<=10000)||![value.paddingX,value.paddingY].every(n=>Number.isFinite(n)&&n>=0&&n<=1000))throw Error('替換框寬高須為 3–10,000 pt，留白須為 0–1,000 pt。');
    }
    return value;
  }
  function applyFields(){const mark=current();if(!mark)return;const value=readFields(mark);if(JSON.stringify(value)!==JSON.stringify(mark)){saveUndo();Object.assign(mark,value);}}
  function ensureFont(name){
    if(fonts.has(name)||fontLoading.has(name)||fontErrors.has(name))return;
    fontLoading.add(name);
    Promise.all([replacementFontMetrics(name),replacementBrowserFont(name)]).then(([font])=>fonts.set(name,font)).catch(()=>fontErrors.add(name)).finally(()=>{fontLoading.delete(name);if(state&&dialog.open)render(true);});
  }
  $('mark-font-retry').onclick=()=>{fontErrors.delete($('mark-font').value);render();};
  function syncFields(){const m=current();if(m){$('mark-color').value=m.color;$('mark-size').value=m.fontSize||20;$('mark-stroke').value=m.thickness||2;if(['text','replace'].includes(m.type))$('mark-text').value=m.text;if(m.type==='replace')for(const [id,key]of [['mark-font','font'],['mark-background','background'],['mark-width','width'],['mark-height','height'],['mark-padding-x','paddingX'],['mark-padding-y','paddingY']])$(id).value=typeof m[key]==='number'?numberLabel(m[key]):m[key];}$('mark-delete').disabled=!m;}
  function replacementStatus(marks){
    const replacing=current()?.type==='replace'||tool==='replace';$('mark-replace-fields').hidden=!replacing;$('mark-stroke').hidden=$('mark-stroke-label').hidden=replacing;
    let problem='';
    for(const mark of marks.filter(m=>m.type==='replace')){
      const matrix=multiply(state.viewport.transform,mark.frame),corners=[[mark.x,mark.y],[mark.x+mark.width,mark.y],[mark.x,mark.y+mark.height],[mark.x+mark.width,mark.y+mark.height]].map(([x,y])=>transformPoint(matrix,x,y));
      const original=state.page.annotations?.find(item=>item.id===mark.id),sameGeometry=original&&['x','y','width','height'].every(key=>original[key]===mark[key])&&JSON.stringify(original.frame)===JSON.stringify(mark.frame);
      if(!sameGeometry&&corners.some(([x,y])=>x<-.1||y<-.1||x>state.viewport.width+.1||y>state.viewport.height+.1)){problem='替換框超出頁面，請移回頁面或縮小範圍。';continue;}
      if(!mark.text)continue;
      ensureFont(mark.font);const font=fonts.get(mark.font);
      if(!font)problem=fontErrors.has(mark.font)?'字型載入失敗，請重新載入字型或改用另一種字型。':'正在載入替換字型，完成後可儲存。';
      else if(replacementLayout(mark,replacementMeasure(font,mark.fontSize)).overflow)problem='替換文字超出範圍，請縮小字級、增加換行或擴大替換框。';
    }
    $('mark-font-retry').hidden=!fontErrors.has($('mark-font').value);
    $('mark-replacement-status').textContent=problem;$('mark-replacement-status').classList.toggle('error',!!problem);$('mark-save').disabled=working||!state||!!problem;
  }
  function render(preview=false){
    if(!state)return;let marks=state.marks;
    if(preview&&current())try{const value=readFields(current());marks=marks.map(m=>m.id===selected?value:m);}catch(error){$('mark-replacement-status').textContent=error.message;$('mark-save').disabled=true;return;}
    svg.replaceChildren();
    let ordinal=0;for(const m of marks){
      const g=node('g',{'data-mark':m.id,transform:`matrix(${multiply(state.viewport.transform,m.frame).join(' ')})`});let shape;
      if(m.type==='replace'){
        const clipId='mark-replacement-'+(++ordinal);
        const clip=node('clipPath',{id:clipId,clipPathUnits:'userSpaceOnUse'});clip.append(node('rect',{x:m.x,y:m.y,width:m.width,height:m.height}));g.append(clip);
        g.append(node('rect',{x:m.x,y:m.y,width:m.width,height:m.height,fill:m.background,'pointer-events':'all'}));
        const font=fonts.get(m.font);if(m.text)ensureFont(m.font);
        const lines=font?replacementLayout(m,replacementMeasure(font,m.fontSize)).lines:[{text:m.text,x:m.x+m.paddingX,y:m.y+m.paddingY+m.fontSize*.88}];
        shape=node('text',{'font-size':m.fontSize,'font-family':replacementFonts[m.font].family,'font-kerning':'none',fill:m.color,'clip-path':`url(#${clipId})`});
        for(const line of lines){const span=node('tspan',{x:line.x,y:line.y});span.textContent=line.text||' ';shape.append(span);}
      }else if(m.type==='text'){
        shape=node('text',{x:m.x,y:m.y+m.fontSize*.88,'font-size':m.fontSize,'font-family':'PDFChinese, sans-serif',fill:m.color});
        m.text.split('\n').forEach((line,i)=>{const span=node('tspan',{x:m.x,dy:i?m.fontSize*1.3:0});span.textContent=line||' ';shape.append(span);});
      }else if(m.type==='arrow'){
        const end={x:m.x+m.width,y:m.y+m.height},a=Math.atan2(m.height,m.width),len=Math.max(8,m.thickness*4);
        shape=node('path',{d:`M ${m.x} ${m.y} L ${end.x} ${end.y} M ${end.x-len*Math.cos(a-.45)} ${end.y-len*Math.sin(a-.45)} L ${end.x} ${end.y} L ${end.x-len*Math.cos(a+.45)} ${end.y-len*Math.sin(a+.45)}`,fill:'none',stroke:m.color,'stroke-width':m.thickness});
      }else shape=node('rect',{x:m.x,y:m.y,width:m.width,height:m.height,fill:m.type==='highlight'?m.color:'none','fill-opacity':m.type==='highlight'?.3:0,stroke:m.type==='box'?m.color:'none','stroke-width':m.thickness});
      shape.setAttribute('pointer-events','all');g.append(shape);
      if(m.id===selected){const width=m.type==='text'?Math.max(m.fontSize,...m.text.split('\n').map(t=>[...t].length*m.fontSize)):Math.abs(m.width),height=m.type==='text'?m.text.split('\n').length*m.fontSize*1.3:Math.abs(m.height);g.append(node('rect',{x:Math.min(m.x,m.x+(m.type==='arrow'?m.width:0))-3,y:Math.min(m.y,m.y+(m.type==='arrow'?m.height:0))-3,width:width+6,height:height+6,fill:'none',stroke:'#2955df','stroke-width':1,'stroke-dasharray':'4 3','pointer-events':'none'}));}
      svg.append(g);
    }
    const list=$('mark-list');list.replaceChildren(new Option('選取標記', ''));state.marks.forEach((m,i)=>list.add(new Option(`${i+1}. ${{text:'文字',highlight:'螢光筆',arrow:'箭頭',box:'方框',replace:'文字替換'}[m.type]}${['text','replace'].includes(m.type)?'：'+m.text.slice(0,16):''}`,m.id)));list.value=selected||'';$('mark-undo').disabled=!history.length;$('mark-redo').disabled=!future.length;if(!preview)syncFields();replacementStatus(marks);
  }
  $('mark-list').onchange=()=>{selected=$('mark-list').value;selectTool('select');render();};
  function makeMark(p,q){
    const fontSize=Number($('mark-size').value),thickness=Number($('mark-stroke').value);if(!(fontSize>=6&&fontSize<=120&&thickness>=1&&thickness<=16))throw new Error('文字大小請設 6–120 pt，線條請設 1–16 pt。');
    if(tool==='text'&&!$('mark-text').value.trim())throw new Error('請先輸入文字。');
    const extra=tool==='replace'?{font:$('mark-font').value,background:$('mark-background').value,paddingX:Number($('mark-padding-x').value),paddingY:Number($('mark-padding-y').value)}:{};
    if(tool==='replace'&&![extra.paddingX,extra.paddingY].every(n=>Number.isFinite(n)&&n>=0&&n<=1000))throw Error('替換文字留白須為 0–1,000 pt。');
    return{...extra,id:crypto.randomUUID(),type:tool,frame:inverse(state.viewport.transform),x:tool==='arrow'?p.x:Math.min(p.x,q.x),y:tool==='arrow'?p.y:Math.min(p.y,q.y),width:tool==='arrow'?q.x-p.x:Math.abs(q.x-p.x),height:tool==='arrow'?q.y-p.y:Math.abs(q.y-p.y),fontSize,thickness,color:$('mark-color').value,text:$('mark-text').value};
  }
  const position=e=>{const rect=svg.getBoundingClientRect();return{x:Math.max(0,Math.min(state.viewport.width,(e.clientX-rect.left)/rect.width*state.viewport.width)),y:Math.max(0,Math.min(state.viewport.height,(e.clientY-rect.top)/rect.height*state.viewport.height))};};
  svg.addEventListener('pointerdown',e=>{
    if(working||drag||!state||e.button!==0)return;try{applyFields();}catch(error){say(error.message,true);return;}e.preventDefault();svg.setPointerCapture(e.pointerId);const p=position(e);
    const previous={marks:structuredClone(state.marks),history:[...history],future:[...future]};
    if(tool==='select'){const id=e.target.closest('[data-mark]')?.getAttribute('data-mark');selected=id||null;if(id){saveUndo();drag={id:e.pointerId,start:p,original:structuredClone(current()),move:true,previous};}render();return;}
    try{const m=makeMark(p,p);saveUndo();state.marks.push(m);selected=m.id;drag={id:e.pointerId,start:p,move:false,previous};render();}
    catch(error){history=previous.history;future=previous.future;say(error.message,true);}
  });
  svg.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const p=position(e),m=current();if(drag.move){const inv=inverse(multiply(state.viewport.transform,m.frame)),a=transformPoint(inv,drag.start.x,drag.start.y),b=transformPoint(inv,p.x,p.y);m.x=drag.original.x+b[0]-a[0];m.y=drag.original.y+b[1]-a[1];}else{const fresh=makeMark(drag.start,p);Object.assign(m,{x:fresh.x,y:fresh.y,width:fresh.width,height:fresh.height});}render();});
  svg.addEventListener('pointerup',e=>{if(!drag||drag.id!==e.pointerId)return;const m=current(),tiny=!drag.move&&m.type!=='text'&&Math.hypot(m.width,m.height)<3,unchanged=drag.move&&JSON.stringify(state.marks)===JSON.stringify(drag.previous.marks);
    if(tiny||unchanged){state.marks=drag.previous.marks;history=drag.previous.history;future=drag.previous.future;if(tiny)selected=null;}
    drag=null;render();say('可選取標記並拖動位置，完成後按「儲存此頁標記」。');});
  svg.addEventListener('pointercancel',()=>{if(drag){state.marks=drag.previous.marks;history=drag.previous.history;future=drag.previous.future;drag=null;selected=null;render();}});
  $('mark-center').onclick=()=>{if(tool==='select'){say('請先選擇文字、文字替換、螢光筆、箭頭或方框。',true);return;}try{const x=state.viewport.width*.25,y=state.viewport.height*.35;const mark=makeMark({x,y},{x:x+state.viewport.width*.35,y:y+(tool==='highlight'?20:60)});saveUndo();state.marks.push(mark);selected=mark.id;render();}catch(e){say(e.message,true);}};
  for(const id of fieldIds){$(id).addEventListener('input',()=>render(true));$(id).addEventListener('change',()=>{try{applyFields();render();}catch(error){say(error.message,true);$('mark-save').disabled=true;}});}
  $('mark-delete').onclick=()=>{if(!current())return;saveUndo();state.marks=state.marks.filter(m=>m.id!==selected);selected=null;render();};
  function undo(){if(working||drag||!state||!history.length)return;future.push(structuredClone(state.marks));state.marks=history.pop();selected=null;render();}
  function redo(){if(working||drag||!state||!future.length)return;history.push(structuredClone(state.marks));state.marks=future.pop();selected=null;render();}
  $('mark-undo').onclick=undo;$('mark-redo').onclick=redo;
  $('mark-close').onclick=()=>dialog.close();dialog.addEventListener('cancel',e=>{if(working)e.preventDefault();});dialog.addEventListener('close',()=>{if(url)URL.revokeObjectURL(url);url=null;state=null;svg.replaceChildren();$('mark-image').removeAttribute('src');api.setBusy(false);});
  $('mark-save').onclick=async()=>{if(working||!state)return;try{applyFields();render();if($('mark-save').disabled)return;}catch(error){say(error.message,true);return;}setWorking(true);say('正在儲存標記…');try{await api.commitEdits([{...state.page,annotations:structuredClone(state.marks)}]);dialog.close();}catch(e){api.setBusy(true);say(e.message,true);}finally{setWorking(false);}};
  async function open(page,index){
    if(api.isBusy())return;api.setBusy(true);dialog.showModal();setWorking(true);say('正在載入頁面與中文字型…');selected=null;history=[];future=[];selectTool('select');
    try{await document.fonts.load('20px PDFChinese');const source=api.getSources().get(page.sourceId),viewport=await api.pageViewport(source,page);state={page,marks:structuredClone(page.annotations||[]),viewport};const result=await api.renderBlob(source,page.index,120,'jpeg',false,{...page,annotations:[]},{maxEdge:1800,quality:.9});url=URL.createObjectURL(result.blob);$('mark-image').src=url;svg.setAttribute('viewBox',`0 0 ${viewport.width} ${viewport.height}`);$('mark-title').textContent=`第 ${index+1} 頁 · 文字與標記`;render();say('選擇工具後在頁面拖曳，也可以使用「在頁面中央加入」。');}
    catch(e){say(e.message,true);}finally{setWorking(false);$('mark-fields').disabled=!state;$('mark-save').disabled=!state;if(state)render();}
  }
  return{open,undo,redo,
    captureDraft:()=>dialog.open&&state?{kind:'marks',pageId:state.page.id,marks:structuredClone(state.marks),tool,selected,fields:Object.fromEntries(fieldIds.map(id=>[id,$(id).value]))}:null,
    async restoreDraft(draft){const index=api.getPages().findIndex(p=>p.id===draft.pageId);if(index<0)return;await open(api.getPages()[index],index);if(!state)return;state.marks=structuredClone(draft.marks);selected=draft.selected;selectTool(['select','text','highlight','arrow','box','replace'].includes(draft.tool)?draft.tool:'select');render();for(const [id,value]of Object.entries(draft.fields||{}))if(fieldIds.includes(id))$(id).value=value;try{applyFields();render();}catch(error){say(error.message,true);$('mark-save').disabled=true;}history=[];future=[];},
    hasDraft:()=>{if(!dialog.open||!state)return false;if(JSON.stringify(state.marks)!==JSON.stringify(state.page.annotations||[]))return true;const m=current();if(!m)return false;try{return JSON.stringify(readFields(m))!==JSON.stringify(m);}catch{return true;}}};
}
