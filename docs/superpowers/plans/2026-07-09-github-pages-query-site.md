# GitHub Pages 查詢網站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Claude artifact 查詢網頁轉成 GitHub Pages 靜態網站，資料從 repo 內 `csv/*_latest.csv` 動態載入。

**Architecture:** 零 build、零依賴的靜態網站：`index.html`（標記＋樣式）+ `lib.mjs`（純邏輯，Node 可測）+ `app.mjs`（DOM 與事件），ES modules。Pages 從 main branch root 伺服，同源 fetch `csv/`。

**Tech Stack:** Vanilla JS (ES modules)、Node 內建 `node:test`（僅測試用）、GitHub Pages（deploy from branch）。

**Spec:** `docs/superpowers/specs/2026-07-09-github-pages-query-site-design.md`

## Global Constraints

- 零 build、零外部依賴：不得引入 package.json、node_modules、CDN 資源
- CSV 是 UTF-8 with BOM：讀取端必須 strip BOM，**不得**修改 CSV 檔案本身
- 記錄格式沿用 artifact 欄位：`{s:"業"|"架", c:縣市, b:業者, n:品名, bat:批號, e:有效日期}`
- 文案不得暗示資料即時或權威（CLAUDE.md 內容原則）；快照日期不顯示確切日期
- 單次最多渲染 120 筆（`CAP = 120`）
- 搜尋 normalize 規則與 artifact 一致：小寫化並移除 `[\s\-—－.]`
- 色票、字體沿用 artifact（見 Task 2 的 CSS 變數）
- 分享預設文字模板：`幹我吃到癌油了 <關鍵字> <連結>`
- 這些是程式 commit，不用 `data: ` 前綴；結尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 工作目錄即 repo root：`/Users/amikai/Workspace/union-oil-case`

---

### Task 1: lib.mjs 純邏輯模組（TDD）

**Files:**
- Create: `lib.mjs`
- Test: `test/lib.test.mjs`

**Interfaces:**
- Consumes: 無（純函式）
- Produces（Task 3 的 app.mjs 依賴）:
  - `stripBOM(text: string): string`
  - `parseCSV(text: string): string[][]`（含表頭列；處理引號跳脫、CRLF、BOM、忽略空行）
  - `buildRecords(distributorsText: string, withdrawnText: string): Record[]`，`Record = {s,c,b,n,bat,e}` 全為 string
  - `normalize(s: string): string`
  - `filterRecords(records: Record[], q: string, src: "all"|"業"|"架"): Record[]`

- [ ] **Step 1: 寫 parseCSV 的失敗測試**

建立 `test/lib.test.mjs`：

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { stripBOM, parseCSV, buildRecords, normalize, filterRecords } from "../lib.mjs";

test("stripBOM 移除開頭 BOM", () => {
  assert.equal(stripBOM("﻿abc"), "abc");
  assert.equal(stripBOM("abc"), "abc");
});

test("parseCSV 解析基本列與表頭", () => {
  const rows = parseCSV("a,b,c\n1,2,3\n");
  assert.deepEqual(rows, [["a", "b", "c"], ["1", "2", "3"]]);
});

test("parseCSV 處理 BOM 與 CRLF", () => {
  const rows = parseCSV("﻿a,b\r\n1,2\r\n");
  assert.deepEqual(rows, [["a", "b"], ["1", "2"]]);
});

test("parseCSV 處理引號內逗號與跳脫引號", () => {
  const rows = parseCSV('a,b\n"x, y","he said ""hi"""\n');
  assert.deepEqual(rows, [["a", "b"], ["x, y", 'he said "hi"']]);
});

