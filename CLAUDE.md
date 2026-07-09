# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a data curation project (no application code): in the spirit of Open Data, it converts official PDF announcements from Taiwan's Union Oil (中聯油脂) food safety case into CSV files for the public and developers to query. Query website entry point: <https://amikai.org/food-safe> (redirects to a Claude artifact).

Data source: Taiwan FDA "Union Oil Case" portal <https://www.fda.gov.tw/tc/site.aspx?sid=13702&r=1309933787>

## Directory Layout and Naming Rules

- `source/` — Official original PDFs (primary source). When content is updated, **add** a new file with a dated filename (e.g. `下游業者360家清單_(截至7月8日).pdf`); never delete old versions. The government site overwrites old announcements, so the archive here may be the only historical record.
- `source/SHA256SUMS` — Standard `shasum -a 256` format (relative filenames). Verify with `shasum -a 256 -c SHA256SUMS` inside `source/`.
- `csv/` — Only fixed-name latest versions: `downstream_distributors_latest.csv` (downstream distributors list) and `withdrawn_products_latest.csv` (preventive withdrawal products list). Overwrite in place on update; do **not** keep dated intermediate CSVs — historical versions live in git history. The fixed filenames are intentional: external consumers' raw URLs never change.

## Data Update Workflow

1. Download the latest PDFs from the Taiwan FDA portal
2. Compare hashes against `source/SHA256SUMS`; if unchanged, stop
3. If changed: save a new dated PDF into `source/`, update `SHA256SUMS`, regenerate both `*_latest.csv`, commit

## Commit Conventions

- Data update commits **must** use the `data: ` prefix (e.g. `data: update downstream distributors list as of July 15`)
- If an official source URL changes (the FDA portal or a PDF download link), the commit body must note both the old and new URLs

## CSV Format Notes

- Both CSVs are UTF-8 **with BOM**; preserve the BOM when editing (Excel users need it to display Chinese correctly)
- `withdrawn_products_latest.csv` columns: 業者序號,縣市,業者,產品序號,產品名稱,有效日期
- `downstream_distributors_latest.csv` columns: 序號,縣市,業者,品項,批號,有效日期

## Content Principles

This is food safety data. The disclaimer in the README (unofficial, no guarantee of accuracy or timeliness, official announcements prevail) is kept deliberately; no public-facing copy may imply the data is real-time or authoritative.
