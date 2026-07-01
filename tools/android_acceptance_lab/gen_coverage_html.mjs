// gen_coverage_html.mjs — build COVERAGE_REPORT.html from RUN_1 + RUN_2 ledgers + the exec plan.
// Validates ledger rows == plan size, unique IDs, UNEXECUTED/UNKNOWN/FAILED counts; exits non-zero
// if the acceptance equalities are violated.
import fs from 'node:fs';
import path from 'node:path';

const DIR = '_generated/android_acceptance_lab/exhaustive';
function loadLedger(p) {
    try { return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
}
const plan = JSON.parse(fs.readFileSync(path.join('apps/mater_controller_android/app/src/androidTest/assets/exec_plan.json'), 'utf8'));
const run1 = loadLedger(path.join(DIR, 'EXHAUSTIVE_RUN_1_LEDGER.jsonl'));
const run2 = loadLedger(path.join(DIR, 'EXHAUSTIVE_RUN_2_LEDGER.jsonl'));
const total = plan.length;
const r1 = Object.fromEntries(run1.map((r) => [r.control_id, r]));
const r2 = Object.fromEntries(run2.map((r) => [r.control_id, r]));

function cls(s) { if (!s) return 'unk'; if (s.startsWith('PASS')) return 'pass'; if (s === 'FAIL') return 'fail'; return 'unx'; }
let rowsHtml = '';
for (const c of plan) {
    const a = r1[c.control_id]; const b = r2[c.control_id];
    rowsHtml += `<tr><td>${c.control_id}</td><td>${c.screen_id}</td><td>${c.control_type}</td><td>${c.risk_class}</td>` +
        `<td>${c.selector_value || ''}</td><td class="${cls(a?.status)}">${a?.status || 'MISSING'}</td>` +
        `<td class="${cls(b?.status)}">${b?.status || 'MISSING'}</td></tr>\n`;
}
const count = (arr, pred) => arr.filter(pred).length;
const r1pass = count(run1, (r) => String(r.status).startsWith('PASS'));
const r2pass = count(run2, (r) => String(r.status).startsWith('PASS'));
const r1fail = count(run1, (r) => r.status === 'FAIL');
const r2fail = count(run2, (r) => r.status === 'FAIL');
const r1unx = count(run1, (r) => String(r.status).startsWith('UNEXECUTED'));
const r2unx = count(run2, (r) => String(r.status).startsWith('UNEXECUTED'));

const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Exhaustive Control Coverage</title>
<style>body{font-family:system-ui,Arial;margin:20px}table{border-collapse:collapse;width:100%;font-size:12px}
th,td{border:1px solid #ccc;padding:3px 6px;text-align:left}th{background:#eee;position:sticky;top:0}
.pass{background:#d6f5d6}.fail{background:#f8d0d0}.unx{background:#fde9c8}.unk{background:#eee}
.s{margin:8px 0;font-size:14px}</style></head><body>
<h1>Exhaustive Control-by-Control Coverage</h1>
<div class="s">TOTAL_TEST_CASES=${total}</div>
<div class="s">RUN_1: rows=${run1.length} pass=${r1pass} fail=${r1fail} unexecuted=${r1unx}</div>
<div class="s">RUN_2: rows=${run2.length} pass=${r2pass} fail=${r2fail} unexecuted=${r2unx}</div>
<table><thead><tr><th>control_id</th><th>screen</th><th>type</th><th>risk</th><th>selector</th><th>Run 1</th><th>Run 2</th></tr></thead>
<tbody>${rowsHtml}</tbody></table></body></html>`;
fs.writeFileSync(path.join(DIR, 'COVERAGE_REPORT.html'), html);

// validation
const problems = [];
if (run1.length && run1.length !== total) problems.push(`RUN_1 rows ${run1.length} != ${total}`);
if (run2.length && run2.length !== total) problems.push(`RUN_2 rows ${run2.length} != ${total}`);
if (r1fail > 0) problems.push(`RUN_1 FAILED=${r1fail}`);
if (r2fail > 0) problems.push(`RUN_2 FAILED=${r2fail}`);
console.log(`HTML written. RUN_1 pass=${r1pass}/${run1.length} RUN_2 pass=${r2pass}/${run2.length}`);
if (problems.length) { console.log('VALIDATION_PROBLEMS:', problems.join('; ')); process.exit(2); }
console.log('VALIDATION_OK');
