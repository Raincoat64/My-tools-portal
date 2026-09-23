// 「設問モード」の分岐ロジック。
//
// 対象: 一般則・冷凍則・液石則の製造・貯蔵・販売・消費。申請資料は procedures.js の台帳を参照。
//
// 各法令の許可・届出基準はすべて高圧ガス保安法第5条に由来するが、
// 政令(施行令)・省令(各則)で具体的な数値・算式が個別に定められている。
// 処理能力そのものを利用者が把握していない場合が多いため、可能な限り
// 「基準値以上か未満か」を選択させる形式にし、自由数値入力は算式が
// 必要な場合(一般則の混合ガス)に限定している。
//
// 参照した一次資料:
//  - 高圧ガス保安法(326AC0000000204) 第2条(定義)・第5条(製造の許可等)
//  - 高圧ガス保安法施行令(409CO0000000020) 第3条(一般則向けガス種・値)、第4条(冷凍則向けガス種・値)
//  - 一般高圧ガス保安規則(341M50000400053) 第3条・第4条(許可申請・届出)、第102条(混合時の算式)、
//    第11条・第12条(処理能力30立方メートルでの技術基準の切り分け)
//  - 冷凍保安規則(341M50000400051) 第3条・第4条(許可申請・届出)、第5条(冷凍能力の算定基準)
//  - 液化石油ガス保安規則(341M50000400052) 第3条・第4条(許可申請・届出) ※法第5条第1項第1号を直接引用
//
// 「処理能力」は圧縮・液化のほか、高圧ガスを減圧して製造する場合も対象となり、
// この場合の処理能力算定上の数値は0となる(高圧ガス保安法上「製造」に該当する)。
// 処理能力0であっても、事業として反復・継続して行えば第二種製造者の届出対象となりうる。

const ACTION_TYPES = [
  { id: "manufacture", label: "製造", available: true },
  { id: "storage", label: "貯蔵", available: true },
  { id: "consumption", label: "消費", available: true },
  { id: "sales", label: "販売", available: true },
];

const IPPAN = "341M50000400053"; // 一般高圧ガス保安規則
const REITOU = "341M50000400051"; // 冷凍保安規則
const EKISEKI = "341M50000400052"; // 液化石油ガス保安規則
const ACT = "326AC0000000204"; // 高圧ガス保安法
const ORDER = "409CO0000000020"; // 高圧ガス保安法施行令
const LPG_ACT = "342AC0000000149"; // 液化石油ガス法

const INVALID_MESSAGE = "必要な情報が不足しているか、入力値を確認できないため判定できません。";

function isChoice(value, allowed) {
  return typeof value === "string" && allowed.includes(value);
}

function readNonNegativeNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function invalidDiagnosis(message = INVALID_MESSAGE) {
  return { verdict: "invalid", message };
}

// invalid は画面側でも結果オブジェクトとして安全に扱えるよう、公開境界で形をそろえる。
function normalizeDiagnosisResult(result) {
  if (!result || typeof result !== "object") {
    return {
      ...invalidDiagnosis(),
      title: "確認が必要です",
      summary: INVALID_MESSAGE,
      citations: [],
      procedures: [],
    };
  }
  if (result.verdict !== "invalid") return result;
  return {
    ...result,
    title: result.title || "確認が必要です",
    summary: result.summary || result.message || INVALID_MESSAGE,
    citations: Array.isArray(result.citations) ? result.citations : [],
    procedures: Array.isArray(result.procedures) ? result.procedures : [],
  };
}

const MANUFACTURE_CATEGORIES = [
  {
    id: "general",
    label: "一般の高圧ガス(不活性・可燃性・毒性ガスなど)",
    help: "冷凍のための製造、液化石油ガスの製造を除く高圧ガス全般。一般高圧ガス保安規則(一般則)が適用されます。",
  },
  {
    id: "refrigeration",
    label: "冷凍のための製造(冷凍設備でガスを圧縮・液化)",
    help: "冷凍保安規則(冷凍則)が適用されます。",
  },
  {
    id: "lpgas",
    label: "液化石油ガス(LPガス、プロパン・ブタン等)の製造",
    help: "液化石油ガス保安規則(液石則)が適用されます。一般消費者向け供給設備への充塡は対象外です(下記注記参照)。",
  },
];

const SALES_CATEGORIES = [
  {
    id: "general",
    label: "一般の高圧ガス(不活性・可燃性・毒性ガスなど)",
    help: "冷凍のための高圧ガス、液化石油ガスを除く高圧ガス全般。一般高圧ガス保安規則(一般則)が適用されます。",
  },
  {
    id: "refrigeration",
    label: "冷凍のための高圧ガス(冷媒ガス等)",
    help: "冷凍保安規則(冷凍則)が適用されます。",
  },
  {
    id: "lpgas",
    label: "液化石油ガス(LPガス、プロパン・ブタン等)",
    help: "液化石油ガス保安規則(液石則)が適用されます。一般消費者向け供給は対象外です(次の設問で確認します)。",
  },
];

const STORAGE_CATEGORIES = [
  {
    id: "general",
    label: "一般の高圧ガス(不活性・可燃性・毒性ガスなど)",
    help: "冷凍のための高圧ガス、液化石油ガスを除く高圧ガス全般。一般高圧ガス保安規則(一般則)の貯蔵所規定が適用されます。",
  },
  {
    id: "refrigeration",
    label: "冷凍のための高圧ガス(冷媒ガス等)",
    help: "冷凍保安規則には貯蔵所固有の基準がないため、一般高圧ガス保安規則(一般則)の貯蔵所規定が適用されます。",
  },
  {
    id: "lpgas",
    label: "液化石油ガス(LPガス、プロパン・ブタン等)",
    help: "液化石油ガス保安規則(液石則)の貯蔵所規定が適用されます。",
  },
];

function getCategoriesForAction(actionType) {
  if (actionType === "sales") return SALES_CATEGORIES;
  if (actionType === "storage") return STORAGE_CATEGORIES;
  if (actionType === "consumption") return CONSUMPTION_CATEGORIES;
  return MANUFACTURE_CATEGORIES;
}

/* ---------- 共通設問 ---------- */

const BUSINESS_STEP = {
  id: "isBusiness",
  prompt: "事業として反復・継続して製造を行いますか?",
  type: "choice",
  help:
    "許可基準未満であっても、事業として反復・継続して高圧ガスを製造する場合は、事業開始の日の20日前までの届出対象となります(高圧ガス保安法第5条第2項)。" +
    "高圧ガスを減圧して製造する場合(この場合、処理能力は0として扱われます)も対象です。",
  options: [
    { value: "yes", label: "はい(事業として反復・継続して行う)" },
    { value: "no", label: "いいえ(自家消費など、事業ではない)" },
  ],
};

function makeCapacityBandStep(threshold, extraHelp) {
  return {
    id: "capacityBand",
    prompt: `処理能力は ${threshold} 立方メートル/日 以上ですか?`,
    type: "choice",
    help:
      "圧縮・液化その他の方法で処理できるガスの容積を、温度0℃・圧力0Paの状態に換算した1日あたりの値です。" +
      "高圧ガスを減圧して製造する場合、処理能力は0として扱われます。" +
      (extraHelp ? " " + extraHelp : ""),
    options: [
      { value: "over", label: `${threshold} 立方メートル/日 以上` },
      { value: "under", label: `${threshold} 立方メートル/日 未満(減圧のみを行う場合を含む)` },
    ],
  };
}

/* ---------- 一般則: 製造 ---------- */

const GENERAL_GAS_SCOPE_STEP = {
  id: "gasScope",
  prompt: "製造する高圧ガスの種類は?",
  type: "choice",
  options: [
    {
      value: "type1only",
      label: "不活性ガス等(第一種ガス)のみ",
      help: "ヘリウム・ネオン・アルゴン・クリプトン・キセノン・ラドン・窒素・二酸化炭素・難燃性フルオロカーボン・空気",
    },
    {
      value: "otherOnly",
      label: "可燃性ガス・毒性ガスなど(第一種ガス以外)のみ",
      help: "上記以外のガス。高圧ガスを減圧して製造する場合も含みます",
    },
    {
      value: "mixed",
      label: "第一種ガスと、それ以外のガスの両方を扱う",
      help: "同一事業所で両方の処理設備を持つ場合",
    },
  ],
};

const GENERAL_TYPE1_BAND_STEP = makeCapacityBandStep(300);
const GENERAL_OTHER_BAND_STEP = makeCapacityBandStep(100);

const GENERAL_S1_STEP = {
  id: "s1",
  prompt: "不活性ガス等(第一種ガス)の処理能力は?",
  type: "number",
  unit: "立方メートル/日",
  help: "第一種ガスの処理能力を、温度0℃・圧力0Paの状態に換算した1日あたりの値で入力してください。",
  min: 0,
};

const GENERAL_S2_STEP = {
  id: "s2",
  prompt: "それ以外(可燃性ガス・毒性ガスなど)の処理能力は?",
  type: "number",
  unit: "立方メートル/日",
  help: "圧縮・液化その他の方法で処理できるガスの容積を、温度0℃・圧力0Paの状態に換算した1日あたりの値(一般則第2条第9号)",
  min: 0,
};

function getGeneralSteps(answers) {
  const steps = [GENERAL_GAS_SCOPE_STEP];
  if (answers.gasScope === "type1only") {
    steps.push(GENERAL_TYPE1_BAND_STEP);
  } else if (answers.gasScope === "otherOnly") {
    steps.push(GENERAL_OTHER_BAND_STEP);
  } else if (answers.gasScope === "mixed") {
    steps.push(GENERAL_S1_STEP, GENERAL_S2_STEP);
  }
  steps.push(BUSINESS_STEP);
  return steps;
}

// 一般則: 施行令第3条・一般則第102条による算式。
// T(許可基準, m3/日) = 100 + (2/3)×S1 (0<=S1<=300の範囲で線形補間)
// S1=0(第一種ガスなし)のとき T=100、S1>=300(第一種ガスのみで既に300以上)のとき T=300 に自然に収束する。
function calcGeneralThreshold(s1) {
  const clamped = Math.max(0, Math.min(s1, 300));
  return 100 + (2 / 3) * clamped;
}

