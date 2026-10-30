// 인바디 결과지 사진 인식 — 2단계에서 이미지 인식 API를 붙인다.
// 결과 → KIND.BODY_COMPOSITION {weight, muscle, fatMass, fatPct, bmi, bmr, ideal, visceral, score}
// source = {type:"inbody_photo", externalId:"inbody:<측정일시>"} , 저장 전 사용자 확인 화면 필수
import { SOURCE, KIND } from "../model.js";

export default {
  id: "inbody_photo",
  name: "인바디 결과지 사진 인식",
  source: SOURCE.INBODY_PHOTO,
  kinds: [KIND.BODY_COMPOSITION, KIND.WEIGHT],
  status: "planned",
  requires: ["이미지 인식 API", "인식값 확인·수정 화면"],
  note: "1단계는 AI 없이 동작해서 꺼 두었어요.",
  async isAvailable() { return false; },
  async fetchEntries() { throw new Error("not_implemented"); },
};
