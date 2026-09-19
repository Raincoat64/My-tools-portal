import { TARGET_LAWS, findLawMeta } from "./constants.js";
import { fetchLawData } from "./api.js";
import { buildChapters, getMainProvision, getLawTitle, findArticleByNum } from "./lawTree.js";
import { renderArticle } from "./render.js";
import { PROCEDURE_VERSION, PROCEDURE_CHECKED_AT, PROCEDURES, PURPOSES, REGULATION_LABELS, ACTIVITY_LABELS, NARA_PAGES, getProcedure, searchProcedures, diagnosisProcedureIds, getLifecycleSteps, evaluateLifecycle, lifecycleFacts, minorLawLink } from "./procedures.js";
import { officialLink, procedureListItem, renderProcedureGuide } from "./procedureView.js";
import {
  ACTION_TYPES,
  getCategoriesForAction,
  getStepsForGasCategory,
  evaluateDiagnosis,
  METI_REFERENCE,
} from "./diagnosis.js";
import {
  getCachedLaw,
  putCachedLaw,
  addHistoryEntry,
  listHistory,
  clearHistory,
  deleteHistoryEntry,
  readDraft,
  writeDraft,
} from "./storage.js";

const breadcrumbEl = document.getElementById("breadcrumb");
const stageEl = document.getElementById("stage");
const historyListEl = document.getElementById("history-list");
const clearHistoryBtn = document.getElementById("clear-history-btn");
const toastEl = document.getElementById("toast");
const modeTabsEl = document.getElementById("mode-tabs");

const appState = {
  mode: "home",
  diag: {
    actionType: null,
    gasCategory: null,
    stepIndex: 0,
    answers: {},
    result: null,
    expandedCitations: new Set(),
    citationCache: new Map(), // "lawId:num" -> {status, article, message}
  },
  browse: {
    law: null,
    lawData: null,
    lawTitle: "",
    chapters: [],
    chapter: null,
    section: null,
    article: null,
  },
};
const navigationState = { purpose: null, answers: {}, stepIndex: 0, result: null, selectedId: null, returnMode: "catalogue", query: "", filters: {}, preparations: {}, caseId: "initial", saved: null };
let draftReady = false;
let saveQueue = Promise.resolve();
const lawFetchedAt = new Map();
let citationRenderIndex = 0;

function navigationButton(text, handler, className = "btn-secondary") {
  const button = document.createElement("button"); button.type = "button"; button.className = className; button.textContent = text;
  button.addEventListener("click", handler); return button;
}
function navigationText(tag, text, className = "") {
  const el = document.createElement(tag); el.textContent = text; el.className = className; return el;
}
function storageWarning() {
  const el = document.getElementById("storage-status");
  el.hidden = false; el.textContent = "このブラウザーでは端末内保存が使えません。案内は利用できますが、閉じる前に印刷・PDF保存してください。";
}
function currentDraft() {
  return { version: PROCEDURE_VERSION, savedAt: new Date().toISOString(), mode: appState.mode,
    diag: { actionType: appState.diag.actionType, gasCategory: appState.diag.gasCategory, stepIndex: appState.diag.stepIndex, answers: appState.diag.answers, finished: Boolean(appState.diag.result) },
    nav: { purpose: navigationState.purpose, answers: navigationState.answers, stepIndex: navigationState.stepIndex, finished: Boolean(navigationState.result), selectedId: navigationState.selectedId, returnMode: navigationState.returnMode, caseId: navigationState.caseId, preparations: navigationState.preparations },
  };
}
function persistDraft() {
  if (!draftReady) return;
  const snapshot = JSON.parse(JSON.stringify(currentDraft()));
  navigationState.saved = snapshot;
  saveQueue = saveQueue.then(() => writeDraft(snapshot)).catch(storageWarning);
}
function navigateHome() { appState.mode = "home"; render(); }
function beginPurpose(purpose) {
  navigationState.purpose = purpose; navigationState.answers = {}; navigationState.stepIndex = 0; navigationState.result = null;
  navigationState.caseId = Date.now().toString(36);
  if (purpose === "new") { appState.mode = "diagnosis"; resetDiagnosis(); }
  else { appState.mode = "lifecycle"; render(); }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showToast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  toastEl.style.background = isError ? "var(--danger)" : "var(--text)";
  toastEl.style.color = isError ? "#fff" : "var(--bg)";
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    toastEl.hidden = true;
  }, 3200);
}

// --- 法令データ取得(キャッシュ優先、対象4法令・参照法令いずれにも使える) ---

async function loadLawData(lawMeta, { forceRefresh = false } = {}) {
  let cached = null;
  try { cached = await getCachedLaw(lawMeta.lawId); } catch { storageWarning(); }
  if (cached && !forceRefresh) {
    lawFetchedAt.set(lawMeta.lawId, cached.fetchedAt);
    return cached.data;
  }
  try {
    const data = await fetchLawData(lawMeta.lawId);
    lawFetchedAt.set(lawMeta.lawId, new Date().toISOString());
    try { await putCachedLaw(lawMeta.lawId, data, data?.revision_info?.updated || null); } catch { storageWarning(); }
    return data;
  } catch (error) {
    if (!cached) throw error;
    lawFetchedAt.set(lawMeta.lawId, cached.fetchedAt);
    showToast("最新版を取得できませんでした。取得日を確認のうえ、保存済み条文を参照してください。", true);
    return cached.data;
  }
}

// --- モード切替 ---

function setMode(mode) {
  appState.mode = mode;
  render();
}

function updateModeTabs() {
  modeTabsEl.querySelectorAll(".mode-tab").forEach((btn) => {
    const active = btn.dataset.mode === appState.mode;
    btn.classList.toggle("active", active);
    if (active) btn.setAttribute("aria-current", "page"); else btn.removeAttribute("aria-current");
  });
}

modeTabsEl.querySelectorAll(".mode-tab").forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