function evaluateGeneral(answers) {
  const { gasScope, isBusiness } = answers;
  if (!isChoice(gasScope, ["type1only", "otherOnly", "mixed"]) || !isChoice(isBusiness, ["yes", "no"])) {
    return invalidDiagnosis("ガスの種類と事業性を確認できないため判定できません。");
  }

  const citations = [
    { lawId: ACT, num: "5", label: "高圧ガス保安法 第5条(製造の許可等)" },
    { lawId: ORDER, num: "3", label: "高圧ガス保安法施行令 第3条(政令で定めるガスの種類等)" },
  ];

  let overThreshold;
  let thresholdLabel;
  let note = null;

  if (gasScope === "type1only") {
    if (!isChoice(answers.capacityBand, ["over", "under"])) return invalidDiagnosis();
    overThreshold = answers.capacityBand === "over";
    thresholdLabel = "300立方メートル/日";
  } else if (gasScope === "otherOnly") {
    if (!isChoice(answers.capacityBand, ["over", "under"])) return invalidDiagnosis();
    overThreshold = answers.capacityBand === "over";
    thresholdLabel = "100立方メートル/日";
  } else if (gasScope === "mixed") {
    const s1 = readNonNegativeNumber(answers.s1);
    const s2 = readNonNegativeNumber(answers.s2);
    if (s1 === null || s2 === null) {
      return invalidDiagnosis("混合ガスの処理能力を確認できないため判定できません。");
    }
    const total = s1 + s2;
    const threshold = calcGeneralThreshold(s1);
    overThreshold = total >= threshold;
    thresholdLabel = `約${threshold.toFixed(1)}立方メートル/日(第一種ガス処理能力${s1}m³/日から算式で算出)`;
    citations.push({ lawId: IPPAN, num: "102", label: "一般高圧ガス保安規則 第102条(第一種製造者に係るガス処理容積の算定方法)" });
    if (s1 > 0 && s2 > 0) {
      note =
        "不活性ガス(第一種ガス)と可燃性ガス・毒性ガスなどを併せて扱うため、施行令第3条・一般則第102条の算式" +
        "(T=100+(2/3)×第一種ガスの処理能力)により許可基準を計算しています。";
    }
  } else {
    return { verdict: "invalid", message: "ガスの種類を選択してください。" };
  }

  if (overThreshold) {
    return {
      verdict: "permit",
      title: "第一種製造者に該当する可能性があります",
      summary: `処理能力が許可基準(${thresholdLabel})以上です。都道府県知事の許可が必要です。`,
      citations,
      procedures: IPPAN_PROCEDURES.permit,
      note,
    };
  }

  if (answers.isBusiness === "yes") {
    return {
      verdict: "notification",
      title: "第二種製造者に該当する可能性があります",
      summary: `処理能力は許可基準(${thresholdLabel})未満ですが、事業として行うため届出が必要です。`,
      citations,
      procedures: IPPAN_PROCEDURES.notification,
      note,
    };
  }

  return {
    verdict: "none",
    title: "許可・届出の対象とならない可能性があります",
    summary: "事業として行わない場合、高圧ガス保安法第5条に基づく許可・届出は不要となる可能性があります。",
    citations,
    procedures: [],
    note: "貯蔵・消費など高圧ガス保安法の他の規定が別途適用される場合があります。",
  };
}

/* ---------- 冷凍則: 製造 ---------- */

// 法第5条第1項第2号・第2項第2号は、冷凍のための製造すべてに適用される基準値そのもの(許可20トン/届出3トン)を
// 条文本体に定めており、施行令第4条はこの値を特定のガス種(第一種ガス、フルオロカーボン+アンモニア)についてのみ
// 「20トン(届出は3トン)を超える政令で定める値」(=50トン/20トン、50トン/5トン)に引き上げる規定に過ぎない。
// したがって施行令第4条の表(2行)に該当しない冷媒ガス(プロパン等)は、一般則にまわるのではなく、法本体の
// デフォルト値(許可20トン/届出3トン)がそのまま適用される。
// フルオロカーボンが「第一種ガス」側(50t/20t)に含まれるのは、施行令第2条第3項第4号の
// 燃焼性基準に適合するものに限られ、その基準に適合しないものはフルオロカーボン+アンモニア側
// (50t/5t)に該当する。根拠は施行令第4条及び一般則第101条(2026-09-19確認)。
const REFRIGERATION_GAS_TYPE_STEP = {
  id: "gasType",
  prompt: "使用する冷媒ガスの種類は?",
  type: "choice",
  options: [
    {
      value: "type1",
      label: "不活性ガス等(第一種ガス): 二酸化炭素・不活性のフルオロカーボンなど",
      help:
        "ヘリウム・ネオン・アルゴン・クリプトン・キセノン・ラドン・窒素・二酸化炭素・空気、及び難燃性の基準" +
        "(経済産業省令で定める燃焼性の基準)に適合するフルオロカーボン",
    },
    {
      value: "fluorocarbon_ammonia",
      label: "フルオロカーボン(不活性でないもの)またはアンモニア",
      help:
        "難燃性の基準(経済産業省令で定める燃焼性の基準)に適合しない、可燃性・微燃性のフルオロカーボン、及び" +
        "アンモニアが該当します。",
    },
    {
      value: "other",
      label: "フルオロカーボン又はアンモニア以外の冷媒ガス(プロパンなど)",
      help: "上記いずれにも該当しない冷媒ガスには、法第5条本体に定める基準値がそのまま適用されます。",
    },
  ],
};

function getRefrigerationThresholds(gasType) {
  if (gasType === "type1") {
    return { permitThreshold: 50, notifyThreshold: 20, gasLabel: "第一種ガス" };
  }
  if (gasType === "fluorocarbon_ammonia") {
    return { permitThreshold: 50, notifyThreshold: 5, gasLabel: "フルオロカーボン(不活性でないもの)又はアンモニア" };
  }
  return { permitThreshold: 20, notifyThreshold: 3, gasLabel: "フルオロカーボン又はアンモニア以外の冷媒ガス" };
}

function makeRefrigerationBandStep(gasType) {
  const { permitThreshold, notifyThreshold } = getRefrigerationThresholds(gasType);
  return {
    id: "capacityBand",
    prompt: "1日の冷凍能力の区分は?",
    type: "choice",
    help: "冷凍則第5条で定める算定基準による換算値です。設備の仕様書・メーカー資料でご確認ください。",
    options: [
      { value: "over", label: `${permitThreshold} トン/日 以上` },
      { value: "between", label: `${notifyThreshold} トン/日 以上 ${permitThreshold} トン/日 未満` },
      { value: "under", label: `${notifyThreshold} トン/日 未満` },
    ],
  };
}

function getRefrigerationSteps(answers) {
  const steps = [REFRIGERATION_GAS_TYPE_STEP];
  if (answers.gasType) {
    steps.push(makeRefrigerationBandStep(answers.gasType));
  }
  return steps;
}

function evaluateRefrigeration(answers) {
  if (!isChoice(answers.gasType, ["type1", "fluorocarbon_ammonia", "other"])) {
    return invalidDiagnosis("冷媒ガスの区分を確認できないため判定できません。");
  }
  if (!isChoice(answers.capacityBand, ["over", "between", "under"])) {
    return invalidDiagnosis("冷凍能力の区分を確認できないため判定できません。");
  }

  const citations = [
    { lawId: ACT, num: "5", label: "高圧ガス保安法 第5条(製造の許可等)" },
    { lawId: ORDER, num: "4", label: "高圧ガス保安法施行令 第4条(政令で定めるガスの種類等)" },
  ];

  const { permitThreshold, notifyThreshold, gasLabel } = getRefrigerationThresholds(answers.gasType);

  if (answers.capacityBand === "over") {
    return {
      verdict: "permit",
      title: "第一種製造者に該当する可能性があります",
      summary: `${gasLabel}の許可基準 ${permitThreshold} トン/日 以上に該当します。都道府県知事の許可が必要です。`,
      citations,
      procedures: REITOU_PROCEDURES.permit,
      note: null,
    };
  }

  if (answers.capacityBand === "between") {
    return {
      verdict: "notification",
      title: "第二種製造者に該当する可能性があります",
      summary: `${gasLabel}の届出基準 ${notifyThreshold} トン/日 以上、許可基準 ${permitThreshold} トン/日 未満に該当します。都道府県知事への届出が必要です。`,
      citations,
      procedures: REITOU_PROCEDURES.notification,
      note: "高圧ガス保安法第5条第2項第2号の冷凍能力による届出基準には、一般則のような事業性(事業として行うか)の要件は明記されていません。",
    };
  }

  return {
    verdict: "none",
    title: "許可・届出の対象とならない可能性があります",
    summary: `${gasLabel}の届出基準 ${notifyThreshold} トン/日 未満です。`,
    citations,
    procedures: [],
    note: "貯蔵・消費など高圧ガス保安法の他の規定が別途適用される場合があります。",
  };
}

/* ---------- 液石則: 製造 ---------- */

const LPGAS_CAPACITY_STEP = makeCapacityBandStep(
  100,
  "液化石油ガス法上の供給設備へ一般消費者向けに充塡する場合は対象外です(判定結果の注記を参照)。"
);

const LPGAS_CONSUMER_SUPPLY_STEP = {
  id: "lpgasConsumerSupply",
  prompt: "液化石油ガス法上の一般消費者等に供給するための充塡ですか?",
  type: "choice",
  help:
    "液化石油ガス法第2条第2項の『一般消費者等』に供給するための液化石油ガスの充塡は、" +
    "高圧ガス保安法第5条第1項第1号のかっこ書きにより同号の製造許可・届出の対象外となる場合があります。該当性を確認できない場合は『不明』を選んでください。",
  options: [
    { value: "yes", label: "はい(一般消費者等への供給用)" },
    { value: "no", label: "いいえ(一般消費者等への供給用ではない)" },
    { value: "unknown", label: "不明(確認できない)" },
  ],
};

function getLpgasSteps(answers) {
  if (answers.lpgasConsumerSupply !== "no") return [LPGAS_CONSUMER_SUPPLY_STEP];
  return [LPGAS_CONSUMER_SUPPLY_STEP, LPGAS_CAPACITY_STEP, BUSINESS_STEP];
}

