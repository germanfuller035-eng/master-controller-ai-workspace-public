#!/usr/bin/env node
// tools/security_os/tests/self_security.test.mjs — the Security Control Plane's OWN boundary self-test.
// Proves the security_os tree itself: no network/send/production/delete, no secret VALUES, no real
// contacts. Invocation checks on code only (data/docs may NAME forbidden things to forbid them).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NETWORK_ALLOWED, LIVE_SCAN_ALLOWED, SECRET_USE_ALLOWED, SECRET_PRINT_ALLOWED,
  CREDENTIAL_ROTATION_ALLOWED, PRODUCTION_MUTATION_ALLOWED, SEND_ALLOWED, FILE_DELETE_ALLOWED,
  MERGE_ALLOWED, LEGAL_ASSERTION_ALLOWED,
} from '../lib/common.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GEN = path.resolve(ROOT, '../../_generated/security_os');

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

function walk(dir) { const out = []; if (!existsSync(dir)) return out; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!/node_modules|\.git|backups/.test(e.name)) out.push(...walk(p)); } else out.push(p); } return out; }
const files = [...walk(ROOT), ...walk(GEN)].filter((f) => /\.(mjs|js|json|md|txt)$/.test(f) && statSync(f).size < 2 * 1024 * 1024);

// Real literal secret value (NOT a regex def, NOT a fake/test vector).
const REAL_SECRET = /(password|app_password|smtp_pass|imap_pass)["']?\s*[:=]\s*["'](?!FAKE|REDACTED|EXAMPLE|env:|process)[A-Za-z0-9]{10,}["']/i;
const REAL_EMAIL = /[A-Za-z0-9._%+-]+@(?!synthetic\.test)(?!example\.test)(?!example\.com)(?!acme-corp\.com)(?!.*\.test\b)[A-Za-z0-9.-]+\.(ru|com|org|net|io)\b/;

let net = 0, send = 0, prod = 0, del = 0, secretVal = 0, contact = 0, liveScan = 0;
for (const file of files) {
  const txt = readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const isCode = /\.(mjs|js)$/.test(rel);
  const isSelf = /tests\//.test(rel) || rel.endsWith('lib/scanners.mjs') || rel.endsWith('lib/attacks.mjs') || rel.endsWith('lib/common.mjs');
  if (!isSelf && REAL_SECRET.test(txt)) { secretVal++; console.log(`  real secret value in ${rel}`); }
  if (isCode && !/tests\//.test(rel)) {
    if (/(fetch\s*\(\s*['"]https?:|axios\.(get|post)\s*\(|https?\.request\s*\(|net\.connect\s*\(|new WebSocket|api\.telegram\.org\/bot)/.test(txt)) { net++; console.log(`  network in ${rel}`); }
    if (/(nodemailer|createTransport|\.sendMail\s*\(|smtp\.send\s*\(|imapflow|new Imap\s*\()/.test(txt)) { send++; console.log(`  send/imap in ${rel}`); }
    if (/(?:import[^;\n]*from\s*['"]|require\s*\(\s*['"])[^'"]*mater_controller_api\/src/.test(txt) || /ssh2|\.deploy\s*\(|execSync\s*\(\s*['"]ssh/.test(txt)) { prod++; console.log(`  prod in ${rel}`); }
    if (/(rmSync\s*\(|unlinkSync\s*\(|rmdirSync\s*\(|fs\.rm\s*\()/.test(txt)) { del++; console.log(`  delete in ${rel}`); }
    if (/(execSync\s*\(\s*['"]git (merge|push)|nmap|masscan|sqlmap|nikto)/.test(txt)) { liveScan++; console.log(`  live-scan/merge in ${rel}`); }
  }
  // sensitive-data scan over fixtures/data/samples (allow classified disposition doc which describes, not contains)
  if (/fixtures|samples|data\//.test(rel) && !/communication_files_disposition|REPRODUCIBILITY/.test(rel) && REAL_EMAIL.test(txt)) { contact++; console.log(`  real contact in ${rel}`); }
}

ok('NO_REAL_SECRET_VALUE', secretVal === 0, `hits=${secretVal}`);
ok('NO_NETWORK', net === 0, `hits=${net}`);
ok('NO_SEND_OR_IMAP', send === 0, `hits=${send}`);
ok('NO_PRODUCTION_ACCESS', prod === 0, `hits=${prod}`);
ok('NO_FILE_DELETE', del === 0, `hits=${del}`);
ok('NO_LIVE_SCAN_OR_MERGE', liveScan === 0, `hits=${liveScan}`);
ok('NO_REAL_CONTACTS', contact === 0, `hits=${contact}`);

const inv = { NETWORK_ALLOWED, LIVE_SCAN_ALLOWED, SECRET_USE_ALLOWED, SECRET_PRINT_ALLOWED, CREDENTIAL_ROTATION_ALLOWED, PRODUCTION_MUTATION_ALLOWED, SEND_ALLOWED, FILE_DELETE_ALLOWED, MERGE_ALLOWED, LEGAL_ASSERTION_ALLOWED };
for (const [k, v] of Object.entries(inv)) ok(`${k} false`, v === false);

const stray = files.filter((f) => /_generated[\\/]/.test(f) && !path.resolve(f).startsWith(path.resolve(GEN)));
ok('generated artifacts confined', stray.length === 0, `stray=${stray.length}`);

console.log(`\nself_security.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