function render() {
  citationRenderIndex = 0;
  const activeId = document.activeElement?.id;
  const openDetails = [...stageEl.querySelectorAll("details[open][data-disclosure]")].map(el => el.dataset.disclosure);
  updateModeTabs();
  if (appState.mode === "diagnosis") {
    renderDiagBreadcrumb();
    renderDiagStage();
  } else if (appState.mode === "browse") {
    renderBrowseBreadcrumb();
    renderBrowseStage();
  } else {
    breadcrumbEl.replaceChildren(crumbButton("ホーム", navigateHome));
    stageEl.replaceChildren();
    if (appState.mode === "home") stageEl.append(renderNavigationHome());
    if (appState.mode === "catalogue") stageEl.append(renderCatalogue());
    if (appState.mode === "lifecycle") stageEl.append(renderLifecycle());
    if (appState.mode === "detail") stageEl.append(renderSelectedProcedure());
  }
  for (const el of stageEl.querySelectorAll("details[data-disclosure]")) if (openDetails.includes(el.dataset.disclosure)) el.open = true;
  const focusTarget = activeId && document.getElementById(activeId);
  if (focusTarget && stageEl.contains(focusTarget)) focusTarget.focus({ preventScroll: true });
  else { const heading = stageEl.querySelector("h2"); if (heading) { heading.tabIndex = -1; heading.focus(); } }
  if (appState.mode !== "home" && appState.mode !== "browse") persistDraft();
}

function crumbButton(label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function crumbCurrent(label) {
  const span = document.createElement("span");
  span.className = "crumb-current";
  span.textContent = label;
  return span;
}

function crumbSep() {
  const s = document.createElement("span");
  s.className = "crumb-sep";
  s.textContent = "›";
  return s;
}

/* =========================================================
   設問モード (diagnosis)
   ========================================================= */

function resetDiagnosis() {
  appState.diag = {
    actionType: null,
    gasCategory: null,
    stepIndex: 0,
    answers: {},
    result: null,
    expandedCitations: new Set(),
    citationCache: new Map(),
  };
  render();
}

function selectActionType(actionType) {
  if (!actionType.available) return;
  appState.diag.actionType = actionType.id;
  appState.diag.gasCategory = null;
  appState.diag.stepIndex = 0;
  appState.diag.answers = {};
  appState.diag.result = null;
  render();
}

function selectGasCategory(gasCategory) {
  appState.diag.gasCategory = gasCategory.id;
  appState.diag.stepIndex = 0;
  appState.diag.answers = {};
  appState.diag.result = null;
  render();
}

async function finalizeDiagnosisResult() {
  const result = evaluateDiagnosis(appState.diag.actionType, appState.diag.gasCategory, appState.diag.answers);
  appState.diag.result = result;
  render();

  if (result.verdict !== "invalid") {
    try {
      await addHistoryEntry({
        type: "diagnosis",
        version: PROCEDURE_VERSION,
        actionType: appState.diag.actionType,
        actionLabel: ACTION_TYPES.find((a) => a.id === appState.diag.actionType)?.label,
        gasCategory: appState.diag.gasCategory,
        gasCategoryLabel: getCategoriesForAction(appState.diag.actionType).find((g) => g.id === appState.diag.gasCategory)?.label,
        answers: { ...appState.diag.answers },
        verdict: result.verdict,
        title: result.title,
        summary: result.summary,
      });
      await renderHistory();
    } catch (err) {
      console.error("履歴の保存に失敗しました", err);
    }
  }
}

function formatAnswerLabel(step, value) {
  if (step.type === "choice") {
    const opt = step.options.find((o) => o.value === value);
    return opt ? opt.label : String(value);
  }
  return `${value}${step.unit ? " " + step.unit : ""}`;
}

function goToDiagStep(index) {
  const steps = getStepsForGasCategory(appState.diag.actionType, appState.diag.gasCategory, appState.diag.answers);
  for (let j = index; j < steps.length; j++) {
    delete appState.diag.answers[steps[j].id];
  }
  appState.diag.stepIndex = index;
  appState.diag.result = null;
  render();
}

async function answerStep(step, value) {
  appState.diag.answers[step.id] = value;
  const steps = getStepsForGasCategory(appState.diag.actionType, appState.diag.gasCategory, appState.diag.answers);
  if (appState.diag.stepIndex < steps.length - 1) {
    appState.diag.stepIndex += 1;
    render();
    return;
  }
  // 最終設問に回答 → 判定
  await finalizeDiagnosisResult();
}

function renderDiagBreadcrumb() {
  breadcrumbEl.replaceChildren(crumbButton("ホーム", navigateHome), crumbSep(), crumbCurrent("新しく始める"));
  if (appState.diag.actionType) {
    breadcrumbEl.append(crumbSep(), crumbButton(ACTIVITY_LABELS[appState.diag.actionType], () => selectActionType(ACTION_TYPES.find(a => a.id === appState.diag.actionType))));
  }
  if (appState.diag.gasCategory) breadcrumbEl.append(crumbSep(), crumbCurrent(REGULATION_LABELS[appState.diag.gasCategory]));
}

function renderDiagStage() {
  const d = appState.diag;
  if (d.actionType && d.gasCategory && !d.result) {
    const pending = getStepsForGasCategory(d.actionType, d.gasCategory, d.answers);
    if (d.stepIndex >= pending.length) { finalizeDiagnosisResult(); return; }
  }
  stageEl.replaceChildren();
  const progress = navigationText("ol", "", "flow-progress");
  ["取扱い", "ガス・設備の条件", "手続き・申請準備"].forEach((label, i) => {
    const item = navigationText("li", label);
    const active = d.result ? i === 2 : d.gasCategory ? i === 1 : i === 0;
    if (active) item.setAttribute("aria-current", "step");
    progress.append(item);
  });
  stageEl.append(progress);
  if (!d.actionType) stageEl.append(renderActionTypeStep());
  else if (!d.gasCategory) stageEl.append(renderGasCategoryStep());
  else if (d.result) stageEl.append(renderResultStep());
  else {
    stageEl.append(renderQuestionStep());
    const steps = getStepsForGasCategory(d.actionType, d.gasCategory, d.answers);
    const current = steps[d.stepIndex];
    const help = document.createElement("details"); help.className = "support-details no-print";
    help.append(navigationText("summary", "答えが分からないとき"));
    help.append(navigationText("p", "許可申請書・届書の控え、設備仕様書、能力計算書、ガスのSDSで確認できます。能力は現在の使用量ではなく、法令上の処理・貯蔵・冷凍能力を用います。"));
    help.append(navigationButton("未確認の条件として残す", () => {
      d.result = { verdict: "needs_confirmation", title: "この条件を確認してから判定してください", summary: current.prompt, note: "未確認のまま手続き不要とは判断しません。資料を確認して回答を修正するか、手続き一覧から候補の書類をご覧ください。", citations: [], procedures: [] }; render();
    }));
    stageEl.append(help);
  }
  if (d.actionType) stageEl.append(navigationButton("一つ前に戻る", () => {
    if (d.result) goToDiagStep(d.stepIndex);
    else if (d.gasCategory && d.stepIndex > 0) goToDiagStep(d.stepIndex - 1);
    else if (d.gasCategory) selectActionType(ACTION_TYPES.find(a => a.id === d.actionType));
    else resetDiagnosis();
  }, "btn-link no-print"));
  if (d.gasCategory) stageEl.append(renderAnswerSummary(false));
}

function renderActionTypeStep() {
  const wrap = document.createElement("div");
  const h2 = document.createElement("h2");
  h2.textContent = "新しく始める事業・取扱いを選んでください";
  wrap.appendChild(h2);

  const grid = document.createElement("div");
  grid.className = "card-grid";
  for (const action of ACTION_TYPES) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "pick-card";
    if (!action.available) card.style.opacity = "0.5";
    const examples = { manufacture: "圧縮・液化、容器への充塡、冷凍設備の設置など", storage: "容器置場・タンク等でガスを保管する", consumption: "工場等でガスを使用する", sales: "高圧ガスや冷媒を販売する" };
    card.innerHTML = `<span class="pick-title">${escapeHtml(action.label)}</span><span class="pick-sub">${escapeHtml(examples[action.id])}</span>`;
    card.addEventListener("click", () => selectActionType(action));
    grid.appendChild(card);
  }
  wrap.appendChild(grid);
  return wrap;
}

