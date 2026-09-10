let worker,ready,pending=null,sequence=0,initialReject=null,initialTimer=null;
export function startWorker(){
  if(worker)return ready;
  ready=new Promise((resolve,reject)=>{
    initialReject=reject;initialTimer=setTimeout(()=>stopWorker('PDF_ENGINE_LOAD_TIMEOUT'),30000);
    worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{
      if(data.ready){clearTimeout(initialTimer);initialReject=null;resolve();return;}if(!pending||data.id!==pending.id)return;
      if(data.progress){pending.onProgress?.(data.progress);return;}
      clearTimeout(pending.timer);const current=pending;pending=null;
      if(data.error)current.reject(Object.assign(Error(data.error.message),{code:data.error.code}));else current.resolve(data.result);
    };
    worker.onerror=e=>{reject(Error(e.message||'PDF エンジンを読み込めません'));stopWorker('PDF_ENGINE_FAILED');};
  });return ready;
}
export function stopWorker(reason='CANCELLED'){
  worker?.terminate();worker=null;ready=null;
  clearTimeout(initialTimer);if(initialReject){const reject=initialReject;initialReject=null;reject(Object.assign(Error(reason),{code:reason}));}
  if(pending){clearTimeout(pending.timer);pending.reject(Object.assign(Error(reason),{code:reason}));pending=null;}
}
export async function compute(action,args,onProgress){
  await startWorker();if(pending)throw Error('PDF_ENGINE_BUSY');
  return new Promise((resolve,reject)=>{
    pending={id:++sequence,resolve,reject,onProgress,timer:setTimeout(()=>stopWorker('PDF_TIMEOUT'),180000)};
    worker.postMessage({id:pending.id,action,args});
  });
}