test("parseCSV 忽略空白行", () => {
  const rows = parseCSV("a,b\n1,2\n\n");
  assert.deepEqual(rows, [["a", "b"], ["1", "2"]]);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test test/`
Expected: FAIL（`Cannot find module '../lib.mjs'`）

- [ ] **Step 3: 實作 stripBOM 與 parseCSV**

建立 `lib.mjs`：

```js
export function stripBOM(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function parseCSV(text) {
  const s = stripBOM(text);
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); field = ""; rows.push(row); row = []; }
    else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}
```

- [ ] **Step 4: 執行測試確認 parseCSV 通過**

Run: `node --test test/`
Expected: stripBOM/parseCSV 的 5 個測試 PASS（其餘 import 錯誤是預期，下一步補齊）

註：若因 `buildRecords` 等尚未定義而整檔 import 失敗，先在 `lib.mjs` 底部加最小 stub（`export function buildRecords(){} export function normalize(){} export function filterRecords(){}`），Step 5 起逐一換成真實作。

- [ ] **Step 5: 寫 buildRecords 的失敗測試**

追加到 `test/lib.test.mjs`：

```js
const D_CSV = "﻿序號,縣市,業者,品項,批號,有效日期\n1,基隆市,蔡O彤,益康大豆沙拉油 18L,20270410000407,2027.04.10\n";
const W_CSV = "﻿業者序號,縣市,業者,產品序號,產品名稱,有效日期\n3,基隆市,聯華食品,1,雙蔬鮪魚飯糰,已逾有效日期\n";

test("buildRecords 映射下游業者（含批號）", () => {
  const rec = buildRecords(D_CSV, W_CSV)[0];
  assert.deepEqual(rec, { s: "業", c: "基隆市", b: "蔡O彤", n: "益康大豆沙拉油 18L", bat: "20270410000407", e: "2027.04.10" });
});

test("buildRecords 映射下架產品（產品名稱→n、無批號）", () => {
  const rec = buildRecords(D_CSV, W_CSV)[1];
  assert.deepEqual(rec, { s: "架", c: "基隆市", b: "聯華食品", n: "雙蔬鮪魚飯糰", bat: "", e: "已逾有效日期" });
});

test("buildRecords 跳過欄位不足的列", () => {
  const bad = "序號,縣市,業者,品項,批號,有效日期\n1,只有兩欄\n2,基隆市,業者A,品項B,BAT1,2027.01.01\n";
  const recs = buildRecords(bad, "業者序號,縣市,業者,產品序號,產品名稱,有效日期\n");
  assert.equal(recs.length, 1);
  assert.equal(recs[0].b, "業者A");
});
```

- [ ] **Step 6: 執行測試確認失敗**

Run: `node --test test/`
Expected: buildRecords 的 3 個測試 FAIL

- [ ] **Step 7: 實作 buildRecords**

在 `lib.mjs` 追加（若 Step 4 有 stub 則取代之）：

```js
export function buildRecords(distributorsText, withdrawnText) {
  const records = [];
  for (const r of parseCSV(distributorsText).slice(1)) {
    if (r.length < 6) { console.warn("skip malformed row:", r); continue; }
    records.push({ s: "業", c: r[1], b: r[2], n: r[3], bat: r[4], e: r[5] });
  }
  for (const r of parseCSV(withdrawnText).slice(1)) {
    if (r.length < 6) { console.warn("skip malformed row:", r); continue; }
    records.push({ s: "架", c: r[1], b: r[2], n: r[4], bat: "", e: r[5] });
  }
  return records;
}
```

- [ ] **Step 8: 執行測試確認通過**

Run: `node --test test/`
Expected: 8 個測試 PASS

- [ ] **Step 9: 寫 normalize 與 filterRecords 的失敗測試**

追加到 `test/lib.test.mjs`：

```js
test("normalize 小寫化並移除空白、破折號、句點", () => {
  assert.equal(normalize("C1160426K"), "c1160426k");
  assert.equal(normalize("沙拉油－塑桶 3L"), "沙拉油塑桶3l");
  assert.equal(normalize("2027.04.10"), "20270410");
  assert.equal(normalize(""), "");
});

const RECS = [
  { s: "業", c: "臺北市", b: "福壽實業", n: "沙拉油 18L(福壽)", bat: "C21404260", e: "2027.04.13" },
  { s: "業", c: "臺北市", b: "泰山企業", n: "沙拉油-18L(泰山)", bat: "2027040901", e: "2027.04.09" },
  { s: "架", c: "基隆市", b: "聯華食品", n: "雙蔬鮪魚飯糰", bat: "", e: "已逾有效日期" },
];

test("空查詢回傳全部（僅套用來源篩選）", () => {
  assert.equal(filterRecords(RECS, "", "all").length, 3);
  assert.equal(filterRecords(RECS, "", "架").length, 1);
  assert.equal(filterRecords(RECS, "  ", "業").length, 2);
});

test("關鍵字比對業者+品名+批號", () => {
  assert.equal(filterRecords(RECS, "福壽", "all").length, 1);
  assert.equal(filterRecords(RECS, "c2140", "all").length, 1); // 批號、不分大小寫
  assert.equal(filterRecords(RECS, "飯糰", "all").length, 1);
});

test("多 token 為 AND 條件", () => {
  assert.equal(filterRecords(RECS, "沙拉油 泰山", "all").length, 1);
  assert.equal(filterRecords(RECS, "沙拉油 飯糰", "all").length, 0);
});

test("來源篩選與關鍵字並用", () => {
  assert.equal(filterRecords(RECS, "沙拉油", "架").length, 0);
  assert.equal(filterRecords(RECS, "沙拉油", "業").length, 2);
});
```

- [ ] **Step 10: 執行測試確認失敗**

Run: `node --test test/`
Expected: 新增 5 個測試 FAIL

- [ ] **Step 11: 實作 normalize 與 filterRecords**

在 `lib.mjs` 追加：

```js
export function normalize(s) {
  return (s || "").toLowerCase().replace(/[\s\-—－.]/g, "");
}

export function filterRecords(records, q, src) {
  const toks = (q || "").split(/\s+/).map(normalize).filter(Boolean);
  const out = [];
  for (const r of records) {
    if (src !== "all" && r.s !== src) continue;
    if (toks.length) {
      const hay = normalize(r.b + r.n + r.bat);
      if (!toks.every((t) => hay.includes(t))) continue;
    }
    out.push(r);
  }
  return out;
}
```

- [ ] **Step 12: 執行全部測試確認通過**

Run: `node --test test/`
Expected: 13 個測試全 PASS

- [ ] **Step 13: 用真實 CSV 冒煙測試**

Run: `node -e "import('./lib.mjs').then(async (m) => { const fs = await import('node:fs'); const d = fs.readFileSync('csv/downstream_distributors_latest.csv','utf8'); const w = fs.readFileSync('csv/withdrawn_products_latest.csv','utf8'); const r = m.buildRecords(d, w); console.log('total', r.length, '業', r.filter(x=>x.s==='業').length, '架', r.filter(x=>x.s==='架').length, 'sample', JSON.stringify(r[0])); })"`
Expected: `total 924 業 523 架 401`，sample 的欄位對應正確（c=縣市、b=業者、bat 為批號）

- [ ] **Step 14: Commit**

```bash
git add lib.mjs test/lib.test.mjs
git commit -m "feat: add CSV parsing and record filtering logic for query site

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: index.html 靜態外殼

**Files:**
- Create: `index.html`

**Interfaces:**
- Consumes: 無
- Produces（Task 3-6 的 app.mjs 依賴這些 DOM id/attr）:
  - `#total`、`#total2`（筆數 span）、`#q`（搜尋 input）、`#clearBtn`、`#micBtn`、`#listenHint`
  - `[data-src]` 按鈕（值 `all`/`架`/`業`）、`[data-kw]` 按鈕
  - `#errorBox`、`#results`、`#srcToggle`、`#srcChev`、`#srcPanel`、`#toast`
  - 載入 `<script type="module" src="./app.mjs"></script>`（Task 3 才建立該檔，此前瀏覽器 console 會有 404，屬預期）

- [ ] **Step 1: 建立完整 index.html**

```html
<!DOCTYPE html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>問題油品查詢｜中聯油脂案</title>
<meta name="description" content="輸入業者、品名或批號，即時比對食藥署中聯油脂案官方清單。非官方整理，請以官方公告為準。">
<meta property="og:title" content="問題油品查詢｜中聯油脂案">
<meta property="og:description" content="輸入業者、品名或批號，即時比對食藥署官方清單。查無不代表安全，請以官方公告為準。">
<meta property="og:type" content="website">
<meta property="og:url" content="https://amikai.github.io/union-oil-case/">
<style>
:root{
  --bg:#EDF0F1; --surface:#FFFFFF; --ink:#16211E; --sub:#5B6866; --line:#DEE3E3;
  --pine:#0E5C4C; --amber:#B5730A; --amber-bg:#FDF2DC; --amber-line:#F3D9A0;
  --danger:#B42318; --danger-bg:#FCEBE9;
  --font-cjk:-apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC","Microsoft JhengHei","Heiti TC",sans-serif;
  --font-mono:"SF Mono","JetBrains Mono","Roboto Mono",ui-monospace,Menlo,monospace;
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0}
body{min-height:100vh;background:var(--bg);font-family:var(--font-cjk);color:var(--ink);-webkit-text-size-adjust:100%}
button{font-family:var(--font-cjk);cursor:pointer}
input{font-family:var(--font-cjk)}
input:focus{outline:none}
.wrap{max-width:480px;margin:0 auto;padding-bottom:calc(28px + env(safe-area-inset-bottom))}
.top{position:sticky;top:0;z-index:20;background:var(--bg);padding-top:calc(14px + env(safe-area-inset-top));box-shadow:0 6px 12px -12px rgba(0,0,0,.25)}
.head{padding:0 16px 10px}
.head h1{margin:0;font-size:21px;font-weight:800;letter-spacing:-.01em;display:flex;align-items:center;gap:9px}
.head h1 .oil{font-size:26px;line-height:1}
.head p{margin:5px 0 0;font-size:12.5px;color:var(--sub);line-height:1.5}
.searchrow{padding:0 16px 12px}
.searchwrap{display:flex;align-items:center;gap:8px;background:var(--surface);border:1.5px solid var(--line);border-radius:14px;padding:0 8px 0 14px;height:52px;transition:border-color .15s,box-shadow .15s}
.searchwrap:focus-within{border-color:var(--pine);box-shadow:0 0 0 3px rgba(14,92,76,.13)}
.searchwrap input{flex:1;border:none;background:transparent;font-size:16px;color:var(--ink);min-width:0;height:100%}
::placeholder{color:var(--sub);opacity:.8}
.iconbtn{width:30px;height:30px;border:none;background:transparent;border-radius:8px;display:grid;place-items:center;padding:0;font-size:15px;color:var(--sub)}
.micbtn{width:40px;height:40px;border:none;border-radius:11px;background:var(--pine);display:grid;place-items:center;padding:0;flex-shrink:0;font-size:18px}
.micbtn.listening{background:var(--danger);animation:pulse 1s infinite}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08);opacity:.8}}
#listenHint{font-size:12px;color:var(--danger);margin:7px 4px 0;font-weight:600}
.chips{display:flex;gap:8px;overflow-x:auto;padding:0 16px 12px;scrollbar-width:none}
.chips::-webkit-scrollbar{display:none}
.chip{flex-shrink:0;height:32px;padding:0 14px;border-radius:999px;font-size:13px;font-weight:600;border:1.5px solid var(--line);background:var(--surface);color:var(--sub);transition:all .12s}
.chip:active{transform:scale(.94)}
.chip[data-src]{font-weight:700;color:var(--ink)}
.chip.on{border-color:var(--pine);background:var(--pine);color:#fff}
.chips .divider{width:1px;background:var(--line);flex-shrink:0;margin:6px 2px}
.banner{margin:4px 16px 0;background:var(--amber-bg);border:1px solid var(--amber-line);border-radius:12px;padding:11px 13px;display:flex;gap:9px}
.banner p{margin:0;font-size:12px;color:var(--amber);line-height:1.6;font-weight:500}
#errorBox{margin:10px 16px 0;background:var(--danger-bg);border:1px solid rgba(180,35,24,.2);border-radius:10px;padding:10px 12px;font-size:12.5px;color:var(--danger);font-weight:600}
#results{padding:14px 16px 0}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;animation:rise .24s cubic-bezier(.2,.7,.3,1) both}
@keyframes rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.card{animation:none}}
.hit{border-left:4px solid var(--danger);padding:13px 14px;margin-bottom:10px;box-shadow:0 1px 2px rgba(16,33,30,.04)}
.hit-top{display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap}
.tag{font-size:11.5px;font-weight:800;border-radius:6px;padding:1px 7px}
.city{font-size:11.5px;color:var(--sub)}
.biz{font-size:15px;font-weight:800;line-height:1.4}
.prod{font-size:13.5px;color:var(--ink);margin-top:2px;line-height:1.5}
.meta{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--sub);margin-top:6px}
.mono{font-family:var(--font-mono)}
.expired{color:var(--danger)}
.res-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:8px}
.res-count{font-size:13px;font-weight:700;color:var(--danger)}
.res-sub{font-size:11px;color:var(--sub)}
.capnote{text-align:center;font-size:12px;color:var(--sub);padding:6px 0 4px}
.rest{text-align:center;padding:36px 8px 8px}
.rest-icon{font-size:34px}
.rest-title{font-size:16px;font-weight:800;margin-top:10px}
.rest-sub{font-size:13px;color:var(--sub);line-height:1.7;margin:8px 0 0}
.ghost{margin-top:12px;height:36px;padding:0 16px;border-radius:10px;border:1.5px solid var(--line);background:var(--surface);color:var(--ink);font-weight:700;font-size:13px}
.share{width:100%;height:44px;border:1.5px solid var(--pine);background:var(--surface);color:var(--pine);border-radius:12px;font-weight:700;font-size:14px;margin-bottom:12px}
.share:active{transform:scale(.985)}
.sources{padding:20px 16px 0}
.sources>button{width:100%;display:flex;align-items:center;justify-content:space-between;background:transparent;border:none;padding:8px 2px;font-size:14px;font-weight:800;color:var(--ink)}
#srcChev{transition:transform .2s;color:var(--sub)}
#srcChev.open{transform:rotate(180deg)}
#srcPanel{padding:6px 4px;margin-top:6px}
#srcPanel a{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;border-bottom:1px solid var(--line);text-decoration:none}
#srcPanel a:last-of-type{border-bottom:none}
#srcPanel a span:first-child{font-size:13.5px;color:var(--pine);font-weight:600;line-height:1.4}
#srcPanel a span:last-child{flex-shrink:0;font-size:10.5px;color:var(--sub);border:1px solid var(--line);border-radius:6px;padding:1px 6px}
.srcnote{font-size:11.5px;color:var(--sub);line-height:1.65;padding:11px 12px 6px}
.scope{padding:18px 16px 0}
.scope div{background:var(--amber-bg);border:1px dashed rgba(181,115,10,.4);border-radius:10px;padding:11px 13px;font-size:11px;color:var(--amber);line-height:1.7}
.scope a{color:var(--amber)}
#toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%);background:var(--ink);color:#fff;font-size:13px;font-weight:600;border-radius:10px;padding:10px 16px;z-index:50;max-width:90vw}
[hidden]{display:none !important}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div class="head">
      <h1><span class="oil">🛢️</span>問題油品查詢</h1>
      <p>2026 中聯油脂大豆沙拉油「苯駢芘」致癌物超標事件 · 輸入業者／品名／批號即時比對，涵蓋 <span id="total">—</span> 筆官方清單</p>
    </div>
    <div class="searchrow">
      <div class="searchwrap">
        <span aria-hidden="true">🔍</span>
        <input id="q" inputmode="search" enterkeyhint="search" placeholder="業者、品名、批號… 例如 C1160426K、聯華、飯糰">
        <button id="clearBtn" class="iconbtn" aria-label="清除" hidden>✕</button>
        <button id="micBtn" class="micbtn" aria-label="語音輸入">🎙️</button>
      </div>
      <div id="listenHint" hidden>聆聽中… 說出業者或品名（點麥克風可停止）</div>
    </div>
    <div class="chips">
      <button class="chip on" data-src="all">全部清單</button>
      <button class="chip" data-src="架">預防性下架</button>
      <button class="chip" data-src="業">下游業者</button>
      <div class="divider"></div>
      <button class="chip" data-kw="泰山">泰山</button>
      <button class="chip" data-kw="福壽">福壽</button>
      <button class="chip" data-kw="益康">益康</button>
      <button class="chip" data-kw="聯華">聯華</button>
      <button class="chip" data-kw="沙拉油">沙拉油</button>
      <button class="chip" data-kw="飯糰">飯糰</button>
      <button class="chip" data-kw="沙拉醬">沙拉醬</button>
      <button class="chip" data-kw="便當">便當</button>
    </div>
  </div>

  <div class="banner">
    <span style="font-size:15px;line-height:1.4">⚠️</span>
    <p>資料隨官方公告更新，<b>非即時</b>。<b>「查無」不代表安全</b>——請以桶身<b>批號</b>及官方公告為準。資料整理與歷史紀錄見 <a href="https://github.com/amikai/union-oil-case" style="color:var(--amber)">GitHub</a>。</p>
  </div>

  <div id="errorBox" hidden></div>
  <div id="results"></div>

  <div class="sources">
    <button id="srcToggle">📄 官方資料來源與品牌公告 <span id="srcChev">▼</span></button>
    <div id="srcPanel" class="card" hidden>
      <a href="https://www.fda.gov.tw/tc/site.aspx?sid=13702" target="_blank" rel="noopener noreferrer"><span>食藥署 中聯油脂案專區</span><span>官方</span></a>
      <a href="https://www.fda.gov.tw/tc/includes/GetFile.ashx?id=t408966" target="_blank" rel="noopener noreferrer"><span>① 食藥署 下游業者清單 PDF</span><span>PDF</span></a>
      <a href="https://www.fda.gov.tw/tc/includes/GetFile.ashx?id=f639191200225589880&type=3&iid=13719" target="_blank" rel="noopener noreferrer"><span>② 食藥署 預防性下架產品清單 PDF</span><span>PDF</span></a>
      <a href="https://www.fda.gov.tw/tc/includes/GetFile.ashx?id=f639191201690713353&type=3&iid=13717" target="_blank" rel="noopener noreferrer"><span>③ 食藥署 下游流向圖 PDF</span><span>PDF</span></a>
      <a href="https://www.taichung.gov.tw/media/1433275/%E6%B2%B9%E5%93%81%E5%93%81%E9%A0%85.pdf" target="_blank" rel="noopener noreferrer"><span>④ 台中市食安處 油品品項清單 PDF</span><span>PDF</span></a>
      <a href="https://www.fda.gov.tw/tc/siteList.aspx?sid=13708" target="_blank" rel="noopener noreferrer"><span>下游業者清單頁</span><span>官方</span></a>
      <a href="https://www.taisun.com.tw/260702/" target="_blank" rel="noopener noreferrer"><span>泰山聲明</span><span>品牌</span></a>
      <a href="https://www.fwusow.com.tw/index.php/news/item/2306" target="_blank" rel="noopener noreferrer"><span>福壽聲明</span><span>品牌</span></a>
      <a href="https://www.fopco.com.tw/News_Detail.php?ADKey=1&CataP=378" target="_blank" rel="noopener noreferrer"><span>福懋聲明</span><span>品牌</span></a>
      <div class="srcnote">原料油批號 <b class="mono" style="color:var(--ink)">315-1150404</b>。退貨客服：泰山 0800-079080、福壽 0800-236699、福懋 0800-888255；消費爭議打 1950。<br>苯駢芘為 IARC 第一類致癌物，風險來自長期累積；短期食用無須恐慌，重點是停用問題批號、飲食均衡。</div>
    </div>
  </div>

  <div class="scope">
    <div><b>⚠ 資料範圍</b>：本頁 <b id="total2">—</b> 筆彙整自食藥署兩份官方清單——「下游業者清單」（含品項＋批號）與「預防性下架產品清單」（產品名稱）。<b>本案滾動更新</b>，完整/最新版本請以上方官方 PDF 為準。搜尋僅比對業者、品名、批號；<b>查無不代表安全</b>。本站為非官方整理，資料來源與更新紀錄見 <a href="https://github.com/amikai/union-oil-case">GitHub repo</a>。</div>
  </div>
</div>
<div id="toast" hidden></div>
<script type="module" src="./app.mjs"></script>
</body>
</html>
```

- [ ] **Step 2: 本地伺服驗證靜態外殼**

Run: `python3 -m http.server 8788 >/dev/null 2>&1 & sleep 1 && curl -s http://localhost:8788/ | grep -c '問題油品查詢\|data-src\|srcPanel'`
Expected: 輸出 `3` 以上（標題、來源按鈕、資料來源面板都存在）

再以瀏覽器開 `http://localhost:8788/` 目視確認：sticky 頂部、搜尋框、chips 橫向捲動、黃色警語、來源折疊區塊（此時 JS 尚未存在，`app.mjs` 404 與互動無反應屬預期）。

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add static shell for query site

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: app.mjs 資料載入與渲染

**Files:**
- Create: `app.mjs`

**Interfaces:**
- Consumes: `lib.mjs` 的 `buildRecords`、`filterRecords`；Task 2 的 DOM id
- Produces（Task 4-6 依賴）: `state = {q, src, records}`、`render()`、`escapeHtml(s)`、模組層級的 `init()` 結構（後續任務在其中加事件掛載）

- [ ] **Step 1: 建立 app.mjs**

```js
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
    ${shown.map(hitCard).join("")}
    ${results.length > CAP ? `<div class="capnote">還有 ${results.length - CAP} 筆，請輸入更精確的業者或批號縮小範圍。</div>` : ""}
  `;
}

