// 규칙 기반 피드백 — AI 없이, 기록 값에 따라 미리 써 둔 문구를 고른다.
// 문구는 PHRASES에만 모아 두었다. 문구를 고칠 때는 이 표만 바꾸면 된다.
// 웰니스(생활 습관) 범위의 표현만 쓴다. 진단·치료로 읽힐 말은 넣지 않는다.
import { KIND, pickDaily, exerciseOfDay, mealRegularity, sleepRange, fmtDur, toMin, CONDITION_LABEL } from "./model.js";
import { pastRemedy } from "./report.js";

export const PHRASES = {
  noRecord: "아직 오늘 기록이 없어요. 수면부터 하나씩 남겨 보세요.",
  sleepVeryShort: "수면 {dur}, 권장 범위({min}–{max}시간)보다 1시간 넘게 짧았어요. 오늘은 평소보다 30분 일찍 누워 보세요.",
  sleepShort: "수면 {dur}, 권장 범위({min}–{max}시간)보다 조금 짧았어요. 잠들기 1시간 전에는 화면을 줄여 보세요.",
  sleepGood: "수면 {dur}, 권장 범위 안이에요. 지금 리듬을 이어 가세요.",
  sleepLong: "평소보다 길게 잤어요({dur}). 피로가 쌓였는지 컨디션과 함께 살펴보세요.",
  lateBed: "새벽 1시 이후에 잠들었어요. 잠드는 시각을 15분씩 앞당겨 보세요.",
  sleepGoalMet: "목표 수면 {goal}시간을 채웠어요.",
  sleepGoalMiss: "목표 수면 {goal}시간까지 {gap} 모자랐어요.",
  condLowSleepShort: "컨디션이 낮은 날 잠도 짧았어요. 오늘은 수면을 먼저 챙겨 보세요.",
  condLowSleepOk: "잠은 충분했는데 컨디션이 낮아요. 식사·운동 기록을 같이 보면 이유를 찾는 데 도움이 돼요.",
  condHigh: "컨디션 '{label}'. 오늘 무엇이 좋았는지 기억해 두세요.",
  mealsAllOnTime: "기록한 끼니가 모두 제시간이었어요.",
  mealsSkippedBreakfast: "아침을 걸렀어요. 달걀이나 두유처럼 간단한 것부터 시작해 보세요.",
  mealsIrregular: "식사 시간이 흔들린 끼니가 {n}번 있었어요. 내일은 점심 시간 하나만 고정해 보세요.",
  lateSnack: "야식이 있었어요. 잠들기 3시간 전에는 먹는 것을 마무리해 보세요.",
  probioticYes: "저녁 유산균을 챙겼어요.",
  probioticNo: "저녁 유산균을 걸렀어요. 양치 옆처럼 매일 보는 곳에 두면 덜 잊어요.",
  exGood: "운동 {min}분, 잘 움직였어요.",
  exShort: "운동 {min}분. 짧아도 기록한 것이 중요해요. 다음엔 10분만 늘려 보세요.",
  exRest: "오늘은 쉬었어요. 내일 10분 걷기부터 시작해 보세요.",
  exWeekGoal: "최근 7일 운동 {min}분으로 주간 목표 {goal}분을 채웠어요.",
  exWeekGap: "최근 7일 운동 {min}분, 주간 목표 {goal}분까지 {gap}분 남았어요.",
  missingHint: "아직 비어 있는 기록: {list}",
  condLowNoCause: "컨디션이 낮은 날이에요. 원인 태그를 골라 두면 주간 리포트에서 패턴을 찾아 줘요.",
  pastRemedy: "지난번 #{tag} 때는 '{action}'이(가) 효과 있었어요 ({count}번).",
  symptomAskEffect: "#{tag}에 한 일의 효과를 나중에 '효과 있음/없음'으로 남겨 주세요. 효과 있던 대처가 리포트에 모여요.",
};

const fill = (t, o) => t.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? "");

