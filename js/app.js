// 화면 구성 — 시작(기본 정보) / 오늘 / 주간 / 설정
import * as M from "./model.js";
import * as DB from "./db.js";
import { dailyFeedback } from "./feedback.js";
import { weekStats, describe, headline, compare, bestDay, topActions, shortDate } from "./report.js";
import * as Rem from "./reminders.js";
import { INTEGRATIONS, STATUS_LABEL } from "./integrations/index.js";

const { KIND, SOURCE_LABEL, CONDITION_LABEL, MEAL_STATUS, MEALS, EXERCISE_TYPES, EFFECT } = M;
const $ = s => document.querySelector(s);
const main = $("#main");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const W = "일월화수목금토";
const fmtDay = s => { const d = M.parseDate(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${W[d.getDay()]})`; };
const fmtShort = s => { const d = M.parseDate(s); return `${d.getMonth() + 1}/${d.getDate()}(${W[d.getDay()]})`; };

let profile = null, settings = null;
const state = { date: M.todayIso(), week: M.weekStart(M.todayIso()) };

function toast(t) {
  const el = $("#toast"); el.textContent = t; el.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 1800);
}

// 두 번 눌러야 실행되는 버튼 (삭제용)
function armed(btn, label, fn) {
  btn.addEventListener("click", async () => {
    if (!btn.classList.contains("armed")) {
      btn.classList.add("armed"); const old = btn.textContent; btn.textContent = label;
      setTimeout(() => { btn.classList.remove("armed"); btn.textContent = old; }, 3000);
      return;
    }
    await fn();
  });
}

// ---------------- 시작 화면 ----------------
function profileFields(p = {}) {
  return `
  <div class="grid2">
    <label class="field">키 (cm)<input id="pf-h" type="number" inputmode="decimal" step="0.1" min="100" max="230" value="${esc(p.heightCm ?? "")}" required></label>
    <label class="field">몸무게 (kg)<input id="pf-w" type="number" inputmode="decimal" step="0.1" min="25" max="250" value="${esc(p.weightKg ?? "")}" required></label>
  </div>
  <div class="field">성별
    <div class="seg" id="pf-sex" role="group" aria-label="성별">
      <button type="button" data-v="male" aria-pressed="${p.sex === "male"}">남성</button>
      <button type="button" data-v="female" aria-pressed="${p.sex === "female"}">여성</button>
    </div>
  </div>
  <label class="field">만 나이<input id="pf-a" type="number" inputmode="numeric" min="14" max="100" value="${esc(p.age ?? "")}" required></label>
  <p class="err" id="pf-err"></p>`;
}
function bindSex() {
  document.querySelectorAll("#pf-sex button").forEach(b => b.onclick = () =>
    document.querySelectorAll("#pf-sex button").forEach(x => x.setAttribute("aria-pressed", String(x === b))));
}
function readProfile() {
  const h = parseFloat($("#pf-h").value), w = parseFloat($("#pf-w").value), a = parseInt($("#pf-a").value, 10);
  const sex = document.querySelector('#pf-sex [aria-pressed="true"]')?.dataset.v;
  const err = !(h >= 100 && h <= 230) ? "키를 100~230cm 사이로 넣어 주세요."
    : !(w >= 25 && w <= 250) ? "몸무게를 25~250kg 사이로 넣어 주세요."
    : !sex ? "성별을 골라 주세요."
    : !(a >= 14 && a <= 100) ? "만 나이를 14~100 사이로 넣어 주세요." : "";
  $("#pf-err").textContent = err;
  return err ? null : { heightCm: h, weightKg: w, sex, age: a };
}

function renderOnboard() {
  $("#bar").hidden = true;
  main.innerHTML = `
  <div class="hero">
    <h1>오늘의 바디체크</h1>
    <p class="muted">수면·컨디션·식사·운동을 하루 1분으로 기록해요.<br>시작하려면 네 가지만 알려 주세요.</p>
  </div>
  <form class="card" id="onb" novalidate>
    ${profileFields()}
    <button class="btn block" type="submit">시작하기</button>
    <p class="small muted">회원가입이 없고 이름·전화번호·이메일을 받지 않아요. 기록은 이 폰에만 저장돼요. 목표 수면 시간 같은 나머지 정보는 나중에 설정에서 넣을 수 있어요.</p>
  </form>
  <p class="small muted">개인 습관 기록용이며 의료적 판단을 대신하지 않아요.</p>`;
  bindSex();
  $("#onb").onsubmit = async e => {
    e.preventDefault();
    const p = readProfile(); if (!p) return;
    await DB.saveProfile(p); profile = await DB.getProfile();
    location.hash = "#today"; route();
  };
}

// ---------------- 해시태그 공통 ----------------
const tagsFor = kind => [...(kind === "symptom" ? M.SYMPTOM_TAGS : M.CAUSE_TAGS), ...settings.customTags[kind].filter(t => !(kind === "symptom" ? M.SYMPTOM_TAGS : M.CAUSE_TAGS).includes(t))];
const hashes = list => (list || []).map(t => "#" + esc(t)).join(" ");
function chipsHtml(id, kind, selected = []) {
  const all = [...tagsFor(kind), ...selected.filter(t => !tagsFor(kind).includes(t))];
  return `<div class="chips" id="${id}" data-kind="${kind}">${all.map(t => `<button type="button" data-v="${esc(t)}" aria-pressed="${selected.includes(t)}">#${esc(t)}</button>`).join("")}
    <button type="button" class="addtag" data-add-tag="${id}">+ 직접</button></div>`;
}
const chipVals = id => [...document.querySelectorAll(`#${id} [aria-pressed="true"]`)].map(b => b.dataset.v);
// 여러 개 선택 칩. onChange는 선택이 바뀔 때마다 호출
function bindChips(id, onChange) {
  const box = document.getElementById(id);
  box.querySelectorAll("button[data-v]").forEach(b => b.onclick = () => {
    const on = b.getAttribute("aria-pressed") !== "true";
    if (on && chipVals(id).length >= 10) return toast("태그는 10개까지 고를 수 있어요.");
    b.setAttribute("aria-pressed", String(on)); onChange?.();
  });
  box.querySelector("[data-add-tag]").onclick = () => {
    if (box.querySelector(".tagin")) return box.querySelector(".tagin input").focus();
    box.insertAdjacentHTML("beforeend", `<span class="tagin"><input maxlength="12" placeholder="새 태그" aria-label="새 태그"><button type="button" class="btn sm">추가</button></span>`);
    const inp = box.querySelector(".tagin input"), go = async () => {
      const t = M.cleanTag(inp.value);
      if (!M.isTag(t)) return toast("태그는 띄어쓰기 없이 12자까지 쓸 수 있어요.");
      const kind = box.dataset.kind;
      if (!tagsFor(kind).includes(t)) { settings.customTags[kind] = [...settings.customTags[kind], t]; await DB.saveSettings(settings); }
      const sel = [...chipVals(id), t];
      box.outerHTML = chipsHtml(id, kind, [...new Set(sel)]); bindChips(id, onChange); onChange?.();
    };
    inp.focus(); inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); go(); } };
    box.querySelector(".tagin button").onclick = go;
  };
}

