import { API_BASE } from "./constants.js";

// 法令本文全体を取得する。e-Gov 法令API v2 /law_data/{law_id_or_num}
// レスポンスは { law_info, revision_info, law_full_text, ... } の形。
export async function fetchLawData(lawId) {
  const url = `${API_BASE}/law_data/${encodeURIComponent(lawId)}?response_format=json`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`法令データの取得に失敗しました (HTTP ${res.status}): ${lawId}`);
    const data = await res.json();
    if (data?.law_full_text?.tag !== "Law" || !Array.isArray(data.law_full_text.children)) {
      throw new Error("法令本文を読み取れませんでした。保存済みデータは更新しません。");
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}