function init() {
  loadData();
}

init();

export { state, render, escapeHtml };
```

- [ ] **Step 2: 本地驗證載入與初始畫面**

Run: `curl -s http://localhost:8788/app.mjs | head -3`（若 http.server 已停，重新啟動：`python3 -m http.server 8788 >/dev/null 2>&1 &`）
Expected: 輸出 import 行

以瀏覽器開 `http://localhost:8788/`，確認：
1. 副標顯示「涵蓋 924 筆官方清單」（非 `—`）
2. 初始畫面為「查查你買的東西中鏢了沒」
3. console 無錯誤（`app.mjs` 404 已消失）

- [ ] **Step 3: 驗證錯誤處理**

以瀏覽器開 `http://localhost:8788/?x=1` 並在 DevTools Network 面板 block `*.csv`（或暫時把 `loadData` 內網址改成不存在的檔名重整一次再改回來），確認 `#errorBox` 顯示紅色錯誤訊息。

- [ ] **Step 4: Commit**

```bash
git add app.mjs
git commit -m "feat: load CSVs and render query results

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 搜尋互動、來源篩選與 ?q= 深連結

**Files:**
- Modify: `app.mjs`

**Interfaces:**
- Consumes: Task 3 的 `state`/`render`、Task 2 的 `#q`/`#clearBtn`/`[data-src]`/`[data-kw]`/`#srcToggle`/`#srcPanel`/`#toast`
- Produces（Task 5-6 依賴）: `setQuery(v: string)`、`clearAll()`、`showToast(msg: string)`、`wireEvents()`（Task 6 在 `#results` 的既有 click 委派中加分支）

