import { PROCEDURE_VERSION, PURPOSES, getLifecycleSteps, getProcedure, documentFactKey } from "./procedures.js";
import { ACTION_TYPES, getCategoriesForAction, getStepsForGasCategory } from "./diagnosis.js";

export const PORTABLE_MAX_BYTES = 1024 * 1024;
export const SHARE_MAX_LENGTH = 2000;
export const SHARE_FRAGMENT_PREFIX = "#kn=";
function portableError(message) { throw new Error(message); }
function portableObject(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) portableError(label + "の形式が正しくありません。");
  if (Object.keys(value).some(key => !allowed.includes(key))) portableError(label + "に未知の項目があります。");
}
function portableBoolean(value) { if (typeof value !== "boolean") portableError("結果の状態が正しくありません。"); }
function portableAnswers(answers, steps) {
  portableObject(answers, steps.map(s => s.id), "回答（設問ID）");
  for (const [key, value] of Object.entries(answers)) {
    const step = steps.find(s => s.id === key);
    if (step.type === "choice") {
      if (!step.options.some(o => o.value === value)) portableError("未知の選択肢があります：" + key);
    } else if (!["number","string"].includes(typeof value) || String(value).trim() === "" || !Number.isFinite(Number(value)) || Number(value) < 0 || String(value).length > 100) portableError("数値の回答が正しくありません：" + key);
  }
}
function portablePosition(data, steps, unconfirmed = false) {
  if (!Number.isInteger(data.stepIndex) || data.stepIndex < 0 || data.stepIndex >= Math.max(1, steps.length)) portableError("設問位置が正しくありません。");
  portableBoolean(data.finished);
  if (unconfirmed && !data.finished) portableError("未確認結果の状態が正しくありません。");
  if (!steps.length) {
    if (data.finished || Object.keys(data.answers).length) portableError("回答する設問がありません。");
    return;
  }
  const required = data.finished && !unconfirmed ? steps : steps.slice(0, data.stepIndex);
  if (required.some(s => !Object.hasOwn(data.answers, s.id))) portableError("前の設問への回答が不足しています。");
  if ((!data.finished || unconfirmed) && steps.slice(data.stepIndex).some(s => Object.hasOwn(data.answers, s.id))) portableError("設問位置と回答が一致しません。");
}
function portableDiagnosis(diag) {
  portableObject(diag, ["actionType","gasCategory","stepIndex","answers","finished","unconfirmed"], "診断");
  portableBoolean(diag.unconfirmed);
  if (diag.actionType !== null && !ACTION_TYPES.some(a => a.id === diag.actionType)) portableError("行為の区分が正しくありません。");
  if (diag.gasCategory !== null && (!diag.actionType || !getCategoriesForAction(diag.actionType).some(g => g.id === diag.gasCategory))) portableError("ガスの区分が正しくありません。");
  const steps = diag.gasCategory ? getStepsForGasCategory(diag.actionType, diag.gasCategory, diag.answers) : [];
  portableAnswers(diag.answers, steps);
  portablePosition(diag, steps, diag.unconfirmed);
}
function portableLifecycle(nav) {
  if (nav.purpose !== null && !PURPOSES.some(p => p.id === nav.purpose)) portableError("目的が正しくありません。");
  const steps = nav.purpose && nav.purpose !== "new" ? getLifecycleSteps(nav.purpose, nav.answers) : [];
  portableAnswers(nav.answers, steps);
  portablePosition(nav, steps);
}
function portablePreparationContext(context) {
  if (Object.hasOwn(context, "answers")) {
    portableObject(context, ["activity","regulation","answers"], "書類の回答条件");
    if (!ACTION_TYPES.some(a => a.id === context.activity) || !getCategoriesForAction(context.activity).some(g => g.id === context.regulation)) portableError("書類の区分が正しくありません。");
    portableAnswers(context.answers, getStepsForGasCategory(context.activity, context.regulation, context.answers));
  } else if (Object.keys(context).length) {
    // 保存キーには目的を含まないため、いずれかの既存目的の質問集合に一致することを検査。
    const valid = PURPOSES.filter(p => p.id !== "new").some(p => {
      try { portableAnswers(context, getLifecycleSteps(p.id, context)); return true; } catch { return false; }
    });
    if (!valid) portableError("書類の回答条件が正しくありません。");
  }
}
function portablePreparations(preparations) {
  if (!preparations || typeof preparations !== "object" || Array.isArray(preparations)) portableError("書類チェックの形式が正しくありません。");
  for (const [scope, state] of Object.entries(preparations)) {
    const match = scope.match(/^([A-Za-z0-9-]{1,80}):([a-z0-9-]+):(.+)$/);
    const procedure = match && getProcedure(match[2]);
    if (!procedure) portableError("未知の手続きの書類チェックがあります。");
    let context;
    try { context = JSON.parse(match[3]); } catch { portableError("書類の回答条件を読み取れません。"); }
    if (!context || Array.isArray(context) || typeof context !== "object") portableError("書類の回答条件が正しくありません。");
    portablePreparationContext(context);
    portableObject(state, ["facts","checks","lastUsedAt"], "書類チェック");
    portableObject(state.facts, procedure.documents.filter(d => d.kind === "conditional").map(documentFactKey), "書類条件");
    if (Object.values(state.facts).some(v => !["yes","no","unknown"].includes(v))) portableError("未知の書類条件があります。");
    portableObject(state.checks, procedure.documents.map(d => d.id), "書類チェック");
    if (Object.values(state.checks).some(v => typeof v !== "boolean")) portableError("書類チェックが正しくありません。");
    if (state.lastUsedAt !== undefined && (!Number.isFinite(state.lastUsedAt) || state.lastUsedAt < 0)) portableError("書類の保存日時が正しくありません。");
  }
}
export function validatePortableState(state, { includeChecks = true } = {}) {
  portableObject(state, ["mode","diag","nav"], "画面");
  if (!["diagnosis","lifecycle","detail"].includes(state.mode)) portableError("共有する画面の種類が正しくありません。");
  portableDiagnosis(state.diag);
  const nav = state.nav;
  portableObject(nav, ["purpose","answers","stepIndex","finished","selectedId","returnMode","caseId", ...(includeChecks ? ["preparations"] : [])], "手続き");
  portableLifecycle(nav);
  if (typeof nav.caseId !== "string" || !/^[A-Za-z0-9-]{1,80}$/.test(nav.caseId)) portableError("案件の識別子が正しくありません。");
  if (!["catalogue","diagnosis","lifecycle","detail","home"].includes(nav.returnMode)) portableError("戻り先が正しくありません。");
  if (nav.selectedId !== null && !getProcedure(nav.selectedId)) portableError("未知の手続きです。");
  if (state.mode === "detail" && !nav.selectedId) portableError("表示する手続きがありません。");
  if (state.mode === "lifecycle" && (!nav.purpose || nav.purpose === "new")) portableError("手続きの目的がありません。");
  if (nav.preparations !== undefined) portablePreparations(nav.preparations);
  return state;
}
export function makePortableEnvelope(draft, { includeChecks = true, now = new Date() } = {}) {
  const d = draft.diag, n = draft.nav;
  const state = {
    mode: draft.mode,
    diag: { actionType: d.actionType ?? null, gasCategory: d.gasCategory ?? null, stepIndex: d.stepIndex, answers: { ...d.answers }, finished: d.finished, unconfirmed: d.unconfirmedResult?.verdict === "needs_confirmation" },
    nav: { purpose: n.purpose ?? null, answers: { ...n.answers }, stepIndex: n.stepIndex, finished: n.finished, selectedId: n.selectedId ?? null, returnMode: n.returnMode || "catalogue", caseId: n.caseId,
      ...(includeChecks ? { preparations: structuredClone(n.preparations || {}) } : {}) },
  };
  validatePortableState(state, { includeChecks });
  return { format: "kouatsu-navi", schemaVersion: 1, procedureVersion: PROCEDURE_VERSION, savedAt: now.toISOString(), state };
}
export function parsePortableEnvelope(text, { includeChecks = true } = {}) {
  if (new TextEncoder().encode(text).byteLength > PORTABLE_MAX_BYTES) portableError("1MB以下のファイルを選んでください。");
  let envelope;
  try { envelope = JSON.parse(text); } catch { portableError("JSONの形式を読み取れません。"); }
  portableObject(envelope, ["format","schemaVersion","procedureVersion","savedAt","state"], "ファイル");
  if (envelope.format !== "kouatsu-navi" || envelope.schemaVersion !== 1) portableError("ファイルの形式・形式の版が異なります。");
  if (envelope.procedureVersion !== PROCEDURE_VERSION) portableError("判定条件の版が異なります。古い回答は読み込まず、現在の質問に改めて回答してください。");
  if (typeof envelope.savedAt !== "string" || envelope.savedAt.length > 40 || !Number.isFinite(Date.parse(envelope.savedAt))) portableError("保存日時が正しくありません。");
  validatePortableState(envelope.state, { includeChecks });
  return envelope;
}
export async function readPortableFile(file) {
  if (!file || file.size > PORTABLE_MAX_BYTES) portableError("1MB以下のファイルを選んでください。");
  return parsePortableEnvelope(await file.text());
}
export function portableFilename(date = new Date()) {
  return "kouatsu-navi-" + date.getFullYear() + String(date.getMonth()+1).padStart(2,"0") + String(date.getDate()).padStart(2,"0") + ".json";
}
async function portableReadStream(stream) {
  const reader = stream.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > PORTABLE_MAX_BYTES) { await reader.cancel(); portableError("共有データが大きすぎます。"); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
function portableBase64(bytes) {
  let text = "";
  for (let i=0; i<bytes.length; i+=8192) text += String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(text).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
}
export async function createShareUrl(draft, baseUrl, { Compressor = globalThis.CompressionStream } = {}) {
  const envelope = makePortableEnvelope(draft, { includeChecks: false });
  let bytes = new TextEncoder().encode(JSON.stringify(envelope)), encoding = "u";
  if (Compressor) {
    try { bytes = await portableReadStream(new Blob([bytes]).stream().pipeThrough(new Compressor("deflate-raw"))); encoding = "d"; }
    catch { /* 非対応ブラウザーは標準の非圧縮形式で共有する。 */ }
  }
  const url = baseUrl.split("#")[0] + SHARE_FRAGMENT_PREFIX + "1." + encoding + "." + portableBase64(bytes);
  if (url.length > SHARE_MAX_LENGTH) portableError("共有URLが2,000文字を超えます。JSONファイルに書き出して共有してください。");
  return url;
}
export async function decodeShareFragment(fragment, { Decompressor = globalThis.DecompressionStream } = {}) {
  if (fragment.length > SHARE_MAX_LENGTH) portableError("共有URLが長すぎます。JSONファイルを読み込んでください。");
  const match = fragment.match(/^#kn=1\.([ud])\.([A-Za-z0-9_-]+)$/);
  if (!match) portableError("共有URLを復号できません。形式を確認してください。");
  let bytes;
  try {
    const binary = atob(match[2].replaceAll("-","+").replaceAll("_","/"));
    bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    if (match[1] === "d") {
      if (!Decompressor) portableError("圧縮に未対応です。JSONファイルを使ってください。");
      bytes = await portableReadStream(new Blob([bytes]).stream().pipeThrough(new Decompressor("deflate-raw")));
    }
  } catch { portableError("共有URLを復号できません。JSONファイルでの読み込みをお試しください。"); }
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { portableError("共有URLを復号できません。"); }
  return parsePortableEnvelope(text, { includeChecks: false });
}