// ---------------- 오늘 ----------------
async function renderToday() {
  const date = state.date, isToday = date === M.todayIso();
  const [list, recent, history] = await Promise.all([DB.entriesOn(date), DB.entriesBetween(M.addDays(date, -6), date), DB.entriesBetween(M.addDays(date, -180), date)]);
  const pro = M.pickDaily(list, KIND.PROBIOTIC);
  const symptoms = list.filter(e => e.kind === KIND.SYMPTOM).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const sleep = M.pickDaily(list, KIND.SLEEP), cond = M.pickDaily(list, KIND.CONDITION), meals = M.pickDaily(list, KIND.MEALS);
  const ex = M.exerciseOfDay(list);
  const lastSleep = sleep || (await DB.entriesBetween(M.addDays(date, -14), M.addDays(date, -1))).filter(e => e.kind === KIND.SLEEP).sort((a, b) => b.date.localeCompare(a.date))[0];
  const bed = sleep?.value.bedTime || lastSleep?.value.bedTime || "23:30", wake = sleep?.value.wakeTime || lastSleep?.value.wakeTime || "07:00";
  const badge = e => e ? `<span class="badge on">기록됨 · ${esc(SOURCE_LABEL[e.source.type])}</span>` : `<span class="badge">미기록</span>`;
  const fb = dailyFeedback({ today: list, recent7: recent, history, profile, settings });
  const mv = meals?.value || {};

  main.innerHTML = `
  <div class="datenav">
    <button id="d-prev" aria-label="전날">‹</button>
    <div class="d">${fmtDay(date)}</div>
    <button id="d-next" aria-label="다음 날" ${isToday ? "disabled" : ""}>›</button>
    <button class="txt" id="d-today" ${isToday ? "hidden" : ""}>오늘</button>
  </div>

  <section class="card" aria-labelledby="h-sleep">
    <div class="card-h"><h2 id="h-sleep">수면</h2>${badge(sleep)}</div>
    <div class="grid2">
      <label class="field">잠든 시각 (전날 밤)<input id="s-bed" type="time" value="${bed}"></label>
      <label class="field">깬 시각<input id="s-wake" type="time" value="${wake}"></label>
    </div>
    <div class="sum"><span>수면 시간</span><b id="s-dur"></b></div>
    <div class="row"><button class="btn" id="s-save">${sleep ? "수정 저장" : "저장"}</button>${sleep ? `<button class="btn danger sm" id="s-del">기록 삭제</button>` : ""}</div>
  </section>

  <section class="card" aria-labelledby="h-cond">
    <div class="card-h"><h2 id="h-cond">아침 컨디션</h2>${badge(cond)}</div>
    <div class="levels" id="c-lv">${[1, 2, 3, 4, 5].map(l => `<button type="button" data-v="${l}" aria-pressed="${cond?.value.level === l}"><b>${l}</b>${CONDITION_LABEL[l]}</button>`).join("")}</div>
    <h3>오늘 컨디션의 원인 <span class="src">여러 개 선택</span></h3>
    ${chipsHtml("c-cause", "cause", cond?.value.causes || [])}
    <label class="field">메모 <span class="src" id="c-cnt"></span><input id="c-note" maxlength="${M.NOTE_MAX}" placeholder="예: 어제 회식, 찬 음료 많이 마심" value="${esc(cond?.value.note || "")}"></label>
    ${cond ? `<div class="row"><span class="small muted grow">원인·메모는 고르면 바로 저장돼요.</span><button class="btn danger sm" id="c-del">기록 삭제</button></div>` : `<p class="small muted">컨디션 숫자를 누르면 원인·메모와 함께 저장돼요.</p>`}
  </section>

  <section class="card" aria-labelledby="h-meal">
    <div class="card-h"><h2 id="h-meal">식사 규칙성</h2>${badge(meals)}</div>
    <div class="list">${MEALS.map(([k, l]) => `
      <div class="meal"><span>${l}</span>
        <div class="seg warnsel" data-meal="${k}">${Object.entries(MEAL_STATUS).map(([v, t]) => `<button type="button" data-v="${v}" class="${v === "late" ? "late" : v === "skipped" ? "skip" : ""}" aria-pressed="${mv[k] === v}">${t}</button>`).join("")}</div>
      </div>`).join("")}
    </div>
    <label class="check"><input type="checkbox" id="m-snack" ${mv.lateSnack ? "checked" : ""}> 야식 먹음</label>
    <p class="small muted">모르는 끼니는 비워 두세요. 비운 끼니는 계산에서 빠져요. 다시 누르면 선택이 풀려요.</p>
    <div class="row"><button class="btn" id="m-save">${meals ? "수정 저장" : "저장"}</button>${meals ? `<button class="btn danger sm" id="m-del">기록 삭제</button>` : ""}</div>
  </section>

  <section class="card" aria-labelledby="h-pro">
    <div class="card-h"><h2 id="h-pro">저녁 유산균</h2>${badge(pro)}</div>
    <div class="seg" id="p-seg" role="group" aria-label="저녁 유산균"><button type="button" data-v="1" aria-pressed="${pro?.value.taken === true}">먹었어요</button><button type="button" data-v="0" aria-pressed="${pro?.value.taken === false}">안 먹었어요</button></div>
    ${pro ? `<div class="row"><button class="btn danger sm" id="p-del">기록 삭제</button></div>` : `<p class="small muted">누르면 바로 저장돼요.</p>`}
  </section>

  <section class="card" aria-labelledby="h-ex">
    <div class="card-h"><h2 id="h-ex">운동</h2>${ex ? `<span class="badge on">${ex.did ? `${ex.sessions.length}회 · ${ex.minutes}분` : "쉬는 날"}</span>` : `<span class="badge">미기록</span>`}</div>
    ${ex?.did ? `<div class="list">${ex.sessions.map(s => `
      <div class="sum"><span>${esc(s.value.type || "운동")} · <b>${s.value.minutes}분</b> <span class="src">${esc(SOURCE_LABEL[s.source.type])}</span></span><button class="btn danger sm" data-del="${s.id}">삭제</button></div>`).join("")}</div>` : ""}
    ${ex && !ex.did ? (() => { const rest = list.find(e => e.kind === KIND.EXERCISE && e.value.did === false); return `<div class="sum"><span>오늘은 운동을 안 했어요</span><button class="btn danger sm" data-del="${rest.id}">삭제</button></div>`; })() : ""}
    <h3>운동 추가</h3>
    <div class="chips" id="e-min">${[20, 30, 45, 60, 90].map(m => `<button type="button" data-v="${m}" aria-pressed="false">${m}분</button>`).join("")}</div>
    <label class="field">직접 입력 (분)<input id="e-minutes" type="number" inputmode="numeric" min="1" max="600" placeholder="예: 40"></label>
    <div class="chips" id="e-type">${EXERCISE_TYPES.map(t => `<button type="button" data-v="${esc(t)}" aria-pressed="false">${esc(t)}</button>`).join("")}</div>
    <div class="row">
      <button class="btn" id="e-add">운동 기록 추가</button>
      ${!ex ? `<button class="btn quiet" id="e-rest">오늘은 안 했어요</button>` : ""}
    </div>
  </section>

  <section class="card" aria-labelledby="h-sym">
    <div class="card-h"><h2 id="h-sym">몸 상태</h2>${symptoms.length ? `<span class="badge on">${symptoms.length}건</span>` : `<span class="badge">없음</span>`}</div>
    ${symptoms.length ? `<div class="list">${symptoms.map(s => `
      <div class="sym">
        <div class="sym-h"><b>${hashes(s.value.tags)}</b><button class="btn danger sm" data-sdel="${s.id}">삭제</button></div>
        ${s.value.causes?.length ? `<div class="small"><span class="muted">원인</span> ${hashes(s.value.causes)}</div>` : ""}
        ${s.value.action ? `<div class="small"><span class="muted">한 일</span> ${esc(s.value.action)}</div>` : ""}
        ${s.value.note ? `<div class="small muted">${esc(s.value.note)}</div>` : ""}
        ${s.value.action ? `<div class="seg sm" data-eff="${s.id}" role="group" aria-label="효과">${Object.entries(EFFECT).map(([k, t]) => `<button type="button" data-v="${k}" aria-pressed="${(s.value.effect || "unknown") === k}">${t}</button>`).join("")}</div>` : ""}
      </div>`).join("")}</div>` : `<p class="small muted">아픈 곳이나 불편한 점이 있으면 해시태그로 남겨 두세요. 증상·원인·한 일·효과를 쌓으면 주간 리포트에 "효과 있던 대처"가 모여요.</p>`}
    <details ${symptoms.length ? "" : "open"} id="sym-form"><summary>몸 상태 추가</summary>
      <div class="list" style="margin-top:10px">
        <h3>증상</h3>${chipsHtml("y-tag", "symptom")}
        <h3>원인 <span class="src">선택</span></h3>${chipsHtml("y-cause", "cause")}
        <label class="field">한 일 (대처) <span class="src">선택 · 40자</span><input id="y-act" maxlength="40" placeholder="예: 따뜻한 물 마시고 휴식"></label>
        <div class="field">효과<div class="seg" id="y-eff" role="group" aria-label="효과">${Object.entries(EFFECT).map(([k, t]) => `<button type="button" data-v="${k}" aria-pressed="${k === "unknown"}">${t}</button>`).join("")}</div></div>
        <label class="field">메모 <span class="src" id="y-cnt">0/${M.NOTE_MAX}</span><input id="y-note" maxlength="${M.NOTE_MAX}" placeholder="예: 계단 내려올 때 오른 무릎 바깥쪽"></label>
        <button class="btn" id="y-save">몸 상태 저장</button>
      </div>
    </details>
  </section>

  <section class="card" aria-labelledby="h-fb">
    <div class="card-h"><h2 id="h-fb">오늘의 피드백</h2></div>
    <ul class="fb">${fb.map(f => `<li class="${f.tone}">${esc(f.text)}</li>`).join("")}</ul>
  </section>
  <p class="small muted">개인 습관 기록용이며 의료적 판단을 대신하지 않아요.</p>`;

  // 날짜 이동
  $("#d-prev").onclick = () => { state.date = M.addDays(date, -1); renderToday(); };
  $("#d-next").onclick = () => { if (!isToday) { state.date = M.addDays(date, 1); renderToday(); } };
  $("#d-today").onclick = () => { state.date = M.todayIso(); renderToday(); };

  const save = async (kind, value, msg) => {
    try { await DB.putEntry(M.makeEntry(kind, date, value)); toast(msg); renderToday(); }
    catch (e) { toast(e.message); }
  };
  const del = (id, msg) => async () => { await DB.deleteEntry(id); toast(msg); renderToday(); };

  // 수면
  const upd = () => { $("#s-dur").textContent = M.fmtDur(M.sleepMinutes($("#s-bed").value || "00:00", $("#s-wake").value || "00:00")); };
  $("#s-bed").oninput = $("#s-wake").oninput = upd; upd();
  $("#s-save").onclick = () => {
    const b = $("#s-bed").value, w = $("#s-wake").value;
    if (!b || !w) return toast("시각을 모두 넣어 주세요.");
    save(KIND.SLEEP, { bedTime: b, wakeTime: w, minutes: M.sleepMinutes(b, w) }, "수면을 저장했어요.");
  };
  if (sleep) armed($("#s-del"), "한 번 더 누르면 삭제", del(sleep.id, "수면 기록을 삭제했어요."));

  // 컨디션 (+ 원인·메모)
  const condValue = level => ({ level, causes: chipVals("c-cause"), note: $("#c-note").value.trim() || null });
  document.querySelectorAll("#c-lv button").forEach(b => b.onclick = () => save(KIND.CONDITION, condValue(+b.dataset.v), "컨디션을 저장했어요."));
  const condQuiet = async () => { if (!cond) return; try { await DB.putEntry({ ...cond, value: condValue(cond.value.level) }); toast("원인을 저장했어요."); } catch (e) { toast(e.message); } };
  bindChips("c-cause", condQuiet);
  const cnt = (inp, out) => { const f = () => { $(out).textContent = `${$(inp).value.length}/${M.NOTE_MAX}`; }; $(inp).addEventListener("input", f); f(); };
  cnt("#c-note", "#c-cnt");
  $("#c-note").onchange = condQuiet;
  if (cond) armed($("#c-del"), "한 번 더 누르면 삭제", del(cond.id, "컨디션 기록을 삭제했어요."));

  // 식사
  document.querySelectorAll("[data-meal]").forEach(seg => seg.querySelectorAll("button").forEach(b => b.onclick = () => {
    const on = b.getAttribute("aria-pressed") === "true";
    seg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", "false"));
    if (!on) b.setAttribute("aria-pressed", "true");
  }));
  $("#m-save").onclick = () => {
    const v = { lateSnack: $("#m-snack").checked };
    MEALS.forEach(([k]) => { v[k] = document.querySelector(`[data-meal="${k}"] [aria-pressed="true"]`)?.dataset.v ?? null; });
    save(KIND.MEALS, v, "식사를 저장했어요.");
  };
  if (meals) armed($("#m-del"), "한 번 더 누르면 삭제", del(meals.id, "식사 기록을 삭제했어요."));

  // 저녁 유산균
  document.querySelectorAll("#p-seg button").forEach(b => b.onclick = () => save(KIND.PROBIOTIC, { taken: b.dataset.v === "1" }, "저녁 유산균을 저장했어요."));
  if (pro) armed($("#p-del"), "한 번 더 누르면 삭제", del(pro.id, "유산균 기록을 삭제했어요."));

  // 운동
  const pick = sel => document.querySelectorAll(sel + " button").forEach(b => b.onclick = () => {
    const on = b.getAttribute("aria-pressed") === "true";
    document.querySelectorAll(sel + " button").forEach(x => x.setAttribute("aria-pressed", "false"));
    if (!on) b.setAttribute("aria-pressed", "true");
    if (sel === "#e-min") $("#e-minutes").value = on ? "" : b.dataset.v;
  });
  pick("#e-min"); pick("#e-type");
  $("#e-minutes").oninput = () => document.querySelectorAll("#e-min button").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.v === $("#e-minutes").value)));
  $("#e-add").onclick = async () => {
    const min = parseInt($("#e-minutes").value, 10);
    if (!(min > 0)) return toast("운동 시간을 골라 주세요.");
    const type = document.querySelector('#e-type [aria-pressed="true"]')?.dataset.v || null;
    // 운동을 추가하면 같은 날 "안 했어요" 기록은 지운다
    for (const e of list.filter(e => e.kind === KIND.EXERCISE && e.value.did === false && e.source.type === M.SOURCE.MANUAL)) await DB.deleteEntry(e.id);
    save(KIND.EXERCISE, { did: true, minutes: min, type }, "운동을 기록했어요.");
  };
  $("#e-rest") && ($("#e-rest").onclick = () => save(KIND.EXERCISE, { did: false }, "쉬는 날로 기록했어요."));
  document.querySelectorAll("[data-del]").forEach(b => armed(b, "한 번 더", del(b.dataset.del, "운동 기록을 삭제했어요.")));

  // 몸 상태
  bindChips("y-tag"); bindChips("y-cause"); cnt("#y-note", "#y-cnt");
  const seg1 = sel => document.querySelectorAll(sel + " button").forEach(b => b.onclick = () => document.querySelectorAll(sel + " button").forEach(x => x.setAttribute("aria-pressed", String(x === b))));
  seg1("#y-eff");
  $("#y-save").onclick = () => {
    const tags = chipVals("y-tag");
    if (!tags.length) return toast("증상 태그를 하나 이상 골라 주세요.");
    const action = $("#y-act").value.trim() || null;
    save(KIND.SYMPTOM, { tags, causes: chipVals("y-cause"), action, effect: action ? document.querySelector('#y-eff [aria-pressed="true"]').dataset.v : null, note: $("#y-note").value.trim() || null }, "몸 상태를 저장했어요.");
  };
  document.querySelectorAll("[data-eff]").forEach(seg => seg.querySelectorAll("button").forEach(b => b.onclick = async () => {
    const e = symptoms.find(x => x.id === seg.dataset.eff);
    await DB.putEntry({ ...e, value: { ...e.value, effect: b.dataset.v } }); toast("효과를 저장했어요."); renderToday();
  }));
  document.querySelectorAll("[data-sdel]").forEach(b => armed(b, "한 번 더", del(b.dataset.sdel, "몸 상태 기록을 삭제했어요.")));
}

