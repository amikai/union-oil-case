import { buildRecords, filterRecords } from "./lib.mjs";

const CAP = 120;
const SRC_META = {
  業: { label: "下游業者清單", color: "#0E5C4C", bg: "#E7F1EE" },
  架: { label: "預防性下架", color: "#B5730A", bg: "#FDF2DC" },
};

const el = (id) => document.getElementById(id);
const state = { q: "", src: "all", records: [] };

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function loadData() {
  try {
    const [d, w] = await Promise.all([
      fetch("csv/downstream_distributors_latest.csv").then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); }),
      fetch("csv/withdrawn_products_latest.csv").then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); }),
    ]);
    state.records = buildRecords(d, w);
    el("total").textContent = state.records.length;
    el("total2").textContent = state.records.length;
    render();
  } catch (err) {
    console.error("CSV 載入失敗", err);
    el("errorBox").textContent = "資料載入失敗，請重新整理頁面；或改查下方「官方資料來源」的官方 PDF。";
    el("errorBox").hidden = false;
  }
}

function hitCard(r) {
  const m = SRC_META[r.s];
  const expired = /逾|過/.test(r.e);
  return `<div class="card hit">
    <div class="hit-top">
      <span class="tag" style="color:${m.color};background:${m.bg}">${m.label}</span>
      <span class="city">${escapeHtml(r.c)}</span>
    </div>
    <div class="biz">${escapeHtml(r.b)}</div>
    <div class="prod">${escapeHtml(r.n)}</div>
    <div class="meta">
      ${r.bat ? `<span>批號 <b class="mono">${escapeHtml(r.bat)}</b></span>` : ""}
      <span>有效日期 <b class="${expired ? "expired" : ""}">${escapeHtml(r.e)}</b></span>
    </div>
  </div>`;
}

function render() {
  const { q, src, records } = state;
  document.querySelectorAll("[data-src]").forEach((b) => b.classList.toggle("on", b.dataset.src === src));
  const box = el("results");
  if (!records.length) { box.innerHTML = ""; return; }

  const active = q.trim().length > 0 || src !== "all";
  if (!active) {
    box.innerHTML = `<div class="rest">
      <div class="rest-icon">🔍</div>
      <div class="rest-title">查查你買的東西中鏢了沒</div>
      <p class="rest-sub">打字即時比對業者／品名／批號，或點麥克風用說的。<br>目前收錄 <b>${records.length}</b> 筆官方清單品項。</p>
    </div>`;
    return;
  }

  const results = filterRecords(records, q, src);
  if (!results.length) {
    box.innerHTML = `<div class="rest">
      <div class="rest-icon">✅</div>
      <div class="rest-title">查無「${escapeHtml(q.trim())}」相關品項</div>
      <p class="rest-sub">查無不代表安全——請改用桶身批號再查一次，並以官方公告為準。</p>
      <button id="clearEmpty" class="ghost">清除條件</button>
    </div>`;
    return;
  }

  let y = 0, j = 0;
  for (const r of results) r.s === "業" ? y++ : j++;
  const shown = results.slice(0, CAP);
  box.innerHTML = `
    <div class="res-head">
      <span class="res-count">找到 ${results.length} 筆</span>
      <span class="res-sub">下架 ${j}・業者 ${y}</span>
    </div>
    ${q.trim() ? `<button id="shareBtn" class="share">📣 分享查詢結果</button>` : ""}
    ${shown.map(hitCard).join("")}
    ${results.length > CAP ? `<div class="capnote">還有 ${results.length - CAP} 筆，請輸入更精確的業者或批號縮小範圍。</div>` : ""}
  `;
}

function syncURL() {
  const u = new URL(location.href);
  if (state.q.trim()) u.searchParams.set("q", state.q.trim());
  else u.searchParams.delete("q");
  history.replaceState(null, "", u);
}

function setQuery(v) {
  state.q = v;
  if (el("q").value !== v) el("q").value = v;
  el("clearBtn").hidden = !(v || state.src !== "all");
  syncURL();
  render();
}

function clearAll() {
  state.src = "all";
  setQuery("");
}

function showToast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { t.hidden = true; }, 2600);
}

async function share() {
  const kw = state.q.trim();
  const u = new URL(location.origin + location.pathname);
  u.searchParams.set("q", kw);
  const text = `幹我吃到癌油了 ${kw}`;
  if (navigator.share) {
    try { await navigator.share({ text, url: u.toString() }); } catch {}
  } else if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(`${text} ${u}`);
      showToast("已複製，貼給朋友吧");
    } catch { showToast("複製失敗，請手動複製網址列"); }
  } else {
    showToast("此瀏覽器不支援分享，請手動複製網址列");
  }
}

function wireEvents() {
  el("q").addEventListener("input", (e) => setQuery(e.target.value));
  el("clearBtn").addEventListener("click", clearAll);
  document.querySelectorAll("[data-src]").forEach((b) =>
    b.addEventListener("click", () => { state.src = b.dataset.src; setQuery(state.q); }));
  document.querySelectorAll("[data-kw]").forEach((b) =>
    b.addEventListener("click", () => setQuery(b.dataset.kw)));
  el("results").addEventListener("click", (e) => {
    if (e.target.closest("#clearEmpty")) clearAll();
    if (e.target.closest("#shareBtn")) share();
  });
  el("srcToggle").addEventListener("click", () => {
    const p = el("srcPanel");
    p.hidden = !p.hidden;
    el("srcChev").classList.toggle("open", !p.hidden);
  });
}

let recognizing = null;

function wireVoice() {
  const mic = el("micBtn");
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  mic.addEventListener("click", () => {
    if (!R) { showToast("此瀏覽器不支援語音輸入，請改用 Chrome 或 Safari。"); return; }
    if (recognizing) { recognizing.stop(); return; }
    const rec = new R();
    rec.lang = "zh-TW";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onstart = () => { recognizing = rec; mic.classList.add("listening"); el("listenHint").hidden = false; };
    rec.onresult = (e) => {
      let fin = "", int = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        e.results[i].isFinal ? (fin += t) : (int += t);
      }
      if (int) el("q").value = int;
      if (fin) setQuery(fin.trim());
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") showToast("麥克風權限被拒絕，請在瀏覽器設定開啟。");
      else if (e.error !== "aborted") showToast("語音辨識發生問題，請再試一次。");
    };
    rec.onend = () => { recognizing = null; mic.classList.remove("listening"); el("listenHint").hidden = true; };
    try { rec.start(); } catch {}
  });
}

function init() {
  const q0 = new URLSearchParams(location.search).get("q") || "";
  state.q = q0;
  el("q").value = q0;
  el("clearBtn").hidden = !q0;
  wireEvents();
  wireVoice();
  loadData();
}

init();

export { state, render, escapeHtml };
