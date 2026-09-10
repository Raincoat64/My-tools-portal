import {validateOptions,validateResult,validateUnit,buildBatches,packet,strictJSON,POLICY_VERSION} from './protocol.mjs';
import {compute} from './worker-client.mjs';
import {saveJob,TTL} from './store.mjs';
import {ENGINE} from './engine-version.mjs';
export const MAX_FILE=30*1024*1024;
export const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
const verifiedResults=new Map();
async function resultKey(job){return hash(new TextEncoder().encode(JSON.stringify({...job,source:await hash(job.source),output:job.output?await hash(job.output):null})));}
async function isVerified(job){return job.qa?.status==='PASS'&&job.output&&verifiedResults.get(job.job_id)===await resultKey(job);}
// Only results computed in this page session may use the fast path. IndexedDB is a checkpoint,
// never an authority for a PASS: a reopened result is generated and checked again before display.
export async function restoreSavedJob(job,onProgress){return job.qa?.status==='PASS'?renderJob(job,onProgress):job;}
function resolveBatch(job,batch){
  const roots=buildBatches(job.ir,validateOptions(job.options)),stored=job.batches;
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  if(!Array.isArray(stored)||stored.length>roots.length*3||!same(stored.filter(b=>!b.retry_of),roots))throw Error('INVALID_BATCH_HISTORY');
  const seen=new Set(),counts=new Map();
  for(const item of stored){
    if(seen.has(item.batch_id))throw Error('INVALID_BATCH_HISTORY');seen.add(item.batch_id);
    if(!item.retry_of)continue;
    const root=roots.find(b=>b.batch_id===item.retry_of),count=(counts.get(item.retry_of)||0)+1;counts.set(item.retry_of,count);
    if(!root||count>2||item.batch_id!==`retry-${root.batch_id}-${count}`||!Array.isArray(item.unit_ids)||!item.unit_ids.length||!same(root.unit_ids.filter(id=>item.unit_ids.includes(id)),item.unit_ids)||!same(Object.keys(item).sort(),['batch_id','retry_of','unit_ids']))throw Error('INVALID_BATCH_HISTORY');
  }
  const resolved=stored.find(b=>b.batch_id===batch?.batch_id);
  if(!resolved||!same(resolved,batch))throw Error('BATCH_NOT_FOUND_OR_CHANGED');return resolved;
}
function assertReady(job){if(job.expires_at<=Date.now())throw Error('JOB_EXPIRED');if(job.ir.blockers.length)throw Error('ANALYSIS_BLOCKED');if(!job.analysis_reviewed)throw Error('ANALYSIS_REVIEW_REQUIRED');}
export function progress(job){return {total:job.ir.units.length,translated:job.ir.units.filter(u=>job.translations[u.unit_id]?.status==='OK'&&!job.translations[u.unit_id]?.errors?.length).length};}
export function status(job){if(job.qa)return job.qa.status;const p=progress(job);if(job.ir.blockers.length)return 'BLOCKED';if(!job.analysis_reviewed)return 'REVIEW';if(p.translated===p.total&&p.total)return 'READY_TO_RENDER';if(Object.values(job.translations).some(t=>t.errors?.length||t.status!=='OK'))return 'NEEDS_REVIEW';return 'TRANSLATING';}
export async function createJob(file,options,password,onProgress){
  if(file.size>MAX_FILE)throw Error('PDF_RESOURCE_LIMIT');options=validateOptions(options);
  const bytes=new Uint8Array(await file.arrayBuffer()),result=await compute('analyze',[bytes,options,password],onProgress);
  const job={format:'papermirror-browser-v1',job_id:crypto.randomUUID(),document_id:`doc-${crypto.randomUUID()}`,filename:file.name,created_at:Date.now(),expires_at:Date.now()+TTL,options,source:result.working,source_hash:await hash(result.working),ir:result.ir,translations:{},batches:buildBatches(result.ir,options),analysis_reviewed:false,qa:null,output:null,manifest:null};
  return saveJob(job);
}
export async function reviewJob(job){if(job.ir.blockers.length)throw Error('ANALYSIS_BLOCKED');return saveJob({...job,analysis_reviewed:true},job.revision);}
export async function getPacket(job,batch){return packet(job,resolveBatch(job,batch));}
export function validateResponse(job,batch,raw){assertReady(job);batch=resolveBatch(job,batch);if(new TextEncoder().encode(raw).length>2*1024*1024)throw Error('JSON_TOO_LARGE');return validateResult(raw,job,batch);}
export async function submit(job,batch,raw){
  assertReady(job);const checked=validateResponse(job,batch,raw);
  if(!checked.valid)throw Object.assign(Error('TRANSLATION_VALIDATION_FAILED'),{detail:checked});
  const translations={...job.translations};let changed=false;
  for(const t of checked.translations){
    const old=translations[t.unit_id];
    if(old?.status==='OK'&&!old.errors?.length&&old.ja!==t.ja)throw Error('VALID_TRANSLATION_IMMUTABLE_CREATE_NEW_JOB');
    if(old?.status===t.status&&old.ja===t.ja)continue;
    const checkedUnit=validateUnit(job.ir.units.find(u=>u.unit_id===t.unit_id),t);
    translations[t.unit_id]={...t,restored:checkedUnit.restored,errors:checkedUnit.errors};changed=true;
  }
  if(!changed)return job;
  return saveJob({...job,translations,qa:null,output:null,manifest:null},job.revision);
}
export async function retry(job,batch){
  assertReady(job);batch=resolveBatch(job,batch);const ids=batch.unit_ids.filter(id=>job.translations[id]?.status!=='OK'||job.translations[id]?.errors?.length);
  if(!ids.length)throw Error('NO_FAILED_UNITS');
  const root=batch.retry_of||batch.batch_id,retries=job.batches.filter(b=>b.retry_of===root);if(retries.length>=2)throw Error('RETRY_LIMIT_REACHED');
  const next={batch_id:`retry-${root}-${retries.length+1}`,unit_ids:ids,retry_of:root};
  return {job:await saveJob({...job,batches:[...job.batches,next]},job.revision),batch:next};
}
export async function renderJob(job,onProgress){
  assertReady(job);if(progress(job).translated!==progress(job).total)throw Error('MISSING_TRANSLATION');
  if(await hash(job.source)!==job.source_hash)throw Error('PROJECT_HASH_MISMATCH');
  if(await isVerified(job))return job;
  const result=await compute('render',[job.source,job.ir,job.translations],onProgress);
  if(result.qa.status==='PASS'&&job.qa?.status==='PASS'&&job.output&&await hash(result.output)===await hash(job.output)&&JSON.stringify(result.qa)===JSON.stringify(job.qa)&&job.manifest?.output_sha256===await hash(result.output)){
    verifiedResults.set(job.job_id,await resultKey(job));return job;
  }
  const translations={...job.translations};
  for(const error of result.qa.errors||[])if(error.unit_id)translations[error.unit_id]={...translations[error.unit_id],errors:[error.code]};
  const manifest=result.output?{schema_version:1,document_id:job.document_id,filename:job.filename,created_at:new Date().toISOString(),policy_version:POLICY_VERSION,engine:ENGINE,source_sha256:job.ir.source_sha256,working_sha256:job.source_hash,output_sha256:await hash(result.output),provider:job.options.provider,provider_model:job.options.provider_model,semantic_fidelity:'NOT_AUTOMATICALLY_VERIFIED',execution:'browser Web Worker; no PDF upload endpoint',options:job.options}:null;
  const saved=await saveJob({...job,translations,qa:result.qa,output:result.output||null,manifest},job.revision);
  if(saved.qa.status==='PASS')verifiedResults.set(saved.job_id,await resultKey(saved));return saved;
}
export function exportProject(job){
  // Deliberately omit trusted IR, computed PASS, output and password. Import reanalyzes the PDF.
  const bytes=new Uint8Array(job.source);let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
  return JSON.stringify({format:'papermirror-browser-project',version:1,engine_version:ENGINE.version,document_id:job.document_id,filename:job.filename,options:job.options,source_sha256:job.source_hash,pdf_base64:btoa(binary),translations:Object.values(job.translations).map(t=>({unit_id:t.unit_id,status:t.status,ja:t.ja})),unit_sources:job.ir.units.map(u=>({unit_id:u.unit_id,source_hash:u.source_hash})),batches:job.batches},null,2);
}
export async function importProject(file,onProgress){
  if(file.size>65*1024*1024)throw Error('PROJECT_TOO_LARGE');const data=strictJSON(await file.text());
  if(data.format!=='papermirror-browser-project'||data.version!==1||data.engine_version!==ENGINE.version||typeof data.pdf_base64!=='string'||data.pdf_base64.length>MAX_FILE*1.4||!/^[A-Za-z0-9+/]*={0,2}$/.test(data.pdf_base64))throw Error('INVALID_PROJECT');
  if(typeof data.document_id!=='string'||!/^doc-[a-f0-9-]{36}$/.test(data.document_id)||typeof data.filename!=='string'||data.filename.length>300)throw Error('INVALID_PROJECT');
  const options=validateOptions(data.options),bytes=Uint8Array.from(atob(data.pdf_base64),c=>c.charCodeAt(0));if(await hash(bytes)!==data.source_sha256)throw Error('PROJECT_HASH_MISMATCH');
  const result=await compute('analyze',[bytes,options,''],onProgress);
  if(JSON.stringify(result.ir.units.map(u=>({unit_id:u.unit_id,source_hash:u.source_hash})))!==JSON.stringify(data.unit_sources))throw Error('PROJECT_LAYOUT_CHANGED');
  if(!Array.isArray(data.translations)||data.translations.length>result.ir.units.length)throw Error('INVALID_PROJECT');
  const translations={},seen=new Set();
  for(const t of data.translations){
    if(seen.has(t.unit_id))throw Error('DUPLICATE_UNIT');seen.add(t.unit_id);
    const unit=result.ir.units.find(u=>u.unit_id===t.unit_id);if(!unit)throw Error('UNKNOWN_UNIT');
    const checked=validateUnit(unit,t);if(t.status==='OK'&&!checked.valid)throw Error('INVALID_PROJECT_TRANSLATION');
    if(!['OK','SOURCE_UNCERTAIN','CANNOT_TRANSLATE'].includes(t.status)||(t.status!=='OK'&&t.ja!==null))throw Error('INVALID_PROJECT_TRANSLATION');
    translations[t.unit_id]={...t,errors:checked.errors,restored:checked.restored};
  }
  // Fresh batches and review are intentional: imported checkpoints cannot authorize PDF generation.
  return saveJob({format:'papermirror-browser-v1',job_id:crypto.randomUUID(),document_id:data.document_id,filename:data.filename,created_at:Date.now(),expires_at:Date.now()+TTL,options,source:result.working,source_hash:await hash(result.working),ir:result.ir,translations,batches:buildBatches(result.ir,options),analysis_reviewed:false,qa:null,output:null,manifest:null});
}
