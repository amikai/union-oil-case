# 語音輸入改善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 語音查詢邊講邊出結果（interim 即時搜尋），定稿時用多候選聽寫反查名單救回辨識錯誤。

**Architecture:** 反查邏輯是純函式 `pickBestCandidate`，放 `lib.mjs`（Node 可測）；`app.mjs` 的 `wireVoice` 只改 `onresult` 的行為與 `maxAlternatives` 設定。零新依賴。

**Tech Stack:** Vanilla JS (ES modules)、Web Speech API、`node --test`。

**Spec:** `docs/superpowers/specs/2026-07-09-voice-input-improvements-design.md`

## Global Constraints

- 零 build、零外部依賴
- 反查範圍固定用全部資料：`filterRecords(records, candidate, "all")`，不受當前來源篩選影響
- 反查只在定稿（final）執行；interim 直接觸發搜尋、不反查
- 全部候選查無時退回第一候選（與現狀行為一致）；候選空陣列回傳 `""`
- 靜音計時器（4 秒）與現有錯誤處理（not-allowed / no-speech / 其他）不得改動
- 程式 commit 不用 `data: ` 前綴；結尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 工作目錄即 repo root：`/Users/amikai/Workspace/union-oil-case`
- 測試指令用 `node --test test/*.mjs`（此 Node 版本對目錄參數解析有問題）

---

### Task 1: lib.mjs 新增 pickBestCandidate（TDD）

**Files:**
- Modify: `lib.mjs`（檔尾追加）
- Test: `test/lib.test.mjs`（檔尾追加）

**Interfaces:**
- Consumes: `filterRecords(records, q, src)`（同檔既有）
- Produces（Task 2 依賴）: `pickBestCandidate(records: Record[], candidates: string[]): string`

- [ ] **Step 1: 寫失敗測試**

追加到 `test/lib.test.mjs`（檔內已有 `RECS` 測試資料，直接沿用；`pickBestCandidate` 需加入檔頭的 import 清單）：

```js
test("pickBestCandidate 第一候選查無時取第二候選", () => {
  assert.equal(pickBestCandidate(RECS, ["複數", "福壽"]), "福壽");
});

test("pickBestCandidate 第一候選命中就直接用", () => {
  assert.equal(pickBestCandidate(RECS, ["泰山", "福壽"]), "泰山");
});

test("pickBestCandidate 全部查無退回第一候選", () => {
  assert.equal(pickBestCandidate(RECS, ["統一", "義美"]), "統一");
});

test("pickBestCandidate 空陣列回傳空字串", () => {
  assert.equal(pickBestCandidate(RECS, []), "");
});
```

並把檔頭 import 改為：

```js
import { stripBOM, parseCSV, buildRecords, normalize, filterRecords, pickBestCandidate } from "../lib.mjs";
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test test/*.mjs 2>&1 | grep -E '✖|^ℹ (pass|fail)'`
Expected: 新增 4 個測試 FAIL（`pickBestCandidate` 未定義），原有 13 個 PASS

- [ ] **Step 3: 實作**

追加到 `lib.mjs` 檔尾：

```js
export function pickBestCandidate(records, candidates) {
  if (!candidates.length) return "";
  return candidates.find((c) => filterRecords(records, c, "all").length > 0) || candidates[0];
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `node --test test/*.mjs 2>&1 | grep -E '^ℹ (pass|fail)'`
Expected: `pass 17`、`fail 0`

- [ ] **Step 5: Commit**

```bash
git add lib.mjs test/lib.test.mjs
git commit -m "feat: add pickBestCandidate for speech alternative lookup

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: app.mjs 接上 interim 即時搜尋與候選反查

**Files:**
- Modify: `app.mjs`

**Interfaces:**
- Consumes: Task 1 的 `pickBestCandidate(records, candidates)`；既有 `setQuery(v)`、`state`
- Produces: 無（終端行為）

- [ ] **Step 1: import pickBestCandidate**

`app.mjs` 第一行改為：

```js
import { buildRecords, filterRecords, pickBestCandidate } from "./lib.mjs";
```

- [ ] **Step 2: 設定 maxAlternatives 並改寫 onresult**

`wireVoice` 內，`rec.continuous = false;` 之後加一行：

```js
    rec.maxAlternatives = 3;
```

`rec.onresult` 整段改為：

```js
    rec.onresult = (e) => {
      const res = e.results[e.results.length - 1];
      if (res.isFinal) {
        const candidates = [];
        for (let k = 0; k < res.length; k++) {
          const t = (res[k].transcript || "").trim();
          if (t) candidates.push(t);
        }
        setQuery(pickBestCandidate(state.records, candidates));
        try { rec.stop(); } catch {}
        return;
      }
      let int = "";
      for (let i = e.resultIndex; i < e.results.length; i++) int += e.results[i][0].transcript;
      if (int.trim()) setQuery(int.trim());
      armSilenceTimer();
    };
```

行為說明（供驗收對照）：final 時取同一結果的全部候選 → 反查 → 帶入 → 停止；interim 時把本次事件的中間文字直接 `setQuery`（即時搜尋＋URL 同步），並重置靜音計時器。

- [ ] **Step 3: 執行單元測試確認未破壞**

Run: `node --test test/*.mjs 2>&1 | grep -E '^ℹ (pass|fail)'`
Expected: `pass 17`、`fail 0`

- [ ] **Step 4: 本地瀏覽器驗證**

Run: `python3 -m http.server 8788 >/dev/null 2>&1 &`

以瀏覽器開 `http://localhost:8788/`：
1. 點麥克風說「福壽」：講話過程中結果卡片就開始出現（不是等定稿）
2. 講完自動關麥、搜尋框為定稿文字、網址列帶 `?q=`
3. 不講話 4 秒自動關麥、無錯誤 toast
4. 打字搜尋、chips、清除、分享按鈕行為不變（回歸檢查）

無法給麥克風權限的環境：至少確認 console 無新錯誤、打字搜尋回歸正常。

- [ ] **Step 5: 停伺服器、Commit、push**

```bash
pkill -f "http.server 8788"
git add app.mjs
git commit -m "feat: live search on interim speech and alternative lookup on final

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
```

- [ ] **Step 6: 確認部署**

Run: `until curl -s "https://amikai.github.io/union-oil-case/app.mjs?cb=$(date +%s)" | grep -q 'pickBestCandidate'; do sleep 30; done; echo deployed`（背景執行，timeout 600s）
Expected: `deployed`（Pages 建置＋CDN 快取約 1–10 分鐘）

---

## Self-Review 紀錄

- **Spec coverage**：`pickBestCandidate` 三條規則＋空陣列（Task 1）、`maxAlternatives=3`＋final 反查＋interim 即時搜尋（Task 2 Step 2）、靜音計時器與錯誤處理不動（Task 2 行為說明＋Global Constraints）、手動驗證項目（Task 2 Step 4）——全數對應
- **Placeholder scan**：無
- **Type consistency**：`pickBestCandidate(records, candidates)` 兩處簽名一致；`armSilenceTimer` 為 `wireVoice` 既有閉包函式，`onresult` 改寫後仍在其作用域內
