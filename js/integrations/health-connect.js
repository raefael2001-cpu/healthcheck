// 안드로이드 헬스커넥트 — 운동(ExerciseSessionRecord)·수면(SleepSessionRecord)·체중 읽기.
// 웹앱(PWA)에서는 접근할 수 없다. 2단계에서 네이티브 안드로이드 래퍼(예: Capacitor + 헬스 플러그인)가 필요하다.
// 매핑 계획: ExerciseSessionRecord → KIND.EXERCISE {did:true, minutes, type}
//           SleepSessionRecord    → KIND.SLEEP {bedTime, wakeTime, minutes}  (date = 깬 날짜)
//           source = {type:"health_connect", app:<dataOrigin 패키지명>, externalId:<record.metadata.id>}
import { SOURCE, KIND } from "../model.js";

export default {
  id: "health_connect",
  name: "헬스커넥트 (운동·수면)",
  source: SOURCE.HEALTH_CONNECT,
  kinds: [KIND.EXERCISE, KIND.SLEEP, KIND.WEIGHT],
  status: "verified",
  requires: ["안드로이드 네이티브 앱(웹앱 불가)", "헬스커넥트 읽기 권한 동의", "플레이스토어 배포 시 건강 권한 신고·심사"],
  note: "삼성헬스에서 헬스커넥트 동기화를 켜면 운동·수면 기록이 함께 들어와요.",
  async isAvailable() { return false; },
  async fetchEntries() { throw new Error("not_implemented: 2단계 네이티브 앱에서 구현"); },
};