// ctx: { today: entries[], recent7: entries[](오늘 포함 7일), profile, settings }
export function dailyFeedback(ctx) {
  const out = [];
  const add = (tone, key, vars = {}) => out.push({ tone, key, text: fill(PHRASES[key], vars) });
  const { today, profile, settings } = ctx;

  const sleep = pickDaily(today, KIND.SLEEP);
  const cond = pickDaily(today, KIND.CONDITION);
  const meals = pickDaily(today, KIND.MEALS);
  const ex = exerciseOfDay(today);

  const symptoms = today.filter(e => e.kind === KIND.SYMPTOM);
  if (!sleep && !cond && !meals && !ex && !symptoms.length && !pickDaily(today, KIND.PROBIOTIC)) { add("info", "noRecord"); return out; }

  // 몸 상태: 같은 증상에 예전에 효과 있던 대처를 먼저 알려 준다
  const shown = new Set();
  for (const s of symptoms) for (const tag of s.value.tags) {
    if (shown.has(tag)) continue; shown.add(tag);
    const r = pastRemedy(ctx.history || [], tag, s.date);
    if (r) add("good", "pastRemedy", { tag, action: r.action, count: r.count });
  }
  const pending = symptoms.find(s => s.value.action && (!s.value.effect || s.value.effect === "unknown"));
  if (pending) add("info", "symptomAskEffect", { tag: pending.value.tags[0] });

  // 수면
  let sleepShort = null;
  if (sleep) {
    const r = sleepRange(profile?.age), m = sleep.value.minutes, dur = fmtDur(m);
    if (m < (r.min - 1) * 60) { add("tip", "sleepVeryShort", { dur, ...r }); sleepShort = true; }
    else if (m < r.min * 60) { add("tip", "sleepShort", { dur, ...r }); sleepShort = true; }
    else if (m > (r.max + 1) * 60) { add("info", "sleepLong", { dur }); sleepShort = false; }
    else { add("good", "sleepGood", { dur }); sleepShort = false; }
    const bed = toMin(sleep.value.bedTime);
    if (bed >= 60 && bed < 6 * 60) add("tip", "lateBed");
    const g = settings?.sleepGoalHours;
    if (g) {
      if (m >= g * 60) add("good", "sleepGoalMet", { goal: g });
      else add("info", "sleepGoalMiss", { goal: g, gap: fmtDur(g * 60 - m) });
    }
  }

  // 컨디션 (수면과 함께 볼 때만 연결 문구)
  if (cond) {
    const lv = cond.value.level;
    if (lv <= 2 && !(cond.value.causes || []).length) add("tip", "condLowNoCause");
    if (lv <= 2 && sleepShort === true) add("tip", "condLowSleepShort");
    else if (lv <= 2 && sleepShort === false) add("info", "condLowSleepOk");
    else if (lv >= 4) add("good", "condHigh", { label: CONDITION_LABEL[lv] });
  }

  // 식사
  if (meals) {
    const v = meals.value, reg = mealRegularity(v);
    if (v.breakfast === "skipped") add("tip", "mealsSkippedBreakfast");
    const off = reg.recorded - reg.onTime; // 늦게 먹었거나 거른 끼니
    if (off >= 2) add("tip", "mealsIrregular", { n: off });
    else if (off === 0 && reg.recorded >= 2) add("good", "mealsAllOnTime");
    if (v.lateSnack) add("tip", "lateSnack");
  }

  // 저녁 유산균
  const pro = pickDaily(today, KIND.PROBIOTIC);
  if (pro) add(pro.value.taken ? "good" : "tip", pro.value.taken ? "probioticYes" : "probioticNo");

  // 운동
  if (ex) {
    if (!ex.did) add("info", "exRest");
    else if (ex.minutes >= 30) add("good", "exGood", { min: ex.minutes });
    else add("info", "exShort", { min: ex.minutes });
  }
  // 최근 7일 운동: "운동 기록이 있는 날"이 4일 이상일 때만 판단 (미기록일을 0분으로 치지 않음)
  const days = groupByDate(ctx.recent7 || []);
  const exDays = Object.values(days).map(exerciseOfDay).filter(Boolean);
  if (exDays.length >= 4) {
    const min = exDays.reduce((a, d) => a + d.minutes, 0), goal = settings?.weeklyExerciseGoal || 150;
    add(min >= goal ? "good" : "info", min >= goal ? "exWeekGoal" : "exWeekGap", { min, goal, gap: goal - min });
  }

  const missing = [[sleep, "수면"], [cond, "컨디션"], [meals, "식사"], [ex, "운동"], [pro, "저녁 유산균"]].filter(([x]) => !x).map(([, n]) => n);
  if (missing.length) add("info", "missingHint", { list: missing.join(", ") });

  const order = { tip: 0, good: 1, info: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}

export function groupByDate(entries) {
  const g = {};
  for (const e of entries) (g[e.date] = g[e.date] || []).push(e);
  return g;
}
