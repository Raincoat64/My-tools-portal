// 奈良県の公開案内・添付書類一覧と各規則を照合した手続き台帳。
// 確認日と版は条文APIの取得日とは独立して管理する。自動更新を意味しない。
export const PROCEDURE_VERSION = "2026-09-19.1";
export const PROCEDURE_CHECKED_AT = "2026-09-19";
export const REGULATION_LABELS = { general: "一般則", lpgas: "液石則", refrigeration: "冷凍則" };
export const ACTIVITY_LABELS = { manufacture: "製造", storage: "貯蔵", sales: "販売", consumption: "消費" };
export const PURPOSES = [
  { id: "new", label: "新しく始める", help: "製造・貯蔵・販売・消費の許可や届出を調べる" },
  { id: "change", label: "施設・ガス・会社情報を変更する", help: "変更許可、変更届、軽微変更、代表者等の変更" },
  { id: "succession", label: "事業を引き継ぐ", help: "相続・合併・分割・事業譲渡による承継" },
  { id: "abolition", label: "廃止・休止する", help: "廃止の届出、製造施設の使用休止" },
  { id: "inspection", label: "検査を受ける・製造を開始する", help: "完成検査、保安検査、他機関の受検届、製造開始" },
  { id: "personnel", label: "保安担当者・規程を届け出る", help: "選任・解任、危害予防規程の制定・変更" },
];
export const NARA_PAGES = {
  manufacture: "https://www.pref.nara.lg.jp/n011/39584.html",
  storage: "https://www.pref.nara.lg.jp/n011/39585.html",
  sales: "https://www.pref.nara.lg.jp/n011/39586.html",
  consumption: "https://www.pref.nara.lg.jp/n011/39587.html",
  common: "https://www.pref.nara.lg.jp/n011/39588.html",
  index: "https://www.pref.nara.lg.jp/n011/39583.html",
  lplaw: "https://www.pref.nara.lg.jp/n011/35957.html",
};
export const SUBMISSION_GUIDE = {
  office: "奈良県 総務部知事公室 消防救急課 保安係",
  address: "〒630-8501 奈良市登大路町30 奈良県庁主棟2階",
  phone: "0570-037-676",
  copies: "2部（県提出分1部・事業者控え1部。控えは原本不要）",
  method: "来庁または郵送。来庁は事前に電話で日時を予約してください。",
  post: "切手を貼った返信用封筒を同封してください。収入証紙を貼付した申請書は簡易書留等の追跡できる方法で郵送してください。",
};
const procAllRegs = ["general", "lpgas", "refrigeration"];
const procGL = ["general", "lpgas"];
const procLawIds = { general: "341M50000400053", lpgas: "341M50000400052", refrigeration: "341M50000400051" };
const procDoc = (id, title, kind = "required", condition = "", extra = {}) => ({ id, title, kind, condition, ...extra });
const procFile = (label, folder, file) => ({ label, url: `https://www.pref.nara.lg.jp/documents/${folder}/${file}` });
const procForm = (folder, file, label = "申請・届出様式（Word）") => procFile(label, folder, `${file}.docx`);
const procIdentity = procDoc("identity", "申請者を確認する書類", "oneOf", "法人：発行後3か月以内の登記簿謄本。個人：発行後3か月以内・マイナンバーなしの住民票。", { alternatives: ["法人：登記簿謄本", "個人：住民票"] });
const procDelegation = procDoc("delegation", "委任状", "conditional", "申請・届出の代表者欄が代表取締役以外の場合。", { fact: "delegate" });
const procExtra = procDoc("additional", "施設の技術基準に応じた補足図面・資料", "conditional", "設備の種類・工事内容により必要。公式一覧と技術基準を照合してください。");
const procFee = "有料。奈良県手数料条例（平成12年条例第33号）による。設備・処理能力・申請区分で金額が異なります。申請前の連絡時に区分と金額を確定し、奈良県収入証紙を申請書裏面に貼付してください。";
const procContact = "県が事前連絡を求めています。許可・受理番号、ガス名、能力、施設図面、実施予定日を準備し、申請・工事の前に内容を説明してください。";
const procRegistry = [];
function registerProcedure(id, activity, purpose, title, form, options = {}) {
  procRegistry.push({
    procedureId: id, activity, purpose, title, regulations: activity === "storage" || activity === "consumption" ? procGL : procAllRegs,
    applicability: "対象の許可・届出区分と発生条件を確認して使用してください。",
    deadline: "遅滞なく", forms: form ? [form] : [],
    documents: [procDoc("form", title)], fee: "届出・報告の手数料は不要です。",
    source: NARA_PAGES[activity], checkedAt: PROCEDURE_CHECKED_AT, basis: "高圧ガス保安法・関係規則／奈良県の申請案内",
    ...options,
  });
}
function manufactureDocuments(kind) {
  const change = kind !== "permit" && kind !== "notification";
  const secondChange = kind === "change-notification";
  const docs = [
    procDoc("form", "申請書・届書"),
    procDoc("plan", change ? "変更明細書" : "製造計画書", "required", "目的、ガス名、内容、処理能力、貯蔵能力、技術基準への対応を記載。変更時は変更前後を比較。"),
    procDoc("location", "施設の位置・付近の状況が分かる地図", secondChange ? "conditional" : "required", secondChange ? "位置・周囲の状況等の変更に応じて必要。" : ""),
    procDoc("site", "事業所全体の平面図", secondChange ? "conditional" : "required", secondChange ? "変更に応じて必要。" : ""),
    procDoc("process", "製造工程の説明書・図面"), procDoc("piping", "フローシートまたは配管図"),
    procDoc("layout", "製造施設配置図"), procDoc("equipment", "機器等一覧表"),
    procDoc("specifications", "機器の図面・成績書・強度計算書等"),
    procDoc("capacity", "処理能力・貯蔵能力の計算書", secondChange ? "conditional" : "required", secondChange ? "能力の変更等に応じて必要。" : ""),
  ];
  if (["permit", "change-permit", "minor"].includes(kind)) {
    docs.push(procDoc("seismic", "耐震設計構造物の計算書", "conditional", "耐震設計の対象構造物がある場合。"));
    docs.push(procDoc("foundation", "基礎・支持構造物の構造図", kind === "permit" ? "required" : "conditional", change ? "工事の対象に応じて必要。" : ""));
  }
  if (kind === "minor") docs.push(procDoc("photos", "変更前後の機器等の写真", "conditional", "工事内容の確認に必要な場合。"));
  docs.push(procExtra);
  if (kind !== "minor") docs.push(change ? { ...procIdentity, kind: "conditional", condition: "県の変更手続き一覧では該当時に添付。申請者情報の変更等に応じて必要。" } : procIdentity);
  if (["permit", "change-permit"].includes(kind)) docs.push(procDoc("stamps", "所定額の奈良県収入証紙"));
  docs.push(procDelegation);
  return docs;
}
for (const [kind, title, file, deadline, status] of [
  ["permit", "高圧ガス製造許可申請", "20260129090946", "製造を始める前に許可取得。施設は原則、完成検査合格後に使用。", "permit"],
  ["notification", "高圧ガス製造（事業）届", "20260129090948", "事業開始（冷凍は製造開始）の20日前まで", "notification"],
  ["change-permit", "高圧ガス製造施設等変更許可申請", "20260129090947", "変更工事・ガスの種類・製造方法の変更前に許可取得", "permit"],
  ["change-notification", "高圧ガス製造施設等変更届", "20260129090948_1", "変更工事・ガスの種類・製造方法の変更前", "notification"],
  ["minor", "高圧ガス製造施設軽微変更届", "20260129090947_1", "軽微な変更工事の完成後、遅滞なく", "permit"],
]) registerProcedure(`manufacture-${kind}`, "manufacture", kind === "permit" || kind === "notification" ? "new" : "change", title, procForm(409, file), {
  status, deadline, documents: manufactureDocuments(kind), contact: procContact,
  applicability: status === "permit" ? "第一種製造者。軽微変更は各規則の要件を満たす工事に限ります。" : "第二種製造者。規模等の変更で第一種に移る場合は新たな許可の確認が必要です。",
  forms: [procForm(409, file), procFile("県の添付書類一覧（Excel）", 409, `${file}.xlsx`)],
  fee: kind.endsWith("permit") ? procFee : "不要", basis: kind === "permit" || kind === "notification" ? "法第5条、一般則・液石則・冷凍則第3条・第4条" : "法第14条、一般則第14〜17条・液石則第15〜18条・冷凍則第16〜19条",
});
for (const [kind, title, file, status] of [
  ["permit", "第一種貯蔵所設置許可申請", "20260129090427", "permit"],
  ["notification", "第二種貯蔵所設置届", "20260129090427_3", "notification"],
  ["change-permit", "第一種貯蔵所位置等変更許可申請", "20260129090427_1", "permit"],
  ["change-notification", "第二種貯蔵所位置等変更届", "20260129090428", "notification"],
  ["minor", "第一種貯蔵所軽微変更届", "20260129090427_2", "permit"],
]) registerProcedure(`storage-${kind}`, "storage", ["permit", "notification"].includes(kind) ? "new" : "change", title, procForm(408, file), {
  status, contact: procContact, deadline: kind === "minor" ? "工事完成後、遅滞なく" : "設置・変更の前（許可対象は許可取得後に着工）",
  fee: kind.endsWith("permit") ? procFee : "不要", basis: "法第16条・第17条の2・第19条、一般則第20・25・27〜30条／液石則第21・26・28〜31条",
  documents: [procDoc("form", title), procDoc("detail", kind === "minor" ? "変更の概要を記載した書面" : kind.startsWith("change") ? "変更明細書" : "貯蔵計画書", "required", "貯蔵の目的、貯蔵能力、技術基準への対応を整理。変更時は変更部分を明示。"), procDoc("location", "位置・付近の状況を示す図面", kind === "minor" ? "conditional" : "required", "変更時は変更内容に対応する図面。"), procExtra],
  preparation: "県のページには貯蔵所の詳細な添付書類一覧が掲載されていません。法令上の基本書類に加え、配置・配管図、容量計算、設備仕様を準備し、事前連絡で追加資料を確定してください。",
});
const procSalesVariants = {
  general: { bundle: "20260128160748", example: "20260128160749", plan: "20260128160751_3", storage: "20260128160752_1", standard: "20260128160753" },
  lpgas: { bundle: "20260128160748_1", example: "20260128160750", plan: "20260128160751_4", storage: "20260128160752_2", standard: "20260128160753_1" },
  refrigeration: { bundle: "20260128160748_2", example: "20260128160750_1", plan: "20260128160752", storage: "20260128160752_3", standard: "20260128160753_2" },
};
const procSupplier = procDoc("supplier", "仕入先の届出・許可を確認する書類", "oneOf", "供給元ごとに用意。", { alternatives: ["自治体受理印のある販売事業届の控え", "販売事業届受理証または許可証の写し"] });
const procNotice = procDoc("notice", "購入者への周知文書", "conditional", "溶接・熱切断用のアセチレン、天然ガス、酸素、LPG、燃料用LPG、在宅酸素療法用液体酸素、スクーバ等呼吸用空気等を扱う場合。", { fact: "notice" });
for (const reg of procAllRegs) {
  const variant = procSalesVariants[reg];
  const salesShared = [procDoc("plan", "販売計画書"), procDoc("storage-standard", "貯蔵・移動の基準対応表", "conditional", "伝票販売のみの場合は不要。", { fact: "physical" }), procDoc("sales-standard", "販売の技術上の基準対応表"), procSupplier, procNotice];
  registerProcedure(`sales-new-${reg}`, "sales", "new", `高圧ガス販売事業届（${REGULATION_LABELS[reg]}）`, null, {
    regulations: [reg], status: "notification", deadline: "事業開始日の20日前まで（販売所ごと）", basis: "法第20条の4、一般則第37条／液石則第38条／冷凍則第26条",
    applicability: reg === "refrigeration" ? "冷凍設備等に封入した冷媒ガスの販売。容器に充塡した冷媒の販売とは区別します。" : reg === "lpgas" ? "高圧ガス保安法の対象となるLPG販売。LP法の一般消費者等への販売は別制度です。" : "液石則・冷凍則以外の高圧ガス販売。届出除外は質問から確認できます。",
    documents: [procDoc("form", "高圧ガス販売事業届書"), procDelegation, procIdentity, ...salesShared.slice(0, 3), procDoc("customer-register", "引渡し先の保安状況を記録する台帳の様式"), ...(reg === "refrigeration" ? [] : [procDoc("container-register", "容器授受帳簿の様式")]), procDoc("map", "販売所案内図"), procDoc("layout", "販売所の平面図"), procDoc("structure", "容器置場の寸法・構造が分かる書面", "conditional", "伝票販売のみの場合は不要。残ガス容器置場も含めて記載。", { fact: "physical" }), procSupplier, procNotice],
    forms: [procForm(407, variant.bundle, `${REGULATION_LABELS[reg]}の提出書類一式（Word）`), procFile(`${REGULATION_LABELS[reg]}の記載例一式（PDF）`, 407, `${variant.example}.pdf`), procFile("提出書類一覧・注意事項（PDF）", 407, "20260128160747.pdf")],
  });
  registerProcedure(`sales-change-${reg}`, "sales", "change", `販売する高圧ガスの種類変更届（${REGULATION_LABELS[reg]}）`, null, {
    regulations: [reg], status: "notification", applicability: "販売ガスの種類を変更した場合。不活性ガスのみの種類変更は届出除外を確認。", deadline: "変更後、遅滞なく", basis: "法第20条の7、一般則第41条／液石則第42条／冷凍則第28条",
    documents: [procDoc("form", "販売に係る高圧ガスの種類変更届書"), ...salesShared],
    forms: [procForm(407, "20260128160755_1"), procForm(407, variant.plan, "販売計画書（Word）"), procForm(407, variant.storage, "貯蔵・移動の基準対応表（Word）"), procForm(407, variant.standard, "販売の基準対応表（Word）")],
  });
}
for (const change of [false, true]) registerProcedure(`consumption-${change ? "change" : "new"}`, "consumption", change ? "change" : "new", change ? "特定高圧ガス消費施設等変更届" : "特定高圧ガス消費届", procForm(406, change ? "20260128160412" : "20260128160411"), {
  status: "notification", deadline: change ? "変更工事・ガス種類・消費方法の変更前" : "消費開始日の20日前まで", contact: procContact,
  documents: [procDoc("form", "特定高圧ガス消費の届書"), procDoc("detail", change ? "変更明細書（変更部分を記載）" : "消費施設等明細書", "required", "消費の目的、貯蔵能力、技術上の基準への対応。"), procDoc("location", "消費施設の位置・他施設との関係・周辺状況を示す図面")],
  basis: "法第24条の2・第24条の4、一般則第53・56条／液石則第51・54条", preparation: "県は提出前の連絡を求めています。上記は規則で定める基本書類です。ガス供給方法・貯蔵設備・消費設備の図面と仕様を準備して追加資料の有無を確認してください。",
});
registerProcedure("representative", "common", "change", "代表者・社名・本社住所の変更届", procForm(405, "20260128155554"), {
  source: NARA_PAGES.common, regulations: procAllRegs, applicability: "許可・届出をしている法人の代表者、社名、主たる事務所の所在地の変更。合併・分割や事業所の移転は別手続き。",
  documents: [procDoc("form", "代表者等変更届"), procDoc("evidence", "変更を確認できる書類", "required", "例：発行後3か月以内の登記簿謄本。")], basis: "奈良県高圧ガス保安法施行細則第13条第1項",
});
registerProcedure("minor-report", "common", "change", "製造・貯蔵・特定高圧ガス消費の軽微変更報告", procForm(405, "20260128155555_4"), {
  source: NARA_PAGES.common, regulations: procAllRegs, applicability: "法の変更許可・変更届の対象外となる場合で、処理能力・貯蔵能力・ガス種類を変更したとき。販売は対象外。",
  documents: [procDoc("form", "軽微変更報告書"), procDoc("evidence", "変更内容を確認できる書類（変更前後の能力・種類・図面等）")], basis: "奈良県高圧ガス保安法施行細則第13条第2項", contact: "能力やガス種類の変更がある場合は、法の手続きとは別に県規則の報告を確認します。変更前後の能力表・図面を準備してください。",
});
for (const [id, activity, title, file, status] of [
  ["manufacture-first-succession", "manufacture", "第一種製造事業承継届", "20260128155554_1", "permit"],
  ["manufacture-second-succession", "manufacture", "第二種製造事業承継届", "20260128155554_2", "notification"],
  ["storage-succession", "storage", "第一種貯蔵所承継届", "20260128155554_3", "permit"],
  ["sales-succession", "sales", "高圧ガス販売事業承継届", "20260128155554_4", "notification"],
  ["consumption-succession", "consumption", "特定高圧ガス消費者承継届", "20260128155554_5", "notification"],
]) registerProcedure(id, activity, "succession", title, procForm(405, file), {
  status, source: NARA_PAGES.common, contact: "県が承継前の連絡を求めています。現在の許可・届出、契約書案、承継範囲、予定日を準備してください。",
  applicability: activity === "storage" ? "第一種貯蔵所の譲渡・引渡し。第二種貯蔵所はこの承継届の対象ではありません。" : status === "permit" ? "第一種製造者の相続・合併・事業全部を承継する分割。事業譲渡はこの承継届では扱えません。" : "相続・合併・事業全部の分割または譲渡。部分譲渡等は別途の新規届出を確認。",
  documents: [procDoc("form", title), procIdentity, procDoc("inheritance", "戸籍謄本と相続人の選定を示す書面", "conditional", "相続の場合。相続人が複数なら全員の同意を示す書面も必要。", { fact: "inheritance" }), procDoc("merger", "合併・分割を記載した登記簿謄本と全部承継を示す契約書等", "conditional", "合併・分割の場合。登記簿は発行後3か月以内。", { fact: "merger" }), procDoc("transfer", "譲渡・引渡しの契約書等", "conditional", "譲渡・引渡しの場合。", { fact: "transfer" })],
});
for (const [activity, file] of [["manufacture", "20260128155554_7"], ["storage", "20260128155555"], ["sales", "20260128155555_1"], ["consumption", "20260128155555_2"]]) {
  registerProcedure(`${activity}-abolition`, activity, "abolition", `${ACTIVITY_LABELS[activity]}の廃止届`, procForm(405, file), {
    source: NARA_PAGES.common, applicability: "当該許可・届出に係る事業・施設を廃止した場合。",
    documents: [procDoc("form", "廃止届書"), procDoc("certificate", "許可証・受理証（紛失時は念書）", "oneOf", "返却できないときは県の念書を使用。", { alternatives: ["許可証または受理証", "紛失時の念書"] }), procDoc("photos", "設備撤去の前後の写真", "conditional", "設備を撤去した場合。", { fact: "removed" }), procDoc("recovery", "フルオロカーボン回収等の証明書の写し", "conditional", "冷凍機等の廃止に伴い回収等を行った場合。", { fact: "recovery" })],
    forms: [procForm(405, file), procForm(405, "20260128155554_6", "許可証・受理証を紛失した場合の念書（Word）")],
  });
}
registerProcedure("manufacture-suspension", "manufacture", "abolition", "高圧ガス製造施設休止届", procForm(409, "20260129090950"), {
  status: "permit", deadline: "使用休止の手続き時。届出の休止期間は最大3年。延長は改めて届出。",
  applicability: "1か月以上の休止計画、他施設との明確な縁切り、不活性ガス置換等の保安措置を備える特定施設。再使用前に保安検査を確認。",
  documents: [procDoc("form", "製造施設休止届書"), procDoc("location", "休止施設の位置と範囲を明示する図面"), procDoc("measures", "休止中の保安措置を説明する書面")], contact: "休止の範囲・期間、縁切り方法、置換等の措置を整理して、保安検査の取扱いを事前に調整してください。",
});
for (const [id, activity, title, folder, file] of [["manufacture-completion", "manufacture", "製造施設完成検査申請", 409, "20260129090947_2"], ["storage-completion", "storage", "第一種貯蔵所完成検査申請", 408, "20260129090428_1"], ["manufacture-safety", "manufacture", "保安検査申請", 409, "20260129090949_5"]]) {
  registerProcedure(id, activity, "inspection", title, procForm(folder, file), { status: "permit", deadline: id.endsWith("safety") ? "適用される保安検査の期限まで。施設により周期・除外が異なります。" : "原則、施設使用開始前に検査を受け合格すること", applicability: "第一種の対象施設。完成検査・保安検査には法令上の除外・特例があります。", fee: procFee, contact: "検査日程の調整が必要です。許可番号、対象設備、工事完成予定日、受検希望日を準備し、余裕を持って県へ連絡してください。", documents: [procDoc("form", title), procDoc("inspection-records", "検査対象・許可内容と施工状況を確認できる図面・成績書等", "conditional", "対象設備に応じて事前調整で必要資料を確定。")], basis: "法第20条（完成検査）／第35条（保安検査）" });
}
registerProcedure("manufacture-start", "manufacture", "inspection", "高圧ガス製造開始届", procForm(409, "20260129090947_3"), { status: "permit", deadline: "製造開始後、遅滞なく", applicability: "第一種製造者。原則、完成検査合格を確認して製造を開始。", basis: "法第21条第1項" });
for (const [kind, label, offset] of [["completion", "完成検査", 1], ["safety", "保安検査", 3]]) {
  for (const [institution, name, n] of [["khk", "高圧ガス保安協会", offset], ["designated", `指定${label}機関`, offset + 1]]) {
    registerProcedure(`external-${kind}-${institution}`, "manufacture", "inspection", `${name}${label}受検届`, procForm(409, `20260129090950_${n}`), { status: "permit", applicability: `${name}で${label}を受け、検査証が交付された場合。`, documents: [procDoc("form", "受検届書"), procDoc("certificate", `${label}の検査証の写し`)], basis: kind === "completion" ? "法第20条" : "法第35条" });
  }
}
registerProcedure("hazard-rules", "manufacture", "personnel", "危害予防規程の制定・変更届", procForm(409, "20260129090948_2"), { status: "permit", applicability: "第一種製造者の危害予防規程の制定・変更。第二種製造者に一律に要求するものではありません。", deadline: "制定または変更したとき", documents: [procDoc("form", "危害予防規程届書"), procDoc("rules", "危害予防規程の本文（任意様式）"), procDoc("change", "変更明細書", "conditional", "規程を変更した場合。", { fact: "rulesChanged" })], basis: "法第26条" });
for (const [id, title, file, regs, annual, qualification] of [
  ["chief", "保安統括者", "20260129090948_3", procGL, false, false],
  ["chief-deputy", "保安統括者代理者", "20260129090948_4", procGL, false, false],
  ["refrigeration-chief", "冷凍保安責任者", "20260129090949", ["refrigeration"], false, true],
  ["refrigeration-deputy", "冷凍保安責任者代理者", "20260129090949_1", ["refrigeration"], false, true],
  ["technical", "保安技術管理者・保安係員", "20260129090949_2", procGL, true, true],
  ["supervisor", "保安主任者・保安企画推進員", "20260129090949_4", procGL, true, true],
]) registerProcedure(`personnel-${id}`, "manufacture", "personnel", `${title}の選任・解任届`, procForm(409, file), {
  regulations: regs, status: "permit", applicability: "当該役職の選任対象となる事業所。設備・ガス・能力による選任要件と免除は別途確認。", deadline: annual ? "前年8月1日〜当年7月31日の選解任を、期間終了後遅滞なく届出" : "選任・解任後、遅滞なく",
  documents: [procDoc("form", `${title}の届書`), ...(regs.includes("refrigeration") ? [] : [procDoc("organization", "変更前後の保安管理組織図")]), ...(qualification ? [procDoc("qualification", "免状の写し・所定の資格要件を示す資料", "conditional", "選任する役職の要件に応じた免状等。解任のみの場合を除く。"), procDoc("experience", "製造の経験等を示す書類", "conditional", "選任する役職の要件に応じて必要。") ] : [])],
  forms: [procForm(409, file), ...(id === "technical" ? [procForm(409, "20260129090949_3", "選解任の別紙（Word）")] : [])],
});
registerProcedure("personnel-sales", "sales", "personnel", "高圧ガス販売主任者の選任・解任届", procForm(407, "20260128160755"), {
  regulations: procGL, applicability: "一般則第72条第1項の列挙ガス、または液石則第70条第1項のLPGを販売する販売所。",
  documents: [procDoc("form", "高圧ガス販売主任者届書"), procDoc("qualification", "要件を満たす免状の写し", "oneOf", "一般則の製造免状は甲種・乙種（丙種不可）。液石則は甲種・乙種・丙種化学（液石）。", { alternatives: ["要件を満たす製造保安責任者免状", "要件を満たす販売主任者免状"] }), procDoc("experience", "対象ガスの製造・販売に関する6か月以上の経験を示す書面")], basis: "法第28条、一般則第72・74条／液石則第70・72条",
});
registerProcedure("personnel-consumption", "consumption", "personnel", "特定高圧ガス取扱主任者の選任・解任届", procForm(406, "20260128160412_1"), {
  applicability: "特定高圧ガス消費者の事業所ごと。", basis: "法第28条、一般則第73・75条／液石則第71・73条",
  documents: [procDoc("form", "取扱主任者届書"), procDoc("organization", "変更前後の保安管理組織図"), procDoc("qualification", "資格・経験要件を証する書類", "oneOf", "各規則の要件を満たす経路を一つ選びます。高校工業課程の経路は卒業等の証明と6か月以上の経験の両方が必要。", { alternatives: ["対象ガスの製造・消費の1年以上の経験証明", "大学・高専等の理学・工学・工業課程修了証明", "高校工業課程修了証明 ＋ 6か月以上の経験証明", "高圧ガス保安協会の取扱講習修了証", "要件を満たす製造保安責任者免状", "要件を満たす販売主任者免状"] })],
});
export const PROCEDURES = procRegistry;
export function getProcedure(id) { return PROCEDURES.find(p => p.procedureId === id); }
export function searchProcedures(query = "", filters = {}) {
  const terms = query.normalize("NFKC").toLowerCase().split(/\s+/).filter(Boolean);
  const namedRegulations = Object.entries(REGULATION_LABELS)
    .filter(([, label]) => terms.includes(label)).map(([id]) => id);
  return PROCEDURES.filter(p => {
    if (filters.activity && p.activity !== filters.activity && p.activity !== "common") return false;
    if (filters.regulation && !p.regulations.includes(filters.regulation)) return false;
    // 「冷凍則以外」などの説明に一致して、別規則の様式が並ぶのを防ぐ。
    if (namedRegulations.length && !namedRegulations.some(id => p.regulations.includes(id))) return false;
    if (filters.purpose && p.purpose !== filters.purpose) return false;
    const searchable = [p.title, p.applicability, ...p.documents.map(d => d.title),
      ...p.forms.map(f => f.label), ...p.regulations.map(r => REGULATION_LABELS[r])]
      .join(" ").normalize("NFKC").toLowerCase();
    return terms.every(term => searchable.includes(term));
  });
}
export function diagnosisProcedureIds(activity, regulation, result) {
  if (!["permit", "notification"].includes(result?.verdict)) return [];
  if (activity === "sales") return [`sales-new-${regulation}`];
  if (activity === "consumption") return ["consumption-new"];
  return [`${activity}-${result.verdict}`];
}
export function documentRequirement(document, facts = {}) {
  if (document.kind !== "conditional" || !document.fact) return document.kind;
  if (facts[document.fact] === "yes") return "required";
  if (facts[document.fact] === "no") return "notApplicable";
  return "unconfirmed";
}
const flowChoice = (id, prompt, options, help = "") => ({ id, prompt, help, type: "choice", options: options.map(([value, label]) => ({ value, label })) });
const flowYesNo = [["yes", "はい"], ["no", "いいえ"], ["unknown", "まだ分からない"]];
export function getLifecycleSteps(purpose, a = {}) {
  const steps = [flowChoice("activity", "どの事業・施設の手続きですか？", Object.entries(ACTIVITY_LABELS))];
  if (!a.activity) return steps;
  steps.push(flowChoice("regulation", "現在の許可証・届書に記載された規則は？", [...Object.entries(REGULATION_LABELS).filter(([key]) => !["storage", "consumption"].includes(a.activity) || key !== "refrigeration"), ["unknown", "まだ分からない"]], "許可申請書・届書の根拠規則や、設備の冷凍能力・処理能力欄を確認してください。"));
  if (!a.regulation || a.regulation === "unknown") return steps;
  if (["manufacture", "storage"].includes(a.activity)) steps.push(flowChoice("status", "現在の許可・届出区分は？", [["permit", a.activity === "storage" ? "第一種貯蔵所（許可）" : "第一種製造者（許可）"], ["notification", a.activity === "storage" ? "第二種貯蔵所（届出）" : "第二種製造者（届出）"], ["unknown", "許可証・届出控えを確認できていない"]]));
  if (["manufacture", "storage"].includes(a.activity) && (!a.status || a.status === "unknown")) return steps;
  if (purpose === "change") {
    steps.push(flowChoice("change", "何を変更しますか？", [["company", "法人の代表者・社名・本社住所のみ"], ["relocation", "事業所・販売所そのものを移転"], ["gas", "取り扱うガスの種類・製造や消費の方法"], ["equipment", "施設・設備の工事（取替え・撤去等）"]]));
    if (a.change === "gas" && a.activity === "sales") steps.push(flowChoice("inertOnly", "不活性ガスの種類の変更だけですか？", flowYesNo, "可燃性・毒性ガスの追加・削除を含むときは「いいえ」。ガスの分類はSDS等で確認。"));
    if (a.change === "equipment" && a.activity !== "sales") {
      steps.push(flowChoice("work", "工事の内容は？", [["remove", "独立した設備の撤去のみ"], ["outside", "ガスが通る設備以外の変更・取替えのみ"], ["replace", "ガスが通る設備の取替え"], ["other", "増設・移設・能力変更など、その他の工事"]], "複数の工事を含む場合は「その他」を選び、変更全体で確認します。"));
      if (["remove", "outside", "replace"].includes(a.work)) {
        const cold = a.regulation === "refrigeration";
        let detail = a.work === "remove" ? (cold ? "独立した製造設備の撤去のみで、第二種の場合は認定指定設備ではない" : "撤去しても他の施設の機能・安全に支障を及ぼすおそれがない。認定高度保安実施者の特例工事ではない") : a.work === "outside" ? (cold ? "製造設備以外の設備の取替えのみ（増設・移設ではない）" : "製造はガス設備以外、貯蔵はガスの通る部分以外、消費は消費設備以外の工事だけである") : cold ? "冷凍能力の変更なし、可燃性・毒性冷媒の冷媒設備ではない、冷媒設備の切断・溶接なし。第一種は耐震設計構造物の対象設備でもない" : "特定設備（貯蔵・消費は貯槽）を除く取替えで、大臣認定の製造者の製品または保安上支障なしと認められた設備を使用し、処理能力（貯蔵・消費は貯蔵能力）を変更しない";
        steps.push(flowChoice("minorCriteria", "この工事は、次の条件をすべて満たしますか？", flowYesNo, `${detail}。工事仕様書・設備証明書で確認。満たさない場合でも他の軽微変更類型に該当する可能性があるため自動で許可とは断定しません。`));
        if (a.minorCriteria === "yes") steps.push(flowChoice("capacityOrGas", "処理能力・貯蔵能力・ガス種類を変更しますか？", flowYesNo, "法の軽微変更とは別に、奈良県規則の軽微変更報告の対象を確認します。"));
      }
    }
  }
  if (purpose === "succession") steps.push(flowChoice("succession", "引継ぎの方法は？", [["inheritance", "相続"], ["merger", "合併"], ["split", "事業の全部を承継する分割"], ["transfer", a.activity === "storage" ? "貯蔵所の譲渡・引渡し" : "事業の全部の譲渡"], ["partial", "事業の一部の譲渡・分割など"]]));
  if (purpose === "abolition") steps.push(flowChoice("ending", "廃止ですか、使用休止ですか？", [["abolish", "事業・施設を廃止する"], ...(a.activity === "manufacture" ? [["suspend", "製造施設の使用を休止する"]] : [])]));
  if (purpose === "inspection") {
    steps.push(flowChoice("inspection", "どの手続きですか？", [["completion", "県の完成検査を受ける"], ...(a.activity === "manufacture" ? [["safety", "県の保安検査を受ける"], ["start", "製造を開始した"], ["external-completion", "県以外で完成検査を受けた"], ["external-safety", "県以外で保安検査を受けた"]] : [])]));
    if (a.inspection?.startsWith("external")) steps.push(flowChoice("institution", "どの機関で受検しましたか？", [["khk", "高圧ガス保安協会"], ["designated", "指定検査機関"]]));
  }
  if (purpose === "personnel" && a.activity === "manufacture") steps.push(flowChoice("role", "どの担当者・規程の届出ですか？", a.regulation === "refrigeration" ? [["refrigeration-chief", "冷凍保安責任者"], ["refrigeration-deputy", "冷凍保安責任者代理者"], ["hazard", "危害予防規程"]] : [["chief", "保安統括者"], ["chief-deputy", "保安統括者代理者"], ["technical", "保安技術管理者・保安係員"], ["supervisor", "保安主任者・保安企画推進員"], ["hazard", "危害予防規程"]]));
  return steps;
}
export function evaluateLifecycle(purpose, a = {}) {
  const result = (ids, message, unresolved = false) => ({ procedureIds: ids, message, unresolved });
  if (getLifecycleSteps(purpose, a).some(s => !s.options.some(o => o.value === a[s.id]))) return result([], "未回答の項目があります。回答内容を確認してください。", true);
  if ([a.regulation, a.status].includes("unknown")) return result([], "適用規則・第一種／第二種が未確認です。許可証・届書の控えを確認してください。手続き名から資料を先に調べることもできます。", true);
  const first = a.status === "permit", activity = a.activity;
  if (purpose === "change") {
    if (a.change === "company") return result(["representative"], "法人の代表者等の変更届です。事業主体の交代は承継、事業所の移転は新規の確認へ進みます。");
    if (a.change === "relocation") return result([], "本社住所の変更と事業所の移転は別です。移転先について「新しく始める」から新規手続きを確認し、旧事業所の廃止も確認してください。", true);
    if (activity === "sales") {
      if (a.change !== "gas") return result([], "販売所の設備工事は、貯蔵・製造等の変更手続きが別途必要な場合があります。該当する施設の区分から確認してください。", true);
      if (a.inertOnly === "yes") return result([], "不活性ガスの種類変更のみであれば、販売ガスの種類変更届は不要です。貯蔵・製造等の変更は別に確認してください。");
      return result([`sales-change-${a.regulation}`], a.inertOnly === "unknown" ? "不活性ガスのみか未確認です。候補の書類を表示します。" : "販売ガスの種類変更届を準備してください。", a.inertOnly === "unknown");
    }
    const ordinary = activity === "consumption" ? "consumption-change" : `${activity}-change-${first ? "permit" : "notification"}`;
    if (a.change === "gas") return result([ordinary], "ガス種類・方法の変更に関する手続きです。規模拡大で許可・届出区分が変わる場合は、新規の区分判定も行ってください。");
    if (a.minorCriteria === "yes") {
      const ids = first && activity !== "consumption" ? [`${activity}-minor`] : [];
      if (a.capacityOrGas !== "no") ids.push("minor-report");
      return result(ids, "回答された工事の範囲では法令上の軽微変更に該当します。第二種製造・第二種貯蔵・特定消費は法の変更届が不要でも、能力・種類変更には県の報告が必要です。", a.capacityOrGas === "unknown");
    }
    const ids = [ordinary, ...(first && activity !== "consumption" ? [`${activity}-minor`] : []), "minor-report"];
    return result(ids, "工事全体の軽微変更該当性は未確定です。候補を表示しています。工事仕様書、能力の変更前後、設備証明書を準備し、各規則の軽微変更の条件と照合してください。工事着手前に区分を確定してください。", true);
  }
  if (purpose === "succession") {
    if (a.succession === "partial" || (activity === "manufacture" && first && a.succession === "transfer") || (activity === "storage" && (!first || a.succession !== "transfer"))) return result([], "選択された区分・引継ぎ方法は県の承継届一覧の対象外です。既存許可がそのまま引き継がれるとは扱えません。新規手続きと旧事業の廃止を確認し、契約書案を用意して県へ事前連絡してください。", true);
    return result([activity === "manufacture" ? `manufacture-${first ? "first" : "second"}-succession` : `${activity}-succession`], "承継届の対象となる組合せです。契約・相続内容と事業範囲を確認して準備してください。");
  }
  if (purpose === "abolition") return a.ending === "suspend" ? result(first ? ["manufacture-suspension"] : [], "休止届による保安検査の免除には、期間・縁切り・置換等の条件があります。第二種の休止に一律にこの届出を使用しないでください。", !first) : result([`${activity}-abolition`], "廃止届と許可証・受理証、該当する添付資料を準備してください。");
  if (purpose === "inspection") {
    if (!["manufacture", "storage"].includes(activity) || !first) return result([], "選択された区分は第一種施設の検査申請の案内対象ではありません。自主検査・設備ごとの検査義務と混同しないでください。", true);
    const id = a.inspection.startsWith("external") ? `${a.inspection}-${a.institution}` : `${activity}-${a.inspection}`;
    return result([id], "対象施設・免除の有無・検査機関を確認してください。受検時は日程の調整が必要です。");
  }
  if (purpose === "personnel") {
    if (activity === "storage" || (activity === "manufacture" && !first) || (activity === "sales" && a.regulation === "refrigeration")) return result([], "選択された区分に、ここで扱う役職・危害予防規程の届出を一律に当てはめることはできません。別の区分を確認する場合は回答を変更してください。", true);
    return result([activity === "manufacture" ? a.role === "hazard" ? "hazard-rules" : `personnel-${a.role}` : `personnel-${activity}`], "役職の選任要件・免除を確認し、選任・解任に応じた書類を準備してください。");
  }
  return result([], "目的を選び直してください。", true);
}
export function lifecycleFacts(answers = {}) {
  return { inheritance: answers.succession ? (answers.succession === "inheritance" ? "yes" : "no") : "unknown", merger: answers.succession ? (["merger", "split"].includes(answers.succession) ? "yes" : "no") : "unknown", transfer: answers.succession ? (answers.succession === "transfer" ? "yes" : "no") : "unknown" };
}
export function minorLawLink(activity, regulation, status) {
  const nums = { manufacture: { general: status === "permit" ? "15" : "17", lpgas: status === "permit" ? "16" : "18", refrigeration: status === "permit" ? "17" : "19" }, storage: { general: status === "permit" ? "28" : "30", lpgas: status === "permit" ? "29" : "31" }, consumption: { general: "57", lpgas: "55" } };
  const num = nums[activity]?.[regulation];
  return num ? `https://laws.e-gov.go.jp/law/${procLawIds[regulation]}#Mp-At_${num}` : NARA_PAGES.common;
}
