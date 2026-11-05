"""건배사 CSV(presets-draft.csv)를 앱(app/index.html) 안의 데이터로 넣는다.

건배사를 고치거나 추가한 뒤 실행:  python3 zzan/build.py
"""
import csv
import json
import pathlib
import re

HERE = pathlib.Path(__file__).parent
CSV_PATH = HERE / "presets-draft.csv"
APP_PATH = HERE / "app" / "index.html"

rows = []
with open(CSV_PATH, encoding="utf-8") as f:
    for line_no, r in enumerate(csv.DictReader(f), start=2):
        k = r["제시어"].strip()
        l1 = r["1행"].strip()
        l2 = r["2행"].strip()
        # 2행시 규칙: 1행은 제시어 첫 글자, 2행은 둘째 글자로 시작
        if len(k) != 2 or l1[:1] != k[0] or l2[:1] != k[1]:
            raise SystemExit(f"{line_no}번째 줄: 첫 글자가 제시어와 안 맞아요 ({k} / {l1} / {l2})")
        item = {"k": k, "t": r["대상"].strip(), "l1": l1, "l2": l2,
                "c": r["구호"].strip(), "s": r["기술"].strip()}
        meme = (r.get("밈") or "").strip()
        if meme:
            item["m"] = meme
            item["d"] = (r.get("밈등록일") or "").strip()
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", item["d"]):
                print(f"주의: {line_no}번째 줄 밈 등록일이 없거나 형식이 달라요 (예: 2026-11-05). 이 카드는 자동으로 숨겨지지 않아요.")
        rows.append(item)

data = "[\n" + ",\n".join(json.dumps(x, ensure_ascii=False) for x in rows) + "\n]"
html = APP_PATH.read_text(encoding="utf-8")
new_html, n = re.subn(r"/\*PRESETS:START\*/.*?/\*PRESETS:END\*/",
                      lambda _: f"/*PRESETS:START*/{data}/*PRESETS:END*/", html, flags=re.S)
if n != 1:
    raise SystemExit("앱 파일에서 데이터 자리(PRESETS:START/END)를 찾지 못했어요")
APP_PATH.write_text(new_html, encoding="utf-8")
print(f"건배사 {len(rows)}개를 앱에 넣었어요 (밈 카드 {sum('m' in x for x in rows)}개)")
