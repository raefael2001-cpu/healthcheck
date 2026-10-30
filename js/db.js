// 저장소 — 기기 안의 IndexedDB만 쓴다. 서버로 보내는 데이터는 없다.
// 서비스워커(sw.js)도 같은 DB를 읽으므로 이름·구조를 바꿀 때는 sw.js도 같이 고친다.
import { SINGLE_PER_DAY, SOURCE, validate, SCHEMA_VERSION } from "./model.js";

export const DB_NAME = "bodycheck";
const DB_VER = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("entries")) {
        const s = db.createObjectStore("entries", { keyPath: "id" });
        s.createIndex("by_date", "date");
        s.createIndex("by_kind_date", ["kind", "date"]);
        s.createIndex("by_external", "source.externalId");
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

const tx = async (stores, mode, fn) => {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(stores, mode);
    let out;
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
    out = fn(t);
  });
};
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

// ---------- key-value (profile / settings / meta) ----------
export async function kvGet(key) {
  const db = await open();
  return req(db.transaction("kv").objectStore("kv").get(key));
}
export const kvSet = (key, val) => tx(["kv"], "readwrite", t => { t.objectStore("kv").put(val, key); });

export const getProfile = () => kvGet("profile");
export async function saveProfile(p) {
  const now = new Date().toISOString();
  const prev = await getProfile();
  await kvSet("profile", { ...prev, ...p, createdAt: prev?.createdAt || now, updatedAt: now });
}

export const DEFAULT_SETTINGS = {
  sleepGoalHours: null,      // null이면 나이 기준 권장 범위 사용
  weeklyExerciseGoal: 150,   // 분
  customTags: { symptom: [], cause: [] }, // 사용자가 더한 해시태그
  reminders: [
    { id: "morning", label: "아침 기록", time: "08:30", enabled: false, kinds: ["sleep", "condition"] },
    { id: "evening", label: "저녁 기록", time: "21:30", enabled: false, kinds: ["meals", "exercise", "probiotic"] },
  ],
};
export async function getSettings() {
  const s = await kvGet("settings");
  return { ...DEFAULT_SETTINGS, ...(s || {}), reminders: s?.reminders || DEFAULT_SETTINGS.reminders,
    customTags: { symptom: [], cause: [], ...(s?.customTags || {}) } };
}
export const saveSettings = s => kvSet("settings", s);

// ---------- entries ----------
export async function entriesBetween(from, to) {
  const db = await open();
  return req(db.transaction("entries").objectStore("entries").index("by_date").getAll(IDBKeyRange.bound(from, to)));
}
export const entriesOn = d => entriesBetween(d, d);

// 같은 날·같은 종류·같은 출처의 단일 기록은 덮어쓴다(새 id를 만들지 않음).
export async function putEntry(e) {
  const err = validate(e);
  if (err) throw new Error(err);
  if (SINGLE_PER_DAY.has(e.kind)) {
    const same = (await entriesOn(e.date)).find(x => x.kind === e.kind && x.source.type === e.source.type && x.id !== e.id);
    if (same) { e = { ...e, id: same.id, createdAt: same.createdAt }; }
  }
  e.updatedAt = new Date().toISOString();
  await tx(["entries"], "readwrite", t => { t.objectStore("entries").put(e); });
  return e;
}

export const deleteEntry = id => tx(["entries"], "readwrite", t => { t.objectStore("entries").delete(id); });

// 2단계 연동용: 외부 기록 묶음을 넣는다. externalId가 같은 기록은 갱신만 한다(중복 방지).
export async function ingestExternal(list) {
  let added = 0, updated = 0;
  for (const e of list) {
    if (e.source.type === SOURCE.MANUAL) throw new Error("외부 연동 기록에 manual 출처를 쓸 수 없어요.");
    if (!e.source.externalId) throw new Error("외부 기록에는 source.externalId가 필요해요.");
    const db = await open();
    const prev = await req(db.transaction("entries").objectStore("entries").index("by_external").get(e.source.externalId));
    if (prev) { await putEntry({ ...e, id: prev.id, createdAt: prev.createdAt }); updated++; }
    else { await putEntry(e); added++; }
  }
  return { added, updated };
}

export async function allEntries() {
  const db = await open();
  return req(db.transaction("entries").objectStore("entries").getAll());
}

// ---------- 백업·삭제 ----------
export async function exportAll() {
  return {
    app: "오늘의 바디체크", schema: SCHEMA_VERSION, exportedAt: new Date().toISOString(),
    profile: await getProfile(), settings: await getSettings(), entries: await allEntries(),
  };
}

export async function importAll(data) {
  if (!data || data.app !== "오늘의 바디체크" || !Array.isArray(data.entries)) throw new Error("오늘의 바디체크 백업 파일이 아니에요.");
  let n = 0;
  if (data.profile) await kvSet("profile", data.profile);
  if (data.settings) await saveSettings(data.settings);
  for (const e of data.entries) {
    if (validate(e)) continue; // 손상된 기록은 건너뜀
    await tx(["entries"], "readwrite", t => { t.objectStore("entries").put(e); }); // 원래 id·출처 그대로 복원
    n++;
  }
  return n;
}

export async function deleteEverything() {
  const db = await open();
  db.close();
  dbp = null;
  await new Promise((res, rej) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
    r.onblocked = () => res();
  });
  try { localStorage.clear(); } catch (e) {}
}
