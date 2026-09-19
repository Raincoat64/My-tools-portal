import test from 'node:test';
import assert from 'node:assert/strict';
import { PROCEDURES, getProcedure, searchProcedures, getLifecycleSteps, evaluateLifecycle, diagnosisProcedureIds, documentRequirement, lifecycleFacts } from '../src/kouatsu/js/procedures.js';

test('台帳は一意のID、出典、期限、公式ファイルを持つ', () => {
  assert.equal(new Set(PROCEDURES.map(p => p.procedureId)).size, PROCEDURES.length);
  for (const p of PROCEDURES) {
    assert.ok(p.deadline && p.source && p.basis && p.checkedAt, p.procedureId);
    assert.ok(p.forms.length && p.documents.length, p.procedureId);
    assert.equal(new Set(p.documents.map(d => d.id)).size, p.documents.length, p.procedureId);
    for (const f of p.forms) assert.match(f.url, /^https:\/\/www\.pref\.nara\.lg\.jp\/documents\//);
  }
});
test('四行為の結果から適切な台帳を参照する', () => {
  for (const action of ['manufacture', 'storage', 'sales', 'consumption']) for (const regulation of ['general', 'lpgas', ...(action === 'sales' || action === 'manufacture' ? ['refrigeration'] : [])]) {
    const ids = diagnosisProcedureIds(action, regulation, { verdict: 'notification' });
    assert.equal(ids.length, 1); assert.ok(getProcedure(ids[0]));
  }
  assert.deepEqual(diagnosisProcedureIds('sales', 'general', { verdict: 'none' }), []);
  assert.deepEqual(diagnosisProcedureIds('sales', 'general', { verdict: 'invalid' }), []);
});
test('販売様式は規則別。冷凍の容器授受帳簿を要求しない', () => {
  const variants = ['general', 'lpgas', 'refrigeration'].map(r => getProcedure(`sales-new-${r}`));
  assert.equal(new Set(variants.map(p => p.forms[0].url)).size, 3);
  assert.ok(!variants[2].documents.some(d => d.id === 'container-register'));
  assert.ok(variants[0].documents.some(d => d.id === 'container-register'));
  assert.equal(variants[0].documents.find(d => d.id === 'supplier').kind, 'oneOf');
});
test('条件未確認・対象外・いずれかを分離する', () => {
  const doc = getProcedure('sales-new-general').documents.find(d => d.id === 'structure');
  assert.equal(documentRequirement(doc, {}), 'unconfirmed');
  assert.equal(documentRequirement(doc, { physical: 'no' }), 'notApplicable');
  assert.equal(documentRequirement(doc, { physical: 'yes' }), 'required');
  const qualification = getProcedure('personnel-consumption').documents.find(d => d.id === 'qualification');
  assert.equal(qualification.alternatives.length, 6);
  assert.match(qualification.alternatives[2], /＋/);
});
const base = { activity: 'manufacture', regulation: 'general', status: 'permit' };
test('第一種のガス種類変更は変更許可を案内', () => {
  assert.deepEqual(evaluateLifecycle('change', { ...base, change: 'gas' }).procedureIds, ['manufacture-change-permit']);
});
test('第一種の軽微工事と県報告を分ける', () => {
  const r = evaluateLifecycle('change', { ...base, change: 'equipment', work: 'remove', minorCriteria: 'yes', capacityOrGas: 'yes' });
  assert.deepEqual(r.procedureIds, ['manufacture-minor', 'minor-report']);
  assert.equal(r.unresolved, false);
});
test('第二種の軽微工事でも県報告を落とさない', () => {
  const r = evaluateLifecycle('change', { ...base, status: 'notification', change: 'equipment', work: 'remove', minorCriteria: 'yes', capacityOrGas: 'yes' });
  assert.deepEqual(r.procedureIds, ['minor-report']);
});
test('不明な工事は許可や不要と断定しない', () => {
  const r = evaluateLifecycle('change', { ...base, change: 'equipment', work: 'replace', minorCriteria: 'unknown' });
  assert.equal(r.unresolved, true); assert.ok(r.procedureIds.includes('manufacture-change-permit'));
});
test('第二種冷凍の撤去で認定指定設備の除外を質問する', () => {
  const steps = getLifecycleSteps('change', { ...base, regulation: 'refrigeration', status: 'notification', change: 'equipment', work: 'remove' });
  assert.match(steps.find(s => s.id === 'minorCriteria').help, /認定指定設備ではない/);
});
test('販売の不活性ガスだけの変更を区別する', () => {
  const answers = { activity: 'sales', regulation: 'general', change: 'gas', inertOnly: 'yes' };
  assert.deepEqual(evaluateLifecycle('change', answers).procedureIds, []);
  assert.equal(evaluateLifecycle('change', answers).unresolved, false);
  assert.equal(evaluateLifecycle('change', { ...answers, inertOnly: 'unknown' }).unresolved, true);
});
test('代表者と事業所移転を混同しない', () => {
  assert.deepEqual(evaluateLifecycle('change', { ...base, change: 'company' }).procedureIds, ['representative']);
  assert.equal(evaluateLifecycle('change', { ...base, change: 'relocation' }).unresolved, true);
});
test('承継できない組合せを止める', () => {
  assert.equal(evaluateLifecycle('succession', { ...base, succession: 'transfer' }).unresolved, true);
  assert.deepEqual(evaluateLifecycle('succession', { ...base, status: 'notification', succession: 'transfer' }).procedureIds, ['manufacture-second-succession']);
  assert.equal(evaluateLifecycle('succession', { activity: 'storage', regulation: 'general', status: 'permit', succession: 'merger' }).unresolved, true);
  assert.deepEqual(evaluateLifecycle('succession', { activity: 'storage', regulation: 'general', status: 'permit', succession: 'transfer' }).procedureIds, ['storage-succession']);
});
test('履歴に必要な質問が欠ける場合は未確認', () => {
  assert.equal(evaluateLifecycle('change', { ...base, change: 'equipment' }).unresolved, true);
  assert.equal(evaluateLifecycle('change', { activity: 'sales', regulation: 'unknown' }).unresolved, true);
});
test('第一種・第二種の保安担当者・規程を区別する', () => {
  assert.deepEqual(evaluateLifecycle('personnel', { ...base, role: 'hazard' }).procedureIds, ['hazard-rules']);
  assert.deepEqual(evaluateLifecycle('personnel', { ...base, status: 'notification', role: 'hazard' }).procedureIds, []);
});
test('検査機関別、製造開始、廃止の案内先が存在する', () => {
  for (const [purpose, answers] of [['inspection', { ...base, inspection: 'external-completion', institution: 'khk' }], ['inspection', { ...base, inspection: 'external-safety', institution: 'designated' }], ['inspection', { ...base, inspection: 'start' }], ['abolition', { ...base, ending: 'suspend' }], ['abolition', { activity: 'sales', regulation: 'lpgas', ending: 'abolish' }]]) {
    const r = evaluateLifecycle(purpose, answers); assert.equal(r.unresolved, false); assert.ok(r.procedureIds.every(id => getProcedure(id)));
  }
});
test('検索は複数語と規則のフィルターに対応', () => {
  const specific = searchProcedures('販売', { regulation: 'refrigeration', purpose: 'new' });
  assert.equal(specific.length, 1); assert.equal(specific[0].procedureId, 'sales-new-refrigeration');
  assert.equal(searchProcedures('冷凍則 記載例', { activity: 'sales' })[0].procedureId, 'sales-new-refrigeration');
  assert.ok(searchProcedures('添付書類 Excel').some(p => p.procedureId === 'manufacture-permit'));
  assert.deepEqual(lifecycleFacts({ succession: 'inheritance' }), { inheritance: 'yes', merger: 'no', transfer: 'no' });
});