function evaluateLpgas(answers) {
  if (!isChoice(answers.lpgasConsumerSupply, ["yes", "no", "unknown"])) {
    return invalidDiagnosis("液化石油ガスの一般消費者等向け充塡か確認できないため判定できません。");
  }
  if (answers.lpgasConsumerSupply === "unknown") {
    return invalidDiagnosis("液化石油ガスの一般消費者等向け充塡か不明なため、不要とは判定しません。");
  }
  if (answers.lpgasConsumerSupply === "yes") {
    return {
      verdict: "other_law",
      title: "液化石油ガス法の対象となる可能性があります",
      summary:
        "液化石油ガス法上の一般消費者等に供給するための充塡は、高圧ガス保安法第5条第1項第1号のかっこ書きにより、同号の製造許可・届出の対象外となる場合があります。",
      citations: [
        { lawId: ACT, num: "5", label: "高圧ガス保安法 第5条第1項第1号(液化石油ガスの適用除外)" },
        { lawId: LPG_ACT, num: "2", label: "液化石油ガス法 第2条第2項(一般消費者等)" },
      ],
      procedures: [],
      note:
        "液化石油ガス法その他の関係法令上の登録・届出・保安規制の要否は、本ツールの対象外です。" +
        "事業所所在地を管轄する都道府県にご確認ください。",
    };
  }
  if (!isChoice(answers.capacityBand, ["over", "under"]) || !isChoice(answers.isBusiness, ["yes", "no"])) {
    return invalidDiagnosis("液化石油ガスの処理能力と事業性を確認できないため判定できません。");
  }

  const citations = [
    { lawId: ACT, num: "5", label: "高圧ガス保安法 第5条(製造の許可等)" },
    { lawId: ORDER, num: "3", label: "高圧ガス保安法施行令 第3条(政令で定めるガスの種類等)" },
  ];
  const lpgasNote =
    "液化石油ガスの保安の確保及び取引の適正化に関する法律(液化石油ガス法)上の供給設備へ一般消費者向けにガスを充塡する行為は、" +
    "高圧ガス保安法第5条第1項第1号のかっこ書きにより本条の対象外です。該当する場合は液化石油ガス法上の規制(別途登録等)をご確認ください。";

  if (answers.capacityBand === "over") {
    return {
      verdict: "permit",
      title: "第一種製造者に該当する可能性があります",
      summary: "処理能力が許可基準(100立方メートル/日)以上です。都道府県知事の許可が必要です。",
      citations,
      procedures: EKISEKI_PROCEDURES.permit,
      note: lpgasNote,
    };
  }

  if (answers.isBusiness === "yes") {
    return {
      verdict: "notification",
      title: "第二種製造者に該当する可能性があります",
      summary: "処理能力は許可基準(100立方メートル/日)未満ですが、事業として行うため届出が必要です。",
      citations,
      procedures: EKISEKI_PROCEDURES.notification,
      note: lpgasNote,
    };
  }

  return {
    verdict: "none",
    title: "許可・届出の対象とならない可能性があります",
    summary: "事業として行わない場合、高圧ガス保安法第5条に基づく許可・届出は不要となる可能性があります。",
    citations,
    procedures: [],
    note: lpgasNote,
  };
}

/* ---------- 販売事業 ---------- */
//
// 高圧ガス保安法第20条の4(販売事業の届出)は、処理能力のような数値基準を持たず、
// 「販売所ごとに事業開始の20日前までに届出」が原則。以下の場合は届出不要:
//  一号: 第一種製造者(法第5条第1項第1号=一般則・液石則の許可)が、自ら製造した高圧ガスを
//        その製造事業所内で販売するとき。※冷凍(法第5条第1項第2号)の第一種製造者は
//        この号の対象外(条文上「第五条第一項第一号に規定する者」に限定されているため)。
//  二号: 施行令第6条の六類型(医療用、300mL以下容器で35℃・20MPa以下、消火器、
//        1.2L以下容器の液化フルオロカーボン、自動車等、指定緩衝装置)を、
//        貯蔵数量が常時5立方メートル未満の販売所で販売するとき。
// また、LPガスの一般消費者向け供給(液化石油ガス法上の供給設備への充塡・供給)は、
// 同条本文かっこ書きにより高圧ガス保安法の届出対象外(液化石油ガス法の管轄)。

const SALES_LPGAS_CONSUMER_STEP = {
  id: "lpgasConsumer",
  prompt: "液化石油ガス法上の一般消費者等に販売しますか?",
  type: "choice",
  help:
    "家庭用などの一般消費者への販売だけでなく、液化石油ガス法第2条第2項の『一般消費者等』(消費態様が生活用に類似する政令指定の者を含む)への販売を指します。" +
    "該当する場合は高圧ガス保安法ではなく、液化石油ガス法第2条第3項・第3条の登録対象です。",
  options: [
    { value: "yes", label: "はい(液石法上の一般消費者等への販売)" },
    { value: "no", label: "いいえ(業務用・産業用などへの販売)" },
    { value: "unknown", label: "不明(該当性を確認できない)" },
  ],
};

const SALES_SMALL_EXCEPTION_STEP = {
  id: "smallSalesException",
  prompt: "販売届出の政令指定少量例外に該当しますか?",
  type: "choice",
  help:
    "高圧ガス保安法第20条の4第2号・施行令第6条に定める次のいずれかの高圧ガスで、販売所の貯蔵数量が常時5立方メートル未満である場合に限ります。" +
    "対象は、医療用(大臣指定の種類を除く)、内容積300mL以下の容器内で35℃・20MPa以下(大臣指定の種類を除く)、消火器内、内容積1.2L以下の容器内の液化フルオロカーボン、" +
    "自動車又はその部分品内(大臣指定のものを除く)、大臣指定の緩衝装置内の高圧ガスです。両方を確認できない場合は『不明』を選んでください。",
  options: [
    { value: "yes", label: "はい(令第6条の対象ガスかつ常時5m³未満)" },
    { value: "no", label: "いいえ(例外に該当しない)" },
    { value: "unknown", label: "不明(確認できない)" },
  ],
};

const SALES_SELF_STEP = {
  id: "selfSale",
  prompt: "法第5条第1項第1号の第一種製造者として、自ら製造した高圧ガスをその製造事業所内で販売しますか?",
  type: "choice",
  help:
    "一般則又は液石則の法第5条第1項第1号に該当する第一種製造者が、自社の製造事業所内で自ら製造した高圧ガスを販売する場合、販売事業の届出は不要です" +
    "(高圧ガス保安法第20条の4第1号)。",
  options: [
    { value: "yes", label: "はい(第一種製造者による自社製造所内の販売のみ)" },
    { value: "no", label: "いいえ(第二種製造者、仕入れ、または事業所外の販売を含む)" },
  ],
};

function getSalesSteps(gasCategoryId, answers) {
  const steps = [];
  if (gasCategoryId === "lpgas") {
    steps.push(SALES_LPGAS_CONSUMER_STEP);
    if (answers.lpgasConsumer === "yes") return steps;
    if (answers.lpgasConsumer !== "no") return steps;
  }
  steps.push(SALES_SMALL_EXCEPTION_STEP);
  if (answers.smallSalesException !== "no") return steps;
  if (gasCategoryId !== "refrigeration") {
    steps.push(SALES_SELF_STEP);
  }
  return steps;
}

function evaluateSales(gasCategoryId, answers) {
  if (!isChoice(gasCategoryId, ["general", "refrigeration", "lpgas"])) {
    return invalidDiagnosis("販売する高圧ガスの区分を確認できないため判定できません。");
  }

  const baseCitation = { lawId: ACT, num: "20_4", label: "高圧ガス保安法 第20条の4(販売事業の届出)" };

  if (gasCategoryId === "lpgas") {
    if (!isChoice(answers.lpgasConsumer, ["yes", "no", "unknown"])) {
      return invalidDiagnosis("液化石油ガス法上の販売区分を確認できないため判定できません。");
    }
    if (answers.lpgasConsumer === "unknown") {
      return invalidDiagnosis("液化石油ガス法上の販売区分が不明なため、不要とは判定しません。");
    }
    if (answers.lpgasConsumer === "yes") {
      return {
        verdict: "other_law",
        title: "液化石油ガス法の対象となる可能性があります",
        summary:
          "一般消費者向けの液化石油ガス供給は、高圧ガス保安法第20条の4のかっこ書きにより本条の対象外です。" +
          "液化石油ガス法上の販売事業登録が必要です。",
        citations: [
          baseCitation,
          { lawId: LPG_ACT, num: "2", label: "液化石油ガス法 第2条第2項(一般消費者等)" },
          { lawId: LPG_ACT, num: "3", label: "液化石油ガス法 第3条(販売事業の登録)" },
        ],
        procedures: [],
        note:
          "液化石油ガスの保安の確保及び取引の適正化に関する法律(液化石油ガス法)上の登録等の要否・手続きについては、" +
          "本ツールの対象外です。事業所所在地を管轄する都道府県にご確認ください。",
      };
    }
  }

  if (!isChoice(answers.smallSalesException, ["yes", "no", "unknown"])) {
    return invalidDiagnosis("販売届出の政令指定少量例外を確認できないため判定できません。");
  }

  if (answers.smallSalesException === "unknown") {
    return invalidDiagnosis("販売届出の政令指定少量例外を確認できないため、不要とは判定しません。");
  }

  if (answers.smallSalesException === "yes") {
    return {
      verdict: "none",
      title: "販売事業の届出は不要となる可能性があります",
      summary:
        "施行令第6条に定める高圧ガスを販売し、販売所の貯蔵数量が常時5立方メートル未満である場合は、販売事業の届出が不要となる可能性があります。",
      citations: [baseCitation, { lawId: ORDER, num: "6", label: "高圧ガス保安法施行令 第6条(販売事業の届出を要しない高圧ガス)" }],
      procedures: [],
      note: "施行令第6条の対象ガスかつ常時5立方メートル未満という回答を前提にした判定です。貯蔵・販売方法など他の規定は別途適用されます。",
    };
  }

  if (gasCategoryId === "refrigeration") {
    return {
      verdict: "notification",
      title: "販売事業の届出が必要な可能性があります",
      summary: "事業開始の日の20日前までに、販売所ごとに都道府県知事への届出が必要です(高圧ガス保安法第20条の4)。",
      citations: [
        baseCitation,
        { lawId: ACT, num: "20_5", label: "高圧ガス保安法 第20条の5(周知させる義務等)" },
        { lawId: ACT, num: "20_6", label: "高圧ガス保安法 第20条の6(販売の方法)" },
      ],
      procedures: SALES_PROCEDURES.refrigeration,
      note:
        "冷凍のための製造に係る第一種製造者(高圧ガス保安法第5条第1項第2号)は、自ら製造した高圧ガスを自社事業所内で" +
        "販売する場合であっても、第20条の4第1号の届出免除の対象外です(同号は第5条第1項第1号の第一種製造者に限定)。",
    };
  }

  if (!isChoice(answers.selfSale, ["yes", "no"])) {
    return invalidDiagnosis("第一種製造者による自社製造所内販売か確認できないため判定できません。");
  }

  if (answers.selfSale === "yes") {
    return {
      verdict: "none",
      title: "販売事業の届出は不要となる可能性があります",
      summary:
        "第一種製造者が自ら製造した高圧ガスをその製造事業所内で販売する場合、販売事業の届出は不要です" +
        "(高圧ガス保安法第20条の4第1号)。",
      citations: [baseCitation],
      procedures: [],
      note: "貯蔵・製造など高圧ガス保安法の他の規定が別途適用される場合があります。",
    };
  }

  return {
    verdict: "notification",
    title: "販売事業の届出が必要な可能性があります",
    summary: "事業開始の日の20日前までに、販売所ごとに都道府県知事への届出が必要です(高圧ガス保安法第20条の4)。",
    citations: [
      baseCitation,
      { lawId: ACT, num: "20_5", label: "高圧ガス保安法 第20条の5(周知させる義務等)" },
      { lawId: ACT, num: "20_6", label: "高圧ガス保安法 第20条の6(販売の方法)" },
    ],
    procedures: SALES_PROCEDURES[gasCategoryId],
    note: "販売・貯蔵・製造など高圧ガス保安法の他の規定が別途適用される場合があります。",
  };
}

