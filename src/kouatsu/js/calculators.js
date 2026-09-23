import { assistLawUrl } from "./glossary.js";

// 冷凍則第5条の係数。表示の丸めは回答区分の比較に使わない。
export const REFRIGERATION_Q = {
  "二酸化炭素": 1.02, "アンモニア": 0.64, "フルオロカーボン32": 0.63, "プロピレン": 0.58,
  "フルオロカーボン410A": 0.57, "フルオロカーボン125": 0.50, "フルオロカーボン404A": 0.50,
  "フルオロカーボン407C": 0.49, "フルオロカーボン22": 0.47, "フルオロカーボン134a": 0.36,
  "フルオロカーボン12": 0.34, "フルオロカーボン124": 0.24, "フルオロカーボン11": 0.10,
};
export const REFRIGERATION_C = {
  "フルオロカーボン21": [49.7,46.6], "フルオロカーボン114": [46.4,43.5], "ノルマルブタン": [37.2,34.9],
  "イソブタン": [27.1,25.4], "クロルメチル": [14.5,13.6], "フルオロカーボン134a": [14.4,13.5],
  "フルオロカーボン12": [13.9,13.1], "フルオロカーボン500": [12.0,11.3], "プロパン": [9.6,9.0],
  "フルオロカーボン22": [8.5,7.9], "アンモニア": [8.4,7.9], "フルオロカーボン502": [8.4,7.9],
  "フルオロカーボン13B1": [6.2,5.8], "フルオロカーボン13": [4.4,4.2], "エタン": [3.1,2.9], "二酸化炭素": [1.8,1.7],
};
export const CALC_MANUAL_NOTE = "この設備・冷媒は自動計算の対象外です。メーカー資料・許可書等に記載の法定の能力を「記載値を使う」から入力してください。";
export function calcNumeric(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).trim().normalize("NFKC");
  if (!/^\+?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function calcInputs(input, fields) {
  const values = {}, errors = {};
  for (const key of fields) {
    const number = calcNumeric(input[key]);
    if (number === null) errors[key] = "0以上の有限な数値を入力してください。";
    else values[key] = number;
  }
  return { values, errors };
}
function calcFinished(value, unit, formula, errorField) {
  if (!Number.isFinite(value)) return { valid: false, errors: { [errorField]: "計算結果が大きすぎます。入力値を確認してください。" } };
  return { valid: true, value, unit, formula };
}
export function calculateStorageRow(input) {
  const fields = { compressed: ["pressure", "volume"], tank: ["density", "volume"], bulk: ["density", "volume"], containers: ["mass", "count"], documented: ["value"] }[input.method];
  if (!fields) return { valid: false, manualRequired: true, errors: {} };
  const { values: v, errors } = calcInputs(input, fields);
  if (input.method === "containers" && v.count !== undefined && !Number.isInteger(v.count)) errors.count = "本数は0以上の整数で入力してください。";
  if (Object.keys(errors).length) return { valid: false, errors };
  if (input.method === "compressed") return calcFinished((10 * v.pressure + 1) * v.volume, "m³", "Q = (10 × " + v.pressure + " + 1) × " + v.volume, "volume");
  if (input.method === "tank" || input.method === "bulk") {
    if (input.lowTemperature) return { valid: false, manualRequired: true, errors: {} };
    const factor = input.method === "bulk" && !(input.underground && v.volume >= 2000) ? 0.85 : 0.9;
    return calcFinished(factor * v.density * v.volume, "kg", "W = " + factor + " × " + v.density + " × " + v.volume, "volume");
  }
  if (input.method === "containers") return calcFinished(v.mass * v.count, "kg", "W = " + v.mass + " × " + v.count, "count");
  if (!["m³", "kg"].includes(input.unit)) return { valid: false, errors: { value: "記載値の単位を確認してください。" } };
  return calcFinished(v.value, input.unit, "メーカー資料・許可書等の記載値 = " + v.value, "value");
}
export function sumStorageRows(rows, { activity, unit = "m³" }) {
  if (!rows.length) return { valid: false, errors: [{ value: "設備を1行以上入力してください。" }] };
  const results = rows.map(calculateStorageRow);
  const errors = results.map(r => r.errors || {});
  if (results.some(r => !r.valid)) return { valid: false, errors, manualRequired: results.some(r => r.manualRequired) };
  const cubicMetres = results.filter(r => r.unit === "m³").reduce((sum,r) => sum+r.value,0);
  const kilograms = results.filter(r => r.unit === "kg").reduce((sum,r) => sum+r.value,0);
  if (activity !== "storage" && results.some(r => r.unit !== unit)) return { valid: false, errors: rows.map(() => ({ value: "この消費設問と同じ単位の設備・記載値を使ってください。" })) };
  const value = activity === "storage" ? cubicMetres + kilograms / 10 : unit === "kg" ? kilograms : cubicMetres;
  if (!Number.isFinite(value)) return { valid: false, errors: rows.map(() => ({ value: "合計が大きすぎます。" })) };
  return { valid: true, value, unit: activity === "storage" ? "m³" : unit, cubicMetres, kilograms,
    converted: activity === "storage" ? kilograms / 10 : null, formulas: results.map(r => r.formula) };
}
export function calculateRefrigeration(input) {
  const fields = { centrifugal: ["power"], absorption: ["heat"], natural: ["area"], single: ["displacement"], documented: ["value"] }[input.method];
  if (!fields) return { valid: false, manualRequired: true, errors: {} };
  if (input.method === "natural" && !Object.hasOwn(REFRIGERATION_Q, input.refrigerant)) return { valid: false, manualRequired: true, errors: {} };
  if (input.method === "single" && (!Object.hasOwn(REFRIGERATION_C, input.refrigerant) || !["small","large"].includes(input.cylinder))) return { valid: false, manualRequired: true, errors: {} };
  const { values: v, errors } = calcInputs(input, fields);
  if (Object.keys(errors).length) return { valid: false, errors };
  let value, formula;
  if (input.method === "centrifugal") { value = v.power / 1.2; formula = "R = " + v.power + " ÷ 1.2"; }
  if (input.method === "absorption") { value = v.heat / 27800; formula = "R = " + v.heat + " ÷ 27,800"; }
  if (input.method === "natural") { const q = REFRIGERATION_Q[input.refrigerant]; value = q * v.area; formula = "R = " + q + " × " + v.area; }
  if (input.method === "single") { const c = REFRIGERATION_C[input.refrigerant][input.cylinder === "large" ? 1 : 0]; value = v.displacement / c; formula = "R = " + v.displacement + " ÷ " + c; }
  if (input.method === "documented") { value = v.value; formula = "メーカー資料・許可書等の法定冷凍能力 = " + v.value; }
  return calcFinished(value, "トン/日", formula, fields[0]);
}
export function calculatorContext(action, category, step, answers = {}) {
  if (action === "manufacture" && category === "refrigeration" && step.id === "capacityBand") return { kind: "refrigeration", activity: action, unit: "トン/日", category };
  if (action === "storage" && ["storageCapacityBand", "storageM", "storageS2"].includes(step.id)) return { kind: "storage", activity: action, unit: "m³", category };
  if (action === "consumption" && step.id === "consumptionStorageBand") return { kind: "storage", activity: action, unit: ["hydrogen","natgas"].includes(answers.consumptionGasType) ? "m³" : "kg", category };
  return null;
}
export function calculationAnswer(step, value) {
  if (!Number.isFinite(value) || value < 0) return null;
  if (step.type === "number") return { value: String(value), label: value.toFixed(2) + " " + (step.unit || "") };
  for (const key of ["over", "between"]) {
    const option = step.options?.find(o => o.value === key);
    const threshold = option?.label.match(/^([\d,]+(?:\.\d+)?)/)?.[1];
    if (threshold && value >= Number(threshold.replaceAll(",",""))) return option;
  }
  return step.options?.find(o => o.value === "under") || null;
}
export function calculationReferences(context) {
  if (context.kind === "refrigeration") return [["冷凍保安規則第5条", assistLawUrl("341M50000400051", "Mp-Ch_2-Se_1-At_5")]];
  return [
    [context.category === "lpgas" ? "液石則第2条第1項第6号" : "一般則第2条第1項第9号", assistLawUrl(context.category === "lpgas" ? "341M50000400052" : "341M50000400053", "Mp-Ch_1-At_2")],
    ["容器保安規則第22条（容器の充塡質量）", assistLawUrl("341M50000400050", "Mp-Ch_6-At_22")],
    ...(context.activity === "storage" ? [["高圧ガス保安法第16条第3項（10kgを1m³へ換算）", assistLawUrl("326AC0000000204", "Mp-Ch_2-At_16")]] : []),
  ];
}
