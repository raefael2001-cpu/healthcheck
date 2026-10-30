// 데이터 모델 — 기록(entry) 하나는 "언제(date) / 무엇(kind) / 값(value) / 어디서(source)"로 구성된다.
// 미기록은 entry가 "없는 것"으로 표현한다. 0이나 빈 값으로 채워 넣지 않는다.

export const SCHEMA_VERSION = 1;

// 데이터 출처. 1단계는 MANUAL만 만든다. 나머지는 2단계 연동이 채운다.
export const SOURCE = Object.freeze({
  MANUAL: "manual",                 // 사용자가 앱에서 직접 입력
  HEALTH_CONNECT: "health_connect", // 안드로이드 헬스커넥트 (삼성헬스·플랜핏 등이 쓴 기록 포함)
  SAMSUNG_HEALTH: "samsung_health", // 삼성헬스 데이터 SDK 직접 연동 (에너지 점수 등)
  INBODY_PHOTO: "inbody_photo",     // 인바디 결과지 사진 인식
  FOOD_PHOTO: "food_photo",         // 음식 사진 인식
  BACKUP_IMPORT: "backup_import",   // 백업 파일에서 복원 (원래 출처는 source.original에 보존)
});

export const SOURCE_LABEL = {
  manual: "직접 입력",
  health_connect: "헬스커넥트",
  samsung_health: "삼성헬스",
  inbody_photo: "인바디 사진",
  food_photo: "음식 사진",
  backup_import: "백업 복원",
};

export const KIND = Object.freeze({
  SLEEP: "sleep",
  CONDITION: "condition",
  MEALS: "meals",
  EXERCISE: "exercise",
  SYMPTOM: "symptom",
  PROBIOTIC: "probiotic", // 저녁 유산균 섭취 (하루 1개): {taken: true|false}   // 몸 상태 (하루 여러 개): 증상 태그 · 원인 · 한 일 · 효과
  // 아래는 2단계용으로 이름만 정해 둔다.
  WEIGHT: "weight",
  BODY_COMPOSITION: "body_composition",
  FOOD: "food",
  ENERGY_SCORE: "energy_score",
});

// 하루에 하나만 두는 종류 (같은 날 같은 출처로 다시 저장하면 덮어씀)
export const SINGLE_PER_DAY = new Set([KIND.SLEEP, KIND.CONDITION, KIND.MEALS, KIND.PROBIOTIC, KIND.ENERGY_SCORE]);

export const CONDITION_LABEL = ["", "매우 나쁨", "나쁨", "보통", "좋음", "매우 좋음"];
export const MEAL_STATUS = { on_time: "제시간", late: "늦게", skipped: "거름" };
export const MEALS = [["breakfast", "아침"], ["lunch", "점심"], ["dinner", "저녁"]];
export const EXERCISE_TYPES = ["걷기", "러닝", "웨이트", "골프", "자전거", "수영", "요가·스트레칭", "기타"];

// 해시태그 기본값 (설정에서 사용자 태그를 더할 수 있음). '#'은 화면에서만 붙인다.
export const SYMPTOM_TAGS = ["두통", "소화불량", "복통", "무릎통증", "허리통증", "어깨결림", "발통증", "근육통", "부딪힘", "피로", "감기기운", "피부트러블"];
export const CAUSE_TAGS = ["수면부족", "과식", "찬음식", "야식", "음주", "스트레스", "운동과다", "운동부족", "오래앉음", "날씨", "모름"];
export const EFFECT = { yes: "효과 있음", no: "효과 없음", unknown: "아직 모름" };
export const NOTE_MAX = 100;

