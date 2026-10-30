// 2단계 외부 연동 레지스트리.
// 각 연동 모듈은 같은 모양(descriptor)을 내보낸다:
//   id, name, kinds(채울 기록 종류), status, requires(조건), note
//   isAvailable(): Promise<boolean>
//   fetchEntries({from, to}): Promise<Entry[]>   // source.type·source.externalId가 채워진 기록
// 앱은 fetchEntries 결과를 db.ingestExternal()로 넣는다. externalId로 중복을 막고,
// 같은 날 수동 기록이 있으면 화면·리포트는 수동 기록을 우선한다(model.pickDaily).
//
// status 값: "planned"(구현 예정) | "verified"(조건 확인 완료, 구현 대기) | "needs_partnership"(외부 승인 필요) | "active"
import healthConnect from "./health-connect.js";
import samsungHealth from "./samsung-health.js";
import planfit from "./planfit.js";
import inbodyPhoto from "./inbody-photo.js";
import foodPhoto from "./food-photo.js";

export const INTEGRATIONS = [healthConnect, planfit, samsungHealth, inbodyPhoto, foodPhoto];

export const STATUS_LABEL = {
  planned: "2단계 예정",
  verified: "조건 확인됨 · 2단계 구현",
  needs_partnership: "외부 승인 필요",
  active: "사용 중",
};
