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
  dbPromise = new Promise((resolve, reject) => {
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
    req.onsuccess = () => { req.result.onversionchange = () => { req.result.close(); dbPromise = null; }; resolve(req.result); };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("別のタブを閉じて再読み込みしてください。"));
  });
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
    store.put(value, "current");
    store.transaction.oncomplete = () => resolve();
    store.transaction.onabort = () => reject(store.transaction.error || new Error("下書きを保存できませんでした。"));
    store.transaction.onerror = () => reject(store.transaction.error);
  });
}

export async function clearCachedLaw(lawId) {
  const store = await tx(STORE_LAW_CACHE, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.delete(lawId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
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
    req.onsuccess = () => resolve(req.result);
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
