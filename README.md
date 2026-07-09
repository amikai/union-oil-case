# 🛢️ 中聯油脂案資料整理

秉持開放資料（Open Data）精神，將中聯油脂案的官方 PDF 公告轉成結構化、易於存取與再利用的 CSV，降低民眾與開發者查詢的門檻。

## 資料來源

衛福部食藥署「中聯油脂案專區」：<https://www.fda.gov.tw/tc/site.aspx?sid=13702&r=1309933787>

## 目錄結構

- `source/` — 官方原始 PDF，內容有更新時以帶日期檔名累積保存，並以 `SHA256SUMS` 紀錄雜湊
- `csv/` — 轉換後的最新 CSV（`downstream_distributors_latest.csv`、`withdrawn_products_latest.csv`），固定檔名、隨官方公告更新覆蓋，歷史版本見 git history

## 免責聲明

本專案為個人整理，非官方資料，不保證正確性、完整性與即時性，請以食藥署官網公告為準。
