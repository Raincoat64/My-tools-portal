export const TTL=24*60*60*1000;
let database;
export function openStore(){
  if(!database)database=new Promise((resolve,reject)=>{
    const request=indexedDB.open('papermirror-jp-browser',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('jobs',{keyPath:'job_id'});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('ブラウザ保存領域を開けません。プライベートモードや容量設定を確認してください。'));
  });return database;
}
async function transaction(mode,callback){
  const db=await openStore();return new Promise((resolve,reject)=>{
    const tx=db.transaction('jobs',mode),store=tx.objectStore('jobs');let result;
    tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error||Error('ブラウザ保存に失敗しました'));tx.onabort=()=>reject(tx.error||Error('別の画面で更新されました。再読み込みしてください。'));
    callback(store,tx,value=>{result=value;});
  });
}
export async function listJobs(){
  await cleanup();return transaction('readonly',(store,_tx,set)=>{const q=store.getAll();q.onsuccess=()=>set(q.result.sort((a,b)=>b.created_at-a.created_at));});
}
export async function getJob(id){
  const job=await transaction('readonly',(store,_tx,set)=>{const q=store.get(id);q.onsuccess=()=>set(q.result);});
  if(job&&job.expires_at<=Date.now()){await deleteJob(id);return undefined;}return job;
}
export async function saveJob(job,expectedRevision=null){
  if(job.expires_at<=Date.now())throw Error('JOB_EXPIRED');
  return transaction('readwrite',(store,tx,set)=>{
    const q=store.get(job.job_id);q.onsuccess=()=>{
      if(expectedRevision===null?q.result!==undefined:q.result?.revision!==expectedRevision){tx.abort();return;}
      const next={...job,revision:(expectedRevision??-1)+1};store.put(next);set(next);
    };
  });
}
export const deleteJob=id=>transaction('readwrite',(store)=>store.delete(id));
export const deleteAll=()=>transaction('readwrite',store=>store.clear());
export async function cleanup(){return transaction('readwrite',(store)=>{const q=store.openCursor();q.onsuccess=()=>{const cursor=q.result;if(cursor){if(cursor.value.expires_at<=Date.now())cursor.delete();cursor.continue();}};});}
