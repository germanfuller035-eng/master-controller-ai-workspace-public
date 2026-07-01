// tools/finance_os/lib/validators.mjs
// Phase 37: Finance OS validators aggregator. Reuses Revenue OS schema validator.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { FINANCE_ROOT, FIXTURE_DIR } from './common.mjs';
import { validate } from '../../revenue_os/lib/schema.mjs';
import { SCHEMAS } from '../schemas/domain.mjs';
import { buildInvoice } from './invoice.mjs';

// Static safety scan over finance_os source (no send / no bank / no production mutation / no key).
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
  })(FINANCE_ROOT);
  for (const f of files) {
    const txt = readFileSync(f, 'utf8');
    if (/(nodemailer|createTransport|\.sendMail\s*\(|bot\.sendMessage\s*\()/.test(txt)) errors.push(`send method in ${path.basename(f)}`);
    if (/(ssh2|195\.96\.132\.82|exec.*systemctl|\.deploy\()/.test(txt)) errors.push(`production/VPS access in ${path.basename(f)}`);
    if (/(fetch\(|https?\.request|bank[._]?api|payment[._]?provider[._]?api|sberbank|tinkoff)/i.test(txt)) errors.push(`bank/network access in ${path.basename(f)}`);
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(txt)) errors.push(`private key in ${path.basename(f)}`);
  }
  return { ok: errors.length === 0, errors, files_scanned: files.length };
}

// Fixture invoice validation: expected pass/fail.
export function validateFixtures() {
  const errors = [];
  const fxFile = path.join(FIXTURE_DIR, 'finance.json');
  if (!existsSync(fxFile)) return { ok: true, note: 'no fixtures', count: 0 };
  const fx = JSON.parse(readFileSync(fxFile, 'utf8'));
  let okCount = 0, expectedFail = 0;
  for (const f of fx.invoices || []) {
    const r = buildInvoice({ ...f.input, test_only: true }, f.existing_numbers || []);
    if (f.expect_ok === false) { if (!r.ok) expectedFail++; else errors.push(`${f.fixture_id}: expected fail but passed`); }
    else if (r.ok) okCount++; else errors.push(`${f.fixture_id}: expected ok but failed (${r.errors[0]})`);
  }
  return { ok: errors.length === 0, errors, invoices: (fx.invoices || []).length, created_ok: okCount, expected_failures: expectedFail };
}

export function validateAll() {
  const results = {};
  results.safety = scanSafety();
  results.fixtures = validateFixtures();
  // Chart of accounts loads + business units load.
  try { JSON.parse(readFileSync(path.join(FINANCE_ROOT, 'data/chart_of_accounts.json'), 'utf8')); results.chart = { ok: true }; } catch (e) { results.chart = { ok: false, errors: [String(e)] }; }
  try { JSON.parse(readFileSync(path.join(FINANCE_ROOT, 'data/business_units.json'), 'utf8')); results.units = { ok: true }; } catch (e) { results.units = { ok: false, errors: [String(e)] }; }
  const ok = Object.values(results).every((r) => r.ok !== false);
  return { ok, results };
}
