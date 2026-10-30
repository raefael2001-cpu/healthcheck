// 서비스워커 — 오프라인 실행 + 기록 알림(주기적 백그라운드 동기화).
const CACHE = "bodycheck-p1-v3";
const SHELL = ["./", "index.html", "styles.css", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png",
  "js/app.js", "js/model.js", "js/db.js", "js/feedback.js", "js/report.js", "js/reminders.js",
  "js/integrations/index.js", "js/integrations/health-connect.js", "js/integrations/samsung-health.js",
  "js/integrations/planfit.js", "js/integrations/inbody-photo.js", "js/integrations/food-photo.js"];

self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (u.origin === location.origin) {
    // 네트워크 우선: 업데이트를 바로 받고, 오프라인이면 캐시
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return res; })));
  }
});

// ---------- 알림 ----------
const KIND_LABEL = { sleep: "수면", condition: "컨디션", meals: "식사", exercise: "운동", probiotic: "저녁 유산균" };
const idb = () => new Promise((res, rej) => { const r = indexedDB.open("bodycheck"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const get = (db, store, key) => new Promise((res, rej) => { const r = db.transaction(store).objectStore(store).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const put = (db, store, val, key) => new Promise((res, rej) => { const t = db.transaction(store, "readwrite"); t.objectStore(store).put(val, key); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
const byDate = (db, d) => new Promise((res, rej) => { const r = db.transaction("entries").objectStore("entries").index("by_date").getAll(d); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const p2 = n => String(n).padStart(2, "0");

async function checkReminders() {
  const db = await idb();
  if (!db.objectStoreNames.contains("kv")) return;
  const settings = await get(db, "kv", "settings");
  if (!settings?.reminders) return;
  const now = new Date(), date = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const sent = (await get(db, "kv", "notified")) || {};
  const have = new Set((await byDate(db, date)).map(e => e.kind));
  for (const r of settings.reminders) {
    if (!r.enabled) continue;
    const [h, m] = r.time.split(":").map(Number), at = h * 60 + m;
    if (nowMin < at || nowMin > at + 180 || sent[r.id] === date) continue;
    const miss = r.kinds.filter(k => !have.has(k));
    if (!miss.length) continue;
    await self.registration.showNotification(`오늘의 바디체크 · ${r.label}`, {
      body: `${miss.map(k => KIND_LABEL[k]).join(", ")} 기록이 비어 있어요.`,
      icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "bodycheck-" + r.id, data: { url: "./#today" },
    });
    sent[r.id] = date;
  }
  await put(db, "kv", sent, "notified");
}

self.addEventListener("periodicsync", e => { if (e.tag === "reminder-check") e.waitUntil(checkReminders()); });

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    for (const c of cs) if ("focus" in c) return c.focus();
    return self.clients.openWindow(e.notification.data?.url || "./");
  }));
});
