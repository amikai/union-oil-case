# 語音輸入改善設計（interim 即時搜尋＋候選反查）

日期：2026-07-09
狀態：已核准
前置：`docs/superpowers/specs/2026-07-09-github-pages-query-site-design.md`（查詢網站已上線）

## 目標

改善語音查詢體感的兩個弱點：

1. **定稿延遲**——現在要等瀏覽器判定講完（1–2 秒靜音）才執行搜尋，這段時間畫面沒有回饋
2. **聽寫錯誤**——「福壽」被聽成「複數」時直接查無，使用者只能重講

## 決策紀錄

- **Interim 即時搜尋**：中間結果直接觸發 `setQuery`（搜尋為本地比對、零成本），邊講邊出結果
- **候選反查**：`rec.maxAlternatives = 3`，定稿時依序將各候選聽寫對名單反查，取第一個命中的候選；全落空則用第一候選（與現狀行為一致，漸進增強）
- **反查範圍用全部資料**（`src = "all"`，不受當前來源篩選影響）：反查的目的是猜對「使用者說了什麼詞」，與篩選無關。篩選下查無是正確結果，該顯示查無
- 反查只在**定稿**執行：瀏覽器對 interim 通常只給單一候選，且邊講邊換詞會造成畫面亂跳
- 反查邏輯抽成 `lib.mjs` 純函式，可用 `node --test` 測試

## 變更

### lib.mjs：新增 `pickBestCandidate`

```
pickBestCandidate(records, candidates: string[]): string
```

- 依序對每個候選跑 `filterRecords(records, candidate, "all")`，回傳第一個命中筆數 > 0 的候選
- 全部查無 → 回傳 `candidates[0]`
- `candidates` 為空陣列 → 回傳 `""`

### app.mjs：`wireVoice` 調整

- 建立辨識器時設定 `rec.maxAlternatives = 3`
- `onresult` 收到 interim：由「只更新輸入框」改為 `setQuery(int)`（觸發即時搜尋與 URL 同步；interim 值會被後續結果覆蓋，`replaceState` 不污染瀏覽歷史）
- `onresult` 收到 final：從該 `SpeechRecognitionResult` 取出全部候選的 `transcript`（trim 後過濾空字串），`setQuery(pickBestCandidate(state.records, candidates))`，然後 `rec.stop()`
- 靜音計時器（4 秒）與其餘錯誤處理不變

## 互動時序（疊加後）

1. 點麥克風 → 開始聆聽
2. 邊講：每個 interim 即時搜尋，畫面隨語音更新（此時用的是第一候選）
3. 定稿：候選反查，若第一候選查無而其他候選命中，畫面切換到命中候選（只在原本注定查無時發生）
4. 立即關麥

## 測試

- `test/lib.test.mjs` 新增 `pickBestCandidate`：
  - 第一候選查無、第二候選命中 → 回傳第二候選
  - 全部查無 → 回傳第一候選
  - 空陣列 → 回傳 `""`
- interim 即時搜尋與整體時序：瀏覽器手動驗證（Web Speech API 無法自動化收音），驗證項目：邊講畫面即時更新、定稿後自動停止、辨識錯誤時被候選反查救回

## 錯誤處理

不新增失敗路徑：瀏覽器不給多候選時 `candidates` 只有一個元素，`pickBestCandidate` 行為退化為現狀；其餘（權限拒絕、no-speech、其他錯誤）沿用現有處理。
