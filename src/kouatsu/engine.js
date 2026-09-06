// DOM・通信に依存しない手続条件。unknown を false に変換しない。
const isKnown = v => v !== undefined && v !== '' && v !== 'unknown';
function documentRows(id, a={}, region='nara') {
 const p=PROCEDURES.find(p=>p.id===id); if(!p || p.tag!=='書類案内') return [];
 const rows=[];
 const add=(key,title,status,note,refs=p.refs,source='law')=>rows.push({key,title,status,note,refs,source});
 if(id==='cold-new') {
  add('form','高圧ガス製造届書（様式第二）','required','法令上の届書。');
  const omit=a.omission==='yes';
  add('details','製造施設等明細書',omit?'omittable':'required',omit?'第4条第1項ただし書の条件を満たす場合は添付を省略できます。県の案内資料の省略範囲は別途確認してください。':'製造の目的、設備の種類、冷凍能力、圧縮機の性能、技術基準に関する事項を記載します。',[ref(REITOU,4)]);
  if(a.designated!=='no')add('certificate','指定設備認定証の写し',a.designated==='yes'?'required':'conditional','認定指定設備を使用する場合。',[ref(REITOU,4,'第1項')]);
  if(a.relocated!=='no')add('history','使用の経歴・保管状態の記録',omit?'conditional':a.relocated==='yes'?'required':'conditional','移設・転用・再使用等の場合の明細書記載事項。独立した届書ではありません。',[ref(REITOU,4,'第2項第6号')]);
 } else if(id==='cold-change') {
  add('form','高圧ガス製造施設等変更届書（様式第六）','required','変更前に提出します。');
  if(a.installDesignated!=='yes')add('details','変更明細書',a.installDesignated==='no'?'required':'conditional','第4条第2項の事項のうち変更した部分を記載します。',[ref(REITOU,18)]);
  if(a.installDesignated!=='no')add('certificate','指定設備認定証の写し',a.installDesignated==='yes'?'required':'conditional','認定指定設備の設置工事の届出では、変更明細書に代えて添付します。',[ref(REITOU,18,'第1項')]);
 } else if(id==='cold-permit') {
  add('form','高圧ガス製造施設等変更許可申請書（様式第四）','required','変更の前に許可を受けます。');
  add('details','変更明細書','required','第3条第2項の事項のうち変更した部分を記載します。',[ref(REITOU,16)]);
 } else {
  add('form','高圧ガス製造施設軽微変更届書（様式第五）','required','工事完成後、遅滞なく提出します。');
  if(a.certMinor!=='yes')add('outline','変更の概要を記載した書面',a.certMinor==='no'?'required':'conditional','認定指定設備の設置及び認定証が無効とならない変更には認定証の写しを添付します。',[ref(REITOU,17,'第2項')]);
  if(a.certMinor!=='no')add('certificate','指定設備認定証の写し',a.certMinor==='yes'?'required':'conditional','第17条第1項第4号・第5号の工事の場合。',[ref(REITOU,17,'第2項')]);
 }
 if(region==='nara' && ['cold-new','cold-change'].includes(id)) {
  const fresh=id==='cold-new';
  for(const [key,title,note,n,c] of NARA_DOCS)add('nara-'+key,title,fresh?n:c,note,[],fresh?'nara-new':'nara-change');
  if(a.entity==='corporate')add('identity','登記簿謄本（発行から3か月以内）',fresh?'required':'conditional','法人の場合。',[],fresh?'nara-new':'nara-change');
  else if(a.entity==='person')add('identity','住民票（発行から3か月以内）',fresh?'required':'conditional','個人の場合。マイナンバーのないもの。',[],fresh?'nara-new':'nara-change');
  else add('identity','登記簿謄本又は住民票',fresh?'required':'conditional','法人・個人の別により選択。発行から3か月以内。住民票はマイナンバーのないもの。',[],fresh?'nara-new':'nara-change');
  if(a.delegate!=='no')add('delegation','委任状',a.delegate==='yes'?'required':'conditional','県一覧では届書の代表者欄が代表取締役以外の場合に必要とされています。',[],fresh?'nara-new':'nara-change');
 }
 return rows;
}
function evaluateChange(base={},item={}) {
 const article=base.class==='first'?'17':'19';
 const refs=[ref(ACT,14),ref(REITOU,article)];
 const result=(status,reason,more=[])=>({status,reason,refs:[...refs,...more],procedure:status==='minor'?(base.class==='first'?'cold-minor':null):status==='regular'?(base.class==='first'?'cold-permit':'cold-change'):null});
 if(base.regime!=='refrigeration')return result('review','一般則・液石則又は適用規則の確認が必要です。設備の仕様と工事範囲を整理して、公式案内・窓口で確認してください。');
 if(!['first','second'].includes(base.class))return result('review','現在の第一種・第二種の区分を、許可証又は届出控えで確認してください。');
 if(base.sameClass!=='yes')return result('review','変更後の能力・設備構成により、事業者区分の変更や新たな手続きがないか確認してください。');
 if(base.special!=='no')return result('review','認定高度保安実施者等の特別な制度、試験研究施設の大臣認定又は個別の取扱いがある場合は、その条件を確認してください。');
 if(item.kind==='installDesignated')return base.class==='first'?result('minor','認定指定設備の設置は、第17条第1項第4号の軽微な変更の工事です。指定設備認定証の写しを添付します。'):result('regular','第二種製造者の認定指定設備の設置には、変更届と指定設備認定証の写しが必要です。',[ref(REITOU,18)]);
 if(item.kind==='designated') {
  if(item.certValid==='yes')return result('minor','第62条第1項ただし書により認定証が無効とならない変更に該当するとの回答に基づきます。認定証への工事内容・年月日の記載も確認してください。',[ref(REITOU,62)]);
  return result('review','同等部品への交換のみか、又は認定機関等の調査・技術基準適合書があるかを確認してください。認定証が無効になる場合は製造区分の再確認も必要です。',[ref(REITOU,62)]);
 }
 if(item.kind==='remove') {
  if(item.independent!=='yes')return result('review','撤去対象が独立した製造設備か確認してください。部分撤去・配管工事・製造廃止は別の確認が必要です。');
  if(base.class==='second' && item.designated!=='no')return result('review','第二種の撤去の軽微変更規定は認定指定設備を除きます。認定の有無と他の該当条件を確認してください。');
  return result('minor','独立した製造設備の撤去に係る軽微変更の条件に該当します。全部廃止となる場合の廃止届は別に確認してください。');
 }
 if(item.kind==='ancillary')return item.ancillaryConfirmed==='yes'?result('minor','製造設備以外の製造施設に係る設備の取替え工事に該当するとの回答に基づきます。'):result('review','冷媒配管や冷媒設備を含む「製造設備」ではないことを図面で確認してください。');
 if(item.kind!=='replace')return result('review','この工事は一括して軽微・届出不要とは判定できません。変更前後の図面、能力、冷媒、工事方法を基に確認してください。');
 if(item.designated!=='no')return result('review','認定指定設備の取替え・変更は専用の選択肢で確認してください。認定の有無が不明な場合は認定証を確認してください。',[ref(REITOU,62)]);
 const fields=['capacitySame','refrigerantPart','welding'];
 if(item.refrigerantPart==='yes')fields.push('hazard');
 if(base.class==='first')fields.push('seismic');
 const missing=fields.filter(k=>!['yes','no'].includes(item[k]));
 if(missing.length)return result('review','冷凍能力、冷媒設備への該当、冷媒の可燃性・毒性、冷媒設備の切断・溶接、耐震設計構造物への該当のうち、未確認の項目を確認してください。');
 const minor=item.capacitySame==='yes' && item.welding==='no' && (item.refrigerantPart==='no'||item.hazard==='no') && (base.class==='second'||item.seismic==='no');
 return minor?result('minor','取替え対象・冷凍能力・冷媒・工事方法等が、取替えに係る軽微変更の条件を満たします。'):result('regular','取替えに係る軽微変更の条件を満たさない項目があります。特別な取扱いがないとの回答に基づく案内です。');
}
function summarizeChanges(base,items) {
 const results=items.map(i=>evaluateChange(base,i));
 if(!results.length || results.some(r=>r.status==='review'))return {status:'review',title:'確認が必要な工事が残っています',results};
 if(results.some(r=>r.status==='regular'))return {status:'regular',title:base.class==='first'?'変更許可申請の対象となる工事を含みます':'変更届の対象となる工事を含みます',results};
 return {status:'minor',title:base.class==='first'?'軽微変更届の対象となる工事です':'今回の変更は国法上の変更届の対象外です',results};
}
function deadlineFor(date) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return null;
 const d=new Date(date+'T00:00:00Z');
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date)return null;
 d.setUTCDate(d.getUTCDate()-20);return d.toISOString().slice(0,10);
}
function searchCatalog(query) {
 const normalize=s=>String(s).normalize('NFKC').toLowerCase().replace(/第?二種/g,'2種').replace(/第?一種/g,'1種');
 const words=normalize(query).trim().split(/\s+/).filter(Boolean);
 return PROCEDURES.filter(p=>words.every(w=>normalize(p.title+' '+p.subtitle+' '+p.keywords).includes(w)));
}
