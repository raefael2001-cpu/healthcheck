// 음식 사진 인식 — 2단계. 결과 → KIND.FOOD {meal:"breakfast"|"lunch"|"dinner"|"snack", items:[{name, amount}], note}
// 식사 규칙성(KIND.MEALS)은 수동 기록을 유지하고, 음식 사진은 내용 기록으로 따로 둔다.
import { SOURCE, KIND } from "../model.js";

export default {
  id: "food_photo",
  name: "음식 사진 인식",
  source: SOURCE.FOOD_PHOTO,
  kinds: [KIND.FOOD],
  status: "planned",
  requires: ["이미지 인식 API", "인식 결과 확인 화면"],
  note: "1단계는 AI 없이 동작해서 꺼 두었어요.",
  async isAvailable() { return false; },
  async fetchEntries() { throw new Error("not_implemented"); },
};
