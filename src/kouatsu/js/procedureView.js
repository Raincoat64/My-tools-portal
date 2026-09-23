import { PROCEDURE_CHECKED_AT, REGULATION_LABELS, ACTIVITY_LABELS, SUBMISSION_GUIDE, NARA_PAGES, documentRequirement, documentFactKey } from "./procedures.js";

function pvNode(tag, text = "", className = "") {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (className) el.className = className;
  return el;
}
export function officialLink(label, url, className = "") {
  const a = pvNode("a", `${label} ↗`, className);
  a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
  a.append(pvNode("span", "(新しいタブで開きます)", "sr-only"));
  return a;
}
export function procedureListItem(procedure, onOpen) {
  const button = pvNode("button", "", "procedure-row");
  button.type = "button";
  button.append(pvNode("span", `${ACTIVITY_LABELS[procedure.activity] || "共通"} · ${procedure.regulations.map(r => REGULATION_LABELS[r]).join(" / ")}`, "procedure-meta"), pvNode("span", procedure.title, "pick-title"), pvNode("span", procedure.deadline, "pick-sub"));
  button.addEventListener("click", () => onOpen(procedure.procedureId));
  return button;
}
export function renderProcedureGuide(procedure, { facts = {}, checks = {}, onFact, onCheck, onRelated, contextLabel = "", headingLevel = 2 } = {}) {
  const wrap = pvNode("article", "", "procedure-guide");
  wrap.dataset.procedureId = procedure.procedureId;
  wrap.append(pvNode("p", `${ACTIVITY_LABELS[procedure.activity] || "共通"} / ${procedure.regulations.map(r => REGULATION_LABELS[r]).join("・")}`, "procedure-meta"));
  wrap.append(pvNode(`h${headingLevel}`, procedure.title, "procedure-title"));
  if (contextLabel) wrap.append(pvNode("p", contextLabel, "print-context"));
  wrap.append(pvNode("p", procedure.applicability, "guide-applicability"));
  const deadline = pvNode("div", "", "deadline-box");
  deadline.append(pvNode("strong", "提出・実施の時期"), pvNode("p", procedure.deadline));
  wrap.append(deadline);
  const jumps = pvNode("nav", "", "guide-jumps no-print"); jumps.setAttribute("aria-label", "申請準備の各項目");
  for (const [key, label] of [["documents", "書類を確認"], ["forms", "様式・記載例を開く"], ["submit", "提出先・方法を確認"]]) {
    const link = pvNode("a", label); link.href = `#${procedure.procedureId}-${key}`; jumps.append(link);
  }
  wrap.append(jumps);
  if (procedure.contact) {
    const contact = pvNode("section", "", "contact-step");
    contact.append(pvNode(`h${headingLevel + 1}`, "最初に：事前連絡・日程調整"), pvNode("p", procedure.contact));
    wrap.append(contact);
  }
  const docs = pvNode("section", "", "guide-section");
  docs.id = `${procedure.procedureId}-documents`;
  docs.append(pvNode(`h${headingLevel + 1}`, "1. 準備する書類"), pvNode("p", "チェックは準備状況のメモです。申請の受理や書類の適合を保証するものではありません。", "support-text"));
  if (procedure.preparation) docs.append(pvNode("p", procedure.preparation, "note-box"));
  const progress = pvNode("p", "", "check-progress");
  progress.setAttribute("role", "status");
  const updateProgress = () => {
    const inputs = [...docs.querySelectorAll('input[type="checkbox"]:not(:disabled)')];
    const unresolved = [...docs.querySelectorAll("[data-unconfirmed='true']")].length;
    progress.textContent = `準備済み ${inputs.filter(i => i.checked).length} / ${inputs.length}項目${unresolved ? ` · 適用条件の未確認 ${unresolved}項目` : ""}`;
  };
  const list = pvNode("ul", "", "document-list");
  for (const item of procedure.documents) {
    const row = pvNode("li", "", "document-row");
    const requirement = documentRequirement(item, facts);
    const labels = { required: "必須", conditional: "条件付き・要確認", oneOf: "いずれか一つ", unconfirmed: "条件未確認", notApplicable: "今回の回答では対象外" };
    row.dataset.unconfirmed = String(["unconfirmed", "conditional"].includes(requirement));
    row.classList.toggle("not-applicable", requirement === "notApplicable");
    const label = pvNode("label", "", "document-check");
    const checkbox = pvNode("input"); checkbox.type = "checkbox";
    checkbox.checked = Boolean(checks[item.id]); checkbox.disabled = requirement === "notApplicable";
    checkbox.dataset.documentId = item.id;
    checkbox.addEventListener("change", () => { onCheck?.(item.id, checkbox.checked); updateProgress(); });
    const description = pvNode("span");
    description.append(pvNode("span", labels[requirement], `requirement ${requirement}`), pvNode("strong", item.title));
    label.append(checkbox, description); row.append(label);
    if (item.condition) row.append(pvNode("p", item.condition, "document-help"));
    if (item.alternatives) {
      const options = pvNode("ul", "", "document-alternatives");
      item.alternatives.forEach(t => options.append(pvNode("li", t)));
      row.append(options);
    }
    if (item.kind === "conditional") {
      const factKey = documentFactKey(item);
      const conditionLabel = pvNode("label", "", "condition-field no-print");
      conditionLabel.append(pvNode("span", "この条件に該当しますか？"));
      const select = pvNode("select"); select.id = `fact-${procedure.procedureId}-${item.id}`;
      for (const [v, text] of [["unknown", "未確認"], ["yes", "該当する"], ["no", "該当しない"]]) { const opt = pvNode("option", text); opt.value = v; select.append(opt); }
      select.value = facts[factKey] || "unknown";
      select.addEventListener("change", () => onFact?.(factKey, select.value, select.id));
      conditionLabel.append(select); row.append(conditionLabel);
    }
    list.append(row);
  }
  docs.append(progress, list); wrap.append(docs); updateProgress();
  const forms = pvNode("section", "", "guide-section");
  forms.id = `${procedure.procedureId}-forms`;
  forms.append(pvNode(`h${headingLevel + 1}`, "2. 様式・記載例を開く"));
  const downloads = pvNode("div", "", "download-list");
  procedure.forms.forEach(f => downloads.append(officialLink(f.label, f.url, "download-link")));
  forms.append(downloads, pvNode("p", "奈良県が公開する公式ファイルを別タブで開きます。取得にはインターネット接続が必要です。ファイルが開かない場合は、下の掲載元ページから最新版を確認してください。", "support-text"), officialLink("奈良県の掲載元ページ", procedure.source));
  wrap.append(forms);
  const submit = pvNode("section", "", "guide-section");
  submit.id = `${procedure.procedureId}-submit`;
  submit.append(pvNode(`h${headingLevel + 1}`, "3. 提出する"));
  const dl = pvNode("dl", "", "submission-list");
  for (const [label, value] of [["提出部数", SUBMISSION_GUIDE.copies], ["提出方法", SUBMISSION_GUIDE.method], ["郵送時", SUBMISSION_GUIDE.post], ["手数料", procedure.fee], ["提出先", `${SUBMISSION_GUIDE.office}\n${SUBMISSION_GUIDE.address}`]]) { dl.append(pvNode("dt", label), pvNode("dd", value)); }
  const phone = pvNode("a", `${SUBMISSION_GUIDE.phone}（ナビダイヤル）`); phone.href = `tel:${SUBMISSION_GUIDE.phone}`;
  const phoneValue = pvNode("dd"); phoneValue.append(phone); dl.append(pvNode("dt", "電話"), phoneValue);
  submit.append(dl, officialLink("県の受付・提出方法の案内", NARA_PAGES.index)); wrap.append(submit);
  const source = pvNode("details", "", "support-details source-details");
  source.append(pvNode("summary", "根拠・情報の確認日"), pvNode("p", `法令上の手続き：${procedure.basis}`), pvNode("p", "添付書類一覧・提出部数・提出方法・事前連絡は奈良県の提出実務の案内です。施設条件により追加資料が必要な場合があります。"), pvNode("p", `案内データ確認日：${PROCEDURE_CHECKED_AT}。条文APIを更新しても、この案内・判定条件は自動更新されません。`), officialLink("根拠となる奈良県の案内", procedure.source));
  wrap.append(source, pvNode("p", `案内データ確認日：${PROCEDURE_CHECKED_AT} / 奈良県の公開案内に基づく参考情報`, "print-only guide-print-date"));
  if (onRelated) { const btn = pvNode("button", "変更・廃止や保安担当者の手続きも調べる", "btn-secondary no-print"); btn.type = "button"; btn.addEventListener("click", onRelated); wrap.append(btn); }
  return wrap;
}
