# 2단계 외부 연동 — 조건 확인 결과

확인일: 2026-10-29. 연동 모듈은 `js/integrations/`에 자리만 만들어 두었고(`isAvailable() → false`), 1단계에서는 동작하지 않는다.

## 공통 전제

- **웹앱(PWA)으로는 헬스커넥트·삼성헬스 SDK에 접근할 수 없다.** 둘 다 안드로이드 네이티브 API다.
  2단계는 지금 웹앱을 네이티브 껍데기로 감싸는 방식(예: Capacitor)으로 간다. 화면·로직(`js/`)은 그대로 쓰고, 연동 모듈만 네이티브 플러그인을 부른다.
- 외부 기록은 모두 `db.ingestExternal()`로 넣는다.
  - `source.type`과 `source.externalId`가 반드시 있어야 하고, 같은 `externalId`는 갱신만 한다(중복 방지).
  - 같은 날·같은 종류에 직접 입력 기록이 있으면 화면과 리포트는 **직접 입력을 우선**한다(`model.pickDaily`).

## 1. 헬스커넥트 — 운동·수면 (조건 확인됨)

| 항목 | 내용 |
|---|---|
| 읽을 데이터 | `ExerciseSessionRecord` → 운동, `SleepSessionRecord` → 수면, `WeightRecord` → 체중 |
| 필요한 것 | 안드로이드 네이티브 앱, 사용자의 헬스커넥트 읽기 권한 동의 |
| 배포 조건 | 플레이스토어에 올릴 때 건강 데이터 권한 사용 목적 신고·심사, 개인정보 처리방침 |
| 개인용 | 직접 빌드한 APK로 설치해 쓸 수 있다(스토어 심사 불필요) |
| 삼성헬스 | 삼성헬스 앱에서 헬스커넥트 동기화를 켜면 운동·수면이 헬스커넥트로 들어온다 |

출처 매핑: `source = { type: "health_connect", app: <기록을 쓴 앱의 패키지명>, externalId: <record.metadata.id> }`

## 2. 플랜핏 — 헬스커넥트 경유 (조건 확인됨)

- 플랜핏은 **공개 API가 없다.**
- 플레이스토어 설명에 따르면 플랜핏은 헬스커넥트를 써서 운동 기록(걸음 수, 웨이트 트레이닝, 칼로리, 케이던스)과 체중을 동기화한다. 이 권한은 선택이다.
- 따라서 별도 연동 없이 **헬스커넥트 연동으로 받는다.**
  - 기록을 쓴 앱의 패키지명이 `com.mih.planfit`이면 플랜핏 기록으로 표시한다.
- 사용자는 플랜핏 앱에서 헬스커넥트 권한을 허용해야 한다.

## 3. 삼성헬스 에너지 점수 (외부 승인 필요)

- 에너지 점수는 **헬스커넥트에 없다.** 삼성헬스 데이터 SDK(Samsung Health Data SDK)로만 읽을 수 있다.
- SDK의 `EnergyScoreType`은 **읽기 전용**이고, 1.0.0 beta2(2025-02)부터 지원한다. 최신 SDK는 1.1.0(2026-03)이다.
- 사용자 동의(권한 요청)가 필요하다.
- **배포하려면 삼성 파트너십 승인이 필요하다.** 승인 전에는 삼성헬스 *개발자 모드*에서만 동작하고, 개발자 모드는 테스트·디버깅용이다.
- SDK는 안드로이드 전용이다.

결론: 헬스커넥트 연동을 먼저 끝낸 뒤 별도 단계로 진행한다. 개인 테스트는 개발자 모드로 할 수 있고, 장기 사용이나 배포는 파트너 신청 후 결정한다.

## 4. 인바디 결과지 사진 인식 / 음식 사진 인식 (예정)

- 이미지 인식 API가 필요하다. 1단계는 AI 없이 동작하므로 비활성 상태다.
- 저장 전 **인식값 확인·수정 화면**을 반드시 거친다.
- 인바디 → `KIND.BODY_COMPOSITION`, 음식 → `KIND.FOOD`. 식사 규칙성(`KIND.MEALS`)은 직접 입력을 유지한다.

## 출처

- Samsung Health Data SDK — Data types: https://developer.samsung.com/health/data/guide/features/data-types.html
- EnergyScoreType API reference: https://developer.samsung.com/health/data/api-reference/-shd/com.samsung.android.sdk.health.data.request/-data-type/-energy-score-type/index.html
- Samsung Health Data SDK — Release note: https://developer.samsung.com/health/data/release-note.html
- Samsung Health Data SDK — App creation process: https://developer.samsung.com/health/data/process.html
- Planfit — Google Play: https://play.google.com/store/apps/details?id=com.mih.planfit&hl=en_US
- Capacitor Health 플러그인 예: https://capgo.app/docs/plugins/health/
