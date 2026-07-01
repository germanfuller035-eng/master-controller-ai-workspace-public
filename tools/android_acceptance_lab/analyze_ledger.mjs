// analyze_ledger.mjs — parse an exhaustive-run logcat ledger into a normalized jsonl + summary,
// and emit/refresh the HTML coverage report. Usage:
//   node analyze_ledger.mjs <raw_logcat.txt> <out_ledger.jsonl> <run_label>
import fs from 'node:fs';
import path from 'node:path';

const raw = process.argv[2];
const outLedger = process.argv[3];
const label = process.argv[4] || 'RUN';
const DIR = '_generated/android_acceptance_lab/exhaustive';

const text = fs.readFileSync(raw, 'utf8');
const rows = [];
for (const line of text.split('\n')) {
    const m = line.match(/ROW (\{.*\})\s*$/);
    if (m) { try { rows.push(JSON.parse(m[1])); } catch { /* skip malformed */ } }
}
fs.writeFileSync(outLedger, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));

const byStatus = {};
for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
const passed = rows.filter((r) => String(r.status).startsWith('PASS')).length;
const failed = rows.filter((r) => r.status === 'FAIL').length;
const unexec = rows.filter((r) => String(r.status).startsWith('UNEXECUTED')).length;
const uniq = new Set(rows.map((r) => r.control_id)).size;

const summary = { label, ledger_rows: rows.length, unique_controls: uniq, passed, failed, unexecuted: unexec, by_status: byStatus };
fs.writeFileSync(path.join(DIR, `${label}_SUMMARY.json`), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
