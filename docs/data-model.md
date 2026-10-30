# 데이터 구조 (스키마 v1)

모든 데이터는 폰의 IndexedDB `bodycheck`에만 저장한다. 서버 전송은 없다.

## 저장소

| store | 키 | 내용 |
|---|---|---|
| `kv` | `profile` | 기본 정보 `{heightCm, weightKg, sex: "male"|"female", age, createdAt, updatedAt}` |
| `kv` | `settings` | `{sleepGoalHours|null, weeklyExerciseGoal, reminders[], customTags:{symptom[], cause[]}}` |
| `kv` | `notified` | 알림 중복 방지 `{<reminderId>: "YYYY-MM-DD"}` |
| `entries` | `id` | 기록 (아래). 인덱스: `by_date`, `by_kind_date`, `by_external` |

이름·전화번호·이메일 필드는 없다.

## 기록(entry)

```js
{
  id, schema: 1,
  kind: "sleep" | "condition" | "meals" | "exercise"   // 1단계
      | "weight" | "body_composition" | "food" | "energy_score", // 2단계 예약
  date: "YYYY-MM-DD",          // 수면은 '깬 날'
  value: { ... },              // 종류별 아래 표
  source: { type, app?, externalId?, importedAt? },
  createdAt, updatedAt
}
```

| kind | value |
|---|---|
| sleep | `{bedTime:"23:30", wakeTime:"07:00", minutes:450}` |
| condition | `{level: 1..5}` |
| meals | `{breakfast, lunch, dinner: "on_time"|"late"|"skipped"|null, lateSnack: bool}` — `null` = 그 끼니 미기록 |
| exercise | `{did:true, minutes, type|null}` 또는 `{did:false}` (명시적으로 쉰 날) — 하루 여러 개 가능 |
| condition (1.5) | `{level, causes:["수면부족",...], note:"100자 이내"|null}` — 원인 해시태그·메모 추가 |
| probiotic (1.5) | `{taken: true|false}` — 저녁 유산균, 하루 1개 |
| symptom (1.5) | `{tags:["무릎통증"], causes:["운동과다"], action:"냉찜질 15분"|null, effect:"yes"|"no"|"unknown"|null, note|null}` — 하루 여러 개 |

## source.type

`manual`(직접 입력) · `health_connect` · `samsung_health` · `inbody_photo` · `food_photo` · `backup_import`

## 계산 원칙

- **미기록 = 기록 없음.** 0으로 채우지 않는다. 평균은 기록된 날만으로 내고, 몇 일 기준인지 함께 보여 준다.
- 운동 0분은 "안 했어요"를 직접 남긴 날에만 생긴다.
- 표본 기준: 수면 평균 안내 3일, 컨디션 추세 3일, 지난주 비교는 두 주 모두 3일 이상.
- 같은 날·같은 종류에 직접 입력과 외부 기록이 함께 있으면 직접 입력을 우선한다.

## 해시태그 규칙

- 저장은 `#` 없이 태그 문자열만 (`"무릎통증"`). 띄어쓰기 없이 12자 이내, 한 기록에 10개까지.
- 기본 태그는 `model.js`의 `SYMPTOM_TAGS`, `CAUSE_TAGS`. 사용자가 더한 태그는 `settings.customTags`.
- 태그를 지워도 이미 남긴 기록의 태그는 그대로 남는다.

## 주간 리포트 추가 규칙 (1.5)

- **한 줄 결론:** 컨디션 지난주 대비 → 수면 지난주 대비 → 컨디션 주중 추세 → 운동 목표 달성 → 반복된 몸 상태 → 기록 일수 순으로 처음 맞는 하나.
- **지난주 대비 화살표:** 두 주 모두 3일 이상(운동은 4일) 기록된 항목만. 부족하면 화살표를 생략한다.
- **가장 좋았던 날:** 컨디션 기록 2일 이상, 모두 같은 값이면 표시하지 않음.
- **효과 있던 대처 TOP 3:** 최근 8주 몸 상태 기록 중 `effect: "yes"`이고 한 일이 적힌 것만, 같은 증상·같은 대처 횟수순.
