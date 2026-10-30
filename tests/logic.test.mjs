// 실행: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../js/model.js";
import { weekStats, describe, trend } from "../js/report.js";
import { dailyFeedback } from "../js/feedback.js";

const mk = (kind, date, value, src = "manual", t = "2026-10-26T00:00:00Z") =>
  ({ ...M.makeEntry(kind, date, value, M.makeSource(src, src === "manual" ? {} : { externalId: kind + date })), updatedAt: t });
const W = "2026-10-26"; // 월요일

test("수면 시간: 자정을 넘기면 다음 날로 계산", () => {
  assert.equal(M.sleepMinutes("23:30", "07:00"), 450);
  assert.equal(M.sleepMinutes("01:00", "08:15"), 435);
});

test("검증: 잘못된 값은 거부", () => {
  assert.throws(() => M.makeEntry("condition", W, { level: 7 }));
  assert.throws(() => M.makeEntry("meals", W, { breakfast: null, lunch: null, dinner: null }));
  assert.throws(() => M.makeEntry("exercise", W, { did: true, minutes: 0 }));
  assert.throws(() => M.makeEntry("sleep", W, { bedTime: "23:00", wakeTime: "07:00", minutes: 480 }, { type: "unknown" }));
});

test("미기록 날은 평균·운동에서 빠지고 0으로 계산되지 않음", () => {
  const es = [
    mk("sleep", "2026-10-26", { bedTime: "23:00", wakeTime: "06:00", minutes: 420 }),
    mk("sleep", "2026-10-28", { bedTime: "00:00", wakeTime: "08:00", minutes: 480 }),
    mk("exercise", "2026-10-26", { did: true, minutes: 30, type: "걷기" }),
    mk("exercise", "2026-10-27", { did: false }),
  ];
  const s = weekStats(es, W);
  assert.equal(s.daysRecorded, 3);
  assert.equal(s.sleep.n, 2);
  assert.equal(s.sleep.avgMin, 450); // (420+480)/2, 빈 5일은 제외
  assert.equal(s.exercise.recordedDays, 2);
  assert.equal(s.exercise.sessions, 1);
  assert.equal(s.exercise.totalMin, 30);
  const d = describe(s, null, {});
  assert.ok(d.notes.some(n => n.includes("수면 기록이 2일뿐")));
  assert.ok(d.notes.some(n => n.includes("나머지 5일은 계산에 넣지 않았어요")));
  assert.ok(d.notes.some(n => n.includes("컨디션 기록이 없어요")));
});

test("기록 없는 주: 숫자 대신 안내", () => {
  const s = weekStats([], W);
  assert.equal(s.sleep.avgMin, null);
  const d = describe(s, null, {});
  assert.equal(d.lines.length, 0);
  assert.match(d.notes[0], /기록이 아직 없어요/);
});

test("컨디션 추세: 3일 미만이면 없음, 상승/하락 판정", () => {
  assert.equal(trend([{ i: 0, v: 2 }, { i: 1, v: 4 }]), null);
  assert.equal(trend([{ i: 0, v: 2 }, { i: 3, v: 3 }, { i: 6, v: 4 }]).dir, "up");
  assert.equal(trend([{ i: 0, v: 4 }, { i: 2, v: 4 }, { i: 5, v: 4 }]).dir, "flat");
  assert.equal(trend([{ i: 0, v: 5 }, { i: 4, v: 3 }, { i: 6, v: 2 }]).dir, "down");
});

test("지난주 비교는 두 주 모두 3일 이상일 때만", () => {
  const sl = (d, m) => mk("sleep", d, { bedTime: "23:00", wakeTime: "07:00", minutes: m });
  const es = [sl("2026-10-19", 400), sl("2026-10-20", 400), sl("2026-10-21", 400), sl("2026-10-26", 460), sl("2026-10-27", 460)];
  const cur = weekStats(es, W), prev = weekStats(es, "2026-10-19");
  let d = describe(cur, prev, {});
  assert.ok(d.notes.some(n => n.includes("지난주와 비교하려면")));
  es.push(sl("2026-10-28", 460));
  d = describe(weekStats(es, W), prev, {});
  assert.ok(d.lines.some(l => l.includes("늘었어요")));
});