- [ ] **Step 1: 加入互動函式**

在 `app.mjs` 的 `function init()` 之前加入：

```js
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

function wireEvents() {
  el("q").addEventListener("input", (e) => setQuery(e.target.value));
  el("clearBtn").addEventListener("click", clearAll);
  document.querySelectorAll("[data-src]").forEach((b) =>
    b.addEventListener("click", () => { state.src = b.dataset.src; setQuery(state.q); }));
  document.querySelectorAll("[data-kw]").forEach((b) =>
    b.addEventListener("click", () => setQuery(b.dataset.kw)));
  el("results").addEventListener("click", (e) => {
    if (e.target.closest("#clearEmpty")) clearAll();
  });
  el("srcToggle").addEventListener("click", () => {
    const p = el("srcPanel");
    p.hidden = !p.hidden;
    el("srcChev").classList.toggle("open", !p.hidden);
  });
}
```

- [ ] **Step 2: init 讀取 ?q= 並掛載事件**

把 `function init() { loadData(); }` 改成：

```js
function init() {
  const q0 = new URLSearchParams(location.search).get("q") || "";
  state.q = q0;
  el("q").value = q0;
  el("clearBtn").hidden = !q0;
  wireEvents();
  loadData();
}
```

- [ ] **Step 3: 瀏覽器驗證互動**

