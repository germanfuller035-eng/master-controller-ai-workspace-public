#!/usr/bin/env node
// tools/ai_hq/tests/file_pipeline.test.mjs
// Offline tests for file_intake (dry-run), chatgpt_import (idempotent), orphans (no delete).
// Run: node tools/ai_hq/tests/file_pipeline.test.mjs

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');
const FIX = path.join(ROOT, 'tools/ai_hq/fixtures');
const TMP = path.join(ROOT, '_generated/ai_hq/test_out/fp');
const TS = '20260101_000000';

let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}
function run(args) {
  try { return { code: 0, out: execFileSync('node', args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, AI_HQ_TS: TS } }) }; }
  catch (e) { return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') }; }
}
function readJSON(p) { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; }

fs.rmSync(TMP, { recursive: true, force: true });
console.log('[test] file pipeline');

// --- file intake dry-run ---
{
  const out = path.join(TMP, 'intake');
  const r = run(['tools/ai_hq/file_intake.mjs', '--incoming', path.join(FIX, 'incoming'), '--out', out]);
  ok('intake exit 0', r.code === 0, `code=${r.code}`);
  const rep = readJSON(path.join(out, 'intake_latest.json'));
  ok('intake dedup detects 1 dup', rep && rep.totals.duplicates === 1, `dups=${rep && rep.totals.duplicates}`);
  ok('intake flags sensitive', rep && rep.totals.sensitive >= 1);
  ok('intake 0 moved/0 deleted', rep && rep.safety.files_moved === 0 && rep.safety.files_deleted === 0);
  ok('intake sensitive has no content summary', rep && rep.records.every((x) => !('content' in x)));
}
// --- intake --apply refused ---
{
  const r = run(['tools/ai_hq/file_intake.mjs', '--incoming', path.join(FIX, 'incoming'), '--apply']);
  ok('intake --apply refused (exit 3)', r.code === 3, `code=${r.code}`);
}
// --- chatgpt import idempotency ---
{
  const out = path.join(TMP, 'cg');
  const state = path.join(out, 'state.json');
  const args = ['tools/ai_hq/chatgpt_import.mjs', '--export', path.join(FIX, 'chatgpt/conversations.json'), '--out', out, '--state', state];
  const r1 = run(args);
  ok('chatgpt import exit 0', r1.code === 0);
  const rep1 = readJSON(path.join(out, `import_report_${TS}.json`));
  ok('chatgpt imports normal convs', rep1 && rep1.totals.imported === 2, `imported=${rep1 && rep1.totals.imported}`);
  ok('chatgpt restricts sensitive', rep1 && rep1.totals.sensitive_restricted === 1);
  ok('chatgpt blocks secret conv', rep1 && rep1.totals.secrets_blocked === 1);
  // second run: idempotent
  const r2 = run(args);
  const rep2 = readJSON(path.join(out, `import_report_${TS}.json`));
  ok('chatgpt re-import idempotent (0 new)', rep2 && rep2.totals.imported === 0 && rep2.totals.skipped_dup === 4, `imported=${rep2 && rep2.totals.imported}`);
  // no secret leaked into notes
  let leaked = false;
  const notesDir = path.join(out, 'notes');
  if (fs.existsSync(notesDir)) {
    const stack = [notesDir];
    while (stack.length) {
      const d = stack.pop();
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (/123456789:AAFakeToken/.test(fs.readFileSync(p, 'utf8'))) leaked = true;
      }
    }
  }
  ok('chatgpt no token in notes', !leaked);
}
// --- chatgpt import integrity failure on bad JSON ---
{
  const bad = path.join(TMP, 'bad.json');
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(bad, '{not valid json');
  const r = run(['tools/ai_hq/chatgpt_import.mjs', '--export', bad, '--out', path.join(TMP, 'cgbad')]);
  ok('chatgpt bad JSON exit 4', r.code === 4, `code=${r.code}`);
}
// --- orphans no-delete on fixture ws ---
{
  const out = path.join(TMP, 'orph');
  const r = run(['tools/ai_hq/orphans.mjs', '--workspace', path.join(FIX, 'ws'), '--out', out, '--now', '2026-06-17']);
  ok('orphans exit 0', r.code === 0);
  const rep = readJSON(path.join(out, 'orphans_latest.json'));
  ok('orphans MASS_DELETION=NO', rep && rep.safety.mass_deletion === 'NO');
  ok('orphans 0 deleted/0 moved', rep && rep.safety.files_deleted === 0 && rep.safety.files_moved === 0);
  ok('orphans classifies sensitive', rep && (rep.counts_by_classification.sensitive_unknown || 0) >= 1);
}

console.log(`\n[test] file pipeline: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
