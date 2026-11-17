"""건배사 CSV를 앱(app/index.html) 안의 데이터로 넣는다.

카드를 고치거나 추가한 뒤 실행:  python3 zzan/build.py

읽는 파일 (한 줄 = 카드 1장)
  cards-notes.csv    직접 모은 건배사 노트. 앱에서 가장 먼저 보여 줌
  cards-my.csv       이름·회사·팀이 들어간 맞춤 카드. 공개 저장소에 올리지 않음 (.gitignore)
  presets-draft.csv  AI가 쓴 초안. 앱에서 'AI 초안'을 켜야 보임

만드는 파일
  app/index.html     공개용. 맞춤 카드 없음
  app/index.my.html  개인용. cards-my.csv가 있을 때만 만들고, 저장소에 올리지 않음

글 안의 표시
  [글자]  강조하고 왼쪽 네모 칸에 보여 줌 (예: [소]통과)
  {지문}  흐리게 보여 주고 말하는 시간에서 뺌 (예: {잔을 들며})
"""
import csv
import hashlib
import json
import pathlib
import re

HERE = pathlib.Path(__file__).parent
APP = HERE / "app" / "index.html"
APP_MY = HERE / "app" / "index.my.html"

TARGETS = {"맞춤", "부장님", "동기", "친목", "가족"}
FORMATS = {"대본", "이야기", "줄임말", "행시", "구호"}
DATE = re.compile(r"\d{4}-\d{2}-\d{2}")


def split(value):
    return [x.strip() for x in (value or "").split("/") if x.strip()]


def with_id(item):
    first = (item.get("lines") or [""])[0] or item.get("intro", "") or item.get("call", "") or item.get("resp", "")
    key = "|".join([item["f"], item["k"], item.get("sub", ""), first])
    item["id"] = hashlib.md5(key.encode("utf-8")).hexdigest()[:8]
    return item


def read_notes(path):
    """노트·맞춤 카드: 형식이 여러 가지 (대본, 이야기, 줄임말, 행시, 구호)."""
    cards = []
    with open(path, encoding="utf-8") as f:
        for line_no, r in enumerate(csv.DictReader(f), start=2):
            where = f"{path.name} {line_no}번째 줄"
            g = lambda name: (r.get(name) or "").strip()
            fmt, title, targets = g("형식"), g("제목"), split(g("대상"))
            lines = [g(f"{i}행") for i in range(1, 5) if g(f"{i}행")]
            if fmt not in FORMATS:
                raise SystemExit(f"{where}: 형식은 {', '.join(sorted(FORMATS))} 중 하나여야 해요 ({fmt})")
            if not title or not targets or set(targets) - TARGETS:
                raise SystemExit(f"{where}: 제목이 없거나 대상이 잘못됐어요 (대상: {', '.join(sorted(TARGETS))})")
            if not (g("이야기") or lines or g("선창") or g("후창")):
                raise SystemExit(f"{where}: 내용이 비어 있어요 ({title})")
            item = {"f": fmt, "k": title, "t": targets, "src": "n"}
            for key, name in (("sub", "테마"), ("intro", "이야기"), ("call", "선창"), ("resp", "후창"), ("after", "덧붙임")):
                if g(name):
                    item[key] = g(name)
            if lines:
                item["lines"] = lines
            if split(g("자리")):
                item["o"] = split(g("자리"))
            if g("달"):  # 그 달에만 보여 줌 (예: 11, 또는 11/12)
                item["mo"] = [int(x) for x in split(g("달"))]
            if g("만료일"):  # 이 날이 지나면 숨김
                if not DATE.fullmatch(g("만료일")):
                    raise SystemExit(f"{where}: 만료일은 2026-12-31처럼 적어요 ({g('만료일')})")
                item["x"] = g("만료일")
            if g("추천"):
                item["r"] = 1
            cards.append(with_id(item))
    return cards


def read_drafts(path):
    """AI 초안: 2행시·3행시. 각 행이 제시어의 그 순서 글자로 시작해야 함."""
    cards = []
    with open(path, encoding="utf-8") as f:
        for line_no, r in enumerate(csv.DictReader(f), start=2):
            where = f"{path.name} {line_no}번째 줄"
            g = lambda name: (r.get(name) or "").strip()
            k = g("제시어")
            lines = [g("1행"), g("2행")] + ([g("3행")] if g("3행") else [])
            if len(k) not in (2, 3) or len(lines) != len(k):
                raise SystemExit(f"{where}: 제시어 글자 수와 행 수가 달라요 ({k})")
            if any(line[:1] != ch for line, ch in zip(lines, k)):
                raise SystemExit(f"{where}: 첫 글자가 제시어와 안 맞아요 ({k} / {' / '.join(lines)})")
            item = {"f": "행시", "k": k, "t": split(g("대상")), "src": "d", "s": g("기술"),
                    "lines": [f"[{line[0]}]{line[1:]}" for line in lines]}
            if set(item["t"]) - TARGETS:
                raise SystemExit(f"{where}: 대상이 잘못됐어요 ({g('대상')})")
            if g("밈"):
                item["m"], item["d"] = g("밈"), g("밈등록일")
                if not DATE.fullmatch(item["d"]):
                    print(f"주의: {where} 밈 등록일이 없거나 형식이 달라요. 이 카드는 자동으로 숨겨지지 않아요.")
            if split(g("자리")):
                item["o"] = split(g("자리"))
            if g("추천"):
                item["r"] = 1
            cards.append(with_id(item))
    return cards


def without_personal(cards):
    """공개용: '맞춤' 대상을 빼고, 맞춤에만 속한 카드는 버림."""
    out = []
    for c in cards:
        targets = [t for t in c["t"] if t != "맞춤"]
        if targets:
            out.append({**c, "t": targets})
    return out


def fill(html, cards):
    data = "[\n" + ",\n".join(json.dumps(c, ensure_ascii=False) for c in cards) + "\n]"
    out, n = re.subn(r"/\*PRESETS:START\*/.*?/\*PRESETS:END\*/",
                     lambda _: f"/*PRESETS:START*/{data}/*PRESETS:END*/", html, flags=re.S)
    if n != 1:
        raise SystemExit("앱 파일에서 데이터 자리(PRESETS:START/END)를 찾지 못했어요")
    return out


notes = read_notes(HERE / "cards-notes.csv")
drafts = read_drafts(HERE / "presets-draft.csv")
my_path = HERE / "cards-my.csv"
my = read_notes(my_path) if my_path.exists() else []

ids = [c["id"] for c in my + notes + drafts]
if len(ids) != len(set(ids)):
    raise SystemExit("똑같은 카드가 두 번 들어 있어요 (형식·제목·테마·첫 줄이 같음)")

html = APP.read_text(encoding="utf-8")
APP.write_text(fill(html, without_personal(notes + drafts)), encoding="utf-8")
print(f"공개용 app/index.html: 노트 {len(without_personal(notes))}장 + AI 초안 {len(drafts)}장")
if my:
    APP_MY.write_text(fill(html, my + notes + drafts), encoding="utf-8")
    print(f"개인용 app/index.my.html: 맞춤 {len(my)}장 + 노트 {len(notes)}장 + AI 초안 {len(drafts)}장")