// ---------------- 주간 ----------------
function condChart(points) {
  const Wd = 320, H = 120, L = 22, R = 8, T = 10, B = 22, x = i => L + i * (Wd - L - R) / 6, y = v => T + (5 - v) / 4 * (H - T - B);
  let g = [1, 3, 5].map(v => `<line class="gl" x1="${L}" x2="${Wd - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 3.5}" text-anchor="end">${v}</text>`).join("");
  let d = ""; points.forEach(p => { d += (d ? "L" : "M") + x(p.i) + "," + y(p.v); });
  if (points.length > 1) g += `<path class="ln" d="${d}"/>`;
  g += points.map(p => `<circle class="pt" cx="${x(p.i)}" cy="${y(p.v)}" r="4"/>`).join("");
  return g;
}
function chartFrame(inner, labels, missing) {
  const Wd = 320, H = 120, L = 22, R = 8, x = i => L + i * (Wd - L - R) / 6;
  const lab = labels.map((t, i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="${missing[i] ? "miss" : ""}">${t}</text>`).join("");
  return `<svg viewBox="0 0 ${Wd} ${H}" role="img">${inner}${lab}</svg>`;
}
function sleepChart(days) {
  const Wd = 320, H = 120, L = 22, R = 8, T = 10, B = 22, x = i => L + i * (Wd - L - R) / 6, y = h => T + (1 - h / 12) * (H - T - B);
  let g = [0, 6, 12].map(h => `<line class="gl" x1="${L}" x2="${Wd - R}" y1="${y(h)}" y2="${y(h)}"/><text x="${L - 6}" y="${y(h) + 3.5}" text-anchor="end">${h}</text>`).join("");
  days.forEach((d, i) => {
    if (d.sleepMin == null) { g += `<text x="${x(i)}" y="${y(0) - 4}" text-anchor="middle" class="miss">–</text>`; return; }
    const h = Math.min(12, d.sleepMin / 60); g += `<rect class="bar" x="${x(i) - 9}" y="${y(h)}" width="18" height="${y(0) - y(h)}" rx="3"/>`;
  });
  return g;
}

async function renderWeek() {
  const start = state.week, prevStart = M.addDays(start, -7), end = M.addDays(start, 6);
  const entries = await DB.entriesBetween(M.addDays(start, -49), end); // 효과 TOP은 최근 8주
  const cur = weekStats(entries, start), prev = weekStats(entries, prevStart);
  const { lines, notes } = describe(cur, prev, settings);
  const cmp = compare(cur, prev), best = bestDay(cur), tops = topActions(entries);
  const arrow = (v, fmt) => v == null ? "" : v === 0 ? `<small class="cmp">→ 지난주와 같음</small>` : `<small class="cmp ${v > 0 ? "up" : "down"}">${v > 0 ? "↑" : "↓"} ${fmt(Math.abs(v))} (지난주 대비)</small>`;
  const isThis = start === M.weekStart(M.todayIso());
  const labels = cur.days.map(d => W[M.parseDate(d.date).getDay()]);
  const t = cur.condition.trend;
  const trendTxt = t ? { up: "↗ 상승", down: "↘ 하락", flat: "→ 비슷" }[t.dir] : "기록 부족";
  const head = headline(cur, prev, settings);
  // 한 줄 결론과 같은 내용의 문장은 아래 목록에서 뺀다
  const dupKey = [["주 후반", "주 후반"], ["컨디션이 지난주", "평균 컨디션이 지난주"], ["수면이 지난주", "평균 수면이 지난주"], ["주간 목표", "주간 목표"]].find(([h]) => head.includes(h));
  const shownLines = dupKey ? lines.filter(l => !l.includes(dupKey[1])) : lines;
  const anyNoCmp = cur.daysRecorded > 0 && [cmp.sleepMin, cmp.exerciseMin, cmp.condition].some(v => v == null);

  main.innerHTML = `
  <div class="datenav">
    <button id="w-prev" aria-label="지난주">‹</button>
    <div class="d">${fmtShort(start)} – ${fmtShort(end)}</div>
    <button id="w-next" aria-label="다음 주" ${isThis ? "disabled" : ""}>›</button>
    <button class="txt" id="w-this" ${isThis ? "hidden" : ""}>이번 주</button>
  </div>

  <section class="card">
    <div class="card-h"><h2>주간 리포트</h2></div>
    <p class="headline">${esc(head)}</p>
    <div class="tiles">
      <div class="tile"><span>기록 일수</span><b>${cur.daysRecorded} / 7일</b><small>하나라도 기록한 날</small>${arrow(cmp.days, v => v + "일")}</div>
      <div class="tile"><span>평균 수면</span><b>${cur.sleep.n ? M.fmtDur(cur.sleep.avgMin) : "–"}</b><small>${cur.sleep.n ? `수면 기록 ${cur.sleep.n}일 기준` : "수면 기록 없음"}</small>${arrow(cmp.sleepMin, M.fmtDur)}</div>
      <div class="tile"><span>운동</span><b>${cur.exercise.recordedDays ? `${cur.exercise.sessions}회 · ${cur.exercise.totalMin}분` : "–"}</b><small>${cur.exercise.recordedDays ? `운동 기록 ${cur.exercise.recordedDays}일 기준` : "운동 기록 없음"}</small>${arrow(cmp.exerciseMin, v => v + "분")}</div>
      <div class="tile"><span>컨디션 추세</span><b>${trendTxt}</b><small>${cur.condition.n ? `컨디션 기록 ${cur.condition.n}일 · 평균 ${cur.condition.avg.toFixed(1)}` : "컨디션 기록 없음"}</small>${arrow(cmp.condition, v => v.toFixed(1))}</div>
    </div>
    ${best ? `<div class="best"><span>가장 좋았던 날</span><b>${fmtShort(best.date)}</b><span class="small">컨디션 ${best.condition}${best.sleepMin != null ? " · 수면 " + M.fmtDur(best.sleepMin) : ""}${best.exercise?.did ? ` · 운동 ${best.exercise.minutes}분` : ""}${best.causes.length ? " · " + hashes(best.causes) : ""}</span></div>` : ""}
    ${shownLines.length ? `<ul class="fb">${shownLines.map(l => `<li class="good">${esc(l)}</li>`).join("")}</ul>` : ""}
    ${anyNoCmp ? `<p class="small muted">↑↓ 지난주 대비는 두 주 모두 3일 이상(운동은 4일) 기록된 항목에만 표시해요.</p>` : ""}
    ${notes.length ? `<ul class="notes">${notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
  </section>

  <section class="card">
    <div class="card-h"><h2>효과 있던 대처</h2><span class="src">최근 8주</span></div>
    ${tops.length ? `<ol class="tops">${tops.map(a => `<li><b>#${esc(a.tag)}</b> → ${esc(a.action)} <span class="src">효과 ${a.count}회 · 최근 ${shortDate(a.last)}</span></li>`).join("")}</ol>`
      : `<p class="small muted">아직 없어요. 오늘 탭 '몸 상태'에 한 일을 적고 '효과 있음'을 누르면 여기에 모여요.</p>`}
    ${cur.symptoms.n ? `<h3>이번 주 몸 상태</h3><p class="small">${cur.symptoms.tags.map(([t, n]) => `#${esc(t)} ${n}회`).join(" · ")}${cur.symptoms.causes.length ? `<br><span class="muted">원인</span> ${cur.symptoms.causes.slice(0, 4).map(([t, n]) => `#${esc(t)} ${n}`).join(" · ")}` : ""}</p>` : ""}
    ${cur.condition.lowCauses.length ? `<h3>컨디션 낮은 날(1~2)의 원인</h3><p class="small">${cur.condition.lowCauses.slice(0, 4).map(([t, n]) => `#${esc(t)} ${n}회`).join(" · ")}</p>` : ""}
  </section>

  <section class="card chart">
    <h3>컨디션 (1~5, 빈 요일은 미기록)</h3>
    ${chartFrame(condChart(cur.condition.points), labels, cur.days.map(d => d.condition == null))}
    <h3>수면 시간 (시간, – 는 미기록)</h3>
    ${chartFrame(sleepChart(cur.days), labels, cur.days.map(d => d.sleepMin == null))}
  </section>

  <section class="card">
    <h3>날짜별 기록</h3>
    <div class="days">${cur.days.map(d => {
      const parts = [];
      if (d.sleepMin != null) parts.push("수면 " + M.fmtDur(d.sleepMin));
      if (d.condition != null) parts.push("컨디션 " + d.condition);
      if (d.meals) parts.push(`식사 ${d.meals.onTime}/${d.meals.recorded}`);
      if (d.exercise) parts.push(d.exercise.did ? `운동 ${d.exercise.minutes}분` : "운동 안 함");
      if (d.probiotic != null) parts.push(d.probiotic ? "유산균 ✓" : "유산균 ✗");
      if (d.symptoms.length) parts.push([...new Set(d.symptoms.flatMap(s => s.value.tags))].map(t => "#" + t).join(" "));
      if (d.date > M.todayIso()) return `<div class="future"><span>${fmtShort(d.date)}</span><span class="dots">아직 오지 않은 날</span><span></span></div>`;
      return `<a href="#today" data-date="${d.date}"><span>${fmtShort(d.date)}</span><span class="dots">${parts.length ? esc(parts.join(" · ")) : "미기록"}</span><span aria-hidden="true">›</span></a>`;
    }).join("")}</div>
  </section>`;

  $("#w-prev").onclick = () => { state.week = prevStart; renderWeek(); };
  $("#w-next").onclick = () => { if (!isThis) { state.week = M.addDays(start, 7); renderWeek(); } };
  $("#w-this").onclick = () => { state.week = M.weekStart(M.todayIso()); renderWeek(); };
  document.querySelectorAll(".days a").forEach(a => a.onclick = () => { state.date = a.dataset.date; });
}

// ---------------- 설정 ----------------
async function renderSettings() {
  const bmi = profile.weightKg / (profile.heightCm / 100) ** 2;
  const range = M.sleepRange(profile.age);
  const perm = Rem.supports.notification ? Notification.permission : "unsupported";
  const permTxt = { granted: "알림 허용됨", denied: "알림이 차단됨 (폰 설정 → 앱/사이트 알림에서 허용)", default: "알림 권한을 아직 묻지 않았어요", unsupported: "이 브라우저는 알림을 지원하지 않아요" }[perm];

  main.innerHTML = `
  <section class="card">
    <div class="card-h"><h2>기본 정보</h2><span class="src">${profile.updatedAt ? "수정 " + esc(profile.updatedAt.slice(0, 10)) : ""}</span></div>
    ${profileFields(profile)}
    <div class="sum"><span>BMI</span><b>${bmi.toFixed(1)}</b></div>
    <button class="btn" id="pf-save">기본 정보 저장</button>
  </section>

  <section class="card">
    <div class="card-h"><h2>추가 정보</h2><span class="src">선택</span></div>
    <label class="field">목표 수면 시간 (시간, 비우면 나이 기준 ${range.min}–${range.max}시간)
      <input id="st-sleep" type="number" inputmode="decimal" step="0.5" min="4" max="12" value="${esc(settings.sleepGoalHours ?? "")}"></label>
    <label class="field">주간 운동 목표 (분, 기본 150분)
      <input id="st-ex" type="number" inputmode="numeric" min="10" max="2000" value="${esc(settings.weeklyExerciseGoal ?? 150)}"></label>
    <button class="btn" id="st-save">추가 정보 저장</button>
  </section>

  <section class="card">
    <div class="card-h"><h2>기록 알림</h2></div>
    ${settings.reminders.map(r => `
      <div class="row">
        <label class="check grow"><input type="checkbox" data-rem-on="${r.id}" ${r.enabled ? "checked" : ""}> ${esc(r.label)} <span class="src">(${r.kinds.map(k => ({ sleep: "수면", condition: "컨디션", meals: "식사", exercise: "운동" })[k]).join("·")})</span></label>
        <input type="time" data-rem-time="${r.id}" value="${r.time}" style="padding:7px 8px;border:1px solid var(--line);border-radius:10px;background:var(--bg)">
      </div>`).join("")}
    <p class="small muted" id="rem-status">${esc(permTxt)}</p>
    <div class="row">
      <button class="btn" id="rem-save">알림 저장</button>
      <button class="btn ghost sm" id="rem-test">테스트 알림</button>
      <button class="btn ghost sm" id="rem-ics">캘린더에 매일 알림 등록</button>
    </div>
    <details><summary>알림이 정확히 오게 하려면</summary>
      <p class="small muted">이 앱은 서버 없이 폰 안에서만 돌아가요. 그래서 앱을 완전히 닫으면 정시 알림을 보장할 수 없어요.</p>
      <ul class="notes">
        <li>앱이 열려 있거나 최근에 쓴 상태면 정한 시각에 알림이 와요. 이미 기록했으면 보내지 않아요.</li>
        <li>홈 화면에 설치하면 크롬이 틈틈이 확인해서 알림을 보내요. 시각은 몇십 분 늦을 수 있어요.</li>
        <li>가장 확실한 방법은 "캘린더에 매일 알림 등록"이에요. 받은 파일을 열어 삼성 캘린더에 추가하면 매일 정시에 울려요.</li>
      </ul>
    </details>
  </section>

  <section class="card">
    <div class="card-h"><h2>내 해시태그</h2><span class="src">직접 추가한 태그</span></div>
    ${["symptom", "cause"].map(k => `<h3>${k === "symptom" ? "증상" : "원인"}</h3>${settings.customTags[k].length
      ? `<div class="chips">${settings.customTags[k].map(t => `<button type="button" data-rmtag="${k}" data-v="${esc(t)}">#${esc(t)} ✕</button>`).join("")}</div>`
      : `<p class="small muted">아직 없어요. 오늘 탭에서 '+ 직접'으로 추가할 수 있어요.</p>`}`).join("")}
    <p class="small muted">태그를 지워도 이미 남긴 기록은 그대로예요.</p>
  </section>

  <section class="card">
    <div class="card-h"><h2>데이터</h2></div>
    <p class="small muted">기록은 이 폰에만 있어요. 폰을 바꾸기 전에 백업 파일을 저장해 두세요.</p>
    <div class="row">
      <button class="btn ghost sm" id="bk-exp">백업 파일 저장</button>
      <label class="btn ghost sm" style="position:relative;overflow:hidden">백업 파일 불러오기<input type="file" id="bk-imp" accept="application/json,.json" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>
    </div>
    <h3>전체 데이터 삭제</h3>
    <p class="small muted">기본 정보·모든 기록·설정이 지워지고 처음 화면으로 돌아가요. 되돌릴 수 없어요.</p>
    <label class="field"><span>확인을 위해 <b>삭제</b>라고 입력하세요</span><input id="wipe-txt" autocomplete="off"></label>
    <button class="btn danger" id="wipe" disabled>전체 데이터 삭제</button>
  </section>

  <section class="card">
    <div class="card-h"><h2>외부 연동</h2><span class="src">2단계</span></div>
    ${INTEGRATIONS.map(i => `
      <div class="integ"><b>${esc(i.name)}</b><span class="st ${i.status === "verified" ? "verified" : ""}">${esc(STATUS_LABEL[i.status])}</span>
        <span class="small muted">필요 조건: ${esc(i.requires.join(" · "))}</span><span class="small muted">${esc(i.note)}</span></div>`).join("")}
  </section>

  <section class="card">
    <h3>이 앱에 대해</h3>
    <p class="small muted">회원가입이 없고 이름·전화번호·이메일을 받지 않아요. 모든 기록은 이 폰의 브라우저 저장소에만 있어요. 개인 습관 기록용이며 의료적 판단을 대신하지 않아요.</p>
    <p class="small muted">버전 1단계 · 데이터 형식 v${M.SCHEMA_VERSION}</p>
  </section>`;

  bindSex();
  $("#pf-save").onclick = async () => { const p = readProfile(); if (!p) return; await DB.saveProfile(p); profile = await DB.getProfile(); toast("기본 정보를 저장했어요."); renderSettings(); };
  document.querySelectorAll("[data-rmtag]").forEach(b => b.onclick = async () => {
    const k = b.dataset.rmtag; settings.customTags[k] = settings.customTags[k].filter(t => t !== b.dataset.v);
    await DB.saveSettings(settings); toast("태그를 지웠어요."); renderSettings();
  });
  $("#st-save").onclick = async () => {
    const sg = $("#st-sleep").value === "" ? null : parseFloat($("#st-sleep").value);
    const eg = parseInt($("#st-ex").value, 10);
    if (sg != null && !(sg >= 4 && sg <= 12)) return toast("목표 수면은 4~12시간으로 넣어 주세요.");
    if (!(eg >= 10)) return toast("주간 운동 목표를 10분 이상으로 넣어 주세요.");
    settings = { ...settings, sleepGoalHours: sg, weeklyExerciseGoal: eg }; await DB.saveSettings(settings); toast("추가 정보를 저장했어요.");
  };

  const readRem = () => settings.reminders.map(r => ({ ...r, enabled: document.querySelector(`[data-rem-on="${r.id}"]`).checked, time: document.querySelector(`[data-rem-time="${r.id}"]`).value || r.time }));
  $("#rem-save").onclick = async () => {
    settings = { ...settings, reminders: readRem() }; await DB.saveSettings(settings);
    let msg = "알림 시간을 저장했어요.";
    if (settings.reminders.some(r => r.enabled)) {
      const p = await Rem.requestPermission();
      if (p !== "granted") msg = "알림 권한이 없어 알림을 보낼 수 없어요. 캘린더 등록을 써 주세요.";
      else { const ps = await Rem.registerPeriodic(); Rem.scheduleInPage(settings.reminders);
        if (ps === "not_installed") msg = "저장했어요. 홈 화면에 설치하면 앱을 닫아도 알림이 더 잘 와요."; }
    }
    toast(msg); renderSettings();
  };
  $("#rem-test").onclick = async () => { const r = await Rem.testNotification(); if (r !== "granted") toast("알림 권한이 없어요. 폰 설정에서 허용해 주세요."); };
  $("#rem-ics").onclick = () => {
    const rs = readRem().filter(r => r.enabled);
    if (!rs.length) return toast("먼저 알림 하나 이상을 켜 주세요.");
    download("bodycheck-reminders.ics", Rem.buildIcs(rs, location.href.split("#")[0]), "text/calendar");
    toast("받은 파일을 열어 캘린더에 추가하세요.");
  };

  $("#bk-exp").onclick = async () => {
    const data = await DB.exportAll();
    download(`bodycheck-backup-${M.todayIso()}.json`, JSON.stringify(data, null, 1), "application/json");
  };
  $("#bk-imp").onchange = async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try { const n = await DB.importAll(JSON.parse(await f.text())); profile = await DB.getProfile(); settings = await DB.getSettings(); toast(`${n}개 기록을 불러왔어요.`); renderSettings(); }
    catch (err) { toast(err.message.includes("JSON") ? "파일을 읽을 수 없어요." : err.message); }
  };
  $("#wipe-txt").oninput = () => { $("#wipe").disabled = $("#wipe-txt").value.trim() !== "삭제"; };
  $("#wipe").onclick = async () => { await DB.deleteEverything(); profile = null; settings = null; location.hash = ""; toast("모든 데이터를 삭제했어요."); route(); };
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type })), a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---------------- 라우팅 ----------------
async function route() {
  profile = await DB.getProfile();
  settings = await DB.getSettings();
  if (!profile) return renderOnboard();
  $("#bar").hidden = false;
  const tab = (location.hash || "#today").slice(1);
  const view = ["today", "week", "settings"].includes(tab) ? tab : "today";
  document.querySelectorAll(".tabs a").forEach(a => { if (a.dataset.tab === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  window.scrollTo(0, 0);
  if (view === "today") await renderToday();
  else if (view === "week") await renderWeek();
  else await renderSettings();
}
window.addEventListener("hashchange", route);
document.addEventListener("visibilitychange", () => { if (!document.hidden && settings) Rem.scheduleInPage(settings.reminders); });

(async () => {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  try { navigator.storage?.persist?.(); } catch (e) {}
  await route();
  if (settings) Rem.scheduleInPage(settings.reminders);
})();