開 `http://localhost:8788/` 逐項確認：
1. 打「福壽」→ 即時出現結果卡片，網址列變成 `?q=福壽`
2. 點「預防性下架」chip → 結果只剩 `架` 來源，chip 變綠
3. 點快選「飯糰」→ 搜尋框帶入且有結果
4. 打不存在的字串（如 `zzzz`）→ 顯示「查無」畫面，點「清除條件」回到初始
5. 直接開 `http://localhost:8788/?q=C1160426K` → 開頁即顯示該批號的結果
6. 點「官方資料來源」→ 面板展開/收合
7. 清除鈕 ✕：有輸入時顯示、按下全部重置

- [ ] **Step 4: 執行單元測試確認未破壞**

Run: `node --test test/`
Expected: 13 個測試 PASS

- [ ] **Step 5: Commit**

```bash
git add app.mjs
git commit -m "feat: wire search, source filter, and ?q= deep link

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 語音輸入

**Files:**
- Modify: `app.mjs`

**Interfaces:**
- Consumes: Task 4 的 `setQuery`、`showToast`；Task 2 的 `#micBtn`/`#listenHint`
- Produces: `wireVoice()`（init 呼叫）

- [ ] **Step 1: 加入 wireVoice**

在 `wireEvents` 函式之後加入：

