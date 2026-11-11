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

// 固定の案内・設問と照合した施行済みの版。取得しただけで案内を更新しない。
export const LAW_CHECKED_AT = "2026-11-11";
export const REVIEWED_LAWS = [
  {
    "lawId": "326AC0000000204",
    "shortName": "法",
    "title": "高圧ガス保安法",
    "revisionId": "326AC0000000204_20251001_507AC0000000044",
    "enforcementDate": "2025-10-01"
  },
  {
    "lawId": "409CO0000000020",
    "shortName": "施行令",
    "title": "高圧ガス保安法施行令",
    "revisionId": "409CO0000000020_20231221_505CO0000000276",
    "enforcementDate": "2023-12-21"
  },
  {
    "lawId": "341M50000400053",
    "shortName": "一般則",
    "title": "一般高圧ガス保安規則",
    "revisionId": "341M50000400053_20251001_507M60000400065",
    "enforcementDate": "2025-10-01"
  },
  {
    "lawId": "341M50000400052",
    "shortName": "液石則",
    "title": "液化石油ガス保安規則",
    "revisionId": "341M50000400052_20251001_507M60000400065",
    "enforcementDate": "2025-10-01"
  },
  {
    "lawId": "341M50000400051",
    "shortName": "冷凍則",
    "title": "冷凍保安規則",
    "revisionId": "341M50000400051_20260612_508M60000400056",
    "enforcementDate": "2026-06-12"
  },
  {
    "lawId": "341M50000400050",
    "shortName": "容器則",
    "title": "容器保安規則",
    "revisionId": "341M50000400050_20260612_508M60000400056",
    "enforcementDate": "2026-06-12"
  },
  {
    "lawId": "342AC0000000149",
    "shortName": "液化石油ガス法",
    "title": "液化石油ガスの保安の確保及び取引の適正化に関する法律",
    "revisionId": "342AC0000000149_20251225_506AC0000000067",
    "enforcementDate": "2025-12-25"
  },
  {
    "lawId": "343CO0000000014",
    "shortName": "液化石油ガス法施行令",
    "title": "液化石油ガスの保安の確保及び取引の適正化に関する法律施行令",
    "revisionId": "343CO0000000014_20251225_506CO0000000374",
    "enforcementDate": "2025-12-25"
  }
];
export const BROWSABLE_LAWS = [...TARGET_LAWS, ...REFERENCE_LAWS.filter(law => ["326AC0000000204", "409CO0000000020"].includes(law.lawId))];
export function lawRevisionAssessment(lawId, revision) {
  const reviewed = REVIEWED_LAWS.find(law => law.lawId === lawId);
  if (!reviewed || !revision?.law_revision_id || !revision.current_revision_status) return "unverified";
  return reviewed.revisionId === revision.law_revision_id && revision.current_revision_status === "CurrentEnforced" ? "match" : "different";
}
