// 플랜핏 — 공개 API 없음. 플랜핏이 헬스커넥트에 운동 기록·체중을 쓰므로(플레이스토어 설명 기준)
// 헬스커넥트 연동으로 받아온다. dataOrigin 패키지명 com.mih.planfit 으로 출처를 구분한다.
import { SOURCE, KIND } from "../model.js";

export const PLANFIT_PACKAGE = "com.mih.planfit";

export default {
  id: "planfit",
  name: "플랜핏 (헬스커넥트 경유)",
  source: SOURCE.HEALTH_CONNECT,
  kinds: [KIND.EXERCISE, KIND.WEIGHT],
  status: "verified",
  requires: ["헬스커넥트 연동 구현", "플랜핏 앱에서 헬스커넥트 권한 허용"],
  note: "플랜핏에서 온 운동은 출처가 '플랜핏'으로 따로 표시돼요.",
  async isAvailable() { return false; },
  async fetchEntries() { throw new Error("not_implemented: 헬스커넥트 연동과 함께 구현"); },
};
