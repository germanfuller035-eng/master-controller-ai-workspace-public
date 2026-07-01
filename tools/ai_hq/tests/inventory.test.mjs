#!/usr/bin/env node
// tools/ai_hq/tests/inventory.test.mjs
// Tests inventory + validator + dashboard generation against the fixture workspace. Deterministic.
// Run: node tools/ai_hq/tests/inventory.test.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');
const FIX_WS = path.join(ROOT, 'tools/ai_hq/fixtures/ws');
const TMP = path.join(ROOT, '_generated/ai_hq/test_out/inv');
const TS = '20260101_000000';

let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}
function run(args, env = {}) {
  try { return { code: 0, out: execFileSync('node', args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, AI_HQ_TS: TS, ...env } }) }; }
  catch (e) { return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') }; }
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log('[test] inventory + validate');

// Inventory on fixture ws
{
  const r = run(['tools/ai_hq/inventory.mjs', '--workspace', FIX_WS, '--out', TMP]);
  ok('inventory exit 0', r.code === 0, `code=${r.code}`);
  const inv = JSON.parse(fs.readFileSync(path.join(TMP, 'inventory_latest.json'), 'utf8'));
  ok('inventory has projects', inv.projects.length > 0);
  ok('inventory marks fixture', inv.is_fixture === true);
  ok('inventory counts files', inv.totals.files >= 5, `files=${inv.totals.files}`);
  ok('inventory flags sensitive', inv.totals.sensitive_files >= 1);
  // determinism
  const a = JSON.stringify(inv.projects);
  run(['tools/ai_hq/inventory.mjs', '--workspace', FIX_WS, '--out', TMP]);
  const inv2 = JSON.parse(fs.readFileSync(path.join(TMP, 'inventory_latest.json'), 'utf8'));
  ok('inventory deterministic', a === JSON.stringify(inv2.projects));
  // no secret values in inventory JSON
  const raw = fs.readFileSync(path.join(TMP, 'inventory_latest.json'), 'utf8');
  ok('inventory contains no secret values', !/AAFakeToken|deadbeefdeadbeef/.test(raw));
}
// Validator detects broken link in fixture ws (warn exit 1)
{
  const r = run(['tools/ai_hq/validate.mjs', '--docs', FIX_WS, '--workspace', FIX_WS, '--now', '2026-06-17']);
  ok('validate warns on broken link (exit 1)', r.code === 1, `code=${r.code}`);
}
// Validator on proposed docs: no ERRORS (warnings allowed for forward refs)
{
  const r = run(['tools/ai_hq/validate.mjs', '--docs', path.join(ROOT, 'docs_canonical_proposed'), '--workspace', '/d/AI_WORKSPACE', '--now', '2026-06-17']);
  ok('proposed docs have no validation ERRORS (exit 0 or 1)', r.code === 0 || r.code === 1, `code=${r.code}`);
  ok('proposed docs report 0 errors', !/errors=[1-9]/.test(r.out), r.out.split('\n')[0]);
}

console.log(`\n[test] inventory: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