test("같은 날 수동·외부 기록이 있으면 수동 우선", () => {
  const ext = mk("sleep", W, { bedTime: "22:00", wakeTime: "06:00", minutes: 480 }, "health_connect", "2026-10-26T09:00:00Z");
  const man = mk("sleep", W, { bedTime: "23:00", wakeTime: "06:00", minutes: 420 }, "manual", "2026-10-26T08:00:00Z");
  assert.equal(M.pickDaily([ext, man], "sleep").source.type, "manual");
  assert.equal(M.pickDaily([ext], "sleep").source.type, "health_connect");
});

test("운동 '안 함'은 실제 운동 기록이 있으면 무시", () => {
  const r = M.exerciseOfDay([mk("exercise", W, { did: false }), mk("exercise", W, { did: true, minutes: 20 })]);
  assert.equal(r.did, true); assert.equal(r.minutes, 20);
  assert.equal(M.exerciseOfDay([]), null);
});

test("식사 규칙성: 비운 끼니는 분모에서 제외", () => {
  assert.deepEqual(M.mealRegularity({ breakfast: "on_time", lunch: null, dinner: "late" }), { onTime: 1, recorded: 2 });
});

test("피드백: 기록 없으면 안내, 짧은 수면·낮은 컨디션 연결", () => {
  const base = { recent7: [], profile: { age: 40 }, settings: {} };
  assert.equal(dailyFeedback({ ...base, today: [] })[0].key, "noRecord");
  const today = [mk("sleep", W, { bedTime: "01:30", wakeTime: "06:30", minutes: 300 }), mk("condition", W, { level: 2 })];
  const keys = dailyFeedback({ ...base, today, recent7: today }).map(f => f.key);
  assert.ok(keys.includes("sleepVeryShort"));
  assert.ok(keys.includes("lateBed"));
  assert.ok(keys.includes("condLowSleepShort"));
  assert.ok(keys.includes("missingHint"));
});

test("피드백: 주간 운동 판단은 운동 기록 4일 이상일 때만", () => {
  const ex = d => mk("exercise", d, { did: true, minutes: 40 });
  const base = { profile: { age: 40 }, settings: { weeklyExerciseGoal: 150 } };
  const three = ["2026-10-26", "2026-10-27", "2026-10-28"].map(ex);
  assert.ok(!dailyFeedback({ ...base, today: [three[2]], recent7: three }).some(f => f.key.startsWith("exWeek")));
  const four = [...three, ex("2026-10-29")];
  assert.ok(dailyFeedback({ ...base, today: [four[3]], recent7: four }).some(f => f.key === "exWeekGoal"));
});

// ---------- 1.5단계 ----------
import { headline, compare, bestDay, topActions, pastRemedy } from "../js/report.js";

test("몸 상태 검증: 태그 필수, 메모 100자, 효과 값", () => {
  assert.throws(() => M.makeEntry("symptom", W, { tags: [] }));
  assert.throws(() => M.makeEntry("symptom", W, { tags: ["두 통"] }));
  assert.throws(() => M.makeEntry("symptom", W, { tags: ["두통"], note: "가".repeat(101) }));
  assert.throws(() => M.makeEntry("symptom", W, { tags: ["두통"], effect: "maybe" }));
  assert.ok(M.makeEntry("symptom", W, { tags: ["두통"], causes: ["수면부족"], action: "물 마시고 휴식", effect: "yes", note: null }));
  assert.ok(M.makeEntry("condition", W, { level: 2, causes: ["과식"], note: "회식" }));
  assert.equal(M.cleanTag(" ##무릎 통증 "), "무릎통증");
});

