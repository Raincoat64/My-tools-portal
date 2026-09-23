import test from "node:test";
import assert from "node:assert/strict";
import { REVISION_BASELINES, KNOWN_PENDING_REVISIONS, KNOWN_PENDING_INFO, compareLawRevisions, checkLawRevisions, fetchLawRevisions, REVISION_CACHE_MS } from "../src/kouatsu/js/revisions.js";
import { evaluateDiagnosis } from "../src/kouatsu/js/diagnosis.js";
const expected = {
  "326AC0000000204":"326AC0000000204_20251001_507AC0000000044", "409CO0000000020":"409CO0000000020_20231221_505CO0000000276",
  "341M50000400053":"341M50000400053_20251001_507M60000400065", "341M50000400052":"341M50000400052_20251001_507M60000400065",
  "341M50000400051":"341M50000400051_20260612_508M60000400056", "341M50000400050":"341M50000400050_20260612_508M60000400056",
  "342AC0000000149":"342AC0000000149_20251225_506AC0000000067",
};
function response(id) { return { revisions: [{ law_revision_id: expected[id], current_revision_status:"CurrentEnforced", amendment_enforcement_date:"2026-01-01", amendment_law_title:"確認済み改正" }, ...KNOWN_PENDING_REVISIONS.filter(r=>r.startsWith(id)).map(law_revision_id=>({ law_revision_id, current_revision_status:"UnEnforced", amendment_enforcement_date:"2026-12-21", amendment_law_title:"令和4年法律第74号" }))] }; }
test("7法令の基準値・施行予定2件は承認仕様に一致", () => {
  assert.deepEqual(REVISION_BASELINES,expected);
  assert.deepEqual(KNOWN_PENDING_REVISIONS,["326AC0000000204_20261221_504AC0000000074","342AC0000000149_20261221_504AC0000000074"]);
  assert.deepEqual(KNOWN_PENDING_INFO,{ enforcementDate:"2026-12-21",amendmentTitle:"令和4年法律第74号" });
});
test("既知の施行中/未施行は警告しない、未知の施行中/未施行は区別して警告", () => {
  for (const id of Object.keys(expected)) assert.deepEqual(compareLawRevisions(id,response(id)),[]);
  const id="326AC0000000204";
  const updated=response(id); updated.revisions[0].law_revision_id=id+"_20270101_test";
  const changes=compareLawRevisions(id,updated);
  assert.equal(changes[0].lawTitle,"高圧ガス保安法"); assert.equal(changes[0].enforcementDate,"2026-01-01");
  updated.revisions[0].law_revision_id=expected[id];
  updated.revisions.push({ law_revision_id:id+"_20280101_test", current_revision_status:"UnEnforced", amendment_enforcement_date:"2028-01-01",amendment_law_title:"未知の改正" });
  assert.equal(compareLawRevisions(id,updated)[0].status,"UnEnforced");
});
test("24時間未満は再取得せず、ちょうど24時間で照合する", async () => {
  let cache, requests=0;
  const options={ readCache:async()=>cache, writeCache:async value=>{cache={data:value};}, fetcher:async url=>{requests++;return {ok:true,json:async()=>response(url.split("/").at(-1))};} };
  assert.equal((await checkLawRevisions({...options,now:100})).status,"ready"); assert.equal(requests,7);
  await checkLawRevisions({...options,now:100+REVISION_CACHE_MS-1}); assert.equal(requests,7);
  await checkLawRevisions({...options,now:100+REVISION_CACHE_MS}); assert.equal(requests,14);
});
test("通信失敗・オフライン・不正な応答・タイムアウトでもfailedを返す", async () => {
  const options={ readCache:async()=>null,writeCache:async()=>{} };
  for (const fetcher of [async()=>{throw Error("offline");},async()=>({ok:false}),async()=>({ok:true,json:async()=>({})})]) assert.equal((await checkLawRevisions({...options,fetcher})).status,"failed");
  assert.equal((await checkLawRevisions({...options,online:false})).status,"failed");
  let aborted=false;
  await assert.rejects(fetchLawRevisions("326AC0000000204",{timeoutMs:5,fetcher:(_url,{signal})=>new Promise(()=>signal.addEventListener("abort",()=>{aborted=true;}))}),/タイムアウト/);
  assert.equal(aborted,true);
  assert.throws(()=>compareLawRevisions("326AC0000000204",{ revisions:[] }));
});
test("照合の成否は診断結果と手続きデータを書き換えない", async () => {
  const answers={gasType:"type1",capacityBand:"between"};
  const before=evaluateDiagnosis("manufacture","refrigeration",answers);
  await checkLawRevisions({online:false,readCache:async()=>null,writeCache:async()=>{}});
  assert.deepEqual(evaluateDiagnosis("manufacture","refrigeration",answers),before);
});
