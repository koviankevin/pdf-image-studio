import {inverse,multiply,transformPoint} from './document-model.mjs';
const NS='http://www.w3.org/2000/svg';
const node=(name,attrs={})=>{const el=document.createElementNS(NS,name);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);return el;};
export function installAnnotations(api){
  document.body.insertAdjacentHTML('beforeend',`<dialog id="mark-dialog" class="work-dialog" aria-labelledby="mark-title"><div class="preview-header"><h2 id="mark-title">文字與標記</h2><button id="mark-close" class="secondary">取消</button></div><div class="mark-toolbar" role="group" aria-label="標記工具"><button data-tool="select" class="secondary" aria-pressed="true">選取／移動</button><button data-tool="text" class="secondary" aria-pressed="false">文字</button><button data-tool="highlight" class="secondary" aria-pressed="false">螢光筆</button><button data-tool="arrow" class="secondary" aria-pressed="false">箭頭</button><button data-tool="box" class="secondary" aria-pressed="false">方框</button></div><p class="field-hint" id="mark-help">選擇工具後在頁面拖曳。文字可點一下加入；選取後可拖動位置。</p><div class="document-layout"><div class="document-scroll"><div id="mark-stage" class="document-stage"><img id="mark-image" alt="正在編輯的 PDF 頁面" draggable="false"><svg id="mark-overlay" aria-label="頁面標記"></svg></div></div><fieldset id="mark-fields"><legend class="sr-only">標記屬性</legend><label class="field-label" for="mark-text">文字內容</label><textarea id="mark-text" rows="3" maxlength="2000" placeholder="輸入要加入的文字">請填寫文字</textarea><label class="field-label" for="mark-color">顏色</label><input id="mark-color" type="color" value="#2955df"><label class="field-label" for="mark-size">文字大小（pt）</label><input id="mark-size" type="number" min="6" max="120" value="20"><label class="field-label" for="mark-stroke">線條粗細（pt）</label><input id="mark-stroke" type="number" min="1" max="16" value="2"><button id="mark-center" class="secondary full">在頁面中央加入</button><label class="field-label" for="mark-list">已加入的標記</label><select id="mark-list"><option value="">尚未加入</option></select><button id="mark-delete" class="secondary danger full">刪除選取標記</button><button id="mark-undo" class="secondary full">復原標記操作</button><button id="mark-save" class="primary full">儲存此頁標記</button><p class="field-hint">標記會一起輸出到 PDF 與圖片。這裡新增的文字可編輯；原稿文字不會被改寫。</p></fieldset></div><p id="mark-status" class="status" role="status"></p></dialog>`);
  const {$}=api,dialog=$('mark-dialog'),svg=$('mark-overlay');let state=null,tool='select',selected=null,drag=null,history=[],working=false,url=null;
  const say=(text,error=false)=>{$('mark-status').textContent=text;$('mark-status').classList.toggle('error',error);};
  const saveUndo=()=>{history.push(structuredClone(state.marks));if(history.length>40)history.shift();};
  function setWorking(value){working=value;$('mark-fields').disabled=value;$('mark-close').disabled=value;for(const b of dialog.querySelectorAll('[data-tool]'))b.disabled=value;}
  function selectTool(value){tool=value;for(const b of dialog.querySelectorAll('[data-tool]'))b.setAttribute('aria-pressed',String(b.dataset.tool===value));svg.style.cursor=value==='select'?'default':'crosshair';}
  for(const b of dialog.querySelectorAll('[data-tool]'))b.onclick=()=>{selectTool(b.dataset.tool);if(tool!=='select')selected=null;if(tool==='highlight')$('mark-color').value='#ffe234';else if(tool!=='select')$('mark-color').value='#2955df';if(state)render();};
  function current(){return state?.marks.find(m=>m.id===selected);}
  function syncFields(){const m=current();if(m){$('mark-color').value=m.color;$('mark-size').value=m.fontSize||20;$('mark-stroke').value=m.thickness||2;if(m.type==='text')$('mark-text').value=m.text;}$('mark-delete').disabled=!m;}
  function render(){
    svg.replaceChildren();
    for(const m of state.marks){
      const g=node('g',{'data-mark':m.id,transform:`matrix(${multiply(state.viewport.transform,m.frame).join(' ')})`});let shape;
      if(m.type==='text'){
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
    const list=$('mark-list');list.replaceChildren(new Option('選取標記', ''));state.marks.forEach((m,i)=>list.add(new Option(`${i+1}. ${{text:'文字',highlight:'螢光筆',arrow:'箭頭',box:'方框'}[m.type]}${m.type==='text'?'：'+m.text.slice(0,16):''}`,m.id)));list.value=selected||'';$('mark-undo').disabled=!history.length;syncFields();
  }
  $('mark-list').onchange=()=>{selected=$('mark-list').value;selectTool('select');render();};
  function makeMark(p,q){
    const fontSize=Number($('mark-size').value),thickness=Number($('mark-stroke').value);if(!(fontSize>=6&&fontSize<=120&&thickness>=1&&thickness<=16))throw new Error('文字大小請設 6–120 pt，線條請設 1–16 pt。');
    if(tool==='text'&&!$('mark-text').value.trim())throw new Error('請先輸入文字。');
    return{id:crypto.randomUUID(),type:tool,frame:inverse(state.viewport.transform),x:tool==='arrow'?p.x:Math.min(p.x,q.x),y:tool==='arrow'?p.y:Math.min(p.y,q.y),width:tool==='arrow'?q.x-p.x:Math.abs(q.x-p.x),height:tool==='arrow'?q.y-p.y:Math.abs(q.y-p.y),fontSize,thickness,color:$('mark-color').value,text:$('mark-text').value};
  }
  const position=e=>{const rect=svg.getBoundingClientRect();return{x:Math.max(0,Math.min(state.viewport.width,(e.clientX-rect.left)/rect.width*state.viewport.width)),y:Math.max(0,Math.min(state.viewport.height,(e.clientY-rect.top)/rect.height*state.viewport.height))};};
  svg.addEventListener('pointerdown',e=>{if(working||!state||e.button!==0)return;e.preventDefault();svg.setPointerCapture(e.pointerId);const p=position(e);if(tool==='select'){const id=e.target.closest('[data-mark]')?.getAttribute('data-mark');selected=id||null;if(id){saveUndo();drag={id:e.pointerId,start:p,original:structuredClone(current()),move:true};}render();return;}try{saveUndo();const m=makeMark(p,p);state.marks.push(m);selected=m.id;drag={id:e.pointerId,start:p,move:false};render();}catch(error){history.pop();say(error.message,true);}});
  svg.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const p=position(e),m=current();if(drag.move){const inv=inverse(multiply(state.viewport.transform,m.frame)),a=transformPoint(inv,drag.start.x,drag.start.y),b=transformPoint(inv,p.x,p.y);m.x=drag.original.x+b[0]-a[0];m.y=drag.original.y+b[1]-a[1];}else{const fresh=makeMark(drag.start,p);Object.assign(m,{x:fresh.x,y:fresh.y,width:fresh.width,height:fresh.height});}render();});
  svg.addEventListener('pointerup',e=>{if(!drag||drag.id!==e.pointerId)return;const m=current();if(!drag.move&&m.type!=='text'&&Math.hypot(m.width,m.height)<3){state.marks=history.pop();selected=null;}drag=null;render();say('可選取標記並拖動位置，完成後按「儲存此頁標記」。');});
  svg.addEventListener('pointercancel',()=>{if(drag){state.marks=history.pop();drag=null;selected=null;render();}});
  $('mark-center').onclick=()=>{if(tool==='select'){say('請先選擇文字、螢光筆、箭頭或方框。',true);return;}try{const x=state.viewport.width*.25,y=state.viewport.height*.35;const mark=makeMark({x,y},{x:x+state.viewport.width*.35,y:y+(tool==='highlight'?20:60)});saveUndo();state.marks.push(mark);selected=mark.id;render();}catch(e){say(e.message,true);}};
  for(const id of ['mark-text','mark-color','mark-size','mark-stroke'])$(id).addEventListener('change',()=>{const m=current();if(!m)return;saveUndo();if(id==='mark-text'&&m.type==='text')m.text=$(id).value;else if(id==='mark-color')m.color=$(id).value;else if(id==='mark-size')m.fontSize=Math.max(6,Math.min(120,Number($(id).value)||20));else if(id==='mark-stroke')m.thickness=Math.max(1,Math.min(16,Number($(id).value)||2));render();});
  $('mark-delete').onclick=()=>{if(!current())return;saveUndo();state.marks=state.marks.filter(m=>m.id!==selected);selected=null;render();};
  $('mark-undo').onclick=()=>{if(!history.length)return;state.marks=history.pop();selected=null;render();};
  $('mark-close').onclick=()=>dialog.close();dialog.addEventListener('cancel',e=>{if(working)e.preventDefault();});dialog.addEventListener('close',()=>{if(url)URL.revokeObjectURL(url);url=null;state=null;svg.replaceChildren();$('mark-image').removeAttribute('src');api.setBusy(false);});
  $('mark-save').onclick=async()=>{if(working)return;setWorking(true);say('正在儲存標記…');try{await api.commitEdits([{...state.page,annotations:structuredClone(state.marks)}]);dialog.close();}catch(e){api.setBusy(true);say(e.message,true);}finally{setWorking(false);}};
  async function open(page,index){
    if(api.isBusy())return;api.setBusy(true);dialog.showModal();setWorking(true);say('正在載入頁面與中文字型…');selected=null;history=[];selectTool('select');
    try{await document.fonts.load('20px PDFChinese');const source=api.getSources().get(page.sourceId),viewport=await api.pageViewport(source,page);state={page,marks:structuredClone(page.annotations||[]),viewport};const result=await api.renderBlob(source,page.index,120,'jpeg',false,{...page,annotations:[]},{maxEdge:1800,quality:.9});url=URL.createObjectURL(result.blob);$('mark-image').src=url;svg.setAttribute('viewBox',`0 0 ${viewport.width} ${viewport.height}`);$('mark-title').textContent=`第 ${index+1} 頁 · 文字與標記`;render();say('選擇工具後在頁面拖曳，也可以使用「在頁面中央加入」。');}
    catch(e){say(e.message,true);}finally{setWorking(false);$('mark-fields').disabled=!state;$('mark-save').disabled=!state;}
  }
  return{open};
}
