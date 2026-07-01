// tools/customer_success_os/lib/validators.mjs
// Phase 49: Customer Success OS validators aggregator. Reuses Revenue OS schema validator.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { CS_ROOT } from './common.mjs';

// Static safety scan: no send / no publish / no production mutation / no canonical-status / no 2nd identity / no secret.
export function scanSafety() {
  const errors = [];
  const files = [];
  (function walk(dir) {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(mjs|js)$/.test(e.name) && !/tests[\\/]/.test(p) && e.name !== 'validators.mjs' && e.name !== 'incidents.mjs' && e.name !== 'support.mjs' && e.name !== 'permissions.mjs') files.push(p);
    }
  })(CS_ROOT);
  for (const f of files) {
    const txt = readFileSync(f, 'utf8');
    if (/(nodemailer|createTransport|\.sendMail\s*\(|bot\.sendMessage\s*\()/.test(txt)) errors.push(`send method in ${path.basename(f)}`);
    if (/(publishSite|publishKb|publishCase|goLive)\s*\(/.test(txt)) errors.push(`publish method in ${path.basename(f)}`);
    if (/(ssh2|195\.96\.132\.82|exec.*systemctl|\.deploy\()/.test(txt)) errors.push(`production/VPS access in ${path.basename(f)}`);
    if (/setLeadStatus|writeCanonicalIdentity|mutateProduction/.test(txt)) errors.push(`canonical mutation in ${path.basename(f)}`);
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(txt)) errors.push(`private key in ${path.basename(f)}`);
  }
  return { ok: errors.length === 0, errors, files_scanned: files.length };
}

// No second identity store check: customer_ref must reference canonical_lead_id, not store identity fields.
export function noSecondIdentity() {
  const errors = [];
  const fxFile = path.join(CS_ROOT, 'fixtures/customers.json');
  if (existsSync(fxFile)) {
    const fx = JSON.parse(readFileSync(fxFile, 'utf8'));
    for (const c of (fx.customers || [])) {
      if (c.full_name || c.email || c.phone) errors.push(`customer ${c.customer_ref_id} stores identity fields (use canonical_lead_id reference only)`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateAll() {
  const results = {};
  results.safety = scanSafety();
  results.no_second_identity = noSecondIdentity();
  for (const [k, file] of [['playbooks', 'playbooks.json'], ['stage_hierarchy', 'mini_audit_stage_hierarchy.json']]) {
    try { JSON.parse(readFileSync(path.join(CS_ROOT, 'data', file), 'utf8')); results[`data_${k}`] = { ok: true }; }
    catch (e) { results[`data_${k}`] = { ok: false, errors: [String(e)] }; }
  }
  const ok = Object.values(results).every((r) => r.ok !== false);
  return { ok, results };
}
