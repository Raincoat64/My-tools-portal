import {analyze,render,preview} from './pdf-engine.mjs';
self.postMessage({ready:true});
self.onmessage=async({data})=>{
  const {id,action,args}=data;
  try{
    const progress=value=>self.postMessage({id,progress:value});
    const result=action==='analyze'?await analyze(...args,progress):action==='render'?await render(...args,progress):action==='preview'?preview(...args):null;
    if(result===null)throw Error('Unknown worker operation');
    self.postMessage({id,result});
  }catch(e){self.postMessage({id,error:{code:e.code||'PDF_PROCESSING_FAILED',message:e.message}});}
};
