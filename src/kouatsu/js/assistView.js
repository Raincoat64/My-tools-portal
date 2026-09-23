import { PROCEDURE_CHECKED_AT, NARA_PAGES } from "./procedures.js";
import { officialLink } from "./procedureView.js";
import { GLOSSARY, relatedGlossary, assistLawUrl } from "./glossary.js";
import { KNOWN_REVISION_NOTE } from "./revisions.js";
import { REFRIGERATION_Q, REFRIGERATION_C, CALC_MANUAL_NOTE, calculatorContext, calculateRefrigeration, sumStorageRows, calculationAnswer, calculationReferences } from "./calculators.js";

function assistNode(tag, text = "", className = "") {
  const node = document.createElement(tag); node.textContent = text; node.className = className; return node;
}
function assistButton(label, callback) {
  const button = assistNode("button", label, "btn-secondary"); button.type = "button"; button.addEventListener("click", callback); return button;
}
export function renderGlossaryEntries(items = GLOSSARY) {
  const wrap = assistNode("div", "", "glossary-list");
  for (const item of items) {
    const entry = assistNode("details", "", "glossary-entry"); entry.dataset.term = item.id;
    entry.append(assistNode("summary", item.term), assistNode("p", item.text));
    for (const [label, lawId, anchor] of item.refs) entry.append(officialLink(label, assistLawUrl(lawId, anchor)));
    wrap.append(entry);
  }
  return wrap;
}
export function renderRevisionWarning(state) {
  const wrap = assistNode("aside", "", "revision-warning");
  wrap.hidden = state.status !== "ready" || !state.changes.length;
  if (wrap.hidden) return wrap;
  wrap.setAttribute("role", "note");
  wrap.append(assistNode("strong", "案内の確認後に、改正情報が見つかりました"));
  for (const change of state.changes) {
    const status = change.status === "CurrentEnforced" ? "確認後に施行された改正" : "確認していない施行予定の改正";
    wrap.append(assistNode("p", change.lawTitle + " — " + status + " / 施行日：" + change.enforcementDate + " / 改正法令：" + change.amendmentTitle));
  }
  wrap.append(assistNode("p", "この案内は" + PROCEDURE_CHECKED_AT + "時点の法令で確認しています。手続きの前に保安係へご確認ください。判定・案内は自動更新していません。"),
    officialLink("奈良県の手続き案内・保安係", NARA_PAGES.index));
  return wrap;
}
export function renderRevisionSource(state) {
  const wrap = assistNode("div", "", "revision-source");
  wrap.append(assistNode("p", KNOWN_REVISION_NOTE, "revision-known-note"));
  if (state.status === "failed") wrap.append(assistNode("p", "改正の有無を確認できませんでした", "revision-status"));
  else if (state.status === "ready") wrap.append(assistNode("p", "改正情報の照合日：" + new Date(state.checkedAt).toLocaleString("ja-JP") + "（照合結果は24時間保持）", "revision-status"));
  return wrap;
}
export function renderQuestionAssistance({ action, category, step, answers, onApply }) {
  const wrap = assistNode("div");
  const context = calculatorContext(action, category, step, answers);
  if (context) {
    const container = assistNode("div");
    const open = assistButton("計算補助を開く", () => {
      if (!container.childElementCount) container.append(renderCalculator(context, step, onApply));
      container.querySelector("h3").focus();
    });
    wrap.append(open, container);
  } else if (action === "manufacture" && category !== "refrigeration" && ["capacityBand","s1","s2"].includes(step.id)) {
    wrap.append(assistNode("p", "処理能力の計算補助はありません。許可申請書・届書の控え、メーカー資料に記載の処理能力を使って回答してください。", "processing-record-guide"));
  }
  wrap.append(assistNode("h3", "関連用語"), renderGlossaryEntries(relatedGlossary(action, category, step.id)));
  return wrap;
}
function renderCalculator(context, step, onApply) {
  const wrap = assistNode("section", "", "calculator-panel");
  const heading = assistNode("h3", context.kind === "refrigeration" ? "冷凍能力の計算補助" : "貯蔵能力の計算補助"); heading.tabIndex = -1;
  wrap.append(heading, assistNode("p", "算定条件が分かる設備だけを入力してください。結果の適用ボタンを押すまでは、設問の回答は変わりません。"));
  const body = assistNode("div"), result = assistNode("div", "", "calculator-result"); result.setAttribute("role","status");
  let sequence = 0;
  const inputErrors = new Map();
  const clearResult = () => result.replaceChildren();
  function field(parent, model, key, label, prefix) {
    const id = "calc-" + sequence++ + "-" + key;
    const labelNode = assistNode("label", label); labelNode.htmlFor = id;
    const input = assistNode("input"); input.type = "text"; input.inputMode = "decimal"; input.id = id; input.value = model[key] ?? ""; input.dataset.calcField = key;
    const error = assistNode("p", "", "calc-error"); error.id = id + "-error"; error.hidden = true;
    input.setAttribute("aria-describedby", error.id);
    input.addEventListener("input", () => { model[key] = input.value; clearResult(); error.hidden = true; input.removeAttribute("aria-invalid"); });
    const group = assistNode("div", "", "calc-field"); group.append(labelNode, input, error); parent.append(group);
    inputErrors.set(prefix + ":" + key, { input, error });
  }
  function select(parent, model, key, label, options, changed) {
    const group = assistNode("label", label, "calc-field");
    const control = assistNode("select"); control.dataset.calcSelect = key;
    for (const [value, text] of options) { const opt = assistNode("option", text); opt.value = value; control.append(opt); }
    if (!options.some(([v]) => v === model[key])) model[key] = options[0][0];
    control.value = model[key];
    control.addEventListener("change", () => { model[key] = control.value; clearResult(); changed?.(); });
    group.append(control); parent.append(group);
  }
  function showErrors(groups) {
    for (const { input, error } of inputErrors.values()) { error.hidden = true; input.removeAttribute("aria-invalid"); }
    groups.forEach((errors, index) => Object.entries(errors).forEach(([key, message]) => {
      const target = inputErrors.get(index + ":" + key) || [...inputErrors.entries()].find(([name]) => name.startsWith(index + ":"))?.[1];
      if (target) { target.error.textContent = message; target.error.hidden = false; target.input.setAttribute("aria-invalid","true"); }
    }));
    const first = [...inputErrors.values()].find(v => !v.error.hidden); first?.input.focus();
  }
  function display(calculation) {
    clearResult();
    if (!calculation.valid) {
      if (calculation.manualRequired) result.append(assistNode("p", CALC_MANUAL_NOTE));
      const groups = Array.isArray(calculation.errors) ? calculation.errors : [calculation.errors || {}];
      showErrors(groups); return;
    }
    showErrors([]);
    result.append(assistNode("strong", "計算結果：" + calculation.value.toFixed(2) + " " + calculation.unit, "calculation-value"));
    for (const formula of calculation.formulas || [calculation.formula]) result.append(assistNode("p", formula, "calculation-formula"));
    if (context.activity === "storage") result.append(assistNode("p", "換算前：圧縮ガス " + calculation.cubicMetres.toFixed(2) + " m³、液化ガス " + calculation.kilograms.toFixed(2) + " kg。液化ガス換算後：" + calculation.kilograms.toFixed(2) + " kg ÷ 10 = " + calculation.converted.toFixed(2) + " m³。合計 " + calculation.value.toFixed(2) + " m³。", "calculation-conversion"));
    for (const [label,url] of calculationReferences(context)) result.append(officialLink(label,url));
    const answer = calculationAnswer(step, calculation.value);
    if (answer) {
      result.append(assistNode("p", "この値は『" + answer.label + "』に当たります。区分は丸める前の値で確認しています。", "calculation-choice"),
        assistButton("この選択肢を選ぶ", () => onApply(answer.value)));
    }
  }
  if (context.kind === "refrigeration") {
    const model = { method: "documented", cylinder: "small" };
    const fields = assistNode("div", "", "calc-fields");
    const refresh = () => {
      fields.replaceChildren(); inputErrors.clear();
      const manual = ["multi-stage","multi-system","rotary","unsupported","cool-natural"].includes(model.method);
      if (manual) { fields.append(assistNode("p", CALC_MANUAL_NOTE)); return; }
      if (model.method === "natural" || model.method === "single") {
        const table = model.method === "natural" ? REFRIGERATION_Q : REFRIGERATION_C;
        select(fields, model, "refrigerant", "冷媒", [...Object.keys(table).map(n=>[n,n]),["other","表にない冷媒"]], refresh);
        if (model.refrigerant === "other") { fields.append(assistNode("p", CALC_MANUAL_NOTE)); return; }
      }
      if (model.method === "single") select(fields, model, "cylinder", "気筒1個の体積", [["small","5,000cm³以下"],["large","5,000cm³超"]]);
      const labels = { documented: ["value","記載された法定冷凍能力（トン/日）"], centrifugal: ["power","原動機の定格出力（kW）"], absorption: ["heat","発生器を加熱する1時間の入熱量（kJ）"], natural: ["area","冷媒ガスに接する側の表面積（m²）"], single: ["displacement","標準回転速度で1時間のピストン押しのけ量（m³）"] };
      const [key,label] = labels[model.method]; field(fields,model,key,label,0);
    };
    select(body,model,"method","計算方法", [
      ["documented","記載値を使う（メーカー資料・許可書等）"],["centrifugal","遠心式圧縮機"],["absorption","吸収式"],
      ["natural","自然環流式・自然循環式"],["single","単段の圧縮機（上記以外）"],["multi-stage","多段圧縮"],["multi-system","多元冷凍"],
      ["rotary","回転ピストン型"],["unsupported","表にない冷媒"],["cool-natural","前号の製造設備で自然循環式の冷媒ガスを冷凍"],
    ],refresh);
    body.append(fields); refresh();
    wrap.append(body,assistButton("計算する",()=>display(calculateRefrigeration(model))));
  } else {
    const rows = [{ method: "documented", unit: context.unit }], rowsElement = assistNode("div", "", "calc-rows");
    const refresh = () => {
      rowsElement.replaceChildren(); inputErrors.clear();
      rows.forEach((row,index) => {
        const group = assistNode("fieldset", "", "calc-row"); group.append(assistNode("legend","設備 " + (index+1)));
        const methods = [["documented","記載値を使う（メーカー資料・許可書等）"]];
        if (context.activity === "storage" || context.unit === "m³") methods.push(["compressed","圧縮ガス"]);
        if (context.activity === "storage" || context.unit === "kg") methods.push(["tank","液化ガスの貯槽"], ...(context.category === "lpgas" ? [["bulk","液化石油ガスのバルク貯槽"]] : []),["containers","液化ガスの容器"],["low-temperature","低温貯槽（記載値で確認）"]);
        select(group,row,"method","設備・入力方法",methods,refresh);
        if (row.method === "documented") {
          if (context.activity === "storage") select(group,row,"unit","記載値の単位",[["m³","m³（圧縮ガス・換算済み容積）"],["kg","kg（液化ガスの質量）"]],refresh);
          field(group,row,"value","記載値（" + row.unit + "）",index);
        }
        if (row.method === "compressed") {
          group.append(assistNode("p","Pは35℃（アセチレンは15℃）での最高充塡圧力です。内容積はm³で入力してください。"));
          field(group,row,"pressure","最高充塡圧力 P（MPa）",index); field(group,row,"volume","内容積 V1（m³）",index);
        }
        if (["tank","bulk"].includes(row.method)) {
          group.append(assistNode("p","常用温度での比重（kg/L）を使用します。低温貯槽は計算せず「記載値を使う」で確認してください。"));
          field(group,row,"density","液化ガスの比重 w（kg/L）",index); field(group,row,"volume","内容積（L）",index);
          if (row.method === "bulk") {
            group.append(assistNode("p","地盤面下で内容積2,000L以上のものは、貯槽の式 W = 0.9 × w × V を使います。"));
            const label = assistNode("label","地盤面下の貯槽","calc-check"); const input=assistNode("input"); input.type="checkbox"; input.checked=Boolean(row.underground);
            input.addEventListener("change",()=>{ row.underground=input.checked; clearResult(); }); label.prepend(input); group.append(label);
          }
        }
        if (row.method === "containers") {
          group.append(assistNode("p","容器保安規則第22条で求めた各容器の充塡質量を使用します。係数表からの計算は行いません。"));
          field(group,row,"mass","容器1本の充塡質量（kg）",index); field(group,row,"count","本数",index);
        }
        if (row.method === "low-temperature") group.append(assistNode("p",CALC_MANUAL_NOTE));
        if (rows.length>1) group.append(assistButton("この設備を削除",()=>{ rows.splice(index,1); clearResult(); refresh(); }));
        rowsElement.append(group);
      });
    };
    body.append(rowsElement,assistButton("設備を追加",()=>{ rows.push({method:"documented",unit:context.unit}); clearResult(); refresh(); }));
    refresh(); wrap.append(body,assistButton("計算する",()=>display(sumStorageRows(rows,context))));
  }
  wrap.append(result);
  return wrap;
}