/* ---------- 貯蔵 ---------- */
//
// 貯蔵所の許可・届出は高圧ガス保安法第16条(第一種貯蔵所・許可)・第17条の2(第二種貯蔵所・届出)に基づく。
// 閾値は施行令第5条の表による: 第一種ガス(不活性ガス等)のみ3000m³、第一種ガス以外(第二種ガス)のみ1000m³、
// 両方混在する場合は一般則第102条と同様の算式(一般則第103条 N=1000+(2/3)×M、M=第一種ガスの貯蔵容積)で
// 許可基準を算出する。第二種貯蔵所(届出)の基準は一律300m³以上(ただし第一種貯蔵所の許可基準に該当する場合を除く)。
// 液化ガスは10kg=容積1m³とみなして算定する(法第16条第3項)。
// 経済産業省令で定める容積(0.15m³)以下の高圧ガスは貯蔵の技術基準(法第15条)自体が適用除外となる。
// 一般則第19条第2項は液化ガスの質量10kgを容積1m³とみなすため、0.15m³相当は1.5kg。液石則第20条も1.5kgを明記する。
// これは貯蔵能力の換算であり、容器の物理的な内容積そのものを意味しない。この差は許可・届出の要否には影響しないため設問では扱わない。
//
// 冷凍則には貯蔵所固有の閾値規定がなく(冷凍則第20条は貯蔵の技術基準を一般則相当の基準に委ねるのみ)、
// 冷凍のための高圧ガスの貯蔵所も一般則の第16条・第17条の2・施行令第5条がそのまま適用されるため、
// 「一般」「冷凍」の両カテゴリーで同一の設問・算式・一般則の手続きを用いる。
// 液化石油ガスは液石則が独自の貯蔵所規定(液石則第19条〜第43条)を持つため、液石則の手続きを用いる。
//
// なお、施行令第5条には「第三種ガス」(一般則第2条第1項第3号の特殊高圧ガス: アルシン・ジシラン・ジボラン・
// セレン化水素・ホスフィン・モノゲルマン・モノシラン)を含む場合の別表(4〜6号、300m³超からの算式)があるが、
// 極めて限定的なガスのため、本ツールでは対象外の注記のみで案内する。
//
// 参照した一次資料:
//  - 高圧ガス保安法 第15条(貯蔵)・第16条(貯蔵所)・第17条の2(第二種貯蔵所)
//  - 高圧ガス保安法施行令 第5条(貯蔵所に係る政令で定めるガスの種類等)
//  - 一般高圧ガス保安規則 第19条(貯蔵の規制を受けない容積)・第20条〜第30条(貯蔵所の許可・届出・変更等)・
//    第43条(廃止届)・第95条(帳簿)・第103条(第一種貯蔵所に係る貯蔵容積の算定方法)
//  - 冷凍保安規則 第20条(貯蔵の方法に係る技術上の基準)
//  - 液化石油ガス保安規則 第19条・第20条・第21条〜第32条・第43条・第93条

const STORAGE_SELF_MANUFACTURE_STEP = {
  id: "selfManufactureStorage",
  prompt: "第一種製造者として、製造許可を受けたところに従い、同じ事業所内で自ら製造した高圧ガスをそのまま貯蔵しますか?",
  type: "choice",
  help:
    "第一種製造者が高圧ガス保安法第5条第1項の許可を受けたところに従って貯蔵する高圧ガスについては、" +
    "貯蔵の技術基準(法第15条)や貯蔵所の許可・届出(法第16条・第17条の2)は適用されません" +
    "(製造許可の技術基準の中に含まれるため)。",
  options: [
    { value: "yes", label: "はい(第一種製造者の製造許可の範囲内で、その事業所内で貯蔵するのみ)" },
    { value: "no", label: "いいえ(他社から仕入れた高圧ガスの貯蔵、製造許可の範囲を超える貯蔵など)" },
  ],
};

const STORAGE_LPGAS_SUPPLY_STEP = {
  id: "lpgasSupply",
  prompt: "液化石油ガス法上の供給設備又は貯蔵施設(液化石油ガス販売事業者としての設備)で貯蔵しますか?",
  type: "choice",
  help:
    "液化石油ガスの保安の確保及び取引の適正化に関する法律(液化石油ガス法)第6条の液化石油ガス販売事業者が、" +
    "同法上の供給設備又は貯蔵施設で貯蔵する液化石油ガスは、高圧ガス保安法第15条・第16条・第17条の2の" +
    "対象外です(液化石油ガス法の管轄)。",
  options: [
    { value: "yes", label: "はい(液化石油ガス法上の供給設備・貯蔵施設での貯蔵)" },
    { value: "no", label: "いいえ(業務用ボンベの保管など、それ以外の貯蔵)" },
  ],
};

const STORAGE_GAS_SCOPE_STEP = {
  id: "storageGasScope",
  prompt: "貯蔵する高圧ガスの種類は?",
  type: "choice",
  options: [
    {
      value: "type1only",
      label: "不活性ガス等(第一種ガス)のみ",
      help: "ヘリウム・ネオン・アルゴン・クリプトン・キセノン・ラドン・窒素・二酸化炭素・難燃性フルオロカーボン・空気",
    },
    {
      value: "otherOnly",
      label: "可燃性ガス・毒性ガスなど(第一種ガス以外)のみ",
      help:
        "上記以外のガス。ただしアルシン・ジシラン・ジボラン・セレン化水素・ホスフィン・モノゲルマン・モノシラン" +
        "(特殊高圧ガス)を貯蔵する場合は、施行令第5条の別表により基準が異なるため、都道府県窓口にご確認ください。",
    },
    {
      value: "mixed",
      label: "第一種ガスと、それ以外のガスの両方を貯蔵する",
      help: "同一の貯蔵所で両方を貯蔵する場合",
    },
  ],
};

const STORAGE_THIRD_GAS_STEP = {
  id: "storageThirdGas",
  prompt: "特殊高圧ガス(施行令第5条の第三種ガス)を含みますか?",
  type: "choice",
  help:
    "アルシン、ジシラン、ジボラン、セレン化水素、ホスフィン、モノゲルマン、モノシランなどの第三種ガスを含む場合、" +
    "第一種ガス・第二種ガスだけの基準とは異なる組合せ区分になります。本ツールでは安全のため自動分類せず、都道府県窓口で確認します。",
  options: [
    { value: "yes", label: "はい(含む)" },
    { value: "no", label: "いいえ(含まない)" },
    { value: "unknown", label: "不明(分類を確認できない)" },
  ],
};

function makeStorageBandStep(permitThreshold, gasLabel) {
  return {
    id: "storageCapacityBand",
    prompt: `${gasLabel}の貯蔵容積は?`,
    type: "choice",
    help:
      "圧縮ガスは温度0℃・圧力0Paの状態に換算した容積、液化ガスは10キログラムを容積1立方メートルとみなして算定します" +
      "(高圧ガス保安法第16条第3項)。",
    options: [
      { value: "over", label: `${permitThreshold} 立方メートル以上` },
      { value: "between", label: `300 立方メートル以上 ${permitThreshold} 立方メートル未満` },
      { value: "under", label: "300 立方メートル未満" },
    ],
  };
}

const STORAGE_M_STEP = {
  id: "storageM",
  prompt: "不活性ガス等(第一種ガス)の貯蔵容積は?",
  type: "number",
  unit: "立方メートル",
  help: "液化ガスの場合は、10キログラムを容積1立方メートルとみなして換算した数値を入力してください。",
  min: 0,
};

const STORAGE_S2_STEP = {
  id: "storageS2",
  prompt: "それ以外(可燃性ガス・毒性ガスなど)の貯蔵容積は?",
  type: "number",
  unit: "立方メートル",
  help: "液化ガスの場合は、10キログラムを容積1立方メートルとみなして換算した数値を入力してください。",
  min: 0,
};

// 一般則第103条による算式。N(許可基準, m3) = 1000 + (2/3)×M (0<=M<=3000の範囲で線形補間)
function calcStorageThreshold(m) {
  const clamped = Math.max(0, Math.min(m, 3000));
  return 1000 + (2 / 3) * clamped;
}

function getStorageSteps(gasCategoryId, answers) {
  const steps = [STORAGE_SELF_MANUFACTURE_STEP];
  if (answers.selfManufactureStorage === "yes") return steps;
  if (answers.selfManufactureStorage !== "no") return steps;

  if (gasCategoryId === "lpgas") {
    steps.push(STORAGE_LPGAS_SUPPLY_STEP);
    if (answers.lpgasSupply === "yes") return steps;
    if (answers.lpgasSupply !== "no") return steps;
    steps.push(makeStorageBandStep(1000, "液化石油ガス"));
    return steps;
  }

  steps.push(STORAGE_GAS_SCOPE_STEP);
  if (["otherOnly", "mixed"].includes(answers.storageGasScope)) {
    steps.push(STORAGE_THIRD_GAS_STEP);
    if (answers.storageThirdGas !== "no") return steps;
  }
  if (answers.storageGasScope === "type1only") {
    steps.push(makeStorageBandStep(3000, "不活性ガス等(第一種ガス)"));
  } else if (answers.storageGasScope === "otherOnly") {
    steps.push(makeStorageBandStep(1000, "第一種ガス以外のガス"));
  } else if (answers.storageGasScope === "mixed") {
    steps.push(STORAGE_M_STEP, STORAGE_S2_STEP);
  }
  return steps;
}