```js
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
```

並在 `init()` 的 `wireEvents();` 之後加一行 `wireVoice();`。

- [ ] **Step 2: 瀏覽器驗證**

開 `http://localhost:8788/`：
1. 點麥克風 → 按鈕變紅、出現「聆聽中…」提示（localhost 視為 secure context，可要求麥克風權限）
2. 再點一次 → 停止聆聽、樣式復原
3. 若環境無法給麥克風權限，至少確認拒絕權限時跳出 toast 錯誤訊息而非 console 例外

- [ ] **Step 3: Commit**

```bash
git add app.mjs
git commit -m "feat: add voice input via Web Speech API

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 社群分享按鈕

**Files:**
- Modify: `app.mjs`

**Interfaces:**
- Consumes: Task 4 的 `showToast`、`state`；Task 3 的 `render`
- Produces: `share()`；results 區的 `#shareBtn`

- [ ] **Step 1: 加入 share 函式**

在 `showToast` 函式之後加入：

```js
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
```

- [ ] **Step 2: render 加入分享按鈕、click 委派加分支**

`render()` 內結果區的 template 改為（只在有關鍵字時顯示按鈕）：

```js
  box.innerHTML = `
    <div class="res-head">
      <span class="res-count">找到 ${results.length} 筆</span>
      <span class="res-sub">下架 ${j}・業者 ${y}</span>
    </div>
    ${q.trim() ? `<button id="shareBtn" class="share">📣 分享查詢結果</button>` : ""}
    ${shown.map(hitCard).join("")}
    ${results.length > CAP ? `<div class="capnote">還有 ${results.length - CAP} 筆，請輸入更精確的業者或批號縮小範圍。</div>` : ""}
  `;
```

