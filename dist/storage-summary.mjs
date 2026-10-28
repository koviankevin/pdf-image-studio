import {storedSummary} from './product-core.mjs?v=20261028-hub3';

// Read only the small state record. Listing workspaces must not deserialize
// every source PDF or preview into memory, or create a missing workspace DB.
export async function inspectStoredWorkspace(name,factory=globalThis.indexedDB){
  if(!factory)throw Error('這個瀏覽器目前無法讀取本機工作區。');
  if(typeof factory.databases==='function'){
    const databases=await factory.databases();if(!databases.some(db=>db.name===name))return storedSummary(null);
  }
  return new Promise((resolve,reject)=>{
    let missing=false,db;const request=factory.open(name);
    request.onupgradeneeded=()=>{missing=true;request.transaction.abort();};
    request.onerror=()=>missing?resolve(storedSummary(null)):reject(request.error||Error('無法讀取工作區。'));
    request.onblocked=()=>reject(Error('其他分頁正使用這個工作區，請關閉後重試。'));
    request.onsuccess=()=>{
      db=request.result;db.onversionchange=()=>db.close();
      if(!db.objectStoreNames.contains('state')){db.close();reject(Error('工作區資料格式不完整。'));return;}
      let tx,record,result,failure;try{tx=db.transaction('state','readonly');record=tx.objectStore('state').get('current');}catch(error){db.close();reject(error);return;}
      record.onsuccess=()=>{try{result=storedSummary(record.result);}catch(error){failure=error;tx.abort();}};
      tx.oncomplete=()=>{db.close();resolve(result);};tx.onabort=tx.onerror=()=>{db.close();reject(failure||tx.error||Error('讀取中斷，已保留原資料。'));};
    };
  });
}
