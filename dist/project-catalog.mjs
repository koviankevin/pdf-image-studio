export const catalogDB='shijian.projects.v1';
export const projectDB=id=>id==='legacy'?'shijian.workspace.v1':`shijian.project.${id}`;
export async function openProjectCatalog(factory=globalThis.indexedDB){
  if(!factory)throw Error('此瀏覽器不支援工作區儲存。');
  const db=await new Promise((resolve,reject)=>{const request=factory.open(catalogDB,1);request.onupgradeneeded=()=>request.result.createObjectStore('catalog');request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result);});
  db.onversionchange=()=>db.close();
  async function access(change){
    const tx=db.transaction('catalog',change?'readwrite':'readonly'),store=tx.objectStore('catalog');
    return new Promise((resolve,reject)=>{let result,failure;const request=store.get('current');
      request.onsuccess=()=>{try{const value=request.result||{active:'legacy',projects:[{id:'legacy',name:'原有工作區',updatedAt:Date.now()}]};result=change?change(value):value;if(change)store.put(result,'current');}catch(error){failure=error;tx.abort();}};
      tx.oncomplete=()=>resolve(result);tx.onerror=event=>{failure=event.target.error;};tx.onabort=()=>reject(failure||tx.error||Error('工作區清單寫入失敗。'));
    });
  }
  return {read:()=>access(),
    async add(name){const id=crypto.randomUUID();await access(value=>{if(value.projects.length>=20)throw Error('最多保留 20 個工作區，請先備份並刪除不再使用的工作區。');value.projects.push({id,name:name.trim().slice(0,80)||'未命名工作區',updatedAt:Date.now()});return value;});return id;},
    activate:id=>access(value=>{if(!value.projects.some(p=>p.id===id&&!p.deleting))throw Error('找不到工作區，或工作區正在刪除。');value.active=id;return value;}),
    rename:(id,name)=>access(value=>{const item=value.projects.find(p=>p.id===id);if(!item)throw Error('找不到工作區。');if(!name.trim())throw Error('請輸入工作區名稱。');item.name=name.trim().slice(0,80);item.updatedAt=Date.now();return value;}),
    touch:id=>access(value=>{const item=value.projects.find(p=>p.id===id);if(item)item.updatedAt=Date.now();return value;}),
    async remove(id){
      // Reserve the entry atomically before deleting its database, so another
      // tab cannot activate it between our active-project check and deletion.
      await access(value=>{if(id===value.active)throw Error('請先切換到其他工作區，再刪除此工作區。');const item=value.projects.find(p=>p.id===id);if(!item||item.deleting)throw Error('工作區已刪除或正在刪除。');item.deleting=true;return value;});
      try{await new Promise((resolve,reject)=>{const request=factory.deleteDatabase(projectDB(id));request.onsuccess=resolve;request.onerror=()=>reject(request.error);});}
      catch(error){await access(value=>{const item=value.projects.find(p=>p.id===id);if(item)item.deleting=false;return value;});throw error;}
      return access(value=>{value.projects=value.projects.filter(p=>p.id!==id);return value;});},
    close:()=>db.close()};
}