`wireEvents()` 內 `#results` 的 click 監聽改為：

```js
  el("results").addEventListener("click", (e) => {
    if (e.target.closest("#clearEmpty")) clearAll();
    if (e.target.closest("#shareBtn")) share();
  });
```

- [ ] **Step 3: 瀏覽器驗證**

開 `http://localhost:8788/?q=福壽`：
1. 結果上方出現「📣 分享查詢結果」
2. 點擊：支援 Web Share 的環境開系統分享面板（文字含「幹我吃到癌油了 福壽」與 `?q=福壽` 連結）；不支援的環境跳 toast「已複製」，貼上驗證剪貼簿內容為 `幹我吃到癌油了 福壽 http://localhost:8788/?q=福壽`
3. 只選來源篩選、無關鍵字時（`?q=` 為空）不顯示分享按鈕

- [ ] **Step 4: 執行單元測試確認未破壞**

Run: `node --test test/`
Expected: 13 個測試 PASS

- [ ] **Step 5: Commit**

```bash
git add app.mjs
git commit -m "feat: add social share button with Web Share API and clipboard fallback

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 清理與 README

**Files:**
- Delete: `food-safety-check.jsx`（未曾 commit 的 artifact 原始碼）
- Modify: `README.md`

**Interfaces:**
- Consumes: 無
- Produces: 無

- [ ] **Step 1: 刪除 artifact 原始碼**

Run: `rm food-safety-check.jsx && git status --short`
Expected: 不再出現 `?? food-safety-check.jsx`

- [ ] **Step 2: README 加上網站連結**

把 README 開頭段落：

```markdown
秉持開放資料（Open Data）精神，將中聯油脂案的官方 PDF 公告轉成結構化、易於存取與再利用的 CSV，降低民眾與開發者查詢的門檻。
```

改為：

```markdown
秉持開放資料（Open Data）精神，將中聯油脂案的官方 PDF 公告轉成結構化、易於存取與再利用的 CSV，降低民眾與開發者查詢的門檻。