test("효과 있던 대처 TOP: 효과 있음만, 횟수순", () => {
  const s = (d, tag, action, effect) => mk("symptom", d, { tags: [tag], action, effect });
  const es = [s("2026-10-01", "두통", "물 마시고 휴식", "yes"), s("2026-10-08", "두통", "물 마시고 휴식", "yes"),
    s("2026-10-09", "무릎통증", "냉찜질", "yes"), s("2026-10-10", "두통", "커피", "no"), s("2026-10-11", "소화불량", "산책", "unknown")];
  const top = topActions(es);
  assert.equal(top.length, 2);
  assert.deepEqual([top[0].tag, top[0].action, top[0].count], ["두통", "물 마시고 휴식", 2]);
  assert.equal(pastRemedy(es, "두통", "2026-10-20").action, "물 마시고 휴식");
  assert.equal(pastRemedy(es, "두통", "2026-10-05").count, 1); // 그 날짜 이전 기록만
  assert.equal(pastRemedy(es, "허리통증", "2026-10-20"), null);
});

test("지난주 대비는 두 주 모두 충분할 때만, 한 줄 결론은 규칙 순서대로", () => {
  const c = (d, l) => mk("condition", d, { level: l });
  const prevE = ["2026-10-19", "2026-10-20", "2026-10-21"].map(d => c(d, 2));
  const curE = ["2026-10-26", "2026-10-27"].map(d => c(d, 4));
  let cur = weekStats([...prevE, ...curE], W), prev = weekStats([...prevE, ...curE], "2026-10-19");
  assert.equal(compare(cur, prev).condition, null);       // 이번 주 2일뿐
  assert.equal(compare(cur, prev).days, -1);
  assert.match(headline(cur, prev, {}), /2일 기록했어요/);
  curE.push(c("2026-10-28", 4));
  cur = weekStats([...prevE, ...curE], W);
  assert.equal(compare(cur, prev).condition, 2);
  assert.match(headline(cur, prev, {}), /컨디션이 지난주보다 좋아졌어요/);
  assert.equal(headline(weekStats([], W), null, {}), "이번 주 기록이 아직 없어요.");
});

test("가장 좋았던 날: 컨디션 2일 이상, 모두 같으면 없음", () => {
  const c = (d, l) => mk("condition", d, { level: l, causes: ["모름"] });
  assert.equal(bestDay(weekStats([c("2026-10-26", 4)], W)), null);
  assert.equal(bestDay(weekStats([c("2026-10-26", 3), c("2026-10-27", 3)], W)), null);
  assert.equal(bestDay(weekStats([c("2026-10-26", 3), c("2026-10-27", 5)], W)).date, "2026-10-27");
});

test("피드백: 컨디션 낮은데 원인 없으면 안내, 지난번 효과 있던 대처 알려 줌", () => {
  const today = [mk("condition", W, { level: 2 }), mk("symptom", W, { tags: ["두통"] })];
  const history = [mk("symptom", "2026-10-10", { tags: ["두통"], action: "물 마시고 휴식", effect: "yes" })];
  const fb = dailyFeedback({ today, recent7: today, history, profile: { age: 45 }, settings: {} });
  assert.ok(fb.some(f => f.key === "condLowNoCause"));
  assert.ok(fb.some(f => f.key === "pastRemedy" && f.text.includes("물 마시고 휴식")));
});

test("저녁 유산균: 기록한 날만 집계", () => {
  assert.throws(() => M.makeEntry("probiotic", W, { taken: "yes" }));
  const es = [mk("probiotic", "2026-10-26", { taken: true }), mk("probiotic", "2026-10-27", { taken: false }), mk("probiotic", "2026-10-28", { taken: true })];
  const s = weekStats(es, W);
  assert.deepEqual(s.probiotic, { recorded: 3, taken: 2 });
  assert.ok(describe(s, null, {}).lines.some(l => l.includes("3일 중 2일")));
});