const TAG_RE = /^[^\s#,]{1,12}$/;
export const cleanTag = t => String(t || "").trim().replace(/^#+/, "").replace(/\s+/g, "");
export const isTag = t => TAG_RE.test(t);
const tagList = v => v == null || (Array.isArray(v) && v.every(isTag) && v.length <= 10);

// ---------- 날짜 ----------
export const pad = n => String(n).padStart(2, "0");
export const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDate = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d); };
export const todayIso = () => isoDate(new Date());
export const weekStart = s => { const d = parseDate(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoDate(d); };
export const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

// 잠든 시각~깬 시각 → 분. 자정을 넘기면 다음 날로 본다.
export function sleepMinutes(bed, wake) {
  let m = toMin(wake) - toMin(bed);
  if (m <= 0) m += 24 * 60;
  return m;
}
export const fmtDur = min => {
  if (min == null) return "–";
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m ? `${h}시간 ${m}분` : `${h}시간`;
};

// ---------- 생성·검증 ----------
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

export function makeSource(type = SOURCE.MANUAL, extra = {}) {
  return { type, ...extra };
}

export function makeEntry(kind, date, value, source = makeSource()) {
  const now = new Date().toISOString();
  const e = { id: uid(), schema: SCHEMA_VERSION, kind, date, value, source, createdAt: now, updatedAt: now };
  const err = validate(e);
  if (err) throw new Error(err);
  return e;
}

export function validate(e) {
  if (!e || !e.kind || !/^\d{4}-\d{2}-\d{2}$/.test(e.date || "")) return "날짜나 종류가 없어요.";
  if (!e.source || !Object.values(SOURCE).includes(e.source.type)) return "출처가 올바르지 않아요.";
  const v = e.value || {};
  switch (e.kind) {
    case KIND.SLEEP:
      if (!/^\d{2}:\d{2}$/.test(v.bedTime || "") || !/^\d{2}:\d{2}$/.test(v.wakeTime || "")) return "잠든 시각과 깬 시각을 넣어 주세요.";
      if (!(v.minutes > 0 && v.minutes <= 20 * 60)) return "수면 시간이 20시간을 넘어요. 시각을 확인해 주세요.";
      return null;
    case KIND.CONDITION:
      if (!(Number.isInteger(v.level) && v.level >= 1 && v.level <= 5)) return "컨디션을 골라 주세요.";
      if (!tagList(v.causes)) return "원인 태그가 올바르지 않아요.";
      if (v.note != null && String(v.note).length > NOTE_MAX) return `메모는 ${NOTE_MAX}자까지 쓸 수 있어요.`;
      return null;
    case KIND.SYMPTOM:
      if (!Array.isArray(v.tags) || !v.tags.length) return "몸 상태 태그를 하나 이상 골라 주세요.";
      if (!tagList(v.tags) || !tagList(v.causes)) return "태그가 올바르지 않아요.";
      if (v.effect != null && !(v.effect in EFFECT)) return "효과 값이 올바르지 않아요.";
      if (v.action != null && String(v.action).length > 40) return "한 일은 40자까지 쓸 수 있어요.";
      if (v.note != null && String(v.note).length > NOTE_MAX) return `메모는 ${NOTE_MAX}자까지 쓸 수 있어요.`;
      return null;
    case KIND.MEALS: {
      const any = MEALS.some(([k]) => v[k] != null);
      if (!any) return "한 끼 이상 골라 주세요.";
      for (const [k] of MEALS) if (v[k] != null && !(v[k] in MEAL_STATUS)) return "식사 상태가 올바르지 않아요.";
      return null;
    }
    case KIND.PROBIOTIC:
      return typeof v.taken === "boolean" ? null : "유산균 섭취 여부를 골라 주세요.";
    case KIND.EXERCISE:
      if (v.did === false) return null;
      if (v.did !== true) return "운동 여부를 골라 주세요.";
      return v.minutes > 0 && v.minutes <= 600 ? null : "운동 시간을 1~600분으로 넣어 주세요.";
    default:
      return null; // 2단계 종류는 해당 연동 모듈이 검증
  }
}

// ---------- 하루 단위 선택 규칙 ----------
// 같은 날·같은 종류에 수동과 외부 기록이 함께 있으면 수동을 우선한다(사용자가 직접 고친 값).
export function pickDaily(entries, kind) {
  const list = entries.filter(e => e.kind === kind);
  if (!list.length) return null;
  const manual = list.filter(e => e.source.type === SOURCE.MANUAL);
  const pool = manual.length ? manual : list;
  return pool.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

// 운동은 하루 여러 번. "안 함" 기록은 실제 운동 기록이 있으면 무시한다.
export function exerciseOfDay(entries) {
  const list = entries.filter(e => e.kind === KIND.EXERCISE);
  if (!list.length) return null; // 미기록
  const sessions = list.filter(e => e.value.did === true);
  if (sessions.length) return { did: true, sessions, minutes: sessions.reduce((a, e) => a + e.value.minutes, 0) };
  return { did: false, sessions: [], minutes: 0 }; // "안 했어요"를 명시한 날만 0분
}

// 식사 규칙성: 기록된 끼니 중 제시간 비율. 기록 안 된 끼니는 분모에서 뺀다.
export function mealRegularity(v) {
  const rec = MEALS.map(([k]) => v[k]).filter(x => x != null);
  if (!rec.length) return null;
  return { onTime: rec.filter(x => x === "on_time").length, recorded: rec.length };
}

// 나이별 권장 수면 시간 (미국 국립수면재단 권고 기준)
export function sleepRange(age) {
  if (age == null) return { min: 7, max: 9 };
  if (age < 18) return { min: 8, max: 10 };
  if (age < 65) return { min: 7, max: 9 };
  return { min: 7, max: 8 };
}
