import test from "node:test";
import assert from "node:assert/strict";
import { makePortableEnvelope, parsePortableEnvelope, createShareUrl, decodeShareFragment, readPortableFile, portableFilename } from "../src/kouatsu/js/portability.js";
const draft = () => ({
  mode:"diagnosis", diag:{actionType:"sales",gasCategory:"general",stepIndex:1,answers:{smallSalesException:"no",selfSale:"no"},finished:true,unconfirmedResult:null},
  nav:{purpose:"new",answers:{},stepIndex:0,finished:false,selectedId:null,returnMode:"catalogue",caseId:"test-case",
    preparations:{"test-case:sales-new-general:{}":{facts:{delegate:"no"},checks:{form:true},lastUsedAt:1}}},
});
test("JSON・共有URLで回答が往復し、URLには書類チェックを含めない",async()=>{
  const input=draft(), file=makePortableEnvelope(input);
  assert.equal(file.format,"kouatsu-navi");assert.equal(file.schemaVersion,1);
  assert.deepEqual(parsePortableEnvelope(JSON.stringify(file)),file);
  const url=await createShareUrl(input,"https://example.test/My-tools-portal/tools/kouatsu-gas-law-viewer.html");
  assert.ok(url.length<=2000);
  const restored=await decodeShareFragment(new URL(url).hash);
  assert.deepEqual(restored.state.diag,file.state.diag);
  assert.equal(restored.state.nav.preparations,undefined);
  assert.ok(!JSON.stringify(restored).includes('"checks"'));
  assert.deepEqual(input,draft(),"書き出し元を変更しない");
});
test("圧縮非対応でもfile URLで往復",async()=>{
  const url=await createShareUrl(draft(),"file:///C:/tools/kouatsu-gas-law-viewer.html",{Compressor:null});
  assert.match(url,/#kn=1\.u\./);
  const result=await decodeShareFragment(new URL(url).hash,{Decompressor:null});
  assert.equal(result.state.diag.answers.selfSale,"no");
});
test("版・設問・選択肢・位置・形式を検証し、未知フィールドを拒否",()=>{
  const mutations=[
    e=>e.procedureVersion="old-version", e=>e.schemaVersion=2, e=>e.format="other",
    e=>e.state.diag.answers.unknownQuestion="yes", e=>e.state.diag.answers.selfSale="bad",
    e=>e.state.diag.stepIndex=99, e=>e.state.nav.preparations["test-case:sales-new-general:{}"].facts.unknown="yes",
    e=>e.state.diag.answers.__hidden="secret", e=>e.state.nav.caseId="../path",
  ];
  for (const change of mutations) { const envelope=makePortableEnvelope(draft());change(envelope);assert.throws(()=>parsePortableEnvelope(JSON.stringify(envelope))); }
  assert.throws(()=>parsePortableEnvelope('{"format":"kouatsu-navi","__proto__":{}}'));
});
test("途中と明示的な未確認結果、目的別と詳細も検証・復元",()=>{
  const input=draft();
  delete input.diag.answers.selfSale;input.diag.finished=false;
  assert.equal(makePortableEnvelope(input).state.diag.finished,false);
  input.diag.finished=true;input.diag.unconfirmedResult={verdict:"needs_confirmation"};
  assert.equal(makePortableEnvelope(input).state.diag.unconfirmed,true);
  input.mode="lifecycle";input.nav={...input.nav,purpose:"change",answers:{activity:"sales",regulation:"general",change:"gas",inertOnly:"no"},stepIndex:3,finished:true};
  assert.equal(makePortableEnvelope(input).state.mode,"lifecycle");
  input.mode="detail";input.nav.selectedId="sales-change-general";input.nav.returnMode="lifecycle";
  assert.equal(makePortableEnvelope(input).state.nav.selectedId,"sales-change-general");
});
test("壊れた/異版/未知設問URL・長すぎるURL・1MB超ファイルを拒否",async()=>{
  for (const hash of ["#kn=broken","#kn=1.d.notcompressed","#kn=1.u.!!!!"]) await assert.rejects(decodeShareFragment(hash));
  for (const change of [e=>e.procedureVersion="old",e=>e.state.diag.answers.invented="yes"]) {
    const e=makePortableEnvelope(draft(),{includeChecks:false});change(e);
    const hash="#kn=1.u."+Buffer.from(JSON.stringify(e)).toString("base64url");
    await assert.rejects(decodeShareFragment(hash));
  }
  await assert.rejects(createShareUrl(draft(),"https://example.test/"+ "x".repeat(2000)),/2,000文字.*JSON/);
  await assert.rejects(readPortableFile({size:1024*1024+1,text:async()=>{throw Error("読んではいけない");}}),/1MB/);
  const file=makePortableEnvelope(draft());
  assert.deepEqual(await readPortableFile(new Blob([JSON.stringify(file)])),file);
  assert.equal(portableFilename(new Date(2026,8,23)),"kouatsu-navi-20260923.json");
});