**查詢網站**：<https://amikai.github.io/union-oil-case/>（輸入業者／品名／批號即時比對，支援 `?q=關鍵字` 深連結）
```

- [ ] **Step 3: 停掉本地伺服器**

Run: `kill %1 2>/dev/null; pkill -f "http.server 8788" 2>/dev/null; true`
Expected: 無輸出（伺服器已停）

- [ ] **Step 4: Commit 並 push**

```bash
git add README.md
git commit -m "docs: add query site link to README

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
```

---

### Task 8: 開啟 GitHub Pages 與線上驗證

**Files:** 無（GitHub 設定操作）

**Interfaces:**
- Consumes: Task 7 已 push 的 main branch
- Produces: `https://amikai.github.io/union-oil-case/` 上線

- [ ] **Step 1: 開啟 Pages（main / root）**

Run: `gh api -X POST repos/amikai/union-oil-case/pages --input - <<< '{"source":{"branch":"main","path":"/"}}'`
Expected: HTTP 201，回傳 JSON 含 `"html_url": "https://amikai.github.io/union-oil-case/"`
若回 409（已開啟過）改用：`gh api repos/amikai/union-oil-case/pages --jq '.html_url,.status'` 確認現況即可。

- [ ] **Step 2: 等待建置完成**

Run: `for i in $(seq 1 12); do s=$(gh api repos/amikai/union-oil-case/pages --jq .status); echo "$i: $s"; [ "$s" = "built" ] && break; sleep 15; done`
Expected: 幾輪之內出現 `built`（首次建置通常 1-3 分鐘）

- [ ] **Step 3: 線上冒煙測試**

Run: `curl -s https://amikai.github.io/union-oil-case/ | grep -c "問題油品查詢" && curl -s https://amikai.github.io/union-oil-case/csv/withdrawn_products_latest.csv | head -c 60`
Expected: 第一個指令輸出 ≥1；第二個輸出 CSV 表頭（含 BOM 與 `業者序號,縣市,業者`）

- [ ] **Step 4: 線上瀏覽器驗證**

以瀏覽器開下列網址逐一確認：
1. `https://amikai.github.io/union-oil-case/` → 初始畫面、筆數 924
2. `https://amikai.github.io/union-oil-case/?q=福壽` → 開頁即有結果與分享按鈕
3. 手機寬度（DevTools device emulation 375px）→ 版面不破版、chips 可橫向捲動

- [ ] **Step 5: 回報**

完成後告知使用者：網站網址、`?q=` 用法，以及 `amikai.org/food-safe` redirect 可改指到 Pages URL（由使用者自行在 Cloudflare 操作）。

---

## Self-Review 紀錄

- **Spec coverage**：資料流（Task 1、3）、搜尋/篩選/chips（Task 4）、語音（Task 5）、分享＋OG（Task 2 OG tags、Task 6 按鈕）、`?q=` 深連結（Task 4）、錯誤處理（Task 3）、移除拍照辨識（重寫本來就不含）、刪 jsx 與 README（Task 7）、Pages 部署與線上驗證（Task 8）——全數對應
- **Placeholder scan**：無 TBD/TODO；所有程式碼步驟皆附完整程式碼
- **Type consistency**：`Record {s,c,b,n,bat,e}`、`filterRecords(records, q, src)`、`setQuery(v)`、`showToast(msg)`、`share()` 各任務間命名一致；`showToast` 定義於 Task 4、使用於 Task 5/6，無前向引用