function evaluateStorage(gasCategoryId, answers) {
  if (!isChoice(gasCategoryId, ["general", "refrigeration", "lpgas"])) {
    return invalidDiagnosis("貯蔵する高圧ガスの区分を確認できないため判定できません。");
  }

  if (!isChoice(answers.selfManufactureStorage, ["yes", "no"])) {
    return invalidDiagnosis("第一種製造者の製造許可範囲内での貯蔵か確認できないため判定できません。");
  }

  if (answers.selfManufactureStorage === "yes") {
    return {
      verdict: "none",
      title: "貯蔵所の許可・届出は不要となる可能性があります",
      summary:
        "第一種製造者が製造許可を受けたところに従って、その事業所内でそのまま貯蔵する場合、" +
        "貯蔵の技術基準・貯蔵所の許可/届出は製造許可の技術基準に含まれます。",
      citations: [
        { lawId: ACT, num: "15", label: "高圧ガス保安法 第15条(貯蔵)" },
        { lawId: ACT, num: "16", label: "高圧ガス保安法 第16条(第一種貯蔵所)" },
      ],
      procedures: [],
      note: "製造・販売など高圧ガス保安法の他の規定が別途適用される場合があります。",
    };
  }

  const storageCitations = [
    { lawId: ACT, num: "15", label: "高圧ガス保安法 第15条(貯蔵)" },
    { lawId: ACT, num: "16", label: "高圧ガス保安法 第16条(貯蔵所)" },
    { lawId: ACT, num: "17_2", label: "高圧ガス保安法 第17条の2(第二種貯蔵所)" },
    { lawId: ORDER, num: "5", label: "高圧ガス保安法施行令 第5条(貯蔵所に係る政令で定めるガスの種類等)" },
  ];
  if (gasCategoryId === "refrigeration") {
    storageCitations.push({ lawId: REITOU, num: "20", label: "冷凍保安規則 第20条(貯蔵の方法に係る技術上の基準)" });
  }
  if (gasCategoryId === "general" || gasCategoryId === "refrigeration") {
    storageCitations.push({ lawId: IPPAN, num: "19", label: "一般高圧ガス保安規則 第19条(貯蔵の規制を受けない容積)" });
  }
  if (gasCategoryId === "lpgas") {
    storageCitations.push({ lawId: EKISEKI, num: "20", label: "液化石油ガス保安規則 第20条(貯蔵の規制を受けない容積)" });
  }

  if (gasCategoryId === "lpgas") {
    if (!isChoice(answers.lpgasSupply, ["yes", "no"])) {
      return invalidDiagnosis("液化石油ガス法上の供給設備・貯蔵施設か確認できないため判定できません。");
    }
    if (answers.lpgasSupply === "yes") {
      return {
        verdict: "other_law",
        title: "液化石油ガス法の対象となる可能性があります",
        summary:
          "液化石油ガス法上の供給設備・貯蔵施設での液化石油ガスの貯蔵は、高圧ガス保安法第15条・第16条・" +
          "第17条の2の対象外です。液化石油ガス法上の規制をご確認ください。",
        citations: storageCitations,
        procedures: [],
        note:
          "液化石油ガスの保安の確保及び取引の適正化に関する法律(液化石油ガス法)上の規制の詳細については、" +
          "本ツールの対象外です。事業所所在地を管轄する都道府県にご確認ください。",
      };
    }
    return evaluateStorageBand(answers, storageCitations, EKISEKI_STORAGE_PROCEDURES, 1000, "液化石油ガス");
  }

  if (!isChoice(answers.storageGasScope, ["type1only", "otherOnly", "mixed"])) {
    return invalidDiagnosis("貯蔵するガスの種類を確認できないため判定できません。");
  }

  if (answers.storageGasScope !== "type1only" && !isChoice(answers.storageThirdGas, ["yes", "no", "unknown"])) {
    return invalidDiagnosis("第三種ガスを含むか確認できないため判定できません。");
  }

  if (answers.storageGasScope !== "type1only" && answers.storageThirdGas !== "no") {
    return invalidDiagnosis(
      "第三種ガスを含む貯蔵は施行令第5条の組合せ区分が異なるため、自動的に不要とは判定しません。都道府県窓口で確認してください。"
    );
  }

  if (answers.storageGasScope === "type1only") {
    return evaluateStorageBand(answers, storageCitations, IPPAN_STORAGE_PROCEDURES, 3000, "不活性ガス等(第一種ガス)");
  }

  if (answers.storageGasScope === "otherOnly") {
    return evaluateStorageBand(answers, storageCitations, IPPAN_STORAGE_PROCEDURES, 1000, "第一種ガス以外のガス");
  }

  if (answers.storageGasScope === "mixed") {
    const m = readNonNegativeNumber(answers.storageM);
    const s2 = readNonNegativeNumber(answers.storageS2);
    if (m === null || s2 === null) {
      return invalidDiagnosis("混合ガスの貯蔵容積を確認できないため判定できません。");
    }
    const total = m + s2;
    const threshold = calcStorageThreshold(m);
    const citations = [
      ...storageCitations,
      { lawId: IPPAN, num: "103", label: "一般高圧ガス保安規則 第103条(第一種貯蔵所に係る貯蔵容積の算定方法)" },
    ];
    const note =
      m > 0 && s2 > 0
        ? "不活性ガス(第一種ガス)と可燃性ガス・毒性ガスなどを併せて貯蔵するため、施行令第5条・一般則第103条の算式" +
          "(N=1000+(2/3)×第一種ガスの貯蔵容積)により許可基準を計算しています。"
        : null;

    if (total >= threshold) {
      return {
        verdict: "permit",
        title: "第一種貯蔵所の設置許可が必要な可能性があります",
        summary: `貯蔵容積の合計が許可基準(約${threshold.toFixed(1)}立方メートル)以上です。都道府県知事の許可が必要です。`,
        citations,
        procedures: IPPAN_STORAGE_PROCEDURES.permit,
        note,
      };
    }
    if (total >= 300) {
      return {
        verdict: "notification",
        title: "第二種貯蔵所の設置届出が必要な可能性があります",
        summary: `貯蔵容積の合計が300立方メートル以上、許可基準(約${threshold.toFixed(1)}立方メートル)未満です。都道府県知事への届出が必要です。`,
        citations,
        procedures: IPPAN_STORAGE_PROCEDURES.notification,
        note,
      };
    }
    return {
      verdict: "none",
      title: "貯蔵所の許可・届出の対象とならない可能性があります",
      summary: "貯蔵容積の合計が300立方メートル未満です。",
      citations,
      procedures: [],
      note: "貯蔵容積が0.15立方メートル(液化ガスは1.5キログラム相当)を超える場合、貯蔵所の許可・届出は不要でも、" +
        "貯蔵の技術基準(法第15条)には従う必要があります。",
    };
  }

  return { verdict: "invalid", message: "貯蔵するガスの種類を選択してください。" };
}

function evaluateStorageBand(answers, baseCitations, procedures, permitThreshold, gasLabel) {
  if (!isChoice(answers.storageCapacityBand, ["over", "between", "under"])) {
    return invalidDiagnosis("貯蔵容積の区分を確認できないため判定できません。");
  }

  if (answers.storageCapacityBand === "over") {
    return {
      verdict: "permit",
      title: "第一種貯蔵所の設置許可が必要な可能性があります",
      summary: `${gasLabel}の許可基準(${permitThreshold}立方メートル)以上に該当します。都道府県知事の許可が必要です。`,
      citations: baseCitations,
      procedures: procedures.permit,
      note: null,
    };
  }

  if (answers.storageCapacityBand === "between") {
    return {
      verdict: "notification",
      title: "第二種貯蔵所の設置届出が必要な可能性があります",
      summary:
        `${gasLabel}の届出基準(300立方メートル)以上、許可基準(${permitThreshold}立方メートル)未満に該当します。` +
        "都道府県知事への届出が必要です。",
      citations: baseCitations,
      procedures: procedures.notification,
      note: null,
    };
  }

  return {
    verdict: "none",
    title: "貯蔵所の許可・届出の対象とならない可能性があります",
    summary: `${gasLabel}の届出基準(300立方メートル)未満です。`,
    citations: baseCitations,
    procedures: [],
    note:
      "貯蔵容積が0.15立方メートル(液化ガスは1.5キログラム相当)を超える場合、" +
      "貯蔵所の許可・届出は不要でも、貯蔵の技術基準(法第15条)には従う必要があります。",
  };
}

/* ---------- 消費 ---------- */
//
// 特定高圧ガス消費者の届出(高圧ガス保安法第24条の2)は、施行令第7条で定める2グループのガスが対象。
// グループ1(施行令7条1項、圧縮又は液化した状態のもの): モノシラン・ホスフィン・アルシン・ジボラン・
//   セレン化水素・モノゲルマン・ジシラン。経済産業省の逐条解説は、貯蔵量・濃度にかかわらず、
//   漏えい検知警報設備の校正試験だけの場合を除き届出対象と説明している。
// グループ2(施行令7条2項、貯蔵能力の閾値あり): 圧縮水素・圧縮天然ガス(各300m³)、液化酸素・液化アンモニア
//   (各3000kg)、液化塩素(1000kg)、液化石油ガス(一般消費者向けを除き3000kg、液化石油ガス法施行令第2条各号に
//   掲げる者は10000kg)。
// グループ2は、法24条の2かっこ書きにより「貯蔵設備の貯蔵能力が政令で定める数量以上である者」または
// 「消費事業所以外の事業所から導管により供給を受ける者」に該当する場合に特定高圧ガス消費者となる(許可制度は
// なく、届出のみ)。液化石油ガスの一般消費者等の消費は液化石油ガス法の管轄(施行令7条2項の表かっこ書き)。
// 液化石油ガスのみ液石則が独自の手続き条文(51条以下)を持ち、それ以外は一般則(53条以下)が適用される。
// 冷凍則には消費者固有の規定がなく、冷凍のための消費(大量アンモニア冷媒等)も一般則の規定に従う。
//
// 参照した一次資料:
//  - 高圧ガス保安法 第24条の2(消費)・第24条の3(技術基準)・第24条の4(変更・廃止の届出)・
//    第24条の5(その他消費に係る技術基準)・第28条第2項(取扱主任者)
//  - 高圧ガス保安法施行令 第7条(政令で定める種類の高圧ガス)
//  - 一般高圧ガス保安規則 第53条(届出)・第54条の2(承継)・第55条(技術基準)・第56条(変更届出)・
//    第57条(軽微変更)・第58条(廃止届出)・第59条・第60条(その他消費の技術基準)・第75条(取扱主任者届出)
//  - 液化石油ガス保安規則 第51条(届出)・第51条の2(承継)・第54条(変更届出)・第56条(廃止届出)・
//    第71条(取扱主任者選任基準)・第73条(取扱主任者届出)

const CONSUMPTION_CATEGORIES = [
  {
    id: "general",
    label: "液化石油ガスを除く高圧ガス(水素・天然ガス・酸素・アンモニア・塩素・特殊高圧ガスなど)",
    help: "一般高圧ガス保安規則(一般則)の特定高圧ガス消費者規定が適用されます。",
  },
  {
    id: "lpgas",
    label: "液化石油ガス(LPガス、プロパン・ブタン等)",
    help: "液化石油ガス保安規則(液石則)の特定高圧ガス消費者規定が適用されます。",
  },
];

