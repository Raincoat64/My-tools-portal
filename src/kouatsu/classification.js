// 既存配布版から継承した区分算定。適用条件を確認してから使用する。
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

const GAS_CATEGORIES = [
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
  return GAS_CATEGORIES;
}

/* ---------- 共通設問 ---------- */

const BUSINESS_STEP = {
  id: "isBusiness",
  prompt: "事業として反復・継続して製造を行いますか?",
  type: "choice",
  help:
    "許可基準未満であっても、事業として反復・継続して高圧ガスを製造する場合は届出の対象となります(高圧ガス保安法第5条第2項)。" +
    "高圧ガスを減圧して製造する場合(この場合、処理能力は0として扱われます)も対象です。",
  options: [
    { value: "yes", label: "はい(事業として反復・継続して行う)" },
    { value: "no", label: "いいえ（反復・継続する製造の事業ではない）" },
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
  if (!gasScope || !isBusiness) {
    return { verdict: "invalid", message: "すべての設問に回答してください。" };
  }

  const citations = [
    { lawId: ACT, num: "5", label: "高圧ガス保安法 第5条(製造の許可等)" },
    { lawId: ORDER, num: "3", label: "高圧ガス保安法施行令 第3条(政令で定めるガスの種類等)" },
  ];

  let overThreshold;
  let thresholdLabel;
  let note = null;

  if (gasScope === "type1only") {
    if (!answers.capacityBand) return { verdict: "invalid", message: "すべての設問に回答してください。" };
    overThreshold = answers.capacityBand === "over";
    thresholdLabel = "300立方メートル/日";
  } else if (gasScope === "otherOnly") {
    if (!answers.capacityBand) return { verdict: "invalid", message: "すべての設問に回答してください。" };
    overThreshold = answers.capacityBand === "over";
    thresholdLabel = "100立方メートル/日";
  } else if (gasScope === "mixed") {
    const s1 = Number(answers.s1);
    const s2 = Number(answers.s2);
    if (!Number.isFinite(s1) || !Number.isFinite(s2) || s1 < 0 || s2 < 0) {
      return { verdict: "invalid", message: "すべての設問に回答してください。" };
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
// フルオロカーボンが「第一種ガス」側(50t/20t)に含まれるのは、施行令第2条第5項第4号の難燃性基準に適合する
// ものに限られ、その基準に適合しないもの(=可燃性・微燃性のフルオロカーボン)はフルオロカーボン+アンモニア側
// (50t/5t)に該当する。
// 出典: 高圧ガス保安法令解説(セーフティー・マネジメント・サービス株式会社)掲載の区分図により、上記3区分・
// 閾値(20/3, 50/20, 50/5トン)を2026-07-17に再確認した。
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
  if (!answers.gasType || !answers.capacityBand) {
    return { verdict: "invalid", message: "すべての設問に回答してください。" };
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

function getLpgasSteps() {
  return [LPGAS_CAPACITY_STEP, BUSINESS_STEP];
}

function evaluateLpgas(answers) {
  if (!answers.capacityBand || !answers.isBusiness) {
    return { verdict: "invalid", message: "すべての設問に回答してください。" };
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
//  二号: 医療用ガス等(政令で定めるもの)を、貯蔵数量が常時5立方メートル未満の販売所で
//        販売するとき(施行令第6条)。※対象ガスが限定的なため、本ツールでは注記のみで案内。
// また、LPガスの一般消費者向け供給(液化石油ガス法上の供給設備への充塡・供給)は、
// 同条本文かっこ書きにより高圧ガス保安法の届出対象外(液化石油ガス法の管轄)。

const SALES_LPGAS_CONSUMER_STEP = {
  id: "lpgasConsumer",
  prompt: "一般消費者向けに液化石油ガスを供給しますか?",
  type: "choice",
  help:
    "家庭用のほか業務用にも液化石油ガス法上の一般消費者等に該当する場合があります。供給先の用途・設備区分を確認してください。この場合は高圧ガス保安法ではなく、" +
    "液化石油ガスの保安の確保及び取引の適正化に関する法律(液化石油ガス法)の登録対象です。",
  options: [
    { value: "yes", label: "はい(一般消費者向けに供給する)" },
    { value: "no", label: "いいえ（液化石油ガス法上の一般消費者等に該当しない）" },
  ],
};

const SALES_SELF_STEP = {
  id: "selfSale",
  prompt: "法第5条第1項第1号の第一種製造者が、自ら製造したガスを、その製造事業所内だけで販売しますか?",
  type: "choice",
  help:
    "第一種製造者が、自社の製造事業所内で自ら製造した高圧ガスを販売する場合、販売事業の届出は不要です" +
    "(高圧ガス保安法第20条の4第1号)。",
  options: [
    { value: "yes", label: "はい（上記の第一種製造者に該当し、自社製造事業所内での自社販売のみ）" },
    { value: "no", label: "いいえ（第二種製造者、他社からの仕入れ、事業所外の販売等）" },
  ],
};

function getSalesSteps(gasCategoryId, answers) {
  const steps = [];
  if (gasCategoryId === "lpgas") {
    steps.push(SALES_LPGAS_CONSUMER_STEP);
    if (answers.lpgasConsumer === "yes") return steps;
  }
  if (gasCategoryId !== "refrigeration") {
    steps.push(SALES_SELF_STEP);
  }
  return steps;
}

function evaluateSales(gasCategoryId, answers) {
  if (!gasCategoryId) {
    return { verdict: "invalid", message: "ガスの種類を選択してください。" };
  }

  const baseCitation = { lawId: ACT, num: "20_4", label: "高圧ガス保安法 第20条の4(販売事業の届出)" };

  if (gasCategoryId === "lpgas") {
    if (!answers.lpgasConsumer) {
      return { verdict: "invalid", message: "すべての設問に回答してください。" };
    }
    if (answers.lpgasConsumer === "yes") {
      return {
        verdict: "other_law",
        title: "液化石油ガス法の対象となる可能性があります",
        summary:
          "一般消費者向けの液化石油ガス供給は、高圧ガス保安法第20条の4のかっこ書きにより本条の対象外です。" +
          "液化石油ガス法上の販売事業登録が必要です。",
        citations: [baseCitation],
        procedures: [],
        note:
          "液化石油ガスの保安の確保及び取引の適正化に関する法律(液化石油ガス法)上の登録等の要否・手続きについては、" +
          "本ツールの対象外です。事業所所在地を管轄する都道府県にご確認ください。",
      };
    }
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

  if (!answers.selfSale) {
    return { verdict: "invalid", message: "すべての設問に回答してください。" };
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
    note:
      "医療用の高圧ガス等を貯蔵数量が常時5立方メートル未満の販売所で販売する場合は、届出が不要となることがあります" +
      "(高圧ガス保安法第20条の4第2号、施行令第6条)。該当する可能性がある場合は都道府県窓口にご確認ください。",
  };
}

/* ---------- 貯蔵 ---------- */
//
// 貯蔵所の許可・届出は高圧ガス保安法第16条(第一種貯蔵所・許可)・第17条の2(第二種貯蔵所・届出)に基づく。
// 閾値は施行令第5条の表による: 第一種ガス(不活性ガス等)のみ3000m³、第一種ガス以外(第二種ガス)のみ1000m³、
// 両方混在する場合は一般則第102条と同様の算式(一般則第103条 N=1000+(2/3)×M、M=第一種ガスの貯蔵容積)で
// 許可基準を算出する。第二種貯蔵所(届出)の基準は一律300m³以上(ただし第一種貯蔵所の許可基準に該当する場合を除く)。
// 液化ガスは10kg=容積1m³とみなして算定する(法第16条第3項)。
// 経済産業省令で定める容積(0.15m³、液化ガスは10kg)以下の高圧ガスは貯蔵の技術基準(法第15条)自体が適用除外となる
// (一般則第19条・液石則第20条)が、この差は許可・届出の要否には影響しないため設問では扱わない。
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
  prompt: "自ら製造した高圧ガスを、その製造許可を受けたところに従って、同じ事業所内でそのまま貯蔵しますか?",
  type: "choice",
  help:
    "第一種製造者が高圧ガス保安法第5条第1項の許可を受けたところに従って貯蔵する高圧ガスについては、" +
    "貯蔵の技術基準(法第15条)や貯蔵所の許可・届出(法第16条・第17条の2)は適用されません" +
    "(製造許可の技術基準の中に含まれるため)。",
  options: [
    { value: "yes", label: "はい(自社の製造許可の範囲内で、その事業所内で貯蔵するのみ)" },
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
  if (!answers.selfManufactureStorage) {
    return { verdict: "invalid", message: "すべての設問に回答してください。" };
  }

  if (answers.selfManufactureStorage === "yes") {
    return {
      verdict: "none",
      title: "貯蔵所の許可・届出は不要となる可能性があります",
      summary:
        "第一種製造者が製造許可を受けたところに従って、その事業所内でそのまま貯蔵する場合、" +
        "貯蔵の技術基準・貯蔵所の許可/届出は製造許可の技術基準に含まれます。",
      citations: [{ lawId: ACT, num: "15", label: "高圧ガス保安法 第15条(貯蔵)" }],
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

  if (gasCategoryId === "lpgas") {
    if (!answers.lpgasSupply) {
      return { verdict: "invalid", message: "すべての設問に回答してください。" };
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

  if (!answers.storageGasScope) {
    return { verdict: "invalid", message: "貯蔵するガスの種類を選択してください。" };
  }

  if (answers.storageGasScope === "type1only") {
    return evaluateStorageBand(answers, storageCitations, IPPAN_STORAGE_PROCEDURES, 3000, "不活性ガス等(第一種ガス)");
  }

  if (answers.storageGasScope === "otherOnly") {
    return evaluateStorageBand(answers, storageCitations, IPPAN_STORAGE_PROCEDURES, 1000, "第一種ガス以外のガス");
  }

  if (answers.storageGasScope === "mixed") {
    const m = Number(answers.storageM);
    const s2 = Number(answers.storageS2);
    if (!Number.isFinite(m) || !Number.isFinite(s2) || m < 0 || s2 < 0) {
      return { verdict: "invalid", message: "すべての設問に回答してください。" };
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
      note: "貯蔵容積が0.15立方メートル(液化ガスは10キログラム)を超える場合、貯蔵所の許可・届出は不要でも、" +
        "貯蔵の技術基準(法第15条)には従う必要があります。",
    };
  }

  return { verdict: "invalid", message: "貯蔵するガスの種類を選択してください。" };
}

function evaluateStorageBand(answers, baseCitations, procedures, permitThreshold, gasLabel) {
  if (!answers.storageCapacityBand) {
    return { verdict: "invalid", message: "すべての設問に回答してください。" };
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
      "貯蔵容積が0.15立方メートル(液化ガスは10キログラム、液化石油ガスは1.5キログラム)を超える場合、" +
      "貯蔵所の許可・届出は不要でも、貯蔵の技術基準(法第15条)には従う必要があります。",
  };
}

/* ---------- 消費 ---------- */
//
// 特定高圧ガス消費者の届出(高圧ガス保安法第24条の2)は、施行令第7条で定める2グループのガスが対象。
// グループ1(施行令7条1項、圧縮又は液化した状態のもの): モノシラン・ホスフィン・アルシン・ジボラン・
//   セレン化水素・モノゲルマン・ジシラン。数量の閾値は政令上定められていない。
// グループ2(施行令7条2項、貯蔵能力の閾値あり): 圧縮水素・圧縮天然ガス(各300m³)、液化酸素・液化アンモニア
//   (各3000kg)、液化塩素(1000kg)、液化石油ガス(一般消費者向けを除き3000kg、液化石油ガス法施行令第2条各号に
//   掲げる者は10000kg)。
// いずれのグループも、法24条の2かっこ書きにより「貯蔵設備の貯蔵能力が政令で定める数量以上である者」または
// 「消費事業所以外の事業所から導管により供給を受ける者」に該当する場合のみ特定高圧ガス消費者となる(許可制度は
// なく、届出のみ)。液化石油ガスの一般消費者向け消費は液化石油ガス法の管轄(施行令7条2項の表かっこ書き)。
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

function getConsumptionThresholdInfo(gasType) {
  const map = {
    hydrogen: { quantity: 300, unit: "立方メートル", gasLabel: "圧縮水素" },
    natgas: { quantity: 300, unit: "立方メートル", gasLabel: "圧縮天然ガス" },
    oxygen: { quantity: 3000, unit: "キログラム", gasLabel: "液化酸素" },
    ammonia: { quantity: 3000, unit: "キログラム", gasLabel: "液化アンモニア" },
    chlorine: { quantity: 1000, unit: "キログラム", gasLabel: "液化塩素" },
    lpgas: { quantity: 3000, unit: "キログラム", gasLabel: "液化石油ガス" },
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

const CONSUMPTION_SPECIAL7_STORAGE_STEP = {
  id: "consumptionStorage",
  prompt: "このガスの貯蔵設備を有していますか?",
  type: "choice",
  help:
    "施行令第7条第1項のガスには貯蔵能力の数量基準が定められていないため、貯蔵設備を有していれば" +
    "その能力にかかわらず特定高圧ガス消費者に該当し得ます。",
  options: [
    { value: "yes", label: "はい(貯蔵設備を有する)" },
    { value: "no", label: "いいえ(容器から都度消費するのみなど)" },
  ],
};

function makeConsumptionBandStep(gasType) {
  const info = getConsumptionThresholdInfo(gasType);
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
  prompt: "一般消費者向けに消費しますか?(家庭用など)",
  type: "choice",
  help:
    "液化石油ガス法上の一般消費者(同法第2条第2項)が消費する液化石油ガスは、施行令第7条第2項のかっこ書きにより" +
    "高圧ガス保安法の特定高圧ガス消費者規定の対象外です(液化石油ガス法の管轄)。",
  options: [
    { value: "yes", label: "はい(家庭用LPガスなど、一般消費者としての消費)" },
    { value: "no", label: "いいえ(業務用・産業用などの消費)" },
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
    steps.push(makeConsumptionBandStep("lpgas"));
    return steps;
  }

  const steps = [CONSUMPTION_GAS_TYPE_STEP];
  const gasType = answers.consumptionGasType;
  if (!gasType || gasType === "other") return steps;

  if (gasType === "special7") {
    steps.push(CONSUMPTION_PIPELINE_STEP);
    if (answers.consumptionPipeline === "yes") return steps;
    if (answers.consumptionPipeline !== "no") return steps;
    steps.push(CONSUMPTION_SPECIAL7_STORAGE_STEP);
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

  if (gasCategoryId === "lpgas") {
    if (!answers.lpgasConsumer) {
      return { verdict: "invalid", message: "すべての設問に回答してください。" };
    }
    if (answers.lpgasConsumer === "yes") {
      return {
        verdict: "other_law",
        title: "液化石油ガス法の対象となる可能性があります",
        summary:
          "一般消費者向けの液化石油ガスの消費は、高圧ガス保安法施行令第7条第2項のかっこ書きにより特定高圧ガス" +
          "消費者の対象外です。液化石油ガス法上の規制をご確認ください。",
        citations,
        procedures: [],
        note:
          "液化石油ガスの保安の確保及び取引の適正化に関する法律(液化石油ガス法)上の規制の詳細については、" +
          "本ツールの対象外です。事業所所在地を管轄する都道府県にご確認ください。",
      };
    }
    if (!answers.consumptionPipeline) {
      return { verdict: "invalid", message: "すべての設問に回答してください。" };
    }
    if (answers.consumptionPipeline === "yes") {
      return buildConsumptionResult("液化石油ガス", EKISEKI_CONSUMPTION_PROCEDURES, citations, null);
    }
    if (!answers.consumptionStorageBand) {
      return { verdict: "invalid", message: "すべての設問に回答してください。" };
    }
    if (answers.consumptionStorageBand === "over") {
      return buildConsumptionResult("液化石油ガス", EKISEKI_CONSUMPTION_PROCEDURES, citations, null);
    }
    return buildConsumptionNoneResult("液化石油ガス", citations, null);
  }

  const gasType = answers.consumptionGasType;
  if (!gasType) {
    return { verdict: "invalid", message: "ガスの種類を選択してください。" };
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
    if (!answers.consumptionPipeline) {
      return { verdict: "invalid", message: "すべての設問に回答してください。" };
    }
    if (answers.consumptionPipeline === "yes") {
      return buildConsumptionResult(gasLabel, IPPAN_CONSUMPTION_PROCEDURES, citations, null);
    }
    if (!answers.consumptionStorage) {
      return { verdict: "invalid", message: "すべての設問に回答してください。" };
    }
    if (answers.consumptionStorage === "yes") {
      return buildConsumptionResult(
        gasLabel,
        IPPAN_CONSUMPTION_PROCEDURES,
        citations,
        "施行令第7条第1項のガスには貯蔵能力の数量基準が定められていないため、貯蔵設備を有する場合は特定高圧ガス消費者に該当します。"
      );
    }
    return buildConsumptionNoneResult(gasLabel, citations, null);
  }

  const info = getConsumptionThresholdInfo(gasType);
  if (!answers.consumptionPipeline) {
    return { verdict: "invalid", message: "すべての設問に回答してください。" };
  }
  if (answers.consumptionPipeline === "yes") {
    return buildConsumptionResult(info.gasLabel, IPPAN_CONSUMPTION_PROCEDURES, citations, null);
  }
  if (!answers.consumptionStorageBand) {
    return { verdict: "invalid", message: "すべての設問に回答してください。" };
  }
  if (answers.consumptionStorageBand === "over") {
    return buildConsumptionResult(info.gasLabel, IPPAN_CONSUMPTION_PROCEDURES, citations, null);
  }
  return buildConsumptionNoneResult(info.gasLabel, citations, null);
}

/* ---------- 手続きチェックリスト(法令ごと) ---------- */

// 区分の目安を計算する既存関数。具体的な手続・書類は共通カタログで管理する。
const IPPAN_PROCEDURES = {permit:[],notification:[]};
const REITOU_PROCEDURES = {permit:[],notification:[]};
const EKISEKI_PROCEDURES = {permit:[],notification:[]};
const SALES_PROCEDURES = {general:[],refrigeration:[],lpgas:[]};
const IPPAN_STORAGE_PROCEDURES = {permit:[],notification:[]};
const EKISEKI_STORAGE_PROCEDURES = {permit:[],notification:[]};
const IPPAN_CONSUMPTION_PROCEDURES = {notification:[]};
const EKISEKI_CONSUMPTION_PROCEDURES = {notification:[]};

function getStepsForGasCategory(actionType, gasCategoryId, answers = {}) {
  if (actionType === "sales") return getSalesSteps(gasCategoryId, answers);
  if (actionType === "storage") return getStorageSteps(gasCategoryId, answers);
  if (actionType === "consumption") return getConsumptionSteps(gasCategoryId, answers);
  if (gasCategoryId === "general") return getGeneralSteps(answers);
  if (gasCategoryId === "refrigeration") return getRefrigerationSteps(answers);
  if (gasCategoryId === "lpgas") return getLpgasSteps();
  return [];
}

function evaluateDiagnosis(actionType, gasCategoryId, answers) {
  if (actionType === "sales") return evaluateSales(gasCategoryId, answers);
  if (actionType === "storage") return evaluateStorage(gasCategoryId, answers);
  if (actionType === "consumption") return evaluateConsumption(gasCategoryId, answers);
  if (gasCategoryId === "general") return evaluateGeneral(answers);
  if (gasCategoryId === "refrigeration") return evaluateRefrigeration(answers);
  if (gasCategoryId === "lpgas") return evaluateLpgas(answers);
  return { verdict: "invalid", message: "ガスの種類を選択してください。" };
}
