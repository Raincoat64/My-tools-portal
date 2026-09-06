// 3つの入口から同じ手続き・書類・根拠へ接続する。
const app={region:'nara',query:'',forms:{},checks:{},change:{base:{regime:'refrigeration',class:'unknown',sameClass:'unknown',special:'unknown'},items:[{kind:'replace'}]},classification:{action:null,category:null,answers:{},index:0,started:false},law:REITOU,lawQuery:'',lawData:null};
const main=typeof document==='undefined'?null:document.getElementById('main'),dialog=typeof document==='undefined'?null:document.getElementById('evidence'),dialogBody=typeof document==='undefined'?null:document.getElementById('evidence-body');
let evidenceToken=0,routeToken=0,toastTimer;
const YESNO=[['unknown','わからない・未確認'],['yes','はい'],['no','いいえ']];
const STATUS={required:'必要',conditional:'条件により必要',omittable:'省略可能'};
const external=(url,label)=>'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a>';
const labelRef=r=>(LAWS.find(l=>l.id===r.law)?.short||'法令')+' 第'+r.num.replaceAll('_','条の')+(r.num.includes('_')?'':'条')+(r.detail?' '+r.detail:'');
function refsHtml(refs){return refs.map(r=>'<button class="ref-link" data-action="evidence" data-law="'+esc(r.law)+'" data-num="'+esc(r.num)+'">'+esc(labelRef(r))+'</button>').join('');}
function field(key,label,options,value,help='',attrs=''){
 return '<label class="field" for="'+esc(key)+'"><span>'+esc(label)+'</span><select id="'+esc(key)+'" '+attrs+'>'+options.map(([v,l])=>'<option value="'+esc(v)+'"'+(v===(value||'unknown')?' selected':'')+'>'+esc(l)+'</option>').join('')+'</select>'+(help?'<span class="help">'+esc(help)+'</span>':'')+'</label>';
}
const crumb=label=>'<div class="crumb"><a href="#home">ホーム</a> / '+esc(label)+'</div>';
function toast(text){const el=document.getElementById('toast');el.textContent=text;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,4000);}
function showDialog(title,html){evidenceToken++;document.getElementById('evidence-title').textContent=title;dialogBody.innerHTML=html;if(!dialog.open)dialog.showModal();}
function ruleStatus(ids){const v=versionMessage(ids);return '<div class="'+v.kind+' rule-status" data-law-status="'+ids.join(',')+'"><div>'+esc(v.text)+'</div><button data-action="verify" data-laws="'+ids.join(',')+'">現在の法令の版を確認</button></div>';}
function refreshStatuses(){document.querySelectorAll('[data-law-status]').forEach(el=>{const ids=el.dataset.lawStatus.split(','),v=versionMessage(ids);el.className=v.kind+' rule-status';el.firstElementChild.textContent=v.text;el.querySelector('button').disabled=ids.some(id=>lawChecks.get(id)==='checking');});}
async function verify(ids){const promises=[...new Set(ids)].filter(id=>LAWS.some(l=>l.id===id)).map(id=>currentLaw(id));refreshStatuses();await Promise.allSettled(promises);refreshStatuses();}
function autoVerify(ids){const pending=ids.filter(id=>!lawChecks.has(id));if(pending.length)void verify(pending);}
function titleBlock(eyebrow,title,description=''){return '<div class="page-head"><div class="eyebrow">'+esc(eyebrow)+'</div><h1>'+esc(title)+'</h1>'+(description?'<p class="lead">'+esc(description)+'</p>':'')+'</div>';}
function renderHome(){
 const actions=[['01','設備を新しく設置する','製造・貯蔵・消費などの区分を確認','#classify'],['02','設備・配管を変更する','交換・撤去・増設と、必要な手続き','#change'],['03','冷凍の第二種製造届を準備する','必要書類・記載事項・提出期限','#procedure/cold-new'],['04','検査・保安担当者を確認する','完成検査、保安検査、選任・解任','#procedures/検査'],['05','会社情報・事業主体を変更する','代表者・社名変更、承継、廃止','#procedure/company'],['06','設備を休止・再開する','止める設備の範囲と保安措置','#procedure/suspend']];
 return titleBlock('目的から確認','何をしたいですか？','手続名が分からなくても、設備や工事の内容から確認できます。')+
 '<div class="grid">'+actions.map(([n,t,d,u])=>'<a class="card" href="'+u+'"><span class="symbol">'+n+'</span><strong>'+t+'</strong><p>'+d+'</p></a>').join('')+'</div>'+
 '<h2 class="section-label">手続名・調べたい基準が分かる方</h2><div class="panel"><div class="quick-links"><a href="#procedures">手続き一覧・必要書類</a><a href="#laws">法令・条番号から探す</a><a href="#laws/themes">技術基準・例示基準</a><a href="#classify">製造・貯蔵・消費・販売の区分</a></div></div>'+
 '<p class="meta">書類の詳しい案内は冷凍の第二種製造届と製造施設の変更が対象です。その他の手続きは公式案内につなぎます。地域を「全国共通」にすると奈良県固有の提出案内を非表示にします。</p>';
}
function renderCatalog(){return crumb('手続き一覧')+titleBlock('手続名から確認','手続き・必要書類を探す')+'<label class="field search" for="procedure-search"><span>手続名・キーワード</span><input id="procedure-search" type="search" placeholder="例：冷凍 第二種、変更、承継" value="'+esc(app.query)+'"></label><div id="catalog-results">'+catalogResults()+'</div>';}
function catalogResults(){const list=searchCatalog(app.query);return '<p class="count" aria-live="polite">'+list.length+'件</p><div class="panel">'+(list.length?list.map(p=>'<div class="list-card"><div><a href="#procedure/'+p.id+'">'+esc(p.title)+'</a><p>'+esc(p.subtitle)+'</p></div><span class="tag '+(p.tag==='公式資料'?'secondary':'')+'">'+p.tag+'</span></div>').join(''):'<p class="empty">該当する手続きがありません。「冷凍」「変更」など短い言葉でもお試しください。</p>')+'</div>';}
function jurisdiction(p){
 if(app.region!=='nara')return '<section class="panel"><h2>提出先・様式</h2><p>事業所所在地の担当行政庁の案内を確認してください。奈良県の書類・部数・手数料は表示していません。</p>'+refsHtml(p.refs)+'</section>';
 const detail=p.id==='cold-new'?external(SOURCES.newForm,'高圧ガス製造（事業）届書（Word）')+' · '+external(SOURCES.newList,'県の添付書類一覧（Excel）'):p.id==='cold-change'?external(SOURCES.changeList,'県の添付書類一覧（Excel）'):'';
 return '<section class="panel"><h2>奈良県への提出</h2><p>'+external(SOURCES[p.source]||SOURCES.manufacture,'公式の手続案内・様式を開く')+'</p>'+(detail?'<p>'+detail+'</p>':'')+(['cold-new','cold-change','cold-permit','cold-minor'].includes(p.id)?'<p>提出部数：2部（県提出分1部、事業者保管分1部・原本不要）<br>提出方法：来庁又は郵送<br>手数料：'+(p.id==='cold-permit'?'県の手数料条例・窓口で確認':'不要')+'</p><p class="help">書類の省略・共通一覧の冷凍設備への適用や具体的な工事内容は、提出前に県の担当窓口へ相談してください。</p>':'')+'<p class="meta">県案内の確認日：2026年9月5日。最新版はリンク先を確認してください。</p></section>';
}
function docFields(p,a){
 if(p.tag!=='書類案内')return '';
 let fields='';const f=(key,label,opts=YESNO,help='')=>field('doc-'+key,label,opts,a[key],help,'data-doc-field="'+key+'"');
 if(p.id==='cold-new'){
  fields+=f('designated','認定指定設備を使用しますか？',YESNO,'「指定設備認定証」がある設備です。一般の認定品・試験成績書とは区別します。');
  fields+=f('relocated','冷媒設備の移設・転用・再使用等ですか？');
  fields+=f('omission','明細書の添付省略条件に該当しますか？',[['unknown','未確認（明細書を準備する）'],['no','通常の新設など、該当しない'],['yes','第4条第1項ただし書の条件に該当する']], '一部の事業譲渡・分割又は遺贈により引き続き製造する者の新たな届出。全部承継の届出とは区別してください。');
 }else if(p.id==='cold-change')fields+=f('installDesignated','認定指定設備の設置工事の届出ですか？');
 else if(p.id==='cold-minor')fields+=f('certMinor','認定指定設備の設置又は認定証が無効とならない変更ですか？');
 if(app.region==='nara'&&['cold-new','cold-change'].includes(p.id)){
  fields+=f('entity','届出者の区分',[['unknown','未選択'],['corporate','法人'],['person','個人']]);
  fields+=f('delegate','委任状が必要となる提出ですか？',YESNO,'県一覧では届書の代表者欄が代表取締役以外の場合に必要とされています。');
 }
 return fields?'<section class="panel no-print"><h2>書類の条件を確認</h2><p class="help">未確認でも一覧を確認できます。条件を変更すると準備済みチェックはリセットします。</p><div class="fields">'+fields+'</div>'+refsHtml(p.refs)+'</section>':'';
}
function docsHtml(p,a){
 const rows=documentRows(p.id,a,app.region),checks=app.checks[p.id]||{};
 if(!rows.length)return '';
 const groups=[['law','法令上の届書・添付書類・記載事項'],['nara','奈良県の添付書類一覧']];
 return groups.map(([group,title])=>{const list=rows.filter(r=>group==='law'?r.source==='law':r.source!=='law');if(!list.length)return '';
  return '<section class="panel"><div class="row"><h2>'+title+'</h2><span class="count">準備済み '+list.filter(r=>checks[r.key]).length+' / '+list.length+'</span></div>'+(group==='nara'?'<p class="help">県の一般則・液石則・冷凍則共通一覧から表示。明細書との重複、認定指定設備・省略特例の場合の扱いは窓口で確認してください。</p>':'')+'<ul class="checklist">'+list.map(r=>'<li class="doc-row '+(checks[r.key]?'done':'')+'"><div class="doc-main"><input type="checkbox" id="check-'+esc(r.key)+'" data-check="'+esc(r.key)+'" '+(checks[r.key]?'checked':'')+'><label for="check-'+esc(r.key)+'"><strong>'+esc(r.title)+'</strong> <span class="tag '+(r.status!=='required'?'secondary':'')+'">'+STATUS[r.status]+'</span></label></div><div class="doc-detail"><p>'+esc(r.note)+'</p>'+(r.refs.length?refsHtml(r.refs):external(r.source==='nara-new'?SOURCES.newList:SOURCES.changeList,'県の一覧で確認'))+'</div></li>').join('')+'</ul></section>';}).join('');
}
function renderProcedure(id){
 const p=PROCEDURES.find(p=>p.id===id);if(!p)return renderMissing();
 const a=app.forms[id]||{},ids=[...new Set(p.refs.map(r=>r.law))];
 const date=id==='cold-new'?'<label class="field no-print" for="doc-startDate"><span>製造開始予定日（任意）</span><input type="date" id="doc-startDate" data-doc-field="startDate" value="'+esc(a.startDate||'')+'"></label>'+(deadlineFor(a.startDate)?'<p>20日前の日付：<b>'+deadlineFor(a.startDate)+'</b></p><p class="help">暦日による目安です。閉庁日・受理日を考慮して余裕を持って提出してください。</p>':''):'';
 const headline=crumb('手続き詳細')+titleBlock(p.subtitle,p.title,p.description);
 const side='<aside class="sidebar"><div class="panel deadline"><span class="eyebrow">提出の時期</span><strong>'+esc(p.deadline||'公式案内で確認')+'</strong>'+date+'</div><div class="panel"><h2>この手続きについて</h2>'+refsHtml(p.refs)+'<a class="side-link" href="#change">変更の手続きを確認</a><a class="side-link" href="#classify">製造などの区分を確認</a><a class="side-link" href="#procedures">手続き一覧に戻る</a></div></aside>';
 const body=ruleStatus(ids)+'<p class="print-only">提出時期：'+esc(p.deadline||'公式案内で確認')+(deadlineFor(a.startDate)?' ／ 製造開始予定日：'+a.startDate+' ／ 20日前：'+deadlineFor(a.startDate):'')+'</p>'+docFields(p,a)+docsHtml(p,a)+
 (id==='cold-new'?'<details><summary>製造施設等明細書に記載する内容</summary><ol>'+DETAIL_FIELDS.map(x=>'<li>'+esc(x)+'</li>').join('')+'<li>移設等の場合は使用の経歴・保管状態の記録</li></ol><p>県の共通一覧では「製造計画書」と表記されています。冷凍則第4条の明細書と対応させて、提出資料の構成を確認してください。</p>'+refsHtml([ref(REITOU,4)])+'</details><section class="panel"><h2>製造開始後の保安</h2><p>第二種製造者にも保安教育の義務があります。第一種製造者の危害予防規程・保安教育計画と区別してください。</p><p>冷凍保安責任者や定期自主検査は、冷媒・冷凍能力・設備の条件により対象が異なります。</p>'+refsHtml([ref(ACT,27,'第4項'),ref(REITOU,36),ref(REITOU,44)])+'</section>':'')+
 (id==='cold-permit'?'<section class="panel"><h2>工事後の完成検査</h2><p>変更許可と完成検査は別の確認が必要です。特定変更工事に該当する場合は、使用前の完成検査等が必要です。冷凍則第23条の除外範囲・告示による条件を確認してください。</p>'+refsHtml([ref(ACT,20,'第3項'),ref(REITOU,23)])+'</section>':'')+
 jurisdiction(p)+standardsBox()+
 '<div class="actions"><button class="primary" data-action="print">この案内を印刷・PDF保存</button><button data-action="save">この確認を履歴に保存</button><button data-action="clear-checks">準備済みをリセット</button></div><p class="meta">書類チェックは端末内の状態です。「履歴に保存」で回答条件と一緒に保存します。工事の具体的な適否を証明する書類ではありません。</p>';
 return headline+'<div class="split">'+side+'<div>'+body+'</div></div>';
}
function standardsBox(){return '<section class="panel"><h2>技術基準・例示基準を確認</h2><p>法令の技術上の要求と、その具体例を示す例示基準を分けて確認できます。</p><div class="quick-links"><a href="#laws/themes">設備・技術テーマから探す</a>'+external(SOURCES.meti,'経済産業省の例示基準・通達一覧')+'</div></section>';}
function changeItemHtml(item,index){
 const f=(key,label,help='')=>field('item-'+index+'-'+key,label,YESNO,item[key],help,'data-item="'+index+'" data-item-field="'+key+'"');
 let fields='';
 if(item.kind==='replace'){
  fields+=f('designated','取替え対象は認定指定設備ですか？');
  fields+=f('capacitySame','当該設備の冷凍能力は変更前後で同じですか？');
  fields+=f('refrigerantPart','取替え対象は冷媒設備ですか？','冷媒ガスが通る部分に該当するか図面等で確認します。');
  if(item.refrigerantPart!=='no')fields+=f('hazard','可燃性又は毒性ガスを冷媒に使いますか？','冷媒番号だけで判断せず、冷凍則上のガス分類を確認してください。');
  fields+=f('welding','冷媒設備の切断又は溶接を伴いますか？');
  if(app.change.base.class==='first')fields+=f('seismic','取替え対象は耐震設計構造物として適用を受ける製造設備ですか？','冷凍則第7条第1項第5号に該当するか確認します。');
 }else if(item.kind==='remove'){
  fields+=f('independent','独立した製造設備の撤去だけですか？','配管改造等を含むときは別の工事として追加してください。');
  if(app.change.base.class==='second')fields+=f('designated','撤去対象は認定指定設備ですか？');
 }else if(item.kind==='ancillary')fields+=f('ancillaryConfirmed','製造設備以外の設備の取替えであることを確認しましたか？');
 else if(item.kind==='designated')fields+=f('certValid','第62条第1項ただし書の条件を満たしますか？','同等の部品への交換のみ、又は認定機関等の調査を受けて技術基準適合書の交付を受ける移設等が対象です。');
 return '<section class="panel"><div class="row"><h2><span class="number">'+String(index+1).padStart(2,'0')+'</span> 工事の内容</h2>'+(app.change.items.length>1?'<button class="quiet" data-action="remove-item" data-index="'+index+'">この工事を削除</button>':'')+'</div>'+field('item-'+index+'-kind','工事の種類',CHANGE_KINDS,item.kind,'複数の種類の工事がある場合は、工事を追加して個別に確認します。','data-item="'+index+'" data-item-field="kind"')+'<div class="fields">'+fields+'</div></section>';
}
function renderChange(){
 const base=app.change.base,summary=summarizeChanges(base,app.change.items);
 const f=(key,label,opts=YESNO,help='')=>field('base-'+key,label,opts,base[key],help,'data-base-field="'+key+'"');
 const pre=f('regime','対象施設の規則',[['unknown','わからない'],['refrigeration','冷凍・空調設備（冷凍則）'],['general','一般高圧ガス（一般則）'],['lpgas','液化石油ガス（液石則）']])+f('class','現在の製造者区分',[['unknown','わからない'],['first','第一種製造者（許可）'],['second','第二種製造者（届出）']],'許可証・届出控えで確認します。')+f('sameClass','変更後も上記の製造者区分が変わらないことを確認しましたか？',YESNO,'能力の増減や認定指定設備の認定失効などによる区分変更は別に確認します。')+f('special','認定高度保安実施者等の特別な制度・個別の取扱いがありますか？',YESNO,'試験研究施設に対する大臣の軽微認定を含みます。認定指定設備そのものは次の工事内容で確認します。');
 const results=summary.results.map((r,i)=>'<section class="panel"><div class="row"><h3>工事 '+(i+1)+'：'+esc(CHANGE_KINDS.find(([k])=>k===app.change.items[i].kind)?.[1]||'未選択')+'</h3><span class="tag '+(r.status==='review'?'secondary':'')+'">'+({review:'要確認',minor:'軽微変更',regular:'変更手続き'})[r.status]+'</span></div><p>'+esc(r.reason)+'</p>'+refsHtml(r.refs)+(r.procedure?'<p><a class="primary" href="#procedure/'+r.procedure+'" data-action="change-procedure" data-index="'+i+'">必要書類・提出時期を見る</a></p>':'')+'</section>').join('');
 const local=app.region==='nara'&&base.class==='second'&&summary.results.some(r=>r.status==='minor')?'<div class="warning"><b>奈良県の軽微変更報告は別に確認してください。</b><p>国法上の当該変更届が不要でも、県細則による報告が必要な場合があります。</p>'+external(SOURCES.manufacture,'県の変更手続案内')+'</div>':'';
 return crumb('設備・配管の変更')+titleBlock('工事内容から確認','設備を変更するときの手続き','冷凍則の第一種・第二種の代表的な変更に対応。未確認の条件は、届出不要として扱いません。')+
 '<div class="split"><aside class="sidebar"><div class="panel"><h2>確認の順序</h2><p>1. 対象施設<br>2. 工事ごとの条件<br>3. 手続き・書類</p><a href="#change-result">現在の確認結果へ</a></div><div class="panel"><h2>確認に使う資料</h2><p class="help">許可証・届出控え、変更前後の図面、機器仕様書、冷凍能力、冷媒、工事方法。</p></div></aside><div>'+ruleStatus([ACT,REITOU])+'<section class="panel"><h2>対象施設を確認</h2><div class="fields">'+pre+'</div></section>'+
 app.change.items.map(changeItemHtml).join('')+'<div class="actions no-print"><button data-action="add-item">＋ 工事を追加</button><button data-action="reset-change">回答をリセット</button></div><div id="change-result" style="scroll-margin-top:1rem;margin-top:2rem"><div class="summary '+(summary.status==='review'?'review':'')+'"><span class="eyebrow">現在の回答に基づく案内</span><h2>'+summary.title+'</h2><p>工事ごとの結果は次のとおりです。複合工事の提出方法は、関連する工事をまとめて窓口に確認してください。</p></div>'+results+local+'<div class="notice">届出の要否とは別に、変更後も技術上の基準への適合が必要です。第一種の変更許可後は完成検査の要否も確認してください。</div>'+refsHtml([ref(ACT,11),ref(ACT,12),ref(ACT,20),ref(REITOU,23)])+standardsBox()+'<div class="actions"><button class="primary" data-action="print">回答と結果を印刷・PDF保存</button><button data-action="save">この確認を履歴に保存</button></div></div></div></div>';
}
function classifySteps(){
 const c=app.classification;if(!c.action||!c.category)return [];
 const intro=[{id:'applicable',prompt:'高圧ガス保安法の適用対象であることを確認していますか？',help:'圧力・温度、設備構成、法第3条・施行令の適用除外を確認します。該当が不明なときは原文・窓口で確認してください。',type:'choice',options:[{value:'yes',label:'適用対象であることを確認済み'},{value:'unknown',label:'未確認・適用除外に該当する可能性がある'}]}];
 if(c.answers.applicable!=='yes')return intro;
 if(c.action==='manufacture')intro.push({id:'designatedScope',prompt:'認定指定設備、特別な認定・個別の取扱いはありますか？',type:'choice',options:[{value:'no',label:'ない（通常の製造区分を確認する）'},{value:'unknown',label:'ある・わからない'}]});
 if(c.action==='storage')intro.push({id:'specialGas',prompt:'第三種ガス（特殊高圧ガス）を含みますか？',help:'アルシン、ジシラン、ジボラン、セレン化水素、ホスフィン、モノゲルマン、モノシラン。',type:'choice',options:[{value:'no',label:'含まない'},{value:'unknown',label:'含む・わからない'}]});
 if((c.action==='manufacture'&&c.answers.designatedScope!=='no')||(c.action==='storage'&&c.answers.specialGas!=='no'))return intro;
 return intro.concat(getStepsForGasCategory(c.action,c.category,c.answers));
}
function classificationResult(){
 const c=app.classification,steps=classifySteps();
 if(steps.some(s=>c.answers[s.id]==='unknown')||c.answers.applicable!=='yes'||(c.action==='manufacture'&&c.answers.designatedScope!=='no')||(c.action==='storage'&&c.answers.specialGas!=='no'))return {verdict:'review',title:'区分を決めるための確認が必要です',summary:'未確認の項目や特別な取扱いがあるため、通常の能力・数量による区分を確定できません。回答内容と設備仕様を窓口に伝えてください。',citations:[{lawId:ACT,num:'3'},{lawId:ACT,num:'5'}]};
 if(steps.some(s=>s.type==='number'&&(!isKnown(c.answers[s.id])||!Number.isFinite(Number(c.answers[s.id])))))return {verdict:'review',title:'数値の確認が必要です',summary:'仕様書の処理能力・貯蔵能力を確認してください。',citations:[]};
 return evaluateDiagnosis(c.action,c.category,c.answers);
}
function renderClassification(){
 const c=app.classification;
 let html=crumb('製造・貯蔵・消費・販売の区分')+titleBlock('区分の目安を確認','設備・ガスの使い方を確認する','新設時などの区分を確認するための補助です。変更工事の手続きは「設備・配管を変更する」から確認してください。');
 if(!c.action)return html+'<div class="grid two">'+ACTION_TYPES.map(a=>'<button class="card" data-action="class-action" data-value="'+a.id+'"><strong>'+esc(a.label)+'</strong><p>'+({manufacture:'圧縮・液化・充塡・減圧等、冷凍・空調設備',storage:'ボンベやタンクで保管する',consumption:'ガスを使う',sales:'ガスを販売する'})[a.id]+'</p></button>').join('')+'</div>';
 if(!c.category)return html+'<div class="panel"><h2>'+ACTION_TYPES.find(a=>a.id===c.action).label+'：ガス・設備の区分</h2><div class="question-options">'+getCategoriesForAction(c.action).map(g=>'<button data-action="class-category" data-value="'+g.id+'">'+esc(g.label)+'<span>'+esc(g.help)+'</span></button>').join('')+'</div><div class="actions"><button data-action="class-reset">行為から選び直す</button></div></div>';
 const steps=classifySteps(),done=c.started&&c.index>=steps.length;
 const answers=steps.slice(0,c.index).map((s,i)=>'<div class="answer-item"><b>'+esc(s.prompt)+'</b>'+esc(s.options?.find(o=>o.value===c.answers[s.id])?.label??c.answers[s.id]??'未回答')+'<br><button data-action="class-back" data-index="'+i+'">変更する</button></div>').join('');
 let body='';
 if(done){const r=classificationResult();body='<div class="summary '+(['review','invalid'].includes(r.verdict)?'review':'')+'"><h2>'+esc(r.title||'確認が必要です')+'</h2><p>'+esc(r.summary||r.message||'')+'</p></div>'+(r.note?'<div class="notice">'+esc(r.note)+'</div>':'')+refsHtml((r.citations||[]).map(x=>ref(x.lawId,x.num)))+'<p class="help">通常の区分の目安です。ガス・設備構成・用途による例外や別の手続きがないかも確認してください。</p>'+
 (c.action==='manufacture'&&c.category==='refrigeration'&&r.verdict==='notification'?'<a class="primary" href="#procedure/cold-new">冷凍・第二種製造届の必要書類を見る</a>':'<a class="primary" href="#procedure/'+c.action+'">関係する手続き・公式案内を見る</a>')+
 '<div class="actions"><button data-action="class-reset">最初から確認する</button><button data-action="save">この確認を履歴に保存</button><button data-action="print">印刷・PDF保存</button></div>';
 }else{
  const s=steps[c.index]||steps[0];body='<section class="panel"><div class="progress">'+esc(ACTION_TYPES.find(a=>a.id===c.action).label)+' / <b>質問 '+(c.index+1)+'</b></div><h2>'+esc(s.prompt)+'</h2>'+(s.help?'<p class="help">'+esc(s.help)+'</p>':'');
  if(s.type==='number')body+='<form id="class-number-form"><label class="field" for="class-number"><span>'+esc(s.unit||s.label||'数値')+'</span><input id="class-number" type="number" min="0" step="any" required value="'+esc(c.answers[s.id]||'')+'"></label><button class="primary" type="submit">この数値で進む</button></form>';
  else body+='<div class="question-options">'+(s.options||[]).map(o=>'<button data-action="class-answer" data-value="'+esc(o.value)+'">'+esc(o.label)+(o.help?'<span>'+esc(o.help)+'</span>':'')+'</button>').join('')+'</div>';
  if(!s.options?.some(o=>o.value==='unknown'))body+='<div class="actions"><button data-action="class-answer" data-value="unknown">わからない・資料を確認したい</button></div>';
  body+='<div class="actions"><button data-action="class-back" data-index="'+Math.max(0,c.index-1)+'">前の質問へ</button><button data-action="class-reset">最初から</button></div></section>';
 }
 return html+'<div class="split"><aside class="sidebar"><div class="panel"><h2>回答した内容</h2>'+(answers||'<p class="help">回答がここに表示されます。</p>')+'</div></aside><div>'+body+'</div></div>';
}
function answerClass(value){const c=app.classification,step=classifySteps()[c.index];if(!step)return;c.answers[step.id]=value;c.index++;c.started=true;if(value==='unknown')c.index=classifySteps().length;render(false);}
function renderLaws(themes=false){
 return crumb('法令・例示基準')+titleBlock('原文・基準から確認','法令・例示基準を調べる','収録条文は通信なしでも表示できます。全文の取得や最新版の確認にはインターネット接続が必要です。')+
 '<div class="panel"><div class="law-selection"><label class="field" for="law-select"><span>法令</span><select id="law-select">'+LAWS.map(l=>'<option value="'+l.id+'"'+(l.id===app.law?' selected':'')+'>'+l.name+'</option>').join('')+'</select></label><label class="field" for="law-search"><span>条番号・見出し・本文の言葉</span><input type="search" id="law-search" placeholder="例：19、14の2、耐圧" value="'+esc(app.lawQuery)+'"></label></div><div class="row"><span id="law-meta" class="meta"></span><button data-action="law-refresh">e-Govから現在の全文を取得</button></div></div><div id="law-results" class="panel article-list"><p>収録条文を読み込んでいます…</p></div>'+
 '<section id="themes"><h2 class="section-label">設備・技術テーマから探す</h2><div class="grid two">'+THEMES.map((t,i)=>'<button class="card" data-action="theme" data-index="'+i+'"><strong>'+esc(t.title)+'</strong><p>'+esc(t.description)+'</p></button>').join('')+'</div><h2 class="section-label">例示基準・運用解釈</h2><div class="panel"><p>経済産業省の掲載ページで、対象の規則の「機能性基準の運用について」を開いてください。</p><div class="quick-links">'+['一般高圧ガス保安規則','液化石油ガス保安規則','冷凍保安規則','容器保安規則'].map(name=>'<button data-action="standard" data-name="'+name+'">'+name+'</button>').join('')+'</div><p>'+external(SOURCES.meti,'例示基準・基本通達の掲載ページ')+'</p><p class="help">例示基準は法令の機能性基準への適合例です。原文の条項と例示基準の該当箇所を合わせて確認してください。最新版PDFの個別項目・ページ対応は未収録です。</p></div></section>';
}
function renderLawList(){
 const el=document.getElementById('law-results');if(!el||!app.lawData)return;
 const d=app.lawData,info=d.revision_info,query=app.lawQuery.normalize('NFKC').trim(),num=query.replace(/^第/,'').replace(/条/g,'').replace(/の|-/g,'_');
 const rows=articleList(d).filter(a=>!query||a.num===num||plain(a.node).includes(query));
 document.getElementById('law-meta').textContent=(d.partial?'収録した一部の条文':'取得済みの法令全文')+' ／ 施行日：'+(info.amendment_enforcement_date||'確認できません')+' ／ 取得日：'+String(d.fetchedAt||'').slice(0,10);
 el.innerHTML='<p class="count">'+rows.length+'条'+(d.partial?'（収録範囲内）':'')+'</p>'+(rows.length?rows.map(a=>'<button class="article-button" data-action="evidence" data-law="'+app.law+'" data-num="'+esc(a.num)+'">'+esc(a.title)+' '+esc(a.caption)+'<span>'+esc(a.chapter)+'</span></button>').join(''):'<p class="empty">該当する収録条文がありません。全文を取得するか、e-Gov原文を確認してください。</p>')+
 (!d.partial?'<details><summary>附則・別表・様式等を表示</summary>'+((child(d.law_full_text,'LawBody')?.children||[]).filter(n=>n?.tag&&!['MainProvision','LawTitle','TOC','Preamble'].includes(n.tag)).map(lawNode).join('')||'<p>附則等はありません。</p>')+'</details>':'')+'<p>'+external('https://laws.e-gov.go.jp/law/'+app.law,'e-Gov原文を開く')+'</p>';
}
async function loadLawPage(refresh=false){const token=routeToken,id=app.law;const button=document.querySelector('[data-action="law-refresh"]');if(button)button.disabled=true;
 try{const data=refresh?await currentLaw(id):await storedLaw(id);if(routeToken!==token||id!==app.law)return;app.lawData=data;renderLawList();if(refresh)toast('法令全文を取得しました。案内の判定条件は別に管理しています。');}
 catch{if(routeToken===token)toast('現在の全文を取得できませんでした。収録条文・取得済み条文をご利用ください。');}
 finally{if(routeToken===token&&button)button.disabled=false;refreshStatuses();}
}
async function openEvidence(law,num,refresh=false){
 const meta=LAWS.find(l=>l.id===law);if(!meta)return;
 if(!refresh)showDialog(meta.short+' 第'+num.replaceAll('_','条の')+(num.includes('_')?'':'条'),'<p>条文を読み込んでいます…</p>');
 const token=++evidenceToken;
 try{
  const data=refresh?await currentLaw(law):await storedLaw(law);if(token!==evidenceToken)return;
  const article=articleList(data).find(a=>a.num===num),revision=data.revision_info;
  const same=revision.law_revision_id===SNAPSHOTS[law]?.revision_info.law_revision_id;
  dialogBody.innerHTML='<p class="tag">法令原文</p><p class="meta">'+esc(meta.name)+' ／ 施行日：'+esc(revision.amendment_enforcement_date||'未確認')+'<br>取得日：'+esc(String(data.fetchedAt||'').slice(0,10))+'<br>法令改正ID：'+esc(revision.law_revision_id)+'</p>'+(!same?'<div class="warning">案内の確認済み版と異なる法令本文です。条件・例外・経過措置を確認してください。</div>':'<p class="help">案内と同じ確認済み版の条文です。現在の法令の版との照合状況は案内画面に表示します。</p>')+
   '<div class="actions"><button data-action="refresh-evidence" data-law="'+law+'" data-num="'+esc(num)+'">現在の原文を取得</button>'+external('https://laws.e-gov.go.jp/law/'+law+'#Mp-At_'+num,'e-Govで開く')+'</div>'+(article?'<div class="law-text">'+lawNode(article.node)+'</div>':'<div class="notice">この条は保存版に収録されていません。「現在の原文を取得」又はe-Govで確認してください。</div>');
 }catch{if(token===evidenceToken)dialogBody.insertAdjacentHTML('afterbegin','<div class="warning">現在の条文を取得できませんでした。'+external('https://laws.e-gov.go.jp/law/'+law,'e-Govで確認')+'</div>');}refreshStatuses();
}
function renderMissing(){return titleBlock('ページの確認','該当するページがありません')+'<a href="#home">ホームへ戻る</a>';}
function route(){return location.hash.slice(1).split('/');}
function render(moveFocus=true){
 const [page='',id]=route();routeToken++;
 const active=document.activeElement?.id,scroll=window.scrollY;
 if(page==='procedure')main.innerHTML=renderProcedure(id);
 else if(page==='procedures'){if(id){try{app.query=decodeURIComponent(id);}catch{app.query='';}}main.innerHTML=renderCatalog();}
 else if(page==='change'||page==='change-result')main.innerHTML=renderChange();
 else if(page==='classify')main.innerHTML=renderClassification();
 else if(page==='laws'){main.innerHTML=renderLaws(id==='themes');void loadLawPage();}
 else if(page==='home'||!page)main.innerHTML=renderHome();else main.innerHTML=renderMissing();
 document.querySelectorAll('[data-nav]').forEach(el=>{const match=el.dataset.nav===(page==='laws'?'laws':['procedure','procedures'].includes(page)?'procedures':'home');if(match)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
 if(moveFocus){main.focus({preventScroll:true});window.scrollTo(0,0);}else{if(active)document.getElementById(active)?.focus({preventScroll:true});window.scrollTo(0,scroll);}
 if(page==='procedure'){const p=PROCEDURES.find(p=>p.id===id);if(p)autoVerify([...new Set(p.refs.map(r=>r.law))]);}
 if(page==='change'||page==='change-result')autoVerify([ACT,REITOU]);
 if(page==='change-result')document.getElementById('change-result')?.scrollIntoView();
 if(page==='laws'&&id==='themes')document.getElementById('themes')?.scrollIntoView();
}
function historyEntries(){try{const raw=localStorage.getItem('kouatsu-navigator-history');if(!raw||raw.length>200000)return [];const parsed=JSON.parse(raw);return Array.isArray(parsed)?parsed.filter(e=>e&&typeof e.title==='string'&&typeof e.route==='string'&&e.version===VERSION).slice(0,20):[];}catch{return [];}}
function saveHistory(){
 const [page,id]=route();if(!['procedure','change','change-result','classify'].includes(page)){toast('手続き詳細又は確認結果を開いて保存してください。');return;}
 const title=page==='procedure'?PROCEDURES.find(p=>p.id===id)?.title:page==='classify'?'区分の確認':'設備変更の確認';
 const entry={version:VERSION,date:new Date().toISOString(),title,route:location.hash,region:app.region,forms:app.forms,checks:app.checks,change:app.change,classification:app.classification};
 try{localStorage.setItem('kouatsu-navigator-history',JSON.stringify([entry,...historyEntries()].slice(0,20)));toast('この端末に保存しました。');}catch{toast('この環境では履歴を保存できません。印刷・PDF保存をご利用ください。');}
}
function showHistory(){const entries=historyEntries();showDialog('この端末の照会履歴','<p class="help">保存した回答は、開く時点のツールの条件で再計算します。別の端末には送信しません。</p>'+(entries.length?entries.map((e,i)=>'<div class="list-card"><div><b>'+esc(e.title)+'</b><p>'+esc(e.date.slice(0,16).replace('T',' '))+' ／ '+(e.region==='nara'?'奈良県':'全国共通')+'</p></div><button data-action="restore" data-index="'+i+'">開く</button></div>').join('')+'<div class="actions"><button data-action="clear-history">保存した履歴をすべて削除</button></div>':'<p class="empty">保存した履歴はありません。</p>'));}
if(typeof document!=='undefined'){
document.addEventListener('click',async event=>{
 const el=event.target.closest('[data-action]');if(!el)return;const a=el.dataset.action;
 if(a==='close-dialog'){evidenceToken++;dialog.close();}
 else if(a==='evidence')void openEvidence(el.dataset.law,el.dataset.num);
 else if(a==='refresh-evidence'){el.disabled=true;await openEvidence(el.dataset.law,el.dataset.num,true);el.disabled=false;}
 else if(a==='verify')void verify(el.dataset.laws.split(','));
 else if(a==='change-procedure'){const item=app.change.items[Number(el.dataset.index)],r=evaluateChange(app.change.base,item);if(r.procedure){app.forms[r.procedure]??={};if(r.procedure==='cold-change')app.forms[r.procedure].installDesignated=item.kind==='installDesignated'?'yes':'no';if(r.procedure==='cold-minor')app.forms[r.procedure].certMinor=['installDesignated','designated'].includes(item.kind)?'yes':'no';app.checks[r.procedure]={};}}
 else if(a==='law-refresh')void loadLawPage(true);
 else if(a==='print')window.print();
 else if(a==='history')showHistory();
 else if(a==='save')saveHistory();
 else if(a==='clear-history'){try{localStorage.removeItem('kouatsu-navigator-history');showHistory();}catch{toast('保存領域にアクセスできませんでした。');}}
 else if(a==='restore'){
  const e=historyEntries()[Number(el.dataset.index)];if(!e)return;
  if(!e.forms||!e.checks||!Array.isArray(e.change?.items)||e.change.items.length>20||!e.classification?.answers){toast('保存内容を読み取れませんでした。');return;}
  Object.assign(app,{region:e.region==='nara'?'nara':'national',forms:e.forms,checks:e.checks,change:e.change,classification:e.classification});document.getElementById('region').value=app.region;dialog.close();if(location.hash===e.route)render();else location.hash=e.route;
 }
 else if(a==='clear-checks'){app.checks[route()[1]]={};render(false);}
 else if(a==='add-item'){if(app.change.items.length>=20){toast('工事は20件まで追加できます。');return;}app.change.items.push({kind:'replace'});render(false);}
 else if(a==='remove-item'){app.change.items.splice(Number(el.dataset.index),1);render(false);}
 else if(a==='reset-change'){app.change={base:{regime:'refrigeration',class:'unknown',sameClass:'unknown',special:'unknown'},items:[{kind:'replace'}]};render(false);}
 else if(a==='class-reset'){app.classification={action:null,category:null,answers:{},index:0,started:false};render();}
 else if(a==='class-action'){Object.assign(app.classification,{action:el.dataset.value,category:null,answers:{},index:0,started:false});render();}
 else if(a==='class-category'){Object.assign(app.classification,{category:el.dataset.value,answers:{},index:0,started:false});render();}
 else if(a==='class-answer')answerClass(el.dataset.value);
 else if(a==='class-back'){const c=app.classification,i=Number(el.dataset.index);for(const s of classifySteps().slice(i))delete c.answers[s.id];c.index=i;c.started=false;render(false);}
 else if(a==='theme'){const t=THEMES[Number(el.dataset.index)];if(t)showDialog(t.title,'<p>'+esc(t.description)+'</p><h3>法令上の要求・条件</h3>'+refsHtml(t.refs)+'<h3>関連する例示基準</h3><p>冷凍保安規則の機能性基準の運用についてを確認してください。設備の区分と、参照する条項を照合します。</p>'+external(SOURCES.meti,'公式の例示基準・通達一覧'));}
 else if(a==='standard')showDialog(el.dataset.name+'の例示基準','<p>経済産業省の掲載ページで「'+esc(el.dataset.name)+'の機能性基準の運用について」を選んでください。</p><p>PDFの現行版、対象条項、項目名を確認します。PDF全文と個別ページ索引はこのHTMLには内包していません。</p>'+external(SOURCES.meti,'経済産業省の掲載ページを開く'));
 else if(a==='about')showDialog('収録範囲・更新','<p><b>高圧ガス 手続き・基準ナビ v'+VERSION+'</b><br>案内の確認日：'+REVIEW_DATE+'</p><h3>書類・変更案内</h3><p>冷凍の第二種製造届、冷凍の第一種・第二種製造施設の代表的な変更。一般則・液石則等の変更は公式資料案内。個別認定・経過措置等は確認対象として扱います。</p><h3>区分の目安</h3><p>製造・貯蔵・消費・販売の既存算定機能を継承。特別な条件や不明な回答は区分を確定しません。</p><h3>法令・資料</h3><p>法律・施行令・4省令の一部条文を収録。現在の全文はe-Govから取得します。案内の条件は本文の更新だけでは変わりません。過去時点や将来の施行・経過措置を含む判断は原文を確認してください。</p><p>奈良県資料は2026年9月5日に確認。例示基準は経済産業省の掲載ページへ案内します。公式の該非判断・申請の代行は行いません。</p><h3>保存</h3><p>回答は「履歴に保存」でこの端末のブラウザ内に保存。法令は取得時に端末内へ保存を試みます。保存できない環境でも案内を使えます。配布HTMLを移動した場合、履歴は引き継がれないことがあります。</p><p>'+external('https://github.com/Raincoat64/My-tools-portal','配布元・更新情報')+'</p>');
});
document.addEventListener('change',event=>{
 const el=event.target;
 if(el.id==='region'){app.region=el.value;app.checks={};render(false);return;}
 if(el.dataset.docField){const id=route()[1];app.forms[id]??={};app.forms[id][el.dataset.docField]=el.value;app.checks[id]={};render(false);}
 if(el.dataset.check){const id=route()[1];app.checks[id]??={};app.checks[id][el.dataset.check]=el.checked;render(false);}
 if(el.dataset.baseField){app.change.base[el.dataset.baseField]=el.value;render(false);}
 if(el.dataset.itemField){const item=app.change.items[Number(el.dataset.item)];if(el.dataset.itemField==='kind')app.change.items[Number(el.dataset.item)]={kind:el.value};else item[el.dataset.itemField]=el.value;render(false);}
 if(el.id==='law-select'){app.law=el.value;app.lawData=null;app.lawQuery='';render(false);}
});
document.addEventListener('input',event=>{const el=event.target;if(el.id==='procedure-search'){app.query=el.value;document.getElementById('catalog-results').innerHTML=catalogResults();}if(el.id==='law-search'){app.lawQuery=el.value;renderLawList();}});
document.addEventListener('submit',event=>{if(event.target.id==='class-number-form'){event.preventDefault();const input=document.getElementById('class-number');if(input.value.trim()===''||!Number.isFinite(Number(input.value))||Number(input.value)<0){toast('0以上の数値を入力してください。');return;}answerClass(input.value);}});
dialog.addEventListener('close',()=>evidenceToken++);
window.addEventListener('hashchange',()=>render());
window.addEventListener('beforeprint',()=>{
 document.getElementById('print-conditions')?.remove();
 const values=[...main.querySelectorAll('select,input[type=date]')].map(el=>{
  const label=main.querySelector('label[for="'+el.id+'"]>span')?.textContent||el.id;
  const value=el.tagName==='SELECT'?el.selectedOptions[0]?.textContent:el.value;
  return value?'<li>'+esc(label)+'：'+esc(value)+'</li>':'';
 }).join('');
 const block=document.createElement('div');block.id='print-conditions';block.className='print-only panel';
 block.innerHTML='<h2>確認時の条件</h2><p>対象地域：'+(app.region==='nara'?'奈良県':'全国共通の法令のみ')+' ／ 案内の確認日：'+REVIEW_DATE+'</p>'+(values?'<ul>'+values+'</ul>':'');
 main.prepend(block);
});
render(false);
}