const CONSUMPTION_GAS_TYPE_STEP = {
  id: "consumptionGasType",
  prompt: "消費する高圧ガスの種類は?",
  type: "choice",
  options: [
    {
      value: "special7",
      label: "モノシラン・ホスフィン・アルシン・ジボラン・セレン化水素・モノゲルマン・ジシラン(圧縮又は液化したもの)",
      help: "施行令第7条第1項に定める特殊性の高いガスで、数量にかかわらず対象となり得ます。",
    },
    { value: "hydrogen", label: "圧縮水素" },
    { value: "natgas", label: "圧縮天然ガス" },
    { value: "oxygen", label: "液化酸素" },
    { value: "ammonia", label: "液化アンモニア" },
    { value: "chlorine", label: "液化塩素" },
    {
      value: "other",
      label: "上記以外の高圧ガス",
      help: "可燃性ガス・毒性ガス・酸素・空気などは、特定高圧ガス消費者に該当しない場合でも別の技術基準(法第24条の5)に従う必要があります。",
    },
  ],
};

const CONSUMPTION_SPECIAL7_PURPOSE_STEP = {
  id: "special7CalibrationOnly",
  prompt: "特殊高圧ガスの用途は、漏えい検知警報設備の校正試験だけですか?",
  type: "choice",
  help:
    "経済産業省の一般則逐条解説は、特殊高圧ガスを漏えい検知警報設備の校正試験だけに用いる場合は、特定高圧ガスの消費とはみなさず届出不要と説明しています。" +
    "通常の製造・研究・工程用途などであれば、容器からの消費を含め、数量・濃度にかかわらず届出対象となり得ます。",
  options: [
    { value: "yes", label: "はい(校正試験だけに使用)" },
    { value: "no", label: "いいえ(通常の用途で消費する)" },
    { value: "unknown", label: "不明(用途を確認できない)" },
  ],
};

const CONSUMPTION_LPGAS_LARGE_CONSUMER_STEP = {
  id: "lpgasLargeConsumer",
  prompt: "液化石油ガス法施行令第2条各号に掲げる者ですか?",
  type: "choice",
  help:
    "液化石油ガス法施行令第2条各号に掲げる者が消費する液化石油ガスは、特定高圧ガス消費の貯蔵能力基準が1万キログラムです。" +
    "該当性を確認できない場合は『不明』を選んでください。",
  options: [
    { value: "yes", label: "はい(施行令第2条各号に掲げる者)" },
    { value: "no", label: "いいえ(該当しない)" },
    { value: "unknown", label: "不明(確認できない)" },
  ],
};

function getConsumptionThresholdInfo(gasType, lpgasLargeConsumer = false) {
  const map = {
    hydrogen: { quantity: 300, unit: "立方メートル", gasLabel: "圧縮水素" },
    natgas: { quantity: 300, unit: "立方メートル", gasLabel: "圧縮天然ガス" },
    oxygen: { quantity: 3000, unit: "キログラム", gasLabel: "液化酸素" },
    ammonia: { quantity: 3000, unit: "キログラム", gasLabel: "液化アンモニア" },
    chlorine: { quantity: 1000, unit: "キログラム", gasLabel: "液化塩素" },
    lpgas: { quantity: lpgasLargeConsumer ? 10000 : 3000, unit: "キログラム", gasLabel: "液化石油ガス" },
  };
  return map[gasType] || null;
}

const CONSUMPTION_PIPELINE_STEP = {
  id: "consumptionPipeline",
  prompt: "消費する事業所以外の事業所から、導管によりこのガスの供給を受けていますか?",
  type: "choice",
  help:
    "他の事業所から導管で供給を受ける場合、貯蔵設備の貯蔵能力にかかわらず特定高圧ガス消費者に該当します" +
    "(高圧ガス保安法第24条の2)。",
  options: [
    { value: "yes", label: "はい(他事業所から導管で供給を受ける)" },
    { value: "no", label: "いいえ" },
  ],
};

function makeConsumptionBandStep(gasType, lpgasLargeConsumer = false) {
  const info = getConsumptionThresholdInfo(gasType, lpgasLargeConsumer);
  const extraHelp =
    gasType === "lpgas"
      ? "液化石油ガスの保安の確保及び取引の適正化に関する法律施行令第2条各号に掲げる者(大口需要家など)が消費する場合は、基準が1万キログラムになります。"
      : null;
  return {
    id: "consumptionStorageBand",
    prompt: `${info.gasLabel}の貯蔵設備の貯蔵能力は?`,
    type: "choice",
    help: "施行令第7条第2項に定める数量です。" + (extraHelp ? " " + extraHelp : ""),
    options: [
      { value: "over", label: `${info.quantity} ${info.unit} 以上` },
      { value: "under", label: `${info.quantity} ${info.unit} 未満(貯蔵設備がない場合を含む)` },
    ],
  };
}

const CONSUMPTION_LPGAS_CONSUMER_STEP = {
  id: "lpgasConsumer",
  prompt: "液化石油ガス法上の一般消費者等として消費しますか?",
  type: "choice",
  help:
    "液化石油ガス法上の一般消費者等(同法第2条第2項)が消費する液化石油ガスは、施行令第7条第2項のかっこ書きにより" +
    "高圧ガス保安法の特定高圧ガス消費者規定の対象外です(液化石油ガス法の管轄)。",
  options: [
    { value: "yes", label: "はい(家庭用その他、液石法上の一般消費者等)" },
    { value: "no", label: "いいえ(業務用・産業用など)" },
    { value: "unknown", label: "不明(該当性を確認できない)" },
  ],
};

function getConsumptionSteps(gasCategoryId, answers) {
  if (gasCategoryId === "lpgas") {
    const steps = [CONSUMPTION_LPGAS_CONSUMER_STEP];
    if (answers.lpgasConsumer === "yes") return steps;
    if (answers.lpgasConsumer !== "no") return steps;
    steps.push(CONSUMPTION_PIPELINE_STEP);
    if (answers.consumptionPipeline === "yes") return steps;
    if (answers.consumptionPipeline !== "no") return steps;
    steps.push(CONSUMPTION_LPGAS_LARGE_CONSUMER_STEP);
    if (!isChoice(answers.lpgasLargeConsumer, ["yes", "no"])) return steps;
    steps.push(makeConsumptionBandStep("lpgas", answers.lpgasLargeConsumer === "yes"));
    return steps;
  }

  const steps = [CONSUMPTION_GAS_TYPE_STEP];
  const gasType = answers.consumptionGasType;
  if (!isChoice(gasType, ["special7", "hydrogen", "natgas", "oxygen", "ammonia", "chlorine", "other"]) || gasType === "other") return steps;

  if (gasType === "special7") {
    steps.push(CONSUMPTION_SPECIAL7_PURPOSE_STEP);
    return steps;
  }

  steps.push(CONSUMPTION_PIPELINE_STEP);
  if (answers.consumptionPipeline === "yes") return steps;
  if (answers.consumptionPipeline !== "no") return steps;
  steps.push(makeConsumptionBandStep(gasType));
  return steps;
}

function buildConsumptionResult(gasLabel, procedures, citations, note) {
  return {
    verdict: "notification",
    title: "特定高圧ガス消費者に該当する可能性があります",
    summary: `${gasLabel}の消費者として、事業所ごとに消費開始の日の20日前までに都道府県知事への届出が必要です(高圧ガス保安法第24条の2)。`,
    citations,
    procedures: procedures.notification,
    note,
  };
}

function buildConsumptionNoneResult(gasLabel, citations, extraNote) {
  return {
    verdict: "none",
    title: "特定高圧ガス消費者の届出は不要となる可能性があります",
    summary: `${gasLabel}の貯蔵設備の貯蔵能力が基準未満で、他事業所からの導管供給も受けない場合、特定高圧ガス消費者の届出は不要です。`,
    citations,
    procedures: [],
    note:
      (extraNote ? extraNote + " " : "") +
      "届出が不要な場合でも、可燃性ガス・毒性ガス・酸素・空気を消費する場合は消費の技術基準(法第24条の5)には従う必要があります。",
  };
}

