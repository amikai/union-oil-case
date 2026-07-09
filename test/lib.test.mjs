import { test } from "node:test";
import assert from "node:assert/strict";
import { stripBOM, parseCSV, buildRecords, normalize, filterRecords, pickBestCandidate } from "../lib.mjs";

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
  assert.equal(filterRecords(RECS, "c2140", "all").length, 1);
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
