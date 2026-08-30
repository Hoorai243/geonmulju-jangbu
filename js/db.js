// 저장소(낮은 계층) — 이 기기 안 IndexedDB.
// 이 파일만 바꾸면 나중에 인터넷 서버로 저장 위치를 옮길 수 있다.
// 오픈뱅킹 대비: payment_log 는 은행 API가 나중에 자동으로 넣기 좋게 독립 테이블.

const DB_NAME = 'jangbu';
const DB_VERSION = 1;

// 테이블(오브젝트 스토어) 정의
const STORES = {
  meta:           { keyPath: 'key' }, // 설정/세션/인증정보 등 key-value
  buildings:      { keyPath: 'id' },
  accounts:       { keyPath: 'id', indexes: { byBuilding: 'buildingId' } },
  tenants:        { keyPath: 'id', indexes: { byBuilding: 'buildingId' } },
  payment_log:    { keyPath: 'id', indexes: { byTenant: 'tenantId', byMonth: 'month', byBuilding: 'buildingId' } },
  deposit_ledger: { keyPath: 'id', indexes: { byTenant: 'tenantId' } },
};

let _db = null;

export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, def] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          const os = db.createObjectStore(name, { keyPath: def.keyPath });
          for (const [idx, path] of Object.entries(def.indexes || {})) {
            os.createIndex(idx, path, { unique: false });
          }
        }
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode = 'readonly') {
  return openDB().then((db) => db.transaction(store, mode).objectStore(store));
}
const done = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export const put = (store, obj) => tx(store, 'readwrite').then((os) => done(os.put(obj)));
export const get = (store, id) => tx(store).then((os) => done(os.get(id)));
export const del = (store, id) => tx(store, 'readwrite').then((os) => done(os.delete(id)));
export const getAll = (store) => tx(store).then((os) => done(os.getAll()));
export function getBy(store, indexName, value) {
  return tx(store).then((os) => done(os.index(indexName).getAll(value)));
}
export const clearStore = (store) => tx(store, 'readwrite').then((os) => done(os.clear()));

// 여러 건 한 번에 저장(트랜잭션 하나로)
export function putMany(store, objs) {
  return openDB().then((db) => new Promise((res, rej) => {
    const t = db.transaction(store, 'readwrite');
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
    const os = t.objectStore(store);
    objs.forEach((o) => os.put(o));
  }));
}

// meta(key-value) 편의
export const metaGet = (key) => get('meta', key).then((r) => (r ? r.value : undefined));
export const metaSet = (key, value) => put('meta', { key, value });

// 전체 데이터 내보내기/가져오기(백업용)
export async function exportAll() {
  const out = {};
  for (const name of Object.keys(STORES)) out[name] = await getAll(name);
  out.__version = DB_VERSION;
  out.__exportedAt = new Date().toISOString();
  return out;
}
export async function importAll(data) {
  for (const name of Object.keys(STORES)) {
    if (!Array.isArray(data[name])) continue;
    await clearStore(name);
    await putMany(name, data[name]);
  }
}
export async function wipeAll() {
  for (const name of Object.keys(STORES)) await clearStore(name);
}

export const STORE_NAMES = Object.keys(STORES);
