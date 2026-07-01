#!/usr/bin/env node
// tools/commercial_core/tests/run_all.mjs — runs all commercial core suites.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const suites = ['commercial.test.mjs', 'security.test.mjs', 'gate_c1a.test.mjs', 'transport_readiness.test.mjs', 'continuous_pipeline.test.mjs', 'multichannel.test.mjs', 'reply_correlation.test.mjs', 'migration_dryrun.mjs', 'local_rehearsal.mjs', 'route_security.test.mjs', 'runtime_bundle.test.mjs', 'production_like_rehearsal.mjs'];
let failed = 0;
for (const s of suites) {
    try { execFileSync('node', [path.join(__dirname, s)], { stdio: 'inherit' }); }
    catch { failed++; }
}
process.exit(failed ? 1 : 0);
