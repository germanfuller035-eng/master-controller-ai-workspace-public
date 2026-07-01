#!/usr/bin/env node
// tools/consolidation_os/run_master_validation.mjs — MP28 master validation runner.
// Sequential, offline, no network, no production. Per-suite exit-code aggregation; machine-readable.
// Does NOT weaken any existing test. Android = explicit NOT_RUN (Gradle not offline-invoked).
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { TEST_MANIFEST } from './lib/engines.mjs';
import { GENERATED_ROOT, nowStamp, arg } from './lib/common.mjs';

const TS = nowStamp(arg('--ts'));
const results = [];
let failed = 0, notRun = 0;
for (const t of TEST_MANIFEST) {
  if (t.command === 'NOT_RUN') { results.push({ suite: t.suite, status: 'EXPLICIT_NOT_RUN', exit: null }); notRun++; continue; }
  let exit = 0;
  try { execFileSync('node', t.command.replace(/^node\s+/, '').split(' '), { cwd: process.cwd(), stdio: 'pipe', timeout: 120000 }); }
  catch (e) { exit = e.status ?? 1; }
  const passed = exit === (t.expected_exit ?? 0);
  if (!passed && t.required) failed++;
  results.push({ suite: t.suite, status: passed ? 'PASS' : (t.required ? 'FAIL' : 'FAIL_OPTIONAL'), exit, required: t.required });
}
const summary = { schema: 'consolidation.master_validation.v1', generated_ts: TS, total: results.length, passed: results.filter((r) => r.status === 'PASS').length, failed, explicit_not_run: notRun, quarantined: 0, unclassified_failures: 0, results };
mkdirSync(path.join(GENERATED_ROOT, 'reports'), { recursive: true });
writeFileSync(path.join(GENERATED_ROOT, 'reports', 'MASTER_VALIDATION.json'), JSON.stringify(summary, null, 2));
for (const r of results) console.log(`  ${r.status.padEnd(16)} ${r.suite}${r.exit != null ? ' (exit ' + r.exit + ')' : ''}`);
console.log(`\nmaster-validation: ${summary.passed} passed, ${failed} required-failed, ${notRun} not-run`);
process.exit(failed ? 1 : 0);