function renderGasCategoryStep() {
  const wrap = document.createElement("div");
  const h2 = document.createElement("h2");
  h2.textContent =
    appState.diag.actionType === "sales"
      ? "どのガスを販売しますか?"
      : appState.diag.actionType === "storage"
      ? "どのガスを貯蔵しますか?"
      : appState.diag.actionType === "consumption"
      ? "どのガスを消費しますか?"
      : "どのガスを製造しますか?";
  wrap.appendChild(h2);

  const list = document.createElement("div");
  list.className = "pick-list";
  for (const category of getCategoriesForAction(appState.diag.actionType)) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "pick-card";
    card.innerHTML = `<span class="pick-title">${escapeHtml(category.label)}</span><span class="pick-sub">${escapeHtml(
      category.help || ""
    )}</span>`;
    card.addEventListener("click", () => selectGasCategory(category));
    list.appendChild(card);
  }
  wrap.appendChild(list);
  return wrap;
}

function renderQuestionStep() {
  const steps = getStepsForGasCategory(appState.diag.actionType, appState.diag.gasCategory, appState.diag.answers);
  const step = steps[appState.diag.stepIndex];
  const wrap = document.createElement("div");

  const h2 = document.createElement("h2");
  h2.textContent = step.prompt;
  wrap.appendChild(h2);

  if (step.help) {
    const help = document.createElement("div");
    help.className = "diag-help";
    help.textContent = step.help;
    wrap.appendChild(help);
  }

  if (step.type === "choice") {
    const list = document.createElement("div");
    list.className = "pick-list";
    for (const opt of step.options) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "pick-card";
      card.innerHTML = `<span class="pick-title">${escapeHtml(opt.label)}</span>${
        opt.help ? `<span class="pick-sub">${escapeHtml(opt.help)}</span>` : ""
      }`;
      card.addEventListener("click", () => answerStep(step, opt.value));
      list.appendChild(card);
    }
    wrap.appendChild(list);
  } else if (step.type === "number") {
    const row = document.createElement("div");
    row.className = "diag-number-row";
    const input = document.createElement("input");
    input.type = "number";
    input.min = String(step.min ?? 0);
    input.step = "any";
    input.placeholder = "数値を入力";
    input.setAttribute("aria-label", `${step.prompt}（${step.unit || "数値"}）`);
    const unit = document.createElement("span");
    unit.className = "unit";
    unit.textContent = step.unit || "";
    row.appendChild(input);
    row.appendChild(unit);
    wrap.appendChild(row);

    const actions = document.createElement("div");
    actions.className = "diag-actions";
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "btn-primary";
    nextBtn.textContent = "次へ";
    nextBtn.disabled = true;
    input.addEventListener("input", () => {
      const v = Number(input.value);
      nextBtn.disabled = input.value === "" || !Number.isFinite(v) || v < (step.min ?? 0);
    });
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !nextBtn.disabled) answerStep(step, input.value);
    });
    nextBtn.addEventListener("click", () => answerStep(step, input.value));
    actions.appendChild(nextBtn);
    wrap.appendChild(actions);

    setTimeout(() => input.focus(), 0);
  }

  return wrap;
}

function verdictLabel(verdict) {
  if (verdict === "permit") return "許可";
  if (verdict === "notification") return "届出";
  if (verdict === "other_law") return "他法令の対象";
  if (verdict === "invalid" || verdict === "needs_confirmation") return "条件の確認が必要";
  return "対象外の可能性";
}

function renderResultStep() {
  const result = appState.diag.result;
  const wrap = document.createElement("div");
  wrap.append(navigationText("h2", "手続きの確認結果"));
  const banner = navigationText("div", "", "verdict-banner " + result.verdict);
  banner.append(navigationText("h3", result.title || result.message || "回答を確認してください", "verdict-title"), navigationText("p", result.summary || result.message || "", "verdict-summary"));
  wrap.append(banner);
  if (result.note) wrap.append(navigationText("p", result.note, "note-box"));
  const ids = diagnosisProcedureIds(appState.diag.actionType, appState.diag.gasCategory, result);
  for (const id of ids) { const p = getProcedure(id); if (p) wrap.append(renderGuide(p)); }
  if (!ids.length) {
    if (result.verdict === "other_law") wrap.append(officialLink("LP法の公式手続き案内", NARA_PAGES.lplaw));
    wrap.append(navigationButton("手続き名・様式から探す", () => { navigationState.filters = { activity: appState.diag.actionType }; setMode("catalogue"); }));
    wrap.append(navigationText("p", "この結果は選択した行為についての案内です。貯蔵・製造などを併せて行う場合は、それぞれ確認してください。", "support-text"));
  }
  const future = document.createElement("details"); future.className = "support-details no-print"; future.dataset.disclosure = "future";
  future.append(navigationText("summary", "事業開始後・変更時に必要となる手続きと義務"));
  for (const citation of result.procedures || []) future.append(renderCitationCard(citation));
  future.append(navigationButton("変更・検査・担当者などを目的から調べる", navigateHome));
  wrap.append(future);
  const laws = document.createElement("details"); laws.className = "support-details"; laws.dataset.disclosure = "laws";
  laws.append(navigationText("summary", "判定の根拠条文・技術基準"));
  for (const citation of result.citations || []) laws.append(renderCitationCard(citation));
  laws.append(officialLink("経済産業省の例示基準・運用解釈", METI_REFERENCE.url));
  wrap.append(laws, renderPrintActions());
  return wrap;
}