function evaluateConsumption(gasCategoryId, answers) {
  const citations = [
    { lawId: ACT, num: "24_2", label: "高圧ガス保安法 第24条の2(消費)" },
    { lawId: ORDER, num: "7", label: "高圧ガス保安法施行令 第7条(政令で定める種類の高圧ガス)" },
  ];

  if (!isChoice(gasCategoryId, ["general", "lpgas"])) {
    return invalidDiagnosis("消費する高圧ガスの区分を確認できないため判定できません。");
  }

  if (gasCategoryId === "lpgas") {
    if (!isChoice(answers.lpgasConsumer, ["yes", "no", "unknown"])) {
      return invalidDiagnosis("液化石油ガス法上の消費区分を確認できないため判定できません。");
    }
    if (answers.lpgasConsumer === "unknown") {
      return invalidDiagnosis("液化石油ガス法上の消費区分が不明なため、不要とは判定しません。");
    }
    if (answers.lpgasConsumer === "yes") {
      return {
        verdict: "other_law",
        title: "液化石油ガス法の対象となる可能性があります",
        summary:
          "液化石油ガス法上の一般消費者等による液化石油ガスの消費は、高圧ガス保安法施行令第7条第2項のかっこ書きにより特定高圧ガス" +
          "消費者の対象外です。液化石油ガス法上の規制をご確認ください。",
        citations: [
          ...citations,
          { lawId: LPG_ACT, num: "2", label: "液化石油ガス法 第2条第2項(一般消費者等)" },
        ],
        procedures: [],
        note:
          "液化石油ガスの保安の確保及び取引の適正化に関する法律(液化石油ガス法)上の規制の詳細については、" +
          "本ツールの対象外です。事業所所在地を管轄する都道府県にご確認ください。",
      };
    }
    if (!isChoice(answers.consumptionPipeline, ["yes", "no"])) {
      return invalidDiagnosis("導管供給の有無を確認できないため判定できません。");
    }
    if (answers.consumptionPipeline === "yes") {
      return buildConsumptionResult("液化石油ガス", EKISEKI_CONSUMPTION_PROCEDURES, citations, null);
    }
    if (!isChoice(answers.lpgasLargeConsumer, ["yes", "no", "unknown"])) {
      return invalidDiagnosis("液化石油ガスの1万キログラム特例の該当性を確認できないため判定できません。");
    }
    if (answers.lpgasLargeConsumer === "unknown") {
      return invalidDiagnosis("液化石油ガスの1万キログラム特例が不明なため、届出不要とは判定しません。");
    }
    if (!isChoice(answers.consumptionStorageBand, ["over", "under"])) {
      return invalidDiagnosis("液化石油ガスの貯蔵能力区分を確認できないため判定できません。");
    }
    const lpgasInfo = getConsumptionThresholdInfo("lpgas", answers.lpgasLargeConsumer === "yes");
    if (answers.consumptionStorageBand === "over") {
      return buildConsumptionResult(
        lpgasInfo.gasLabel,
        EKISEKI_CONSUMPTION_PROCEDURES,
        citations,
        answers.lpgasLargeConsumer === "yes" ? "液化石油ガス法施行令第2条各号に掲げる者のため、基準は1万キログラムです。" : null
      );
    }
    return buildConsumptionNoneResult(
      lpgasInfo.gasLabel,
      citations,
      answers.lpgasLargeConsumer === "yes" ? "1万キログラム未満のため、届出不要となる可能性があります。" : null
    );
  }

  const gasType = answers.consumptionGasType;
  if (!isChoice(gasType, ["special7", "hydrogen", "natgas", "oxygen", "ammonia", "chlorine", "other"])) {
    return invalidDiagnosis("消費するガスの種類を確認できないため判定できません。");
  }

  if (gasType === "other") {
    return {
      verdict: "none",
      title: "特定高圧ガス消費者の届出は不要となる可能性があります",
      summary: "施行令第7条に定めるガスの種類に該当しないため、特定高圧ガス消費者の届出(法第24条の2)は不要です。",
      citations,
      procedures: [],
      note:
        "可燃性ガス・毒性ガス・酸素・空気を消費する場合は、届出は不要でも消費の技術基準" +
        "(法第24条の5、一般則第59条・第60条)には従う必要があります。",
    };
  }

  if (gasType === "special7") {
    const gasLabel = "モノシラン・ホスフィン・アルシン・ジボラン・セレン化水素・モノゲルマン・ジシラン";
    if (!isChoice(answers.special7CalibrationOnly, ["yes", "no", "unknown"])) {
      return invalidDiagnosis("特殊高圧ガスの用途を確認できないため判定できません。");
    }
    if (answers.special7CalibrationOnly === "unknown") {
      return invalidDiagnosis("特殊高圧ガスの用途が不明なため、届出不要とは判定しません。");
    }
    if (answers.special7CalibrationOnly === "yes") {
      return {
        verdict: "none",
        title: "特定高圧ガス消費届出は不要となる可能性があります",
        summary: "特殊高圧ガスを漏えい検知警報設備の校正試験だけに使用する場合、特定高圧ガスの消費とはみなされず、届出不要となる可能性があります。",
        citations: [...citations, { lawId: IPPAN, num: "53", label: "一般高圧ガス保安規則 第53条(特定高圧ガス消費者に係る消費の届出)" }],
        procedures: [],
        note: "これは経済産業省の一般則逐条解説に基づく限定的な扱いです。消費・貯蔵・移動の技術基準は別途確認してください。",
      };
    }
    return buildConsumptionResult(
      gasLabel,
      IPPAN_CONSUMPTION_PROCEDURES,
      citations,
      "特殊高圧ガスは、容器からの消費を含め、貯蔵量・濃度にかかわらず特定高圧ガス消費の届出対象となり得ます。"
    );
  }

  const info = getConsumptionThresholdInfo(gasType);
  if (!info) {
    return invalidDiagnosis("消費するガスの基準を確認できないため判定できません。");
  }
  if (!isChoice(answers.consumptionPipeline, ["yes", "no"])) {
    return invalidDiagnosis("導管供給の有無を確認できないため判定できません。");
  }
  if (answers.consumptionPipeline === "yes") {
    return buildConsumptionResult(info.gasLabel, IPPAN_CONSUMPTION_PROCEDURES, citations, null);
  }
  if (!isChoice(answers.consumptionStorageBand, ["over", "under"])) {
    return invalidDiagnosis("貯蔵能力区分を確認できないため判定できません。");
  }
  if (answers.consumptionStorageBand === "over") {
    return buildConsumptionResult(info.gasLabel, IPPAN_CONSUMPTION_PROCEDURES, citations, null);
  }
  return buildConsumptionNoneResult(info.gasLabel, citations, null);
}

/* ---------- 手続きチェックリスト(法令ごと) ---------- */

const IPPAN_PROCEDURES = {
  permit: [
    { lawId: IPPAN, num: "3", label: "許可申請(一般則第3条)" },
    { lawId: IPPAN, num: "31", label: "完成検査の申請等(一般則第31条)" },
    { lawId: ACT, num: "56_3", label: "特定設備検査(機器メーカーが実施、法第56条の3)" },
    { lawId: IPPAN, num: "63", label: "危害予防規程の制定・届出(一般則第63条)" },
    { lawId: ACT, num: "27", label: "保安教育計画の制定・実施(法第27条)" },
    { lawId: IPPAN, num: "64", label: "保安統括者等の選任・届出(一般則第64条・第67条)" },
    { lawId: IPPAN, num: "83", label: "定期自主検査の実施・記録(一般則第83条)" },
    { lawId: IPPAN, num: "80", label: "保安検査の受検(一般則第80条)" },
    { lawId: ACT, num: "11", label: "技術基準の遵守・維持(法第11条)" },
    { lawId: IPPAN, num: "95", label: "帳簿の記載・保存(一般則第95条)" },
    { lawId: IPPAN, num: "42", label: "製造の開始・廃止の届出(一般則第42条)" },
    { lawId: IPPAN, num: "9", label: "承継の届出(一般則第9条)" },
    { lawId: IPPAN, num: "14", label: "変更工事の許可申請、または軽微な変更工事の届出(一般則第14条・第15条)" },
  ],
  notification: [
    { lawId: IPPAN, num: "4", label: "製造の事業の届出(一般則第4条)、事業開始の20日前まで" },
    { lawId: ACT, num: "27", label: "保安教育計画の制定・実施(法第27条)" },
    { lawId: IPPAN, num: "64", label: "保安統括者等の選任・届出(一般則第64条・第67条、一定規模以上)" },
    { lawId: IPPAN, num: "83", label: "定期自主検査の実施・記録(一般則第83条、指定設備・一定規模以上)" },
    { lawId: IPPAN, num: "11", label: "技術基準の遵守・維持(処理能力30立方メートル/日以上は第一種製造者と同じ基準、一般則第11条・第12条)" },
    { lawId: IPPAN, num: "95", label: "帳簿の記載・保存(一般則第95条)" },
    { lawId: IPPAN, num: "42", label: "製造の開始・廃止の届出(一般則第42条)" },
    { lawId: IPPAN, num: "9_2", label: "承継の届出(一般則第9条の2)" },
    { lawId: IPPAN, num: "16", label: "変更工事の届出、または軽微な変更工事(届出不要)(一般則第16条・第17条)" },
  ],
};

const REITOU_PROCEDURES = {
  permit: [
    { lawId: REITOU, num: "3", label: "許可申請(冷凍則第3条)" },
    { lawId: REITOU, num: "21", label: "完成検査の申請等(冷凍則第21条)" },
    { lawId: REITOU, num: "35", label: "危害予防規程の制定・届出(冷凍則第35条)" },
    { lawId: ACT, num: "27", label: "保安教育計画の制定・実施(法第27条)" },
    { lawId: REITOU, num: "36", label: "冷凍保安責任者の選任・届出(冷凍則第36条・第37条)" },
    { lawId: REITOU, num: "44", label: "定期自主検査の実施・記録(冷凍則第44条)" },
    { lawId: REITOU, num: "41", label: "保安検査の受検(冷凍則第41条)" },
    { lawId: REITOU, num: "65", label: "帳簿の記載・保存(冷凍則第65条)" },
    { lawId: REITOU, num: "29", label: "製造の開始・廃止の届出(冷凍則第29条)" },
    { lawId: REITOU, num: "10", label: "承継の届出(冷凍則第10条)" },
    { lawId: REITOU, num: "16", label: "変更工事の許可申請、または軽微な変更工事の届出(冷凍則第16条・第17条)" },
  ],
  notification: [
    { lawId: REITOU, num: "4", label: "製造の届出(冷凍則第4条)、製造開始の日の20日前まで" },
    { lawId: ACT, num: "27", label: "保安教育計画の制定・実施(法第27条)" },
    { lawId: REITOU, num: "36", label: "冷凍保安責任者の選任・届出(冷凍則第36条・第37条、一定規模以上)" },
    { lawId: REITOU, num: "44", label: "定期自主検査の実施・記録(冷凍則第44条)" },
    { lawId: REITOU, num: "65", label: "帳簿の記載・保存(冷凍則第65条)" },
    { lawId: REITOU, num: "29", label: "製造の開始・廃止の届出(冷凍則第29条)" },
    { lawId: REITOU, num: "10_2", label: "承継の届出(冷凍則第10条の2)" },
    { lawId: REITOU, num: "18", label: "変更工事の届出、または軽微な変更工事(冷凍則第18条・第19条)" },
  ],
};

const EKISEKI_PROCEDURES = {
  permit: [
    { lawId: EKISEKI, num: "3", label: "許可申請(液石則第3条)" },
    { lawId: EKISEKI, num: "32", label: "完成検査の申請等(液石則第32条)" },
    { lawId: EKISEKI, num: "61", label: "危害予防規程の制定・届出(液石則第61条)" },
    { lawId: ACT, num: "27", label: "保安教育計画の制定・実施(法第27条)" },
    { lawId: EKISEKI, num: "62", label: "保安統括者等の選任・届出(液石則第62条・第65条)" },
    { lawId: EKISEKI, num: "81", label: "定期自主検査の実施・記録(液石則第81条)" },
    { lawId: EKISEKI, num: "78", label: "保安検査の受検(液石則第78条)" },
    { lawId: EKISEKI, num: "93", label: "帳簿の記載・保存(液石則第93条)" },
    { lawId: EKISEKI, num: "42", label: "製造の開始・廃止の届出(液石則第42条)" },
    { lawId: EKISEKI, num: "10", label: "承継の届出(液石則第10条)" },
    { lawId: EKISEKI, num: "15", label: "変更工事の許可申請、または軽微な変更工事の届出(液石則第15条・第16条)" },
  ],
  notification: [
    { lawId: EKISEKI, num: "4", label: "製造の事業の届出(液石則第4条)、事業開始の20日前まで" },
    { lawId: ACT, num: "27", label: "保安教育計画の制定・実施(法第27条)" },
    { lawId: EKISEKI, num: "62", label: "保安統括者等の選任・届出(液石則第62条・第65条、一定規模以上)" },
    { lawId: EKISEKI, num: "81", label: "定期自主検査の実施・記録(液石則第81条、指定設備・一定規模以上)" },
    { lawId: EKISEKI, num: "93", label: "帳簿の記載・保存(液石則第93条)" },
    { lawId: EKISEKI, num: "42", label: "製造の開始・廃止の届出(液石則第42条)" },
    { lawId: EKISEKI, num: "10_2", label: "承継の届出(液石則第10条の2)" },
    { lawId: EKISEKI, num: "17", label: "変更工事の届出、または軽微な変更工事(液石則第17条・第18条)" },
  ],
};

