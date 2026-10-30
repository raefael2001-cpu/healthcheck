// 삼성헬스 데이터 SDK — 에너지 점수(EnergyScoreType, 읽기 전용)처럼 헬스커넥트에 없는 항목용.
// 확인한 조건(2026-10): SDK 1.0.0부터 에너지 점수 읽기 지원, 사용자 동의 필요,
// 배포하려면 삼성 파트너십 승인 필요(승인 전에는 삼성헬스 개발자 모드에서만 동작).
import { SOURCE, KIND } from "../model.js";

export default {
  id: "samsung_health",
  name: "삼성헬스 에너지 점수",
  source: SOURCE.SAMSUNG_HEALTH,
  kinds: [KIND.ENERGY_SCORE],
  status: "needs_partnership",
  requires: ["안드로이드 네이티브 앱", "Samsung Health Data SDK", "삼성 파트너십 승인(배포 시)", "사용자 동의"],
  note: "헬스커넥트로는 받을 수 없는 항목이에요. 개인 테스트는 삼성헬스 개발자 모드로 가능하고, 배포는 삼성 승인 후에 할 수 있어요.",
  async isAvailable() { return false; },
  async fetchEntries() { throw new Error("not_implemented: 파트너십 승인 후 구현"); },
};
