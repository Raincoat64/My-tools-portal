import {startWorker,stopWorker,compute} from './worker-client.mjs';
import {listJobs,getJob,deleteJob,deleteAll,cleanup} from './store.mjs';
import {createJob,reviewJob,progress,status,getPacket,validateResponse,submit,retry,renderJob,restoreSavedJob,exportProject,importProject} from './jobs.mjs';
import {strictJSON} from './protocol.mjs';
const $=id=>document.getElementById(id);
const labels={BLOCKED:'原稿の確認が必要',REVIEW:'解析結果を確認',TRANSLATING:'翻訳待ち',READY_TO_RENDER:'生成可能',NEEDS_REVIEW:'要確認',QA_FAILED:'QA 不合格',PASS:'機械検査 PASS'};
const issues={PDF_RESOURCE_LIMIT:'原稿が処理上限を超えています。30 MB・100 ページ以下の PDF を使用してください。',PASSWORD_REQUIRED:'パスワードを確認してください。',DAMAGED_PDF:'破損した PDF は処理できません。',OCR_REQUIRED_UNSUPPORTED_V1:'スキャン原稿は対象外です。文字情報を持つ PDF を選んでください。',MIXED_PAGE_REQUIRES_REVIEW:'ページ全体の画像と文字が重なっています。',LAYOUT_COLUMNS_UNSUPPORTED:'3 段以上の組版は対象外です。',SOURCE_REGION_REQUIRES_REVIEW:'安全に文字を置換できない領域があります。',ACTIVE_OR_OPTIONAL_CONTENT_UNSUPPORTED:'フォーム・能動的な内容・切替レイヤーなどを含む PDF は対象外です。',ANNOTATIONS_UNSUPPORTED:'リンク以外の注釈やフォームを含む PDF は対象外です。',NO_TRANSLATABLE_NATIVE_TEXT:'翻訳できる英語の文字情報がありません。',LAYOUT_OVERFLOW:'訳文が元の領域に収まりません。内容を省略せず簡潔な訳に見直してください。',ANALYSIS_BLOCKED:'解析の要確認箇所を含むため、生成できません。',ANALYSIS_REVIEW_REQUIRED:'先に読み順と翻訳範囲を確認してください。',CANCELLED:'処理を中止しました。保存済みの作業から再開できます。',PDF_TIMEOUT:'処理時間の上限に達しました。小さな原稿で試してください。',JOB_EXPIRED:'この作業の保存期限が切れました。保存した作業ファイルから再開できます。',TRANSLATION_VALIDATION_FAILED:'翻訳 JSON に検証エラーがあります。下の詳細を確認してください。',VALID_TRANSLATION_IMMUTABLE_CREATE_NEW_JOB:'保存済みの合格訳は固定されています。変更する場合は新しい作業として開始してください。',RETRY_LIMIT_REACHED:'このバッチは再試行上限（2 回）に達しています。',NO_FAILED_UNITS:'このバッチの翻訳はすべて保存済みです。',PROJECT_LAYOUT_CHANGED:'作業ファイルと再解析した原稿が一致しません。',PROJECT_HASH_MISMATCH:'作業ファイル内の PDF が破損しています。',INVALID_PROJECT_TRANSLATION:'作業ファイルに不正な翻訳が含まれています。',MISSING_TRANSLATION:'すべての翻訳を保存してから生成してください。'};
Object.assign(issues,{INVALID_BATCH_HISTORY:'保存された翻訳バッチの履歴が一致しません。作業ファイルから新しい作業として再開してください。',BATCH_NOT_FOUND_OR_CHANGED:'翻訳バッチが現在の作業と一致しません。画面を再読み込みして選び直してください。'});
Object.assign(issues,{SOURCE_HASH_MISMATCH:'保存された原稿の内容が一致しません。元の PDF または作業ファイルから再開してください。',IR_STRUCTURE_MISMATCH:'保存された解析結果が原稿と一致しません。作業ファイルから新しい作業として再開してください。',SOURCE_GLYPH_UNKNOWN_UNICODE:'文字コードを確定できない字形があります。この原稿は処理できません。',SOURCE_GLYPH_COVERAGE_MISMATCH:'描画される文字と抽出した文字が一致しません。この原稿は処理できません。'});
let job=null,currentPacket=null,busy=false,ready=false,deletingAll=false,urls=new Map();
function el(tag,text,className){const item=document.createElement(tag);item.textContent=text;if(className)item.className=className;return item;}
function notice(message,error=false){$('notice').textContent=message;$('notice').className=`notice${error?' error':''}`;$('notice').hidden=false;}
function download(id,content,type='application/json',name){
  if(urls.has(id))URL.revokeObjectURL(urls.get(id));const url=URL.createObjectURL(new Blob([content],{type}));urls.set(id,url);$(id).href=url;if(name)$(id).download=name;
}
function releaseURLs(){for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();}
function step(name){for(const id of ['upload','analysis','translate','output'])$('step-'+id).classList.toggle('active',id===name);}
function sync(){
  $('analyze-pdf').disabled=busy||!ready;$('analyze-pdf').textContent=ready?'PDF を解析 →':'エンジンを準備中…';
  $('review-analysis').disabled=busy||!job||!$('analysis-ack').checked||Boolean(job.ir.blockers.length);
  $('render-pdf').disabled=busy||!job||!job.analysis_reviewed||Boolean(job?.ir.blockers.length)||progress(job).translated!==progress(job).total||!progress(job).total;
  $('preview-translated').disabled=busy||!job?.output;
}
async function run(fn){
  if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=b.id!=='cancel');
  try{await fn();}catch(e){notice(issues[e.code]||issues[e.message]||e.message||'処理に失敗しました。',true);if(e.detail){$('validation-result').hidden=false;$('validation-result').textContent=JSON.stringify(e.detail,null,2);}}
  finally{busy=false;$('activity').hidden=true;document.querySelectorAll('button').forEach(b=>b.disabled=false);sync();}
}
const bind=(id,fn)=>$(id).addEventListener('click',()=>run(fn));
function onProgress(p){$('activity').hidden=false;$('progress').value=100*p.page/p.total;notice(`${{analyze:'原稿を解析',render:'日本語 PDF を生成',qa:'生成結果を検査'}[p.phase]}しています… ${p.page} / ${p.total} ページ`);}
async function refreshJobs(){
  const jobs=await listJobs(),container=$('job-list');container.replaceChildren();
  if(!jobs.length)container.append(el('p','保存中の作業はありません。','muted small'));
  for(const saved of jobs){const p=progress(saved),b=el('button',saved.filename,'job-item'+(saved.job_id===job?.job_id?' selected':''));b.append(el('small',`${labels[status(saved)]} · ${p.translated}/${p.total}`));b.addEventListener('click',()=>run(()=>loadJob(saved.job_id)));container.append(b);}
}
async function loadJob(id){
  const loaded=await getJob(id);if(!loaded){reset();throw Error('JOB_EXPIRED');}job=await restoreSavedJob(loaded,onProgress);localStorage.setItem('papermirror-browser-job',id);
  $('upload-panel').hidden=true;$('workspace').hidden=false;$('document-name').textContent=job.filename;
  $('job-expiry').textContent=`このブラウザに保存 · 期限 ${new Date(job.expires_at).toLocaleString('ja-JP')}（起動時にも期限を確認）`;
  $('job-status').textContent=labels[status(job)];const p=progress(job),metrics=$('metrics');metrics.replaceChildren();
  for(const [value,label] of [[job.ir.pages.length,'ページ'],[p.total,'翻訳単位'],[p.translated,'保存済み'],[job.ir.blockers.length,'要確認箇所']]){const m=el('div','','metric');m.append(el('strong',String(value)),el('span',label));metrics.append(m);}
  const problems=$('analysis-issues');problems.replaceChildren();
  for(const issue of job.ir.blockers.slice(0,30))problems.append(el('div',`${issue.page?`p.${issue.page} `:''}${issues[issue.code]||issue.code} ${(issue.reasons||[]).join(', ')}`,'issue blocker'));
  if(job.ir.blockers.length>30)problems.append(el('p','残りの要確認箇所は解析データで確認できます。','muted small'));
  if(job.ir.warnings.some(w=>w.code==='RASTER_FIGURE_TEXT_NOT_TRANSLATED'))problems.append(el('div','画像に埋め込まれた文字は原文のまま保持します。','issue'));
  if(job.ir.encrypted_source)problems.append(el('div','解析用 PDF・作業ファイル・出力は暗号化されていません。パスワードは保存しません。','issue'));
  const pages=$('preview-page'),previousPage=pages.value;pages.replaceChildren();for(const page of job.ir.pages){const option=el('option',String(page.page));option.value=page.page;pages.append(option);}pages.value=Number(previousPage)<=job.ir.pages.length?previousPage||'1':'1';
  $('preview-translated').checked=false;$('analysis-ack').checked=job.analysis_reviewed;$('review-analysis').textContent=job.analysis_reviewed?'確認済み ✓':'確認して翻訳へ →';
  download('download-layout',JSON.stringify(job.ir,null,2));$('translation-panel').hidden=!job.analysis_reviewed;$('output-panel').hidden=!job.analysis_reviewed;
  const batches=$('batch-select'),previousBatch=batches.value;batches.replaceChildren();
  for(const batch of job.batches){const count=batch.unit_ids.filter(id=>job.translations[id]?.status==='OK'&&!job.translations[id]?.errors?.length).length;const option=el('option',`${batch.batch_id} · ${count}/${batch.unit_ids.length}`);option.value=batch.batch_id;batches.append(option);}
  batches.value=job.batches.some(b=>b.batch_id===previousBatch)?previousBatch:job.batches.find(b=>b.unit_ids.some(id=>job.translations[id]?.status!=='OK'||job.translations[id]?.errors?.length))?.batch_id||job.batches[0]?.batch_id||'';
  await updatePreview();await loadBatch();showQA();sync();step(status(job)==='PASS'||status(job)==='READY_TO_RENDER'?'output':job.analysis_reviewed?'translate':'analysis');await refreshJobs();
}
async function updatePreview(){
  if(!job)return;const page=Number($('preview-page').value)||1,png=await compute('preview',[$('preview-translated').checked?job.output:job.source,page]);
  if(urls.has('preview'))URL.revokeObjectURL(urls.get('preview'));const url=URL.createObjectURL(new Blob([png],{type:'image/png'}));urls.set('preview',url);$('page-preview').src=url;
  const list=$('region-list');list.replaceChildren();for(const r of job.ir.pages[page-1].regions){const li=el('li','',r.action==='preserve'?'preserved':'');li.append(el('small',`${r.action==='translate'?'翻訳':r.action==='preserve'?'原文を保持':'要確認'} · ${r.type} · ${r.region_id}`),el('span',r.text));list.append(li);}
}
function selectedBatch(){return job.batches.find(b=>b.batch_id===$('batch-select').value);}
async function loadBatch(){
  if(!selectedBatch())return;currentPacket=await getPacket(job,selectedBatch());$('batch-json').value=JSON.stringify(currentPacket,null,2);
  download('export-packet',`${currentPacket.translation_contract}\n\n${JSON.stringify(currentPacket,null,2)}`,'text/markdown');const p=progress(job);$('batch-progress').textContent=`${p.translated} / ${p.total} 保存済み`;
  const problems=selectedBatch().unit_ids.filter(id=>job.translations[id]?.errors?.length).map(id=>({unit_id:id,errors:job.translations[id].errors}));$('validation-result').hidden=!problems.length;if(problems.length)$('validation-result').textContent=JSON.stringify(problems,null,2);
}
function showQA(){
  const target=$('qa-result');target.replaceChildren();for(const id of ['download-result','download-qa','download-manifest'])$(id).hidden=true;
  if(!job.qa){const p=progress(job);target.append(el('p',`${p.translated} / ${p.total} 単位を保存済み。すべての翻訳を確認してから生成します。`,'muted'));return;}
  const qa=job.qa,grid=el('div','','qa-grid');
  for(const [name,pass] of [['翻訳・数値',qa.content?.status==='PASS'],['図表・レイアウト',qa.status==='PASS'],['はみ出し',qa.clipping_count===0]]){const cell=el('div',name,'qa-check'+(pass?'':' failed'));cell.append(el('strong',pass?'PASS':'要確認'));grid.append(cell);}target.append(grid);
  for(const issue of (qa.errors||[]).slice(0,30))target.append(el('div',`${issue.unit_id||''} ${issues[issue.code]||issue.code}`,'issue blocker'));
  download('download-qa',JSON.stringify(qa,null,2));$('download-qa').hidden=false;
  if(job.output&&qa.status==='PASS'){download('download-result',job.output,'application/pdf',job.filename.replace(/\.pdf$/i,'')+'_ja.pdf');download('download-manifest',JSON.stringify(job.manifest,null,2));$('download-result').hidden=false;$('download-manifest').hidden=false;}
}
function reset(){releaseURLs();job=null;currentPacket=null;localStorage.removeItem('papermirror-browser-job');$('workspace').hidden=true;$('upload-panel').hidden=false;$('provider-response').value='';$('notice').hidden=true;step('upload');}
bind('new-job',async()=>{reset();await refreshJobs();});bind('refresh-jobs',refreshJobs);
bind('analyze-pdf',async()=>{
  const file=$('pdf-file').files[0];if(!file)throw Error('PDF ファイルを選択してください。');
  const options={provider:$('provider').value,provider_model:$('provider-model').value||'unspecified',glossary:strictJSON($('glossary').value||'{}'),protected_terms:$('protected-terms').value.split(/\r?\n/).map(t=>t.trim()).filter(Boolean)};
  const password=$('pdf-password').value;$('pdf-password').value='';$('activity').hidden=false;
  job=await createJob(file,options,password,onProgress);$('pdf-file').value='';await loadJob(job.job_id);notice(job.ir.blockers.length?'原稿に要確認箇所があります。解析結果を確認してください。':'解析が完了しました。読み順と翻訳範囲を確認してください。',Boolean(job.ir.blockers.length));
});
$('pdf-file').onchange=()=>{$('file-label').textContent=$('pdf-file').files[0]?.name||'PDF ファイルを選ぶ';};
$('analysis-ack').onchange=sync;
bind('review-analysis',async()=>{job=await reviewJob(job);await loadJob(job.job_id);notice('パケットを翻訳 AI に渡してください。');$('translation-panel').scrollIntoView({behavior:'smooth'});});
$('preview-page').onchange=()=>run(updatePreview);$('preview-translated').onchange=()=>run(updatePreview);
$('batch-select').onchange=()=>run(async()=>{await loadBatch();$('provider-response').value='';});
bind('copy-batch',async()=>{try{await navigator.clipboard.writeText($('batch-json').value);notice('翻訳パケットをコピーしました。');}catch{$('batch-json').closest('details').open=true;$('batch-json').select();notice('コピーが許可されていません。選択されたパケットをコピーするか、ファイルとして保存してください。');}});
$('response-file').onchange=()=>run(async()=>{const file=$('response-file').files[0];if(file){if(file.size>2*1024*1024)throw Error('JSON は 2 MB 以下にしてください。');$('provider-response').value=await file.text();$('response-file').value='';}});
bind('validate-response',async()=>{const result=validateResponse(job,selectedBatch(),$('provider-response').value);$('validation-result').hidden=false;$('validation-result').textContent=JSON.stringify(result,null,2);notice(result.valid?'形式・識別子・数値を検証しました。翻訳を保存できます。':'検証エラーがあります。翻訳 JSON を確認してください。',!result.valid);});
bind('submit-response',async()=>{job=await submit(job,selectedBatch(),$('provider-response').value);await loadJob(job.job_id);notice(status(job)==='NEEDS_REVIEW'?'読み取り不確実な単位があります。未完了の単位を再試行できます。':'翻訳を保存しました。');});
bind('retry-failed',async()=>{const result=await retry(job,selectedBatch());job=result.job;await loadJob(job.job_id);$('batch-select').value=result.batch.batch_id;await loadBatch();$('provider-response').value='';notice('未完了の単位だけを新しいパケットにしました。');});
bind('render-pdf',async()=>{$('activity').hidden=false;job=await renderJob(job,onProgress);await loadJob(job.job_id);notice(job.qa.status==='PASS'?'機械検査に合格しました。日本語 PDF を保存できます。':'生成結果に要確認箇所があります。QA レポートを確認してください。',job.qa.status!=='PASS');});
bind('export-project',async()=>{const current=await getJob(job.job_id);if(!current)throw Error('JOB_EXPIRED');const url=URL.createObjectURL(new Blob([exportProject(current)],{type:'application/json'})),a=el('a','');a.href=url;a.download=job.filename.replace(/\.pdf$/i,'')+'.papermirror.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);notice('再開用の作業ファイルを保存しました。このファイルには PDF と翻訳が含まれます。');});
$('project-file').onchange=()=>run(async()=>{const file=$('project-file').files[0];if(!file)return;$('activity').hidden=false;job=await importProject(file,onProgress);$('project-file').value='';await loadJob(job.job_id);notice('作業ファイルを読み込み、原稿を再解析しました。翻訳範囲を確認して再開してください。');});
bind('delete-job',async()=>{deletingAll=false;$('delete-title').textContent='この作業を削除しますか';$('delete-dialog').showModal();});
bind('delete-all',async()=>{deletingAll=true;$('delete-title').textContent='保存した作業をすべて削除しますか';$('delete-dialog').showModal();});
bind('cancel-delete',async()=>$('delete-dialog').close());
bind('confirm-delete',async()=>{if(deletingAll)await deleteAll();else if(job)await deleteJob(job.job_id);$('delete-dialog').close();reset();await refreshJobs();notice('ブラウザ内の作業データを削除しました。');});
$('cancel').onclick=()=>{stopWorker();};
setInterval(()=>{if(!busy)run(async()=>{await cleanup();if(job&&job.expires_at<=Date.now()){reset();notice(issues.JOB_EXPIRED,true);}await refreshJobs();});},60000);
run(async()=>{
  if(!window.isSecureContext)throw Error('HTTPS の URL または localhost で開いてください。');
  await startWorker();ready=true;await refreshJobs();const id=localStorage.getItem('papermirror-browser-job');if(id)await loadJob(id);
});