function renderCitationCard(citation) {
  const key = `${citation.lawId}:${citation.num}`;
  const card = document.createElement("div");
  card.className = "citation-card";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.id = `citation-${citation.lawId}-${citation.num}-${citationRenderIndex++}`;
  toggle.className = "citation-toggle";
  const expanded = appState.diag.expandedCitations.has(key);
  toggle.textContent = `${expanded ? "▾" : "▸"} ${citation.label}`;
  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.addEventListener("click", () => toggleCitation(citation));
  card.appendChild(toggle);

  if (expanded) {
    const body = document.createElement("div");
    body.className = "citation-body";
    const cached = appState.diag.citationCache.get(key);
    if (!cached || cached.status === "loading") {
      body.innerHTML = `<div class="loading">条文を読み込んでいます…</div>`;
    } else if (cached.status === "error") {
      body.innerHTML = `<div class="error-box">条文を取得できませんでした。申請案内は引き続き利用できます。</div>`;
      body.append(officialLink("e-Govで法令を確認", `https://laws.e-gov.go.jp/law/${citation.lawId}`));
    } else if (cached.status === "notfound") {
      body.innerHTML = `<div class="error-box">該当条文が見つかりませんでした。</div>`;
    } else {
      body.innerHTML = renderArticle(cached.article.node);
      body.prepend(navigationText("p", `条文取得日：${lawFetchedAt.get(citation.lawId) ? new Date(lawFetchedAt.get(citation.lawId)).toLocaleString("ja-JP") : "不明"} ／ 案内データ確認日：${PROCEDURE_CHECKED_AT}`, "support-text"));
    }
    card.appendChild(body);
  }

  return card;
}

async function toggleCitation(citation) {
  const key = `${citation.lawId}:${citation.num}`;
  if (appState.diag.expandedCitations.has(key)) {
    appState.diag.expandedCitations.delete(key);
    render();
    return;
  }
  appState.diag.expandedCitations.add(key);
  render();

  if (["ready", "loading", "notfound"].includes(appState.diag.citationCache.get(key)?.status)) return;
  appState.diag.citationCache.set(key, { status: "loading" });
  try {
    const lawMeta = findLawMeta(citation.lawId);
    const lawData = await loadLawData(lawMeta);
    const mainProvision = getMainProvision(lawData);
    const article = findArticleByNum(mainProvision, citation.num);
    appState.diag.citationCache.set(key, article ? { status: "ready", article } : { status: "notfound" });
  } catch (err) {
    console.error(err);
    appState.diag.citationCache.set(key, { status: "error", message: err.message });
  }
  render();
}

async function restoreDiagnosisFromHistory(entry) {
  if (entry.version !== PROCEDURE_VERSION) {
    beginPurpose("new");
    showToast("判定条件が更新されています。古い結果は使用せず、現在の質問に回答してください。");
    return;
  }
  appState.mode = "diagnosis";
  const steps = getStepsForGasCategory(entry.actionType, entry.gasCategory, entry.answers);
  appState.diag = {
    actionType: entry.actionType,
    gasCategory: entry.gasCategory,
    stepIndex: Math.max(0, steps.length - 1),
    answers: { ...entry.answers },
    result: evaluateDiagnosis(entry.actionType, entry.gasCategory, entry.answers),
    expandedCitations: new Set(),
    citationCache: new Map(),
  };
  render();
}

/* =========================================================
   条文ブラウズモード (browse) — 法令 → 章 → 節 → 条
   ========================================================= */

function renderNavigationHome() {
  const wrap = document.createElement("div");
  const intro = navigationText("div", "", "home-intro");
  intro.append(navigationText("h2", "必要な手続きから、\n申請の準備まで。"), navigationText("p", "質問に答えて、必要な届出・申請、様式、添付書類を確認できます。", "home-lead"));
  wrap.append(intro);
  if (navigationState.saved && (navigationState.saved.diag?.actionType || navigationState.saved.nav?.purpose || navigationState.saved.nav?.selectedId)) {
    const resume = navigationText("div", "", "resume-strip");
    resume.append(navigationText("span", `保存した回答・準備状況があります（${new Date(navigationState.saved.savedAt).toLocaleString("ja-JP")}）`), navigationButton("続きから再開", resumeDraft));
    wrap.append(resume);
  }
  const entry = navigationText("section", "", "home-entry");
  entry.append(navigationText("h3", "質問に答えて探す"), navigationText("p", "今、行いたいことを選んでください。", "support-text"));
  const purposes = navigationText("div", "", "purpose-grid");
  for (const purpose of PURPOSES) {
    const b = navigationButton("", () => beginPurpose(purpose.id), `purpose-option${purpose.id === "new" ? " primary-purpose" : ""}`);
    b.append(navigationText("span", purpose.label, "pick-title"), navigationText("span", purpose.help, "pick-sub"), navigationText("span", "→", "purpose-arrow"));
    purposes.append(b);
  }
  entry.append(purposes); wrap.append(entry);
  const direct = navigationText("section", "", "home-search");
  direct.append(navigationText("h3", "手続き名・様式から探す"), navigationText("p", "手続きが分かっている方は、名前からすぐに資料を開けます。"));
  direct.append(renderSearchForm(() => setMode("catalogue")));
  wrap.append(direct);
  const support = document.createElement("details"); support.className = "support-details";
  support.append(navigationText("summary", "対象範囲・情報の確認日"), navigationText("p", `案内データ確認日：${PROCEDURE_CHECKED_AT}。奈良県の製造・貯蔵・販売・消費を対象とします。申請の送信機能はありません。コンビナート則・特別な認定制度等の個別判断は対象外です。`), navigationText("p", "県が事前連絡や検査日程調整を求める手続きは、その工程を案内します。条文の取得日と、固定の案内・判定条件の確認日は別です。"), officialLink("奈良県消防救急課の申請案内", NARA_PAGES.index));
  wrap.append(support);
  return wrap;
}

