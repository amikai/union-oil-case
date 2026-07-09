# GitHub Pages 查詢網站設計

日期：2026-07-09
狀態：已核准

## 目標

把現有的 Claude artifact 查詢網頁（問題油品查詢，`amikai.org/food-safe` → claude.ai artifact）轉成 GitHub Pages 靜態網站，資料來源改為 repo 內的兩份 `csv/*_latest.csv`，資料隨 repo 更新自動同步，不再內嵌快照。

## 決策紀錄

- **技術路線**：單一 `index.html`、vanilla JS、零 build、零外部依賴（否決 Vite+React 與 CDN React：資料 repo 不引入前端工具鏈與執行期第三方依賴）
- **Pages 來源**：deploy from branch，`main` / root——網頁可同源 fetch `csv/`，CSV 同時獲得乾淨的 `amikai.github.io` URL
- **拍照辨識**：移除。它依賴 Claude artifact 環境的免金鑰 Anthropic API，靜態網站無法運作
- **快照日期**：不顯示確切日期，改為「資料隨官方公告更新，非即時」＋ GitHub repo 連結（否決 GitHub API 查 commit 與 meta.json）
- **`?q=` 參數**：純前端深連結（讀取 URL 參數帶入搜尋、輸入時 `replaceState` 同步回網址列）。伺服器端回傳篩選後 CSV 在靜態主機做不到，機器消費者直接抓 raw CSV 自行篩選

## 架構

```
union-oil-case/
├── index.html      ← 新增：整個網站（內嵌 CSS + JS）
├── csv/            ← 資料來源（同源 fetch）
└── source/         ← 不變
```

- 部署：GitHub Pages, main / root；`git push` 即上線
- `food-safety-check.jsx`（artifact 原始碼，未 commit）：改寫完成後刪除

## 資料流

1. 頁面載入即並行 fetch `csv/downstream_distributors_latest.csv` 與 `csv/withdrawn_products_latest.csv`
2. 自寫標準 CSV 解析器（約 30 行）：引號跳脫、CRLF、strip UTF-8 BOM
3. 映射成統一 record（沿用 artifact 欄位命名）：
   - 下游業者 `序號,縣市,業者,品項,批號,有效日期` → `{s:"業", c, b, n, bat, e}`
   - 下架產品 `業者序號,縣市,業者,產品序號,產品名稱,有效日期` → `{s:"架", c, b, n, bat:"", e}`
4. 總筆數動態計算（取代寫死的 916）
5. 欄位數不符的資料列跳過並 `console.warn`

## 功能

**保留**（視覺照 artifact 還原）：

- 即時搜尋：normalize（小寫、去空白與 `-—－.`）後 token AND 比對 `業者+品名+批號`
- 來源篩選：全部清單 / 預防性下架 / 下游業者
- 快選關鍵字 chips（泰山、福壽、益康、聯華、沙拉油、飯糰、沙拉醬、便當）
- 語音輸入（Web Speech API，zh-TW，不支援時顯示提示）
- 官方資料來源與品牌公告折疊清單（連結照抄 artifact）
- 免責警語（「查無不代表安全」等）
- 單次最多渲染 120 筆，超出提示縮小範圍

**移除**：拍照辨識（含「需登入 Claude」說明列）

**新增**：

- `?q=xxx` 深連結（開頁帶入搜尋；輸入時 `replaceState` 同步回網址列，可複製分享）
- 社群分享按鈕（搜尋有結果時顯示）：組出預設文字＋`?q=` 深連結，優先用 `navigator.share` 開原生分享面板（feature detection），不支援則 `navigator.clipboard.writeText` 複製並提示「已複製」。預設文字模板：`幹我吃到癌油了 <關鍵字> <連結>`（文案可隨時調整）
- OG meta tags（`og:title`、`og:description`）：讓分享連結在 LINE/FB 有預覽卡；靜態網站僅能固定一組文案，不隨 `?q=` 變動

**文案調整**：快照日期改為「資料隨官方公告更新，非即時」＋ repo 連結

## 錯誤處理

- CSV fetch 失敗：顯示錯誤卡片＋官方 PDF 連結，不留白畫面
- 語音權限被拒／不支援：沿用 artifact 的錯誤訊息
- 空搜尋：顯示初始狀態（RestState）

## 驗證

1. 本地 `python3 -m http.server` 開發驗證（`file://` 無法 fetch）
2. 驗證項目：中文／批號搜尋、來源篩選、`?q=` 深連結、BOM 處理、手機寬度 RWD、CSV 載入失敗畫面
3. 驗證分享按鈕：支援 Web Share 的環境開面板、不支援的環境複製＋提示
4. 開啟 Pages 後在 `https://amikai.github.io/union-oil-case/` 驗證
5. 之後由使用者自行把 `amikai.org/food-safe` redirect 改指到 Pages URL

## 後續構想（不在本次範圍）

- 產生合併純文字檔（`food_safe_data_latest.txt`：兩份 CSV 加段落標題），供 LLM 一次抓取完整資料集；搭配預填 prompt 的短網址（`chatgpt.com/?q=…`）做 AI 查詢入口
- `llms.txt` 說明檔
