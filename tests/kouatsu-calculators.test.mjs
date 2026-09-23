import test from "node:test";
import assert from "node:assert/strict";
import { calculateStorageRow, sumStorageRows, calculateRefrigeration, REFRIGERATION_Q, REFRIGERATION_C, calculatorContext, calculationAnswer, calculationReferences, calcNumeric } from "../src/kouatsu/js/calculators.js";
import { getStepsForGasCategory } from "../src/kouatsu/js/diagnosis.js";
import { GLOSSARY, assistLawUrl } from "../src/kouatsu/js/glossary.js";

// run-001レビューでe-Govの章・節・条を確認済み。実装から期待値を生成せず、オフラインで固定する。
const VERIFIED_LAW_LINKS = {
  act2: "https://laws.e-gov.go.jp/law/326AC0000000204#Mp-Ch_1-At_2",
  act5: "https://laws.e-gov.go.jp/law/326AC0000000204#Mp-Ch_2-At_5",
  act16: "https://laws.e-gov.go.jp/law/326AC0000000204#Mp-Ch_2-At_16",
  act17_2: "https://laws.e-gov.go.jp/law/326AC0000000204#Mp-Ch_2-At_17_2",
  act20_4: "https://laws.e-gov.go.jp/law/326AC0000000204#Mp-Ch_2-At_20_4",
  act24_2: "https://laws.e-gov.go.jp/law/326AC0000000204#Mp-Ch_2-At_24_2",
  order2: "https://laws.e-gov.go.jp/law/409CO0000000020#Mp-At_2",
  order7: "https://laws.e-gov.go.jp/law/409CO0000000020#Mp-At_7",
  general2: "https://laws.e-gov.go.jp/law/341M50000400053#Mp-Ch_1-At_2",
  lpgas2: "https://laws.e-gov.go.jp/law/341M50000400052#Mp-Ch_1-At_2",
  refrigeration5: "https://laws.e-gov.go.jp/law/341M50000400051#Mp-Ch_2-Se_1-At_5",
  container22: "https://laws.e-gov.go.jp/law/341M50000400050#Mp-Ch_6-At_22",
};
test("計算補助の全区分の根拠リンクは確認済みの章・節・条へ向く", () => {
  const links = VERIFIED_LAW_LINKS;
  assert.deepEqual(calculationReferences({kind:"refrigeration"}).map(([,url])=>url), [links.refrigeration5]);
  for (const [category, regulation] of [["general",links.general2],["lpgas",links.lpgas2]]) {
    for (const activity of ["storage","consumption"]) {
      assert.deepEqual(
        calculationReferences({kind:"storage",category,activity}).map(([,url])=>url),
        [regulation, links.container22, ...(activity === "storage" ? [links.act16] : [])],
        category + "/" + activity,
      );
    }
  }
});
test("用語解説12項目の全根拠リンクは確認済みの章・節・条へ向く", () => {
  const links = VERIFIED_LAW_LINKS;
  assert.deepEqual(
    Object.fromEntries(GLOSSARY.map(item=>[item.id,item.refs.map(([,lawId,anchor])=>assistLawUrl(lawId,anchor))])),
    {
      "high-pressure": [links.act2],
      type1: [links.order2],
      flammable: [links.general2],
      toxic: [links.general2],
      special: [links.general2],
      specified: [links.act24_2,links.order7],
      processing: [links.general2],
      refrigeration: [links.act5,links.refrigeration5],
      storage: [links.general2],
      manufacturers: [links.act5],
      "storage-sites": [links.act16,links.act17_2],
      "sales-site": [links.act20_4],
    },
  );
});
test("圧縮ガス2設備の合計は13.912m³、貯槽/バルク/容器と換算を計算", () => {
  const compressed={method:"compressed",pressure:14.7,volume:0.047};
  const total=sumStorageRows([compressed,compressed],{activity:"storage"});
  assert.ok(Math.abs(total.value-13.912)<1e-10); assert.equal(total.value.toFixed(2),"13.91");
  assert.match(total.formulas[0],/10 × 14.7/);
  assert.equal(calculateStorageRow({method:"tank",density:0.5,volume:1000}).value,450);
  assert.equal(calculateStorageRow({method:"bulk",density:0.5,volume:1000}).value,425);
  assert.equal(calculateStorageRow({method:"bulk",density:0.5,volume:2000,underground:true}).value,900);
  assert.equal(calculateStorageRow({method:"bulk",density:0.5,volume:1999,underground:true}).value,0.85*0.5*1999);
  const mixed=sumStorageRows([{method:"tank",density:0.5,volume:1000},{method:"containers",mass:50,count:3}, {method:"documented",value:10,unit:"m³"}],{activity:"storage"});
  assert.equal(mixed.kilograms,600);assert.equal(mixed.converted,60);assert.equal(mixed.value,70);
  const consume=sumStorageRows([{method:"containers",mass:50,count:3}],{activity:"consumption",unit:"kg"});
  assert.equal(consume.value,150);assert.equal(consume.converted,null);
  assert.equal(sumStorageRows([compressed],{activity:"consumption",unit:"kg"}).valid,false);
});
test("不正数値・負・無限大・計算オーバーフローを拒否", () => {
  for (const value of ["", "text", -1, Infinity, "1e309", NaN, null]) assert.equal(calcNumeric(value),null);
  for (const pressure of ["bad",-1,Infinity]) assert.equal(calculateStorageRow({method:"compressed",pressure,volume:1}).valid,false);
  assert.equal(calculateStorageRow({method:"compressed",pressure:1e308,volume:1e308}).valid,false);
  assert.equal(calculateStorageRow({method:"containers",mass:2,count:1.5}).valid,false);
});
test("冷凍能力の4計算方式と係数表の全行", () => {
  const q={"二酸化炭素":1.02,"アンモニア":0.64,"フルオロカーボン32":0.63,"プロピレン":0.58,"フルオロカーボン410A":0.57,"フルオロカーボン125":0.50,"フルオロカーボン404A":0.50,"フルオロカーボン407C":0.49,"フルオロカーボン22":0.47,"フルオロカーボン134a":0.36,"フルオロカーボン12":0.34,"フルオロカーボン124":0.24,"フルオロカーボン11":0.10};
  const c={"フルオロカーボン21":[49.7,46.6],"フルオロカーボン114":[46.4,43.5],"ノルマルブタン":[37.2,34.9],"イソブタン":[27.1,25.4],"クロルメチル":[14.5,13.6],"フルオロカーボン134a":[14.4,13.5],"フルオロカーボン12":[13.9,13.1],"フルオロカーボン500":[12.0,11.3],"プロパン":[9.6,9.0],"フルオロカーボン22":[8.5,7.9],"アンモニア":[8.4,7.9],"フルオロカーボン502":[8.4,7.9],"フルオロカーボン13B1":[6.2,5.8],"フルオロカーボン13":[4.4,4.2],"エタン":[3.1,2.9],"二酸化炭素":[1.8,1.7]};
  assert.deepEqual(REFRIGERATION_Q,q);assert.deepEqual(REFRIGERATION_C,c);
  assert.equal(calculateRefrigeration({method:"centrifugal",power:1.2}).value,1);
  assert.equal(calculateRefrigeration({method:"absorption",heat:27800}).value,1);
  for (const [refrigerant,coefficient] of Object.entries(q)) assert.equal(calculateRefrigeration({method:"natural",refrigerant,area:10}).value,coefficient*10);
  for (const [refrigerant,pair] of Object.entries(c)) for (const [i,cylinder] of ["small","large"].entries()) assert.equal(calculateRefrigeration({method:"single",refrigerant,cylinder,displacement:pair[i]*2}).value,2);
});
test("対象外設備と冷媒は計算せず、記載値なら入力できる", () => {
  for (const method of ["multi-stage","multi-system","rotary","unsupported","cool-natural"]) assert.equal(calculateRefrigeration({method}).manualRequired,true);
  for (const method of ["natural","single"]) assert.equal(calculateRefrigeration({method,refrigerant:"other",area:1,displacement:1,cylinder:"small"}).manualRequired,true);
  assert.equal(calculateStorageRow({method:"low-temperature"}).manualRequired,true);
  assert.equal(calculateStorageRow({method:"tank",density:1,volume:1,lowTemperature:true}).manualRequired,true);
  assert.equal(calculateRefrigeration({method:"documented",value:20}).value,20);
});
test("選択肢への対応は丸め前・境界は以上、数値質問にはそのまま反映", () => {
  const cold=getStepsForGasCategory("manufacture","refrigeration",{gasType:"type1"})[1];
  assert.equal(calculationAnswer(cold,20).value,"between");
  assert.equal((19.999).toFixed(2),"20.00");assert.equal(calculationAnswer(cold,19.999).value,"under");
  const storage=getStepsForGasCategory("storage","general",{selfManufactureStorage:"no",storageGasScope:"type1only"}).at(-1);
  assert.equal(calculationAnswer(storage,300).value,"between");assert.equal(calculationAnswer(storage,299.999).value,"under");
  assert.equal(calculationAnswer({type:"number",unit:"立方メートル"},13.912).value,"13.912");
  assert.equal(calculationAnswer({type:"number",unit:"立方メートル"},13.912).label,"13.91 立方メートル");
  assert.equal(calculatorContext("manufacture","general",{id:"capacityBand"}),null);
});
test("用語12項目は仕様の文面と一致し、すべて根拠リンクを持つ", () => {
  const texts=[
    "常用の温度で圧力1MPa以上となる圧縮ガス、0.2MPa以上となる圧縮アセチレンガス・液化ガスなど。温度35℃で1MPa以上となる圧縮ガスも含む。",
    "ヘリウム、ネオン、アルゴン、クリプトン、キセノン、ラドン、窒素、二酸化炭素、空気、及び難燃性の基準に適合するフルオロカーボン。処理能力などの基準が緩和される区分。",
    "アセチレン、アンモニア、水素、プロパン、メタンなど一般則に列挙されたガスと、爆発限界の下限が10%以下または上限と下限の差が20%以上のガス。",
    "アンモニア、塩素、一酸化炭素、シアン化水素など一般則に列挙されたガスと、毒物及び劇物取締法の毒物に当たるガス。",
    "アルシン、ジシラン、ジボラン、セレン化水素、ホスフィン、モノゲルマン、モノシラン。",
    "特殊高圧ガスの7種(圧縮・液化したもの)。加えて、一定量以上を貯蔵して消費する圧縮水素、圧縮天然ガス、液化酸素、液化アンモニア、液化石油ガス、液化塩素。消費者の届出の対象。",
    "処理設備・減圧設備で1日に処理できるガスの容積を、温度0℃・圧力0Paの状態に換算したもの。現在の使用量ではない。",
    "省令の算定基準で求めた1日の冷凍能力(トン)。運転中の実測値ではない。",
    "貯蔵設備に貯蔵できる高圧ガスの数量。圧縮ガスは m³、液化ガスは kg で表す。",
    "製造の許可を受けた者が第一種製造者、製造の届出をした者が第二種製造者。",
    "許可を受けて設置する貯蔵所が第一種貯蔵所、届け出て設置する貯蔵所が第二種貯蔵所。",
    "高圧ガスを販売する事業所。販売事業の届出は販売所ごとに行う。",
  ];
  assert.deepEqual(GLOSSARY.map(g=>g.text),texts);
  assert.equal(new Set(GLOSSARY.map(g=>g.id)).size,12);
  for (const item of GLOSSARY) { assert.ok(item.refs.length); for (const [label,id,anchor] of item.refs) {assert.match(label,/第/);assert.match(id,/^\d{3}[A-Z]/);assert.match(anchor,/^Mp-.*At_/);} }
});