function renderSearchForm(onSubmit) {
  const form = document.createElement("form"); form.className = "search-form";
  const label = navigationText("label", "手続き・様式のキーワード"); label.htmlFor = "procedure-search";
  const input = document.createElement("input"); input.type = "search"; input.id = "procedure-search"; input.value = navigationState.query; input.placeholder = "例：販売、変更、承継、冷凍";
  const button = navigationButton("検索する", () => {} , "btn-primary"); button.type = "submit";
  form.append(label, input, button);
  form.addEventListener("submit", ev => { ev.preventDefault(); navigationState.query = input.value.trim(); onSubmit(); });
  return form;
}

function renderCatalogue() {
  const wrap = document.createElement("div");
  breadcrumbEl.append(crumbSep(), crumbCurrent("手続き・様式を探す"));
  wrap.append(navigationText("h2", "手続き・様式を探す"), renderSearchForm(render));
  const filters = navigationText("div", "", "filter-row");
  for (const [key, title, options] of [["activity", "取扱い", Object.entries(ACTIVITY_LABELS)], ["regulation", "適用規則", Object.entries(REGULATION_LABELS)], ["purpose", "目的", PURPOSES.map(p => [p.id, p.label])]]) {
    const label = navigationText("label", title); const select = document.createElement("select"); select.id = `filter-${key}`;
    for (const [value, name] of [["", "すべて"], ...options]) { const opt = navigationText("option", name); opt.value = value; select.append(opt); }
    select.value = navigationState.filters[key] || "";
    select.addEventListener("change", () => { navigationState.filters[key] = select.value; render(); }); label.append(select); filters.append(label);
  }
  filters.append(navigationButton("絞り込みを解除", () => { navigationState.query = ""; navigationState.filters = {}; render(); }, "btn-link"));
  wrap.append(filters);
  const list = searchProcedures(navigationState.query, navigationState.filters);
  wrap.append(navigationText("p", `${list.length}件の手続き。適用条件を各案内で確認してください。`, "support-text"));
  const results = navigationText("div", "", "procedure-list");
  for (const proc of list) results.append(procedureListItem(proc, openProcedure));
  if (!list.length) results.append(navigationText("p", "見つかりませんでした。キーワードを短くするか、絞り込みを解除してください。"), navigationButton("質問に答えて探す", navigateHome));
  wrap.append(results); return wrap;
}

function lifecycleGoTo(index) {
  const steps = getLifecycleSteps(navigationState.purpose, navigationState.answers);
  for (const step of steps.slice(index)) delete navigationState.answers[step.id];
  navigationState.stepIndex = index; navigationState.result = null; render();
}
function renderLifecycle() {
  const nav = navigationState;
  const purpose = PURPOSES.find(p => p.id === nav.purpose);
  const wrap = document.createElement("div");
  if (!purpose) { wrap.append(navigationButton("目的を選ぶ", navigateHome)); return wrap; }
  breadcrumbEl.append(crumbSep(), crumbCurrent(purpose.label));
  const steps = getLifecycleSteps(nav.purpose, nav.answers);
  if (nav.result) {
    wrap.append(navigationText("h2", nav.result.unresolved ? "未確認の条件と手続き候補" : "今回の手続き"));
    wrap.append(navigationText("p", nav.result.message, nav.result.unresolved ? "contact-step" : "note-box"));
    if (nav.purpose === "change" && nav.answers.change === "equipment") wrap.append(officialLink("軽微変更の条件を法令で確認", minorLawLink(nav.answers.activity, nav.answers.regulation, nav.answers.status)));
    const ids = nav.result.procedureIds.filter(id => getProcedure(id));
    if (nav.result.unresolved) {
      ids.forEach(id => wrap.append(procedureListItem(getProcedure(id), openProcedure)));
    } else ids.forEach(id => wrap.append(renderGuide(getProcedure(id))));
    if (!ids.length) wrap.append(navigationButton("新規の手続きを確認する", () => beginPurpose("new")), navigationButton("手続き・様式一覧を開く", () => { nav.filters = { activity: nav.answers.activity }; setMode("catalogue"); }));
    wrap.append(renderPrintActions());
  } else {
    const step = steps[nav.stepIndex];
    if (!step) { nav.result = evaluateLifecycle(nav.purpose, nav.answers); return renderLifecycle(); }
    wrap.append(navigationText("p", `${purpose.label} · 質問 ${nav.stepIndex + 1}`, "progress-label"), navigationText("h2", step.prompt));
    if (step.help) wrap.append(navigationText("p", step.help, "diag-help"));
    const choices = navigationText("div", "", "pick-list");
    for (const opt of step.options) choices.append(navigationButton(opt.label, () => {
      nav.answers[step.id] = opt.value;
      const next = getLifecycleSteps(nav.purpose, nav.answers);
      if (nav.stepIndex < next.length - 1) nav.stepIndex++;
      else nav.result = evaluateLifecycle(nav.purpose, nav.answers);
      render();
    }, "pick-card"));
    wrap.append(choices);
  }
  wrap.append(navigationButton("一つ前に戻る", () => { if (nav.stepIndex > 0 || nav.result) lifecycleGoTo(nav.result ? nav.stepIndex : nav.stepIndex - 1); else navigateHome(); }, "btn-link no-print"), renderAnswerSummary(true));
  return wrap;
}

