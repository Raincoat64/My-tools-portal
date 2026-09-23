// 解説文・根拠は承認仕様に固定。判定条件の代用にはしない。
const glossaryAct = "326AC0000000204", glossaryOrder = "409CO0000000020", glossaryGeneral = "341M50000400053";
export function assistLawUrl(lawId, anchor) { return "https://laws.e-gov.go.jp/law/" + lawId + "#" + anchor; }
export const GLOSSARY = [
  { id: "high-pressure", term: "高圧ガス", text: "常用の温度で圧力1MPa以上となる圧縮ガス、0.2MPa以上となる圧縮アセチレンガス・液化ガスなど。温度35℃で1MPa以上となる圧縮ガスも含む。", refs: [["高圧ガス保安法第2条", glossaryAct, "Mp-Ch_1-At_2"]] },
  { id: "type1", term: "第一種ガス", text: "ヘリウム、ネオン、アルゴン、クリプトン、キセノン、ラドン、窒素、二酸化炭素、空気、及び難燃性の基準に適合するフルオロカーボン。処理能力などの基準が緩和される区分。", refs: [["高圧ガス保安法施行令第2条第5項第4号", glossaryOrder, "Mp-At_2"]] },
  { id: "flammable", term: "可燃性ガス", text: "アセチレン、アンモニア、水素、プロパン、メタンなど一般則に列挙されたガスと、爆発限界の下限が10%以下または上限と下限の差が20%以上のガス。", refs: [["一般則第2条第1項第1号", glossaryGeneral, "Mp-Ch_1-At_2"]] },
  { id: "toxic", term: "毒性ガス", text: "アンモニア、塩素、一酸化炭素、シアン化水素など一般則に列挙されたガスと、毒物及び劇物取締法の毒物に当たるガス。", refs: [["一般則第2条第1項第2号", glossaryGeneral, "Mp-Ch_1-At_2"]] },
  { id: "special", term: "特殊高圧ガス", text: "アルシン、ジシラン、ジボラン、セレン化水素、ホスフィン、モノゲルマン、モノシラン。", refs: [["一般則第2条第1項第3号", glossaryGeneral, "Mp-Ch_1-At_2"]] },
  { id: "specified", term: "特定高圧ガス", text: "特殊高圧ガスの7種(圧縮・液化したもの)。加えて、一定量以上を貯蔵して消費する圧縮水素、圧縮天然ガス、液化酸素、液化アンモニア、液化石油ガス、液化塩素。消費者の届出の対象。", refs: [["高圧ガス保安法第24条の2", glossaryAct, "Mp-Ch_2-At_24_2"], ["施行令第7条", glossaryOrder, "Mp-At_7"]] },
  { id: "processing", term: "処理能力", text: "処理設備・減圧設備で1日に処理できるガスの容積を、温度0℃・圧力0Paの状態に換算したもの。現在の使用量ではない。", refs: [["一般則第2条第1項第18号", glossaryGeneral, "Mp-Ch_1-At_2"]] },
  { id: "refrigeration", term: "冷凍能力", text: "省令の算定基準で求めた1日の冷凍能力(トン)。運転中の実測値ではない。", refs: [["高圧ガス保安法第5条第3項", glossaryAct, "Mp-Ch_2-At_5"], ["冷凍保安規則第5条", "341M50000400051", "Mp-Ch_2-Se_1-At_5"]] },
  { id: "storage", term: "貯蔵能力", text: "貯蔵設備に貯蔵できる高圧ガスの数量。圧縮ガスは m³、液化ガスは kg で表す。", refs: [["一般則第2条第1項第9号", glossaryGeneral, "Mp-Ch_1-At_2"]] },
  { id: "manufacturers", term: "第一種製造者・第二種製造者", text: "製造の許可を受けた者が第一種製造者、製造の届出をした者が第二種製造者。", refs: [["高圧ガス保安法第5条", glossaryAct, "Mp-Ch_2-At_5"]] },
  { id: "storage-sites", term: "第一種貯蔵所・第二種貯蔵所", text: "許可を受けて設置する貯蔵所が第一種貯蔵所、届け出て設置する貯蔵所が第二種貯蔵所。", refs: [["高圧ガス保安法第16条", glossaryAct, "Mp-Ch_2-At_16"], ["高圧ガス保安法第17条の2", glossaryAct, "Mp-Ch_2-At_17_2"]] },
  { id: "sales-site", term: "販売所", text: "高圧ガスを販売する事業所。販売事業の届出は販売所ごとに行う。", refs: [["高圧ガス保安法第20条の4", glossaryAct, "Mp-Ch_2-At_20_4"]] },
];
export function relatedGlossary(action, category, stepId) {
  const ids = new Set(["high-pressure"]);
  if (action === "storage") ["storage", "storage-sites", "type1", "special"].forEach(id => ids.add(id));
  if (action === "consumption") ["storage", "specified", "special"].forEach(id => ids.add(id));
  if (action === "sales") ["sales-site", "manufacturers"].forEach(id => ids.add(id));
  if (action === "manufacture") ["manufacturers", category === "refrigeration" ? "refrigeration" : "processing"].forEach(id => ids.add(id));
  if (["gasScope", "gasType", "storageGasScope", "consumptionGasType"].includes(stepId)) ["type1", "flammable", "toxic"].forEach(id => ids.add(id));
  return GLOSSARY.filter(item => ids.has(item.id));
}
