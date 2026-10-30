// 주간 리포트 — 기록 일수 · 평균 수면 · 운동 횟수/총시간 · 컨디션 추세.
// 원칙: 기록이 없는 날은 계산에서 뺀다(0으로 치지 않음). 표본이 적으면 숫자 대신 안내를 낸다.
import { KIND, pickDaily, exerciseOfDay, addDays, fmtDur, mealRegularity, parseDate } from "./model.js";
import { groupByDate } from "./feedback.js";

export const MIN_DAYS = { sleepAvg: 3, conditionTrend: 3, compare: 3 };

export function weekDates(start) { return [...Array(7)].map((_, i) => addDays(start, i)); }

export function weekStats(entries, start) {
  const dates = weekDates(start);
  const byDate = groupByDate(entries.filter(e => e.date >= dates[0] && e.date <= dates[6]));
  const days = dates.map(date => {
    const list = byDate[date] || [];
    const sleep = pickDaily(list, KIND.SLEEP);
    const cond = pickDaily(list, KIND.CONDITION);
    const meals = pickDaily(list, KIND.MEALS);
    const ex = exerciseOfDay(list);
    const symptoms = list.filter(e => e.kind === KIND.SYMPTOM);
    return { date, recorded: list.length > 0, sleepMin: sleep?.value.minutes ?? null, condition: cond?.value.level ?? null,
      causes: cond?.value.causes || [], meals: meals ? mealRegularity(meals.value) : null, exercise: ex, symptoms,
      probiotic: pickDaily(list, KIND.PROBIOTIC)?.value.taken ?? null };
  });

  const sleepVals = days.map(d => d.sleepMin).filter(v => v != null);
  const condPts = days.map((d, i) => ({ i, date: d.date, v: d.condition })).filter(p => p.v != null);
  const exDays = days.filter(d => d.exercise);
  const sessions = exDays.reduce((a, d) => a + d.exercise.sessions.length, 0);
  const exMin = exDays.reduce((a, d) => a + d.exercise.minutes, 0);
  const mealDays = days.filter(d => d.meals);

  return {
    start, end: dates[6], days,
    daysRecorded: days.filter(d => d.recorded).length,
    sleep: { n: sleepVals.length, avgMin: sleepVals.length ? sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length : null },
    probiotic: { recorded: days.filter(d => d.probiotic != null).length, taken: days.filter(d => d.probiotic === true).length },
    exercise: { recordedDays: exDays.length, activeDays: exDays.filter(d => d.exercise.did).length, sessions, totalMin: exMin },
    condition: { n: condPts.length, points: condPts, trend: trend(condPts), avg: condPts.length ? condPts.reduce((a, p) => a + p.v, 0) / condPts.length : null,
      lowCauses: countTags(days.filter(d => d.condition != null && d.condition <= 2).flatMap(d => d.causes)) },
    symptoms: { n: days.reduce((a, d) => a + d.symptoms.length, 0), tags: countTags(days.flatMap(d => d.symptoms.flatMap(s => s.value.tags))),
      causes: countTags(days.flatMap(d => d.symptoms.flatMap(s => s.value.causes || []))) },
    meals: { n: mealDays.length, onTime: mealDays.reduce((a, d) => a + d.meals.onTime, 0), recorded: mealDays.reduce((a, d) => a + d.meals.recorded, 0) },
  };
}

// 최소제곱 기울기. 일주일 동안의 변화량(기울기×6)이 0.5단계 미만이면 "비슷함".
export function trend(pts) {
  if (pts.length < MIN_DAYS.conditionTrend) return null;
  const n = pts.length, mx = pts.reduce((a, p) => a + p.i, 0) / n, my = pts.reduce((a, p) => a + p.v, 0) / n;
  const sxx = pts.reduce((a, p) => a + (p.i - mx) ** 2, 0);
  if (sxx === 0) return null;
  const slope = pts.reduce((a, p) => a + (p.i - mx) * (p.v - my), 0) / sxx;
  const change = slope * 6;
  return { slope, change, avg: my, dir: change >= 0.5 ? "up" : change <= -0.5 ? "down" : "flat" };
}