function renderAnswerSummary(lifecycle) {
  const state = lifecycle ? navigationState : appState.diag;
  const steps = lifecycle ? getLifecycleSteps(state.purpose, state.answers) : getStepsForGasCategory(state.actionType, state.gasCategory, state.answers);
  const details = document.createElement("details"); details.className = "support-details answer-summary"; details.dataset.disclosure = lifecycle ? "flow-answers" : "new-answers";
  details.append(navigationText("summary", "回答内容を確認・修正する"));
  for (const [index, step] of steps.entries()) {
    if (!(step.id in state.answers)) continue;
    const row = navigationText("div", "", "answer-row");
    row.append(navigationText("p", step.prompt), navigationText("strong", formatAnswerLabel(step, state.answers[step.id])), navigationButton("修正", () => lifecycle ? lifecycleGoTo(index) : goToDiagStep(index), "btn-link no-print"));
    details.append(row);
  }
  return details;
}

function openProcedure(id) {
  if (!getProcedure(id)) return;
  navigationState.returnMode = appState.mode; navigationState.selectedId = id; appState.mode = "detail"; render();
}
function renderGuide(procedure) {
  const isLifecycle = appState.mode === "lifecycle" || (appState.mode === "detail" && navigationState.returnMode === "lifecycle");
  const context = isLifecycle ? navigationState.answers : appState.mode === "diagnosis" ? { activity: appState.diag.actionType, regulation: appState.diag.gasCategory, answers: appState.diag.answers } : {};
  const scope = `${navigationState.caseId}:${procedure.procedureId}:${JSON.stringify(context)}`;
  const state = navigationState.preparations[scope] ||= { facts: {}, checks: {} };
  const facts = { ...(isLifecycle ? lifecycleFacts(navigationState.answers) : {}), ...state.facts };
  return renderProcedureGuide(procedure, {
    facts, checks: state.checks,
    contextLabel: isLifecycle ? `${ACTIVITY_LABELS[navigationState.answers.activity] || ""} / ${REGULATION_LABELS[navigationState.answers.regulation] || ""}` : "",
    onFact: (key, value, focusId) => { state.facts[key] = value; for (const doc of procedure.documents) if (doc.fact === key) delete state.checks[doc.id]; render(); document.getElementById(focusId)?.focus({ preventScroll: true }); },
    onCheck: (key, value) => { state.checks[key] = value; persistDraft(); },
    onRelated: navigateHome,
  });
}
function renderSelectedProcedure() {
  const wrap = document.createElement("div"); const procedure = getProcedure(navigationState.selectedId);
  breadcrumbEl.append(crumbSep(), crumbCurrent("申請準備"));
  wrap.append(navigationButton("一覧・確認結果に戻る", () => setMode(navigationState.returnMode || "catalogue"), "btn-link no-print"));
  if (!procedure) { wrap.append(navigationText("p", "この案内が見つかりません。手続き一覧から選び直してください。")); return wrap; }
  if (navigationState.returnMode === "lifecycle" && navigationState.result?.unresolved) wrap.append(navigationText("p", `適用未確定の候補です。${navigationState.result.message}`, "contact-step"));
  wrap.append(renderGuide(procedure), renderPrintActions());
  if (navigationState.returnMode === "lifecycle") wrap.append(renderAnswerSummary(true));
  return wrap;
}
function renderPrintActions() {
  const actions = navigationText("div", "", "diag-actions no-print");
  actions.append(navigationButton("印刷・PDF保存", () => window.print(), "btn-primary"), navigationButton("ホームへ", navigateHome));
  return actions;
}
function resumeDraft() {
  const saved = navigationState.saved;
  if (!saved) return;
  if (saved.version !== PROCEDURE_VERSION) {
    beginPurpose(PURPOSES.some(p => p.id === saved.nav?.purpose) ? saved.nav.purpose : "new");
    showToast("判定条件が更新されています。古い回答・チェックは適用せず、現在の質問で再確認してください。"); return;
  }
  const n = saved.nav || {}; Object.assign(navigationState, { purpose: n.purpose, answers: n.answers || {}, stepIndex: n.stepIndex || 0, selectedId: n.selectedId, returnMode: n.returnMode, caseId: n.caseId || "restored", preparations: n.preparations || {}, result: n.finished ? evaluateLifecycle(n.purpose, n.answers) : null });
  const d = saved.diag || {};
  Object.assign(appState.diag, { actionType: d.actionType, gasCategory: d.gasCategory, stepIndex: d.stepIndex || 0, answers: d.answers || {}, result: d.finished && d.actionType && d.gasCategory ? evaluateDiagnosis(d.actionType, d.gasCategory, d.answers) : null });
  appState.mode = ["diagnosis", "lifecycle", "detail", "catalogue"].includes(saved.mode) ? saved.mode : "home";
  render();
}

window.addEventListener("beforeprint", () => { for (const el of stageEl.querySelectorAll("details.answer-summary")) { el.dataset.wasOpen = String(el.open); el.open = true; } });
window.addEventListener("afterprint", () => { for (const el of stageEl.querySelectorAll("details[data-was-open]")) { el.open = el.dataset.wasOpen === "true"; delete el.dataset.wasOpen; } });

function resetBrowse() {
  appState.browse = {
    law: null,
    lawData: null,
    lawTitle: "",
    chapters: [],
    chapter: null,
    section: null,
    article: null,
  };
  render();
}

async function selectLaw(lawMeta, { forceRefresh = false } = {}) {
  const b = appState.browse;
  b.law = lawMeta;
  b.chapter = null;
  b.section = null;
  b.article = null;
  renderBrowseLoading(`${lawMeta.title} を読み込んでいます…`);

  try {
    const lawData = await loadLawData(lawMeta, { forceRefresh });
    b.lawData = lawData;
    b.lawTitle = getLawTitle(lawData) || lawMeta.title;
    const mainProvision = getMainProvision(lawData);
    b.chapters = buildChapters(mainProvision);

    if (b.chapters.length === 0) {
      renderBrowseError("この法令から条文構造を読み取れませんでした。");
      return;
    }

    if (b.chapters.length === 1 && b.chapters[0].num === null) {
      selectChapter(b.chapters[0]);
      return;
    }

    render();
  } catch (err) {
    console.error(err);
    renderBrowseError(`法令データの取得に失敗しました。時間をおいて再度お試しください。\n(${err.message})`);
  }
}

function selectChapter(chapter) {
  appState.browse.chapter = chapter;
  appState.browse.section = null;
  appState.browse.article = null;
  render();
}

