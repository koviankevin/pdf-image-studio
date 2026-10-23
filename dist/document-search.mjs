import {textItemBounds} from './text-geometry.mjs?v=20261023-projects2';
const normalize=text=>text.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,'');
export function installDocumentSearch(api){
  const {$}=api;
  $('page-grid').insertAdjacentHTML('beforebegin',`<section class="document-search" aria-label="文件文字搜尋"><label for="document-query">搜尋文件文字</label><div class="search-row"><input id="document-query" type="search" maxlength="200" placeholder="搜尋原有文字、OCR 或新增標記 · Ctrl+F"><button id="document-search" class="secondary">搜尋</button></div><p id="search-status" class="field-hint" role="status">掃描頁請先執行 OCR，才有文字可搜尋。</p><div id="search-results" class="search-results"></div></section>`);
  const cache=new WeakMap();let generation=0,timer,previous=[];
  async function textOf(record){
    if(cache.has(record))return cache.get(record);
    const promise=(async()=>{
      const added=(record.annotations||[]).filter(mark=>mark.type==='text').map(mark=>mark.text);
      if(record.ocr?.mode==='ocr')return [...record.ocr.lines.map(line=>line.text),...added].join(' ');
      const source=api.getSources().get(record.sourceId);if(!source)return '';
      const page=await api.getSourcePage(source,record.index),content=await page.getTextContent();
      return [...content.items.filter(item=>{
        if(!item.str)return false;if(!record.crop)return true;const {x,y,width,height}=record.crop,bounds=textItemBounds(item);
        return bounds&&bounds.right>=x&&bounds.left<=x+width&&bounds.bottom>=y&&bounds.top<=y+height;
      }).map(item=>item.str),...added].join(' ');
    })();cache.set(record,promise);try{return await promise;}catch(error){cache.delete(record);throw error;}
  }
  async function search(){
    clearTimeout(timer);const serial=++generation,query=normalize($('document-query').value.trim()),records=[...api.getPages()];
    $('search-results').replaceChildren();for(const card of $('page-grid').children)card.classList.remove('search-hit');
    if(!query){$('search-status').textContent='掃描頁請先執行 OCR，才有文字可搜尋。';return;}
    let hits=0,errors=0;
    for(const [index,record]of records.entries()){
      if(serial!==generation)return;
      $('search-status').textContent=`正在搜尋 ${index+1} / ${records.length} 頁…`;
      let text;try{text=await textOf(record);}catch{errors++;continue;}
      if(serial!==generation)return;
      const plain=normalize(text),position=plain.indexOf(query);if(position<0)continue;hits++;
      const button=document.createElement('button');button.type='button';button.className='secondary search-result';
      const excerpt=plain.slice(Math.max(0,position-18),position+query.length+45);
      button.textContent=`第 ${index+1} 頁 · ${excerpt}`;
      button.onclick=()=>{const card=[...$('page-grid').children].find(card=>card.dataset.id===record.id);if(!card)return;for(const other of $('page-grid').children)other.classList.remove('search-hit');card.classList.add('search-hit');card.scrollIntoView({block:'center',behavior:'smooth'});card.querySelector('.page-thumb').focus({preventScroll:true});};
      $('search-results').append(button);
      if(index%8===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(serial===generation)$('search-status').textContent=`找到 ${hits} 頁${errors?`；${errors} 頁暫時無法讀取`:''}${!hits?'。掃描頁請先做 OCR，或換個關鍵字。':''}`;
  }
  $('document-query').oninput=()=>{generation++;clearTimeout(timer);timer=setTimeout(search,250);};$('document-search').onclick=()=>void search();
  $('document-query').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();void search();}};
  return {focus:()=>{$('document-query').focus();$('document-query').select();},refresh(){const next=api.getPages();if(next.length===previous.length&&next.every((page,index)=>page===previous[index]))return;previous=[...next];generation++;clearTimeout(timer);if($('document-query').value.trim())timer=setTimeout(search,250);else $('search-results').replaceChildren();}};
}