const SALES_PROCEDURES = {
  general: [
    { lawId: IPPAN, num: "37", label: "販売事業の届出(一般則第37条)、事業開始の20日前まで" },
    { lawId: IPPAN, num: "37_2", label: "承継の届出(一般則第37条の2)" },
    { lawId: IPPAN, num: "38", label: "周知の義務(一般則第38条)" },
    { lawId: IPPAN, num: "40", label: "販売業者等に係る技術上の基準の遵守(一般則第40条)" },
    { lawId: IPPAN, num: "41", label: "販売するガスの種類の変更届出(一般則第41条)" },
    { lawId: IPPAN, num: "72", label: "条件付き：販売主任者の選任等(一般則第72条、法第28条第1項)", procedureId: "personnel-sales",
      condition: "対象ガス：アセチレン、アルシン、アンモニア、塩素、クロルメチル、五フッ化ヒ素、五フッ化リン、酸素、三フッ化窒素、三フッ化ホウ素、三フッ化リン、シアン化水素、ジシラン、四フッ化硫黄、四フッ化ケイ素、ジボラン、水素、セレン化水素、ホスフィン、メタン、モノゲルマン、モノシラン。販売するガスに上記を含む場合に必要です。ただし、スクーバダイビング呼吸用で酸素の容量が全容量の40％未満のもの、および保安管理組織を整備した圧縮水素スタンドで自動車用に販売する圧縮水素は除かれます。" },
    { lawId: IPPAN, num: "44", label: "廃止の届出(一般則第44条)" },
  ],
  refrigeration: [
    { lawId: REITOU, num: "26", label: "販売事業の届出(冷凍則第26条)、事業開始の20日前まで" },
    { lawId: REITOU, num: "26_2", label: "承継の届出(冷凍則第26条の2)" },
    { lawId: REITOU, num: "27", label: "販売業者等に係る技術上の基準の遵守(冷凍則第27条)" },
    { lawId: REITOU, num: "28", label: "変更の届出(冷凍則第28条)" },
    { lawId: REITOU, num: "30", label: "廃止の届出(冷凍則第30条)" },
  ],
  lpgas: [
    { lawId: EKISEKI, num: "38", label: "販売事業の届出(液石則第38条)、事業開始の20日前まで" },
    { lawId: EKISEKI, num: "38_2", label: "承継の届出(液石則第38条の2)" },
    { lawId: EKISEKI, num: "39", label: "周知の義務(液石則第39条)" },
    { lawId: EKISEKI, num: "41", label: "販売業者等に係る技術上の基準の遵守(液石則第41条)" },
    { lawId: EKISEKI, num: "70", label: "販売主任者の選任等(液石則第70条・第72条)" },
    { lawId: EKISEKI, num: "44", label: "廃止の届出(液石則第44条)" },
  ],
};

const IPPAN_STORAGE_PROCEDURES = {
  permit: [
    { lawId: IPPAN, num: "20", label: "第一種貯蔵所設置許可申請(一般則第20条)" },
    { lawId: IPPAN, num: "31", label: "完成検査の申請等(一般則第31条)" },
    { lawId: IPPAN, num: "21", label: "技術基準の遵守・維持(一般則第21条〜第23条)" },
    { lawId: IPPAN, num: "27", label: "変更工事の許可申請、または軽微な変更工事の届出(一般則第27条・第28条)" },
    { lawId: IPPAN, num: "24", label: "承継の届出(一般則第24条)" },
    { lawId: IPPAN, num: "95", label: "帳簿の記載・保存(一般則第95条)" },
    { lawId: ACT, num: "27", label: "従業者への保安教育の実施(法第27条第4項)" },
    { lawId: ACT, num: "63", label: "事故届(法第63条)" },
    { lawId: IPPAN, num: "43", label: "廃止の届出(一般則第43条)" },
  ],
  notification: [
    { lawId: IPPAN, num: "25", label: "第二種貯蔵所設置届出(一般則第25条)" },
    { lawId: IPPAN, num: "26", label: "技術基準の遵守・維持(一般則第26条)" },
    { lawId: IPPAN, num: "29", label: "変更工事の届出、または軽微な変更工事(一般則第29条・第30条)" },
    { lawId: IPPAN, num: "95", label: "帳簿の記載・保存(一般則第95条)" },
    { lawId: ACT, num: "27", label: "従業者への保安教育の実施(法第27条第4項)" },
    { lawId: ACT, num: "63", label: "事故届(法第63条)" },
    { lawId: IPPAN, num: "43", label: "廃止の届出(一般則第43条)" },
  ],
};

const EKISEKI_STORAGE_PROCEDURES = {
  permit: [
    { lawId: EKISEKI, num: "21", label: "第一種貯蔵所設置許可申請(液石則第21条)" },
    { lawId: EKISEKI, num: "32", label: "完成検査の申請等(液石則第32条)" },
    { lawId: EKISEKI, num: "22", label: "技術基準の遵守・維持(液石則第22条〜第24条)" },
    { lawId: EKISEKI, num: "28", label: "変更工事の許可申請、または軽微な変更工事の届出(液石則第28条・第29条)" },
    { lawId: EKISEKI, num: "25", label: "承継の届出(液石則第25条)" },
    { lawId: EKISEKI, num: "93", label: "帳簿の記載・保存(液石則第93条)" },
    { lawId: ACT, num: "27", label: "従業者への保安教育の実施(法第27条第4項)" },
    { lawId: ACT, num: "63", label: "事故届(法第63条)" },
    { lawId: EKISEKI, num: "43", label: "廃止の届出(液石則第43条)" },
  ],
  notification: [
    { lawId: EKISEKI, num: "26", label: "第二種貯蔵所設置届出(液石則第26条)" },
    { lawId: EKISEKI, num: "27", label: "技術基準の遵守・維持(液石則第27条)" },
    { lawId: EKISEKI, num: "30", label: "変更工事の届出、または軽微な変更工事(液石則第30条・第31条)" },
    { lawId: EKISEKI, num: "93", label: "帳簿の記載・保存(液石則第93条)" },
    { lawId: ACT, num: "27", label: "従業者への保安教育の実施(法第27条第4項)" },
    { lawId: ACT, num: "63", label: "事故届(法第63条)" },
    { lawId: EKISEKI, num: "43", label: "廃止の届出(液石則第43条)" },
  ],
};

const IPPAN_CONSUMPTION_PROCEDURES = {
  notification: [
    { lawId: IPPAN, num: "53", label: "特定高圧ガス消費届出(一般則第53条)、消費開始の20日前まで" },
    { lawId: IPPAN, num: "55", label: "技術基準の遵守・維持(一般則第55条)" },
    { lawId: IPPAN, num: "56", label: "変更工事の届出、または軽微な変更工事(一般則第56条・第57条)" },
    { lawId: IPPAN, num: "54_2", label: "承継の届出(一般則第54条の2)" },
    { lawId: ACT, num: "28", label: "特定高圧ガス取扱主任者の選任(法第28条第2項)" },
    { lawId: IPPAN, num: "75", label: "取扱主任者の選任等の届出(一般則第75条)" },
    { lawId: ACT, num: "27", label: "従業者への保安教育の実施(法第27条第4項)" },
    { lawId: ACT, num: "63", label: "事故届(法第63条)" },
    { lawId: IPPAN, num: "58", label: "消費の廃止の届出(一般則第58条)" },
  ],
};

const EKISEKI_CONSUMPTION_PROCEDURES = {
  notification: [
    { lawId: EKISEKI, num: "51", label: "特定高圧ガス消費届出(液石則第51条)、消費開始の20日前まで" },
    { lawId: ACT, num: "24_3", label: "技術基準の遵守・維持(法第24条の3)" },
    { lawId: EKISEKI, num: "54", label: "変更工事の届出(液石則第54条)" },
    { lawId: EKISEKI, num: "51_2", label: "承継の届出(液石則第51条の2)" },
    { lawId: EKISEKI, num: "71", label: "取扱主任者の選任(液石則第71条)" },
    { lawId: EKISEKI, num: "73", label: "取扱主任者の選任等の届出(液石則第73条)" },
    { lawId: ACT, num: "27", label: "従業者への保安教育の実施(法第27条第4項)" },
    { lawId: ACT, num: "63", label: "事故届(法第63条)" },
    { lawId: EKISEKI, num: "56", label: "消費の廃止の届出(液石則第56条)" },
  ],
};

/* ---------- 呼び出し口 ---------- */

function getStepsForGasCategory(actionType, gasCategoryId, answers = {}) {
  const safeAnswers = answers && typeof answers === "object" ? answers : {};
  if (actionType === "sales") return getSalesSteps(gasCategoryId, safeAnswers);
  if (actionType === "storage") return getStorageSteps(gasCategoryId, safeAnswers);
  if (actionType === "consumption") return getConsumptionSteps(gasCategoryId, safeAnswers);
  if (gasCategoryId === "general") return getGeneralSteps(safeAnswers);
  if (gasCategoryId === "refrigeration") return getRefrigerationSteps(safeAnswers);
  if (gasCategoryId === "lpgas") return getLpgasSteps(safeAnswers);
  return [];
}

function evaluateDiagnosis(actionType, gasCategoryId, answers = {}) {
  const safeAnswers = answers && typeof answers === "object" ? answers : {};
  try {
    let result;
    if (actionType === "sales") result = evaluateSales(gasCategoryId, safeAnswers);
    else if (actionType === "storage") result = evaluateStorage(gasCategoryId, safeAnswers);
    else if (actionType === "consumption") result = evaluateConsumption(gasCategoryId, safeAnswers);
    else if (gasCategoryId === "general") result = evaluateGeneral(safeAnswers);
    else if (gasCategoryId === "refrigeration") result = evaluateRefrigeration(safeAnswers);
    else if (gasCategoryId === "lpgas") result = evaluateLpgas(safeAnswers);
    else result = invalidDiagnosis("行為とガスの種類を確認できないため判定できません。");
    return normalizeDiagnosisResult(result);
  } catch (_error) {
    return normalizeDiagnosisResult(invalidDiagnosis("入力条件を安全に確認できないため判定できません。"));
  }
}

// 技術上の基準の細部(例示基準)や運用解釈(基本通達)は随時改正されるため、本文を
// 取り込まず、経済産業省の一覧ページへの案内にとどめる。
const METI_REFERENCE = {
  url: "https://www.meti.go.jp/policy/safety_security/industrial_safety/sangyo/hipregas/hourei/kouatu_kokuji.html",
  label:
    "技術上の基準の具体的な内容(例示基準)や条文の運用解釈(基本通達)は随時改正されます。最新の内容は経済産業省「高圧ガス保安法等」のページでご確認ください。",
};

export {
  ACTION_TYPES,
  getCategoriesForAction,
  getStepsForGasCategory,
  evaluateDiagnosis,
  METI_REFERENCE,
};