function selectSection(section) {
  appState.browse.section = section;
  appState.browse.article = null;
  render();
}

async function selectArticle(article) {
  const b = appState.browse;
  b.article = article;
  render();

  try {
    await addHistoryEntry({
      type: "article",
      lawId: b.law.lawId,
      lawShortName: b.law.shortName,
      lawTitle: b.lawTitle,
      chapterNum: b.chapter ? b.chapter.num : null,
      chapterTitle: b.chapter ? b.chapter.title : null,
      sectionNum: b.section ? b.section.num : null,
      sectionTitle: b.section ? b.section.title : null,
      articleNum: article.num,
      articleTitle: article.title,
      articleCaption: article.caption,
    });
    await renderHistory();
  } catch (err) {
    console.error("履歴の保存に失敗しました", err);
  }
}

async function restoreArticleFromHistory(entry) {
  const lawMeta = TARGET_LAWS.find((l) => l.lawId === entry.lawId);
  if (!lawMeta) {
    showToast("対象法令の情報が見つかりませんでした。", true);
    return;
  }
  appState.mode = "browse";
  renderBrowseLoading(`${entry.lawTitle || lawMeta.title} を読み込んでいます…`);
  try {
    const lawData = await loadLawData(lawMeta);
    const b = appState.browse;
    b.law = lawMeta;
    b.lawData = lawData;
    b.lawTitle = getLawTitle(lawData) || lawMeta.title;
    const mainProvision = getMainProvision(lawData);
    b.chapters = buildChapters(mainProvision);

    let chapter = null;
    if (entry.chapterNum !== null && entry.chapterNum !== undefined) {
      chapter = b.chapters.find((c) => c.num === entry.chapterNum) || null;
    } else if (b.chapters.length === 1 && b.chapters[0].num === null) {
      chapter = b.chapters[0];
    }
    b.chapter = chapter;

    let section = null;
    if (chapter && entry.sectionNum !== null && entry.sectionNum !== undefined) {
      section = chapter.sections.find((s) => s.num === entry.sectionNum) || null;
    }
    b.section = section;

    const pool = section ? section.articles : chapter ? chapter.articles : [];
    const article = pool.find((a) => a.num === entry.articleNum) || null;

    if (!article) {
      showToast("この条文は法令の改正等により見つかりませんでした。最新の目次から探してください。", true);
      b.article = null;
      render();
      return;
    }

    b.article = article;
    render();
  } catch (err) {
    console.error(err);
    renderBrowseError(`履歴からの復元に失敗しました。\n(${err.message})`);
  }
}

function renderBrowseLoading(message) {
  stageEl.innerHTML = `<div class="loading">${escapeHtml(message)}</div>`;
  renderBrowseBreadcrumb();
}

function renderBrowseError(message) {
  stageEl.innerHTML = `<div class="error-box">${escapeHtml(message)}</div>`;
  renderBrowseBreadcrumb();
}

function renderBrowseBreadcrumb() {
  breadcrumbEl.innerHTML = "";
  const b = appState.browse;

  breadcrumbEl.appendChild(crumbButton("法令選択", () => resetBrowse()));
  if (!b.law) return;

  breadcrumbEl.appendChild(crumbSep());
  if (b.chapter || b.chapters.length <= 1) {
    breadcrumbEl.appendChild(crumbButton(b.law.shortName, () => selectLaw(b.law)));
  } else {
    breadcrumbEl.appendChild(crumbCurrent(b.law.shortName));
  }

  if (!b.chapter || b.chapter.num === null) return;

  breadcrumbEl.appendChild(crumbSep());
  if (b.section || b.article) {
    breadcrumbEl.appendChild(crumbButton(b.chapter.title, () => selectChapter(b.chapter)));
  } else {
    breadcrumbEl.appendChild(crumbCurrent(b.chapter.title));
  }

  if (b.section) {
    breadcrumbEl.appendChild(crumbSep());
    if (b.article) {
      breadcrumbEl.appendChild(crumbButton(b.section.title, () => selectSection(b.section)));
    } else {
      breadcrumbEl.appendChild(crumbCurrent(b.section.title));
    }
  }

  if (b.article) {
    breadcrumbEl.appendChild(crumbSep());
    breadcrumbEl.appendChild(crumbCurrent(b.article.title));
  }
}

function renderBrowseStage() {
  stageEl.innerHTML = "";
  const b = appState.browse;
  if (b.law && lawFetchedAt.has(b.law.lawId)) stageEl.append(navigationText("p", `条文取得日：${new Date(lawFetchedAt.get(b.law.lawId)).toLocaleString("ja-JP")} ／ 案内データ確認日：${PROCEDURE_CHECKED_AT}`, "support-text"));

  if (!b.law) {
    stageEl.appendChild(renderLawStage());
    return;
  }
  if (!b.chapter) {
    stageEl.appendChild(renderChapterStage());
    return;
  }
  if (b.chapter.sections.length > 0 && !b.section) {
    stageEl.appendChild(renderSectionStage());
    return;
  }
  if (!b.article) {
    stageEl.appendChild(renderArticleListStage());
    return;
  }
  stageEl.appendChild(renderArticleStage());
}

function renderLawStage() {
  const wrap = document.createElement("div");
  wrap.className = "stage";
  const h2 = document.createElement("h2");
  h2.textContent = "対象法令を選択してください";
  wrap.appendChild(h2);

  const grid = document.createElement("div");
  grid.className = "card-grid";
  for (const law of TARGET_LAWS) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "pick-card";
    card.innerHTML = `<span class="pick-title">${escapeHtml(law.shortName)}</span><span class="pick-sub">${escapeHtml(law.title)}</span>`;
    card.addEventListener("click", () => selectLaw(law));
    grid.appendChild(card);
  }
  wrap.appendChild(grid);
  return wrap;
}

