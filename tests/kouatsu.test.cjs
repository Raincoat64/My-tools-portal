// 実行時依存を追加せず、法的条件の境界と不明時の挙動を検証する。
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'../src/kouatsu');
function context(){const c=vm.createContext({console,setTimeout,clearTimeout,AbortController,Date,URL});
 vm.runInContext('const SNAPSHOTS = '+fs.readFileSync(path.join(root,'snapshots.json'),'utf8'),c);
 for(const f of ['classification.js','data.js','engine.js','laws.js','app.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),c,{filename:f});return c;
}
const c=context(),run=code=>vm.runInContext(code,c),plain=x=>JSON.parse(JSON.stringify(x));
const base={regime:'refrigeration',class:'second',sameClass:'yes',special:'no'};
const item={kind:'replace',designated:'no',capacitySame:'yes',refrigerantPart:'yes',hazard:'no',welding:'no',seismic:'no'};
function change(b=base,i=item){return plain(run(`evaluateChange(${JSON.stringify(b)},${JSON.stringify(i)})`));}
test('第二種の通常の同能力取替えは軽微。第一種は届出先が異なる',()=>{
 assert.equal(change().status,'minor');assert.equal(change().procedure,null);
 assert.equal(change({...base,class:'first'}).procedure,'cold-minor');
});
test('取替え条件の全組合せと第一種・第二種の差',()=>{
 for(const cls of ['first','second'])for(const same of ['yes','no'])for(const gas of ['yes','no'])for(const cut of ['yes','no'])for(const seismic of ['yes','no']){
  const r=change({...base,class:cls},{...item,capacitySame:same,hazard:gas,welding:cut,seismic});
  const expected=same==='yes'&&gas==='no'&&cut==='no'&&(cls==='second'||seismic==='no')?'minor':'regular';
  assert.equal(r.status,expected,JSON.stringify({cls,same,gas,cut,seismic}));
 }
});
test('冷媒設備以外の交換では冷媒の危険性を軽微除外の理由にしない',()=>assert.equal(change(base,{...item,refrigerantPart:'no',hazard:'yes'}).status,'minor'));
test('不明な事実を届出不要にしない',()=>{
 for(const key of ['class','sameClass','special','regime'])assert.equal(change({...base,[key]:'unknown'}).status,'review',key);
 for(const key of ['designated','capacitySame','refrigerantPart','hazard','welding'])assert.equal(change(base,{...item,[key]:'unknown'}).status,'review',key);
 assert.equal(change({...base,class:'first'},{...item,seismic:'unknown'}).status,'review');
});
test('認定指定設備の設置と撤去、認定証の有効性',()=>{
 assert.equal(change(base,{kind:'installDesignated'}).procedure,'cold-change');
 assert.equal(change({...base,class:'first'},{kind:'installDesignated'}).procedure,'cold-minor');
 assert.equal(change(base,{kind:'remove',independent:'yes',designated:'yes'}).status,'review');
 assert.equal(change(base,{kind:'remove',independent:'yes',designated:'no'}).status,'minor');
 assert.equal(change(base,{kind:'designated',certValid:'unknown'}).status,'review');
 assert.equal(change(base,{kind:'designated',certValid:'yes'}).status,'minor');
});
test('複合工事で軽微の一項目が案件全体を不要にしない',()=>{
 const summary=items=>plain(run(`summarizeChanges(${JSON.stringify(base)},${JSON.stringify(items)})`));
 assert.equal(summary([item,{...item,capacitySame:'no'}]).status,'regular');
 assert.equal(summary([item,{kind:'other'}]).status,'review');
 assert.equal(summary([]).status,'review');
});
function docs(id,answers={},region='national'){return plain(run(`documentRows(${JSON.stringify(id)},${JSON.stringify(answers)},${JSON.stringify(region)})`));}
test('冷凍第二種の書類と条件付きの認定証・移設記録',()=>{
 const ordinary=docs('cold-new',{designated:'no',relocated:'no',omission:'no'});
 assert.deepEqual(ordinary.map(x=>x.key),['form','details']);
 const special=docs('cold-new',{designated:'yes',relocated:'yes'});
 assert.equal(special.find(r=>r.key==='certificate').status,'required');
 assert.equal(special.find(r=>r.key==='history').status,'required');
 assert.equal(docs('cold-new').find(r=>r.key==='certificate').status,'conditional');
 assert.equal(docs('cold-new',{omission:'yes'}).find(r=>r.key==='details').status,'omittable');
 assert.ok(!special.some(r=>/保安教育計画|危害予防規程/.test(r.title)));
});
test('第二種の認定指定設備設置は変更明細書に代えて認定証を添付',()=>{
 const rows=docs('cold-change',{installDesignated:'yes'});
 assert.ok(!rows.some(r=>r.key==='details'));assert.equal(rows.find(r=>r.key==='certificate').status,'required');
});
test('奈良県資料を全国共通として表示しない。法人・個人と委任を切替',()=>{
 assert.ok(docs('cold-new',{},'national').every(r=>r.source==='law'));
 const nara=docs('cold-new',{entity:'person',delegate:'no'},'nara');
 assert.match(nara.find(r=>r.key==='identity').title,/住民票/);assert.ok(!nara.some(r=>r.key==='delegation'));
 assert.equal(docs('cold-change',{},'nara').find(r=>r.key==='nara-location').status,'conditional');
});
test('20日前の日付、月跨ぎ・うるう年・不正日',()=>{
 assert.equal(run(`deadlineFor('2026-10-01')`),'2026-09-11');
 assert.equal(run(`deadlineFor('2028-03-01')`),'2028-02-10');
 assert.equal(run(`deadlineFor('2026-02-30')`),null);
 assert.match(run(`PROCEDURES.find(p=>p.id==='cold-new').deadline`),/20日前/);
});
test('第二種・2種、複数キーワード、空検索',()=>{
 assert.ok(run(`searchCatalog('冷凍 第二種').some(p=>p.id==='cold-new')`));
 assert.ok(run(`searchCatalog('冷凍 2種').some(p=>p.id==='cold-new')`));
 assert.equal(run(`searchCatalog('存在しない文書').length`),0);
 assert.equal(run(`searchCatalog('').length`),run('PROCEDURES.length'));
});
test('法令本文の表、附則の分離、HTML文字列のエスケープ',()=>{
 assert.ok(run(`lawNode(articleList(SNAPSHOTS[REITOU]).find(a=>a.num==='4').node).includes('<table')`));
 assert.equal(run(`articleList(SNAPSHOTS[ACT]).filter(a=>a.num==='5').length`),1);
 assert.equal(run(`lawNode({tag:'Unknown',children:['<script>危険</script>']})`),'&lt;script&gt;危険&lt;/script&gt;');
 assert.match(run(`lawNode({tag:'Fig',attr:{src:'javascript:alert(1)'}})`),/図があります/);
 assert.ok(!run(`lawNode({tag:'Fig',attr:{src:'javascript:alert(1)'}})` ).includes('javascript:'));
});
test('初期画面・手続詳細・変更画面が全カタログで生成できる',()=>{
 assert.match(run('renderHome()'),/設備・配管を変更/);
 for(const id of run('PROCEDURES.map(p=>p.id)'))assert.ok(run(`renderProcedure('${id}')`).length>1000);
 assert.match(run('renderChange()'),/確認が必要/);
 assert.match(run('renderLaws()'),/法令・例示基準/);
});
test('区分の設問全経路で例外・欠落した結果を生じない',()=>{
 let terminals=0;
 function visit(action,category,answers={},depth=0){
  assert.ok(depth<20,'質問の循環');
  run(`Object.assign(app.classification,${JSON.stringify({action,category,answers,index:0,started:false})})`);
  const steps=plain(run('classifySteps()'));
  const step=steps.find(s=>answers[s.id]===undefined);
  if(!step||Object.values(answers).includes('unknown')){
   const result=run('classificationResult()');assert.ok(result.verdict);assert.notEqual(result.verdict,'invalid',JSON.stringify({action,category,answers,result}));
   if(Object.values(answers).includes('unknown'))assert.equal(result.verdict,'review');
   terminals++;return;
  }
  const values=step.type==='number'?['0','100','300','unknown']:[...new Set([...step.options.map(o=>o.value),'unknown'])];
  for(const v of values)visit(action,category,{...answers,[step.id]:v},depth+1);
 }
 for(const action of ['manufacture','storage','consumption','sales'])for(const category of ['general','refrigeration','lpgas'])visit(action,category);
 assert.ok(terminals>100);console.log('確認した設問終端:',terminals);
});
test('更新照合の成功、版相違、通信・保存失敗でも保存版を維持',async()=>{
 const x=context();const get=code=>vm.runInContext(code,x);
 const original=get('SNAPSHOTS[REITOU].revision_info.law_revision_id');
 x.fetch=async()=>({ok:true,json:async()=>plain(get('SNAPSHOTS[REITOU]'))});
 await get('currentLaw(REITOU)');assert.equal(get('lawChecks.get(REITOU)'),'match');
 x.fetch=async()=>({ok:true,json:async()=>{const d=plain(get('SNAPSHOTS[REITOU]'));d.revision_info.law_revision_id='new-version';return d;}});
 await get('currentLaw(REITOU)');assert.equal(get('lawChecks.get(REITOU)'),'different');
 x.fetch=async()=>{throw Error('offline');};
 await assert.rejects(get('currentLaw(REITOU)'));assert.equal(get('lawChecks.get(REITOU)'),'offline');
 assert.equal(get('SNAPSHOTS[REITOU].revision_info.law_revision_id'),original);
 assert.ok(await get('storedLaw(REITOU)'));
});
