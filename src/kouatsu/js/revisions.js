import { API_BASE, ALL_LAWS } from "./constants.js";
import { getCachedLaw, putCachedLaw } from "./storage.js";

// 承認仕様で確認済みの基準。条文APIを読んだだけで更新しない。
export const REVISION_BASELINES = {
  "326AC0000000204": "326AC0000000204_20251001_507AC0000000044",
  "409CO0000000020": "409CO0000000020_20231221_505CO0000000276",
  "341M50000400053": "341M50000400053_20251001_507M60000400065",
  "341M50000400052": "341M50000400052_20251001_507M60000400065",
  "341M50000400051": "341M50000400051_20260612_508M60000400056",
  "341M50000400050": "341M50000400050_20260612_508M60000400056",
  "342AC0000000149": "342AC0000000149_20251225_506AC0000000067",
};
export const KNOWN_PENDING_REVISIONS = [
  "326AC0000000204_20261221_504AC0000000074",
  "342AC0000000149_20261221_504AC0000000074",
];
export const KNOWN_PENDING_INFO = { enforcementDate: "2026-12-21", amendmentTitle: "令和4年法律第74号" };
export const KNOWN_REVISION_NOTE = "2026年12月21日に施行予定の改正(完成検査・保安検査の認定制度の見直し)があります。このツールが案内する許可・届出の区分は変わらない見込みです。";
export const REVISION_CACHE_KEY = "__revision-check__";
const revisionCacheTag = JSON.stringify([REVISION_BASELINES, KNOWN_PENDING_REVISIONS]);
export const REVISION_CACHE_MS = 24 * 60 * 60 * 1000;

export function compareLawRevisions(lawId, data) {
  if (!Object.hasOwn(REVISION_BASELINES, lawId) || !Array.isArray(data?.revisions) || !data.revisions.length) throw new Error("改正応答の形式不一致");
  let currentCount = 0;
  const changes = [];
  for (const row of data.revisions) {
    if (!row || typeof row.current_revision_status !== "string" || typeof row.law_revision_id !== "string" || !row.law_revision_id.startsWith(lawId + "_")) throw new Error("改正応答の形式不一致");
    const status = row.current_revision_status;
    if (!["CurrentEnforced", "UnEnforced"].includes(status)) continue;
    if (typeof row.amendment_enforcement_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.amendment_enforcement_date) || typeof row.amendment_law_title !== "string") throw new Error("改正応答の形式不一致");
    if (status === "CurrentEnforced") currentCount++;
    const changed = status === "CurrentEnforced" ? row.law_revision_id !== REVISION_BASELINES[lawId] : !KNOWN_PENDING_REVISIONS.includes(row.law_revision_id);
    if (changed) changes.push({ lawId, lawTitle: ALL_LAWS.find(l => l.lawId === lawId).title, revisionId: row.law_revision_id, status,
      enforcementDate: row.amendment_enforcement_date, amendmentTitle: row.amendment_law_title });
  }
  if (currentCount !== 1) throw new Error("施行中の改正を特定できません");
  return changes;
}

export async function fetchLawRevisions(lawId, { fetcher = globalThis.fetch, timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetcher(API_BASE + "/law_revisions/" + encodeURIComponent(lawId), { signal: controller.signal });
        if (!response.ok) throw new Error("改正情報を取得できません");
        return compareLawRevisions(lawId, await response.json());
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("改正確認のタイムアウト")); }, timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

export async function checkLawRevisions({ now = Date.now(), online = globalThis.navigator?.onLine !== false,
  readCache = () => getCachedLaw(REVISION_CACHE_KEY), writeCache = value => putCachedLaw(REVISION_CACHE_KEY, value),
  fetcher = globalThis.fetch, timeoutMs = 10000 } = {}) {
  try {
    const cached = (await readCache())?.data;
    if (cached?.tag === revisionCacheTag && Number.isFinite(cached.checkedAt) && now >= cached.checkedAt && now - cached.checkedAt < REVISION_CACHE_MS &&
      ["ready", "failed"].includes(cached.status) && Array.isArray(cached.changes)) return cached;
  } catch { /* 保存禁止でも、照合と案内は使える。 */ }
  let result;
  try {
    if (!online) throw new Error("オフライン");
    const changes = (await Promise.all(Object.keys(REVISION_BASELINES).map(id => fetchLawRevisions(id, { fetcher, timeoutMs })))).flat();
    result = { tag: revisionCacheTag, checkedAt: now, status: "ready", changes };
  } catch { result = { tag: revisionCacheTag, checkedAt: now, status: "failed", changes: [] }; }
  try { await writeCache(result); } catch { /* 取得成功は保存の可否と分ける。 */ }
  return result;
}