// 화면에 바로 쓰는 문장 묶음. 표본 부족이면 notes에 안내를 넣는다.
export function describe(cur, prev, settings) {
  const notes = [], lines = [];
  if (cur.daysRecorded === 0) { notes.push("이번 주 기록이 아직 없어요. 하루 기록부터 시작해 보세요."); return { lines, notes }; }

  if (cur.sleep.n === 0) notes.push("수면 기록이 없어 평균을 낼 수 없어요.");
  else if (cur.sleep.n < MIN_DAYS.sleepAvg) notes.push(`수면 기록이 ${cur.sleep.n}일뿐이라 평균이 이번 주를 대표하지 못할 수 있어요. 3일 이상 기록해 주세요.`);

  if (cur.exercise.recordedDays === 0) notes.push("운동 기록(했음/안 함)이 없어 횟수를 판단할 수 없어요. 쉰 날도 '안 했어요'로 남기면 정확해져요.");
  else if (cur.exercise.recordedDays < 7) notes.push(`운동은 ${cur.exercise.recordedDays}일만 기록됐어요. 나머지 ${7 - cur.exercise.recordedDays}일은 계산에 넣지 않았어요.`);

  if (!cur.condition.trend) notes.push(cur.condition.n ? `컨디션 기록이 ${cur.condition.n}일뿐이에요. 3일 이상 있어야 추세를 보여 줘요.` : "컨디션 기록이 없어요. 3일 이상 있어야 추세를 보여 줘요.");
  else lines.push({ up: "컨디션이 주 후반으로 갈수록 좋아졌어요.", down: "컨디션이 주 후반으로 갈수록 떨어졌어요. 수면 시간과 함께 살펴보세요.", flat: "컨디션이 일주일 내내 비슷했어요." }[cur.condition.trend.dir]);

  if (cur.probiotic.recorded) lines.push(`저녁 유산균을 기록한 ${cur.probiotic.recorded}일 중 ${cur.probiotic.taken}일 챙겼어요.`);
  const goal = settings?.weeklyExerciseGoal || 150;
  if (cur.exercise.recordedDays >= 4) lines.push(cur.exercise.totalMin >= goal ? `운동 ${cur.exercise.totalMin}분으로 주간 목표 ${goal}분을 채웠어요.` : `운동 ${cur.exercise.totalMin}분, 주간 목표 ${goal}분까지 ${goal - cur.exercise.totalMin}분 남았어요.`);

  // 지난주 비교: 두 주 모두 같은 항목이 3일 이상 기록됐을 때만
  if (prev) {
    if (cur.sleep.n >= MIN_DAYS.compare && prev.sleep.n >= MIN_DAYS.compare) {
      const d = Math.round(cur.sleep.avgMin - prev.sleep.avgMin);
      lines.push(Math.abs(d) < 10 ? "평균 수면이 지난주와 비슷해요." : `평균 수면이 지난주보다 ${fmtDur(Math.abs(d))} ${d > 0 ? "늘었어요" : "줄었어요"}.`);
    } else if (cur.sleep.n > 0) notes.push("지난주와 비교하려면 두 주 모두 수면 기록이 3일 이상 필요해요.");
    if (cur.condition.n >= MIN_DAYS.compare && prev.condition.n >= MIN_DAYS.compare) {
      const d = cur.condition.avg - prev.condition.avg;
      if (Math.abs(d) >= 0.5) lines.push(`평균 컨디션이 지난주보다 ${d > 0 ? "좋아졌어요" : "낮아졌어요"} (${prev.condition.avg.toFixed(1)} → ${cur.condition.avg.toFixed(1)}).`);
    }
  }
  return { lines, notes };
}

