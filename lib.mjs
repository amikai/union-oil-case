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