function renderChapterStage() {
  const b = appState.browse;
  const wrap = document.createElement("div");
  wrap.className = "stage";

  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  const refreshBtn = document.createElement("button");
  refreshBtn.type = "button";
  refreshBtn.className = "btn-link";
  refreshBtn.textContent = "⟲ 最新版を再取得";
  refreshBtn.addEventListener("click", () => selectLaw(b.law, { forceRefresh: true }));
  toolbar.appendChild(refreshBtn);
  wrap.appendChild(toolbar);

  const h2 = document.createElement("h2");
  h2.textContent = `${b.lawTitle} — 章を選択してください`;
  wrap.appendChild(h2);

  const list = document.createElement("div");
  list.className = "pick-list";
  for (const chapter of b.chapters) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "pick-card";
    card.innerHTML = `<span class="pick-title">${escapeHtml(chapter.title)}</span>`;
    card.addEventListener("click", () => selectChapter(chapter));
    list.appendChild(card);
  }
  wrap.appendChild(list);
  return wrap;
}

function renderSectionStage() {
  const b = appState.browse;
  const wrap = document.createElement("div");
  wrap.className = "stage";
  const h2 = document.createElement("h2");
  h2.textContent = `${b.chapter.title} — 節を選択してください`;
  wrap.appendChild(h2);

  const list = document.createElement("div");
  list.className = "pick-list";

  if (b.chapter.articles.length > 0) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "pick-card";
    card.innerHTML = `<span class="pick-title">（節に属さない条）</span><span class="pick-sub">${b.chapter.articles.length}条</span>`;
    card.addEventListener("click", () =>
      selectSection({ key: `${b.chapter.key}-direct`, num: null, title: null, articles: b.chapter.articles })
    );
    list.appendChild(card);
  }

  for (const section of b.chapter.sections) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "pick-card";
    card.innerHTML = `<span class="pick-title">${escapeHtml(section.title)}</span><span class="pick-sub">${section.articles.length}条</span>`;
    card.addEventListener("click", () => selectSection(section));
    list.appendChild(card);
  }

  wrap.appendChild(list);
  return wrap;
}

function renderArticleListStage() {
  const b = appState.browse;
  const wrap = document.createElement("div");
  wrap.className = "stage";
  const scopeTitle = b.section && b.section.title ? b.section.title : b.chapter.title;
  const h2 = document.createElement("h2");
  h2.textContent = `${scopeTitle} — 条を選択してください`;
  wrap.appendChild(h2);

  const articles = b.section ? b.section.articles : b.chapter.articles;

  const list = document.createElement("div");
  list.className = "pick-list";
  for (const article of articles) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "pick-card";
    card.innerHTML = `<span class="pick-title">${escapeHtml(article.title)}</span>${
      article.caption ? `<span class="pick-sub">${escapeHtml(article.caption)}</span>` : ""
    }`;
    card.addEventListener("click", () => selectArticle(article));
    list.appendChild(card);
  }
  wrap.appendChild(list);
  return wrap;
}

function renderArticleStage() {
  const wrap = document.createElement("div");
  wrap.innerHTML = renderArticle(appState.browse.article.node);
  return wrap;
}

/* =========================================================
   照会履歴パネル (共通)
   ========================================================= */

function formatTimestamp(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function renderHistory() {
  let entries;
  try { entries = await listHistory(); } catch { storageWarning(); historyListEl.textContent = "履歴を読み込めません。案内の利用は継続できます。"; return; }
  historyListEl.innerHTML = "";

  if (entries.length === 0) {
    const empty = document.createElement("li");
    empty.className = "history-empty";
    empty.textContent = "まだ照会履歴はありません。";
    historyListEl.appendChild(empty);
    return;
  }

  for (const entry of entries) {
    const li = document.createElement("li");
    li.className = "history-item";
    const type = entry.type || "article";
    const openBtn = document.createElement("button"); openBtn.type = "button"; openBtn.className = "history-open";

    if (type === "diagnosis") {
      openBtn.innerHTML = `
        <span class="h-law">診断・${escapeHtml(entry.actionLabel || "")}</span>
        <span class="h-title">${escapeHtml(verdictLabel(entry.verdict))} — ${escapeHtml(entry.title || "")}</span>
        <span class="h-time">${escapeHtml(entry.gasCategoryLabel || "")} ・ ${formatTimestamp(entry.timestamp)}</span>
      `;
      openBtn.addEventListener("click", () => restoreDiagnosisFromHistory(entry));
    } else {
      const scope = [entry.chapterTitle, entry.sectionTitle].filter(Boolean).join(" / ");
      openBtn.innerHTML = `
        <span class="h-law">${escapeHtml(entry.lawShortName || "")}</span>
        <span class="h-title">${escapeHtml(entry.articleTitle || "")}${entry.articleCaption ? " " + escapeHtml(entry.articleCaption) : ""}</span>
        <span class="h-time">${scope ? escapeHtml(scope) + " ・ " : ""}${formatTimestamp(entry.timestamp)}</span>
      `;
      openBtn.addEventListener("click", () => restoreArticleFromHistory(entry));
    }

    li.appendChild(openBtn);
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "h-delete";
    delBtn.textContent = "×";
    delBtn.title = "この履歴を削除";
    delBtn.setAttribute("aria-label", "この履歴を削除");
    delBtn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      try { await deleteHistoryEntry(entry.id); renderHistory(); } catch { storageWarning(); }
    });
    li.appendChild(delBtn);

    historyListEl.appendChild(li);
  }
}

clearHistoryBtn.addEventListener("click", async () => {
  if (!confirm("照会履歴をすべて削除しますか？この操作は取り消せません。")) return;
  try { await clearHistory(); renderHistory(); } catch { storageWarning(); }
});

// --- 初期化 ---

function showLegacyHistoryNotice() {
  // 公開中だったv2とは保存形式・判定条件が異なる。読取りだけ行い、移行や削除はしない。
  try {
    const raw = localStorage.getItem("kouatsu-navigator-history");
    if (!raw || raw.length > 200000) return;
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries) || entries.length === 0) return;
    const notice = document.getElementById("legacy-history-notice");
    notice.textContent = "旧公開版の保存履歴がこの端末にあります。この版とは保存形式・判定条件が異なるため、質問へ改めて回答してください。旧履歴と旧版の条文保存データは削除していません。";
    notice.hidden = false;
  } catch {
    // localStorage禁止・破損時も、新版の申請案内を利用できるようにする。
  }
}

async function initializeNavigator() {
  showLegacyHistoryNotice();
  try { navigationState.saved = await readDraft(); } catch { storageWarning(); }
  draftReady = true; render(); renderHistory();
}
initializeNavigator();
