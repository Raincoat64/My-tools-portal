// e-Govの原文を順序を保って表示。外部応答をHTMLとして挿入しない。
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function plain(n){return typeof n==='string'?n:(n?.children||[]).map(plain).join('');}
function child(n,tag){return(n?.children||[]).find(c=>c?.tag===tag);}
function articleList(data) {
 const body=child(data?.law_full_text,'LawBody'),main=child(body,'MainProvision');
 const result=[];
 function walk(n,chapter='') {
  if(!n||typeof n!=='object')return;
  if(['Chapter','Section'].includes(n.tag))chapter=[chapter,plain(child(n,n.tag+'Title'))].filter(Boolean).join(' / ');
  if(n.tag==='Article')result.push({num:n.attr?.Num,title:plain(child(n,'ArticleTitle')),caption:plain(child(n,'ArticleCaption')),chapter,node:n});
  else for(const c of n.children||[])walk(c,chapter);
 }walk(main);return result;
}
function lawNode(n) {
 if(typeof n==='string')return esc(n);if(!n||typeof n!=='object')return '';
 const tag=n.tag,inside=()=> (n.children||[]).map(lawNode).join('');
 if(tag==='Fig')return '<p class="notice">図があります。図の内容はe-Gov原文で確認してください。</p>';
 if(tag==='Table')return '<div class="table-scroll"><table class="law-table">'+inside()+'</table></div>';
 if(/Table(Header)?Row/.test(tag))return '<tr>'+inside()+'</tr>';
 if(/Table(Header)?Column/.test(tag)){
  const t=tag==='TableHeaderColumn'?'th':'td';let attr='';
  for(const k of ['rowspan','colspan'])if(/^\d{1,3}$/.test(n.attr?.[k]||''))attr+=' '+k+'="'+n.attr[k]+'"';
  return '<'+t+attr+'>'+inside()+'</'+t+'>';
 }
 if(tag==='ArticleTitle')return '<h3>'+inside()+'</h3>';
 if(/(Title|Caption)$/.test(tag))return '<div class="law-label">'+inside()+'</div>';
 if(/^(Paragraph|Item|Subitem\d+|Remarks|List|TableStruct|Appdx.*|SupplProvision|NoteStruct|FormatStruct)$/.test(tag))return '<div class="law-'+(tag==='Paragraph'?'paragraph':'block')+'">'+inside()+'</div>';
 if(tag==='ParagraphNum')return '<b>'+inside()+'</b> ';
 if(tag==='Column')return '<span>'+inside()+'</span>　';
 if(tag==='Sup')return '<sup>'+inside()+'</sup>';if(tag==='Sub')return '<sub>'+inside()+'</sub>';
 if(tag==='Ruby')return '<ruby>'+inside()+'</ruby>';if(tag==='Rt')return '<rt>'+inside()+'</rt>';
 return inside();
}
const lawMemory=new Map(), lawChecks=new Map(), inflight=new Map();
let dbPromise;
function lawDb(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise(resolve=>{
  let done=false;const end=v=>{if(!done){done=true;resolve(v);}};
  setTimeout(()=>end(null),1800);
  try{const r=indexedDB.open('kouatsu-navigator-laws',1);r.onupgradeneeded=()=>r.result.createObjectStore('laws');r.onsuccess=()=>{if(done)r.result.close();else end(r.result);};r.onerror=()=>end(null);r.onblocked=()=>end(null);}catch{end(null);}
 });return dbPromise;
}
async function cacheLaw(id,data){const db=await lawDb();if(!db)return null;return new Promise(resolve=>{let finished=false;const end=v=>{if(!finished){finished=true;resolve(v);}};setTimeout(()=>end(null),1800);try{const tx=db.transaction('laws',data?'readwrite':'readonly'),store=tx.objectStore('laws');const req=data?store.put(data,id):store.get(id);req.onsuccess=()=>{if(!data)end(req.result||null);};tx.oncomplete=()=>{if(data)end(data);};tx.onerror=()=>end(null);tx.onabort=()=>end(null);}catch{end(null);}});}
function checkedLawData(data,id){
 if(!data||!data.law_full_text||data.law_info?.law_id!==id||!data.revision_info?.law_revision_id)throw new Error('法令データの形式を確認できませんでした。');
 return data;
}
async function currentLaw(id){
 if(inflight.has(id))return inflight.get(id);
 const task=(async()=>{
  lawChecks.set(id,'checking');
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
  try{
   const response=await fetch('https://laws.e-gov.go.jp/api/2/law_data/'+encodeURIComponent(id)+'?response_format=json',{signal:ctrl.signal,credentials:'omit'});
   if(!response.ok)throw new Error('HTTP '+response.status);
   const data=checkedLawData(await response.json(),id);
   data.fetchedAt=new Date().toISOString();
   data.partial=false;
   lawMemory.set(id,data);
   const revision=data.revision_info;
   lawChecks.set(id,revision.current_revision_status!=='CurrentEnforced'?'different':revision.law_revision_id===SNAPSHOTS[id]?.revision_info.law_revision_id?'match':'different');
   void cacheLaw(id,data);return data;
  }catch(error){lawChecks.set(id,'offline');throw error;}finally{clearTimeout(timer);inflight.delete(id);}
 })();inflight.set(id,task);return task;
}
async function storedLaw(id){
 if(lawMemory.has(id))return lawMemory.get(id);
 const cached=await cacheLaw(id);if(cached){try{checkedLawData(cached,id);lawMemory.set(id,cached);return cached;}catch{}}
 return SNAPSHOTS[id]||null;
}
function versionMessage(ids){
 const states=[...new Set(ids)].map(id=>lawChecks.get(id)||'unchecked');
 if(states.includes('different'))return {kind:'warning',text:'取得した法令の版が案内の確認済み版と異なります。表示中の案内は2026年9月5日確認版です。変更箇所と経過措置を原文で確認してください。'};
 if(states.includes('checking'))return {kind:'notice',text:'案内の確認済み版とe-Govの法令の版を照合しています。'};
 if(states.length&&states.every(s=>s==='match'))return {kind:'notice',text:'参照法令の版は案内の確認済み版と一致しました。自治体資料・通達の確認日は別に表示しています。'};
 if(states.includes('offline'))return {kind:'warning',text:'現在の法令の版を照合できませんでした。案内は2026年9月5日確認版です。収録条文は引き続き読めます。'};
 return {kind:'notice',text:'案内は2026年9月5日に確認した条件に基づきます。現在の法令の版は未照合です。'};
}
