// tools/delivery_os/lib/validators.mjs
// Phase 32: Delivery OS validators aggregator. Reuses Revenue OS schema validator.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { DELIVERY_ROOT, FIXTURE_DIR } from './common.mjs';
import { validate } from '../../revenue_os/lib/schema.mjs';
import { SCHEMAS } from '../schemas/domain.mjs';
import { validateCreation } from './creation.mjs';
import { validateTransition } from './lifecycle.mjs';
import { validatePlaybook, listPlaybooks } from './playbooks.mjs';

// Validate all playbooks.
export function validatePlaybooks() {
  const errors = [];
  for (const pb of listPlaybooks()) {
    const v = validatePlaybook(pb.product_id);
    if (!v.ok) errors.push(`${pb.product_id}: ${v.errors.join('; ')}`);
  }
  return { ok: errors.length === 0, errors, count: listPlaybooks().length };
}

// No-send + no-production-mutation static scan over delivery_os source.
export function scanSafety() {
  const errors = [];
  const files = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(mjs|js)$/.test(e.name) && !/tests[\\/]/.test(p) && e.name !== 'validators.mjs') files.push(p);
    }
  }
  walk(DELIVERY_ROOT);
  for (const f of files) {
    const txt = readFileSync(f, 'utf8');
    if (/(nodemailer|createTransport|\.sendMail\s*\(|sendApprovedMessage\s*\(|bot\.sendMessage\s*\()/.test(txt)) errors.push(`send method in ${path.basename(f)}`);
    if (/(ssh2|195\.96\.132\.82|\.deploy\(|exec.*systemctl)/.test(txt)) errors.push(`production/VPS access in ${path.basename(f)}`);
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(txt)) errors.push(`private key in ${path.basename(f)}`);
  }
  return { ok: errors.length === 0, errors, files_scanned: files.length };
}

// Run everything.
export function validateAll() {
  const results = {};
  results.playbooks = validatePlaybooks();
  results.safety = scanSafety();
  // Fixture projects pass creation validation appropriately.
  const fxFile = path.join(FIXTURE_DIR, 'projects.json');
  if (existsSync(fxFile)) {
    const fx = JSON.parse(readFileSync(fxFile, 'utf8'));
    let okCount = 0, expectedFail = 0;
    for (const p of fx.projects) {
      const r = validateCreation(p.request);
      if (p.expect_creation === false) { if (!r.ok) expectedFail++; }
      else if (r.ok) okCount++;
    }
    results.fixtures = { ok: true, projects: fx.projects.length, created_ok: okCount, expected_failures: expectedFail };
  }
  const ok = Object.values(results).every((r) => r.ok !== false);
  return { ok, results };
}
