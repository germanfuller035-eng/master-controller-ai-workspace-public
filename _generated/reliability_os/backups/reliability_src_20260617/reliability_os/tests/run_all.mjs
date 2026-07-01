#!/usr/bin/env node
// tools/reliability_os/tests/run_all.mjs — runs all Reliability Control Plane test suites.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const suites = ['reliability_os.test.mjs', 'self_security.test.mjs'];
let failed = 0; const results = [];
for (const s of suites) {
  console.log(`\n===== ${s} =====`);
  let code = 0;
  try { execFileSync('node', [path.join(__dirname, s)], { stdio: 'inherit' }); } catch (e) { code = e.status ?? 1; failed++; }
  results.push({ suite: s, code });
}
console.log('\n===== SUMMARY =====');
for (const r of results) console.log(`  ${r.code === 0 ? 'PASS' : 'FAIL'}  ${r.suite} (exit ${r.code})`);
console.log(`\n${results.length - failed}/${results.length} suites passed`);
process.exit(failed ? 1 : 0);
