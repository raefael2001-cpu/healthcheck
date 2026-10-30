// 기록 알림 — 서버 없이 쓸 수 있는 방법 3가지를 겹쳐 쓴다.
// 1) 앱이 열려 있거나 백그라운드에 있을 때: 정해진 시각에 타이머로 알림
// 2) 설치된 앱(크롬 계열): 주기적 백그라운드 동기화로 서비스워커가 확인 후 알림 (브라우저가 주기를 정해 정확하지 않음)
// 3) 가장 확실한 방법: 매일 반복 일정(.ics)을 폰 캘린더에 등록 → 캘린더 앱이 정시에 알림
import { entriesOn, kvGet, kvSet } from "./db.js";
import { todayIso, toMin, pad } from "./model.js";

const KIND_LABEL = { sleep: "수면", condition: "컨디션", meals: "식사", exercise: "운동", probiotic: "저녁 유산균" };
let timers = [];

export const supports = {
  notification: "Notification" in self,
  periodicSync: "serviceWorker" in navigator && "periodicSync" in ServiceWorkerRegistration.prototype,
};

export async function requestPermission() {
  if (!supports.notification) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}

// 오늘 아직 비어 있는 종류
export async function missingKinds(kinds, date = todayIso()) {
  const have = new Set((await entriesOn(date)).map(e => e.kind));
  return kinds.filter(k => !have.has(k));
}

async function show(rem, missing) {
  const reg = await navigator.serviceWorker?.getRegistration();
  const body = missing.length ? `${missing.map(k => KIND_LABEL[k]).join(", ")} 기록이 비어 있어요.` : "오늘 기록을 확인해 보세요.";
  const opts = { body, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "bodycheck-" + rem.id, data: { url: "./#today" } };
  if (reg) await reg.showNotification(`오늘의 바디체크 · ${rem.label}`, opts);
  else new Notification(`오늘의 바디체크 · ${rem.label}`, opts);
}

// 하루 한 번만 보내도록 기록 (서비스워커와 같은 키를 쓴다)
async function alreadySent(rem, date) { return (await kvGet("notified"))?.[rem.id] === date; }
async function markSent(rem, date) { const m = (await kvGet("notified")) || {}; m[rem.id] = date; await kvSet("notified", m); }

export async function fireIfDue(rem, now = new Date()) {
  const date = todayIso();
  if (!rem.enabled || !supports.notification || Notification.permission !== "granted") return false;
  const nowMin = now.getHours() * 60 + now.getMinutes(), at = toMin(rem.time);
  if (nowMin < at || nowMin > at + 180) return false; // 정시~3시간 안에만
  if (await alreadySent(rem, date)) return false;
  const miss = await missingKinds(rem.kinds, date);
  if (!miss.length) return false; // 이미 다 기록했으면 보내지 않음
  await show(rem, miss);
  await markSent(rem, date);
  return true;
}

export function scheduleInPage(reminders) {
  timers.forEach(clearTimeout); timers = [];
  const now = new Date();
  for (const r of reminders.filter(r => r.enabled)) {
    fireIfDue(r);
    const t = new Date(now); const [h, m] = r.time.split(":").map(Number); t.setHours(h, m, 0, 0);
    if (t > now) timers.push(setTimeout(() => fireIfDue(r), t - now));
  }
}

export async function registerPeriodic() {
  if (!supports.periodicSync) return "unsupported";
  try {
    const reg = await navigator.serviceWorker.ready;
    const st = await navigator.permissions.query({ name: "periodic-background-sync" });
    if (st.state !== "granted") return "not_installed"; // 홈 화면에 설치해야 허용됨
    await reg.periodicSync.register("reminder-check", { minInterval: 60 * 60 * 1000 });
    return "registered";
  } catch (e) { return "failed"; }
}

export async function testNotification() {
  const p = await requestPermission();
  if (p !== "granted") return p;
  await show({ id: "test", label: "테스트" }, []);
  return "granted";
}

// 매일 반복 캘린더 일정 (.ics)
export function buildIcs(reminders, appUrl) {
  const d = new Date(), ymd = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const ev = reminders.filter(r => r.enabled).map(r => {
    const [h, m] = r.time.split(":");
    const kinds = r.kinds.map(k => KIND_LABEL[k]).join("·");
    return [
      "BEGIN:VEVENT",
      `UID:bodycheck-${r.id}@bodycheck.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Asia/Seoul:${ymd}T${h}${m}00`,
      `DURATION:PT5M`,
      "RRULE:FREQ=DAILY",
      `SUMMARY:바디체크 ${r.label} (${kinds})`,
      `DESCRIPTION:${appUrl}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:바디체크 ${r.label}`, "TRIGGER:PT0M", "END:VALARM",
      "END:VEVENT",
    ].join("\r\n");
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//bodycheck//KO", "CALSCALE:GREGORIAN",
    "BEGIN:VTIMEZONE", "TZID:Asia/Seoul", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0900", "TZOFFSETTO:+0900", "TZNAME:KST", "END:STANDARD", "END:VTIMEZONE",
    ...ev, "END:VCALENDAR"].join("\r\n");
}
