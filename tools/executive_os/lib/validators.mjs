// tools/executive_os/lib/validators.mjs
// Phase 38: Executive OS validators aggregator. Reuses Revenue OS schema validator.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { EXEC_ROOT, FIXTURE_DIR } from './common.mjs';
import { detectConflicts } from './sot.mjs';
import { validateMapping } from './status.mjs';
import { listPolicies } from './policy.mjs';

// Static safety scan: no send / no production mutation / no decision execution / no secret.
export function scanSafety() {
  const errors = [];
  const files = [];
  (function walk(dir) {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(mjs|js)$/.test(e.name) && !/tests[\\/]/.test(p) && e.name !== 'validators.mjs') files.push(p);
    }
  })(EXEC_ROOT);
  for (const f of files) {
    const txt = readFileSync(f, 'utf8');
    if (/(nodemailer|createTransport|\.sendMail\s*\(|bot\.sendMessage\s*\()/.test(txt)) errors.push(`send method in ${path.basename(f)}`);
    if (/(ssh2|195\.96\.132\.82|exec.*systemctl|\.deploy\()/.test(txt)) errors.push(`production/VPS access in ${path.basename(f)}`);
    if (/executeDecision\s*\(|applyDecision\s*\(|mutateProduction/.test(txt)) errors.push(`decision execution in ${path.basename(f)}`);
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(txt)) errors.push(`private key in ${path.basename(f)}`);
  }
  return { ok: errors.length === 0, errors, files_scanned: files.length };
}

export function validateAll() {
  const results = {};
  results.source_of_truth = detectConflicts();
  results.status_mapping = validateMapping();
  results.policies = { ok: listPolicies().count > 0, count: listPolicies().count };
  results.safety = scanSafety();
  // Data loads.
  for (const [k, file] of [['sot', 'source_of_truth_matrix.json'], ['decisions', 'decision_backlog.json'], ['kpi', 'kpi_tree.json']]) {
    try { JSON.parse(readFileSync(path.join(EXEC_ROOT, 'data', file), 'utf8')); results[`data_${k}`] = { ok: true }; }
    catch (e) { results[`data_${k}`] = { ok: false, errors: [String(e)] }; }
  }
  const ok = Object.values(results).every((r) => r.ok !== false);
  return { ok, results };
}