// ---------- 1.5: 한 줄 결론 · 지난주 대비 · 가장 좋았던 날 · 효과 있던 대처 ----------
export function countTags(list) {
  const m = {};
  for (const t of list) m[t] = (m[t] || 0) + 1;
  return Object.entries(m).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// 지난주 대비. 두 주 모두 비교 가능한 만큼 기록됐을 때만 값을 낸다(아니면 null → 화면에서 화살표 생략).
export function compare(cur, prev) {
  if (!prev) return {};
  const ok = (a, b, min) => a >= min && b >= min;
  return {
    days: prev.daysRecorded > 0 ? cur.daysRecorded - prev.daysRecorded : null,
    sleepMin: ok(cur.sleep.n, prev.sleep.n, MIN_DAYS.compare) ? Math.round(cur.sleep.avgMin - prev.sleep.avgMin) : null,
    exerciseMin: ok(cur.exercise.recordedDays, prev.exercise.recordedDays, 4) ? cur.exercise.totalMin - prev.exercise.totalMin : null,
    condition: ok(cur.condition.n, prev.condition.n, MIN_DAYS.compare) ? Math.round((cur.condition.avg - prev.condition.avg) * 10) / 10 : null,
  };
}

// 리포트 맨 위 한 줄. 위에서부터 처음 맞는 규칙 하나만 쓴다.
export function headline(cur, prev, settings) {
  if (cur.daysRecorded === 0) return "이번 주 기록이 아직 없어요.";
  const c = compare(cur, prev), goal = settings?.weeklyExerciseGoal || 150;
  if (c.condition != null && Math.abs(c.condition) >= 0.5) return `이번 주는 컨디션이 지난주보다 ${c.condition > 0 ? "좋아졌어요" : "떨어졌어요"}.`;
  if (c.sleepMin != null && Math.abs(c.sleepMin) >= 20) return `이번 주는 수면이 지난주보다 하루 평균 ${fmtDur(Math.abs(c.sleepMin))} ${c.sleepMin > 0 ? "늘었어요" : "줄었어요"}.`;
  if (cur.condition.trend && cur.condition.trend.dir !== "flat") return cur.condition.trend.dir === "up" ? "주 후반으로 갈수록 컨디션이 좋아졌어요." : "주 후반으로 갈수록 컨디션이 떨어졌어요.";
  if (cur.exercise.recordedDays >= 4 && cur.exercise.totalMin >= goal) return `운동 주간 목표 ${goal}분을 채운 한 주였어요.`;
  if (cur.symptoms.tags.length && cur.symptoms.tags[0][1] >= 2) return `이번 주에는 #${cur.symptoms.tags[0][0]}이(가) ${cur.symptoms.tags[0][1]}번 있었어요.`;
  if (cur.daysRecorded < 3) return `이번 주는 ${cur.daysRecorded}일 기록했어요. 3일 이상 쌓이면 변화를 알려 드려요.`;
  return `이번 주 ${cur.daysRecorded}일 기록했어요. 지난주와 큰 차이 없이 지나갔어요.`;
}

// 가장 좋았던 날: 컨디션 최고 → 같으면 수면이 긴 날. 컨디션 기록 2일 이상일 때만.
export function bestDay(cur) {
  const c = cur.days.filter(d => d.condition != null);
  if (c.length < 2) return null;
  const top = [...c].sort((a, b) => b.condition - a.condition || (b.sleepMin ?? -1) - (a.sleepMin ?? -1))[0];
  if (c.every(d => d.condition === top.condition)) return null; // 모두 같으면 의미 없음
  return top;
}

// 효과 있던 대처 TOP N. entries는 여러 주(예: 최근 8주) 범위를 넘긴다.
export function topActions(entries, n = 3) {
  const m = new Map();
  for (const e of entries) {
    if (e.kind !== KIND.SYMPTOM || e.value.effect !== "yes" || !e.value.action) continue;
    const act = String(e.value.action).trim(), key = e.value.tags[0] + "|" + act;
    const cur = m.get(key) || { tag: e.value.tags[0], action: act, count: 0, last: e.date };
    cur.count++; if (e.date > cur.last) cur.last = e.date; m.set(key, cur);
  }
  return [...m.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last)).slice(0, n);
}

// 같은 증상에 예전에 효과 있던 대처 (오늘 피드백용)
export function pastRemedy(history, tag, beforeDate) {
  return topActions(history.filter(e => e.date < beforeDate && e.kind === KIND.SYMPTOM && e.value.tags.includes(tag))
    .map(e => ({ ...e, value: { ...e.value, tags: [tag, ...e.value.tags.filter(t => t !== tag)] } })), 1)[0] || null;
}

export const shortDate = s => { const d = parseDate(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
