// 対象4法令(高圧ガス保安法関係省令)の law_id は e-Gov 法令API v2 の
// GET /laws?law_title=... で事前に確認済みの値。
export const TARGET_LAWS = [
  {
    lawId: "341M50000400053",
    shortName: "一般則",
    title: "一般高圧ガス保安規則",
  },
  {
    lawId: "341M50000400052",
    shortName: "液石則",
    title: "液化石油ガス保安規則",
  },
  {
    lawId: "341M50000400051",
    shortName: "冷凍則",
    title: "冷凍保安規則",
  },
  {
    lawId: "341M50000400050",
    shortName: "容器則",
    title: "容器保安規則",
  },
];

// 設問モードの判定根拠として条文を引用するために参照する法令(政令・法律本体)。
// 対象4法令(省令)とは別に、根拠条文の原文表示のためだけに使う。
export const REFERENCE_LAWS = [
  {
    lawId: "342AC0000000149",
    shortName: "液化石油ガス法",
    title: "液化石油ガスの保安の確保及び取引の適正化に関する法律",
  },
  {
    lawId: "326AC0000000204",
    shortName: "法",
    title: "高圧ガス保安法",
  },
  {
    lawId: "409CO0000000020",
    shortName: "施行令",
    title: "高圧ガス保安法施行令",
  },
];

export const ALL_LAWS = [...TARGET_LAWS, ...REFERENCE_LAWS];

export function findLawMeta(lawId) {
  return ALL_LAWS.find((l) => l.lawId === lawId) || null;
}

export const API_BASE = "https://laws.e-gov.go.jp/api/2";
