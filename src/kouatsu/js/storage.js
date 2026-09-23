// ブラウザの IndexedDB を使った法令データキャッシュと照会履歴の永続化。
// サーバーは一切使わず、この端末・このブラウザ内にのみ保存される。

const DB_NAME = "kouatsu-gas-law-db";
const DB_VERSION = 2;
const STORE_LAW_CACHE = "lawCache";
const STORE_HISTORY = "history";
const STORE_DRAFT = "draft";

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  let failed = false;
  const attempt = new Promise((resolve, reject) => {
    const fail = error => { failed = true; reject(error); };
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_DRAFT)) db.createObjectStore(STORE_DRAFT);
      if (!db.objectStoreNames.contains(STORE_LAW_CACHE)) {
        db.createObjectStore(STORE_LAW_CACHE, { keyPath: "lawId" });
      }
      if (!db.objectStoreNames.contains(STORE_HISTORY)) {
        const store = db.createObjectStore(STORE_HISTORY, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("timestamp", "timestamp");
      }
    };
    req.onsuccess = () => {
      if (failed) { req.result.close(); return; }
      req.result.onversionchange = () => { req.result.close(); dbPromise = null; };
      resolve(req.result);
    };
    req.onerror = () => fail(req.error);
    req.onblocked = () => fail(new Error("別のタブを閉じて再読み込みしてください。"));
  });
  dbPromise = attempt.catch(error => { dbPromise = null; throw error; });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDb().then(
    (db) => db.transaction(storeName, mode).objectStore(storeName)
  );
}

// --- 法令データキャッシュ ---

export async function getCachedLaw(lawId) {
  const store = await tx(STORE_LAW_CACHE, "readonly");
  return new Promise((resolve, reject) => {
    const req = store.get(lawId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function putCachedLaw(lawId, data, updated) {
  const store = await tx(STORE_LAW_CACHE, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.put({
      lawId,
      data,
      updated: updated || null,
      fetchedAt: new Date().toISOString(),
    });
    store.transaction.oncomplete = () => resolve();
    store.transaction.onabort = () => reject(store.transaction.error || new Error("保存を完了できませんでした。"));
    req.onerror = () => reject(req.error);
  });
}

export async function readDraft() {
  const store = await tx(STORE_DRAFT, "readonly");
  return new Promise((resolve, reject) => { const req = store.get("current"); req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error); });
}

export async function writeDraft(value) {
  const store = await tx(STORE_DRAFT, "readwrite");
  return new Promise((resolve, reject) => {
    const bounded = value.nav ? { ...value, nav: { ...value.nav, preparations: trimPreparations(value.nav.preparations) } } : value;
    store.put(bounded, "current");
    store.transaction.oncomplete = () => resolve();
    store.transaction.onabort = () => reject(store.transaction.error || new Error("下書きを保存できませんでした。"));
    store.transaction.onerror = () => reject(store.transaction.error);
  });
}

// 同じ案件の全手続き・全書類をまとめて保持する。法令キャッシュ・旧版領域は触らない。
export function trimPreparations(preparations = {}, limit = 50) {
  const cases = new Map();
  for (const [index, [key, value]] of Object.entries(preparations).entries()) {
    const id = key.split(":")[0];
    const order = Number.isFinite(value.lastUsedAt) ? value.lastUsedAt : 0;
    const previous = cases.get(id);
    if (!previous || order >= previous.order) cases.set(id, { order, index });
  }
  const keep = new Set([...cases].sort((a, b) => b[1].order - a[1].order || b[1].index - a[1].index).slice(0, limit).map(([id]) => id));
  return Object.fromEntries(Object.entries(preparations).filter(([key]) => keep.has(key.split(":")[0])));
}

// --- 照会履歴 ---

const MAX_HISTORY = 200;

export async function addHistoryEntry(entry) {
  const store = await tx(STORE_HISTORY, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.add({
      ...entry,
      timestamp: new Date().toISOString(),
    });
    let id;
    req.onsuccess = () => {
      id = req.result;
      let count = 0;
      const scan = store.index("timestamp").openCursor(null, "prev");
      scan.onsuccess = () => {
        const cursor = scan.result;
        if (!cursor) return;
        if (++count > MAX_HISTORY) cursor.delete();
        cursor.continue();
      };
    };
    store.transaction.oncomplete = () => resolve(id);
    store.transaction.onabort = () => reject(store.transaction.error || new Error("履歴を保存できませんでした。"));
    store.transaction.onerror = () => reject(store.transaction.error);
    req.onerror = () => reject(req.error);
  });
}

export async function listHistory(limit = MAX_HISTORY) {
  const store = await tx(STORE_HISTORY, "readonly");
  return new Promise((resolve, reject) => {
    const results = [];
    const req = store.index("timestamp").openCursor(null, "prev");
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function clearHistory() {
  const store = await tx(STORE_HISTORY, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function deleteHistoryEntry(id) {
  const store = await tx(STORE_HISTORY, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
