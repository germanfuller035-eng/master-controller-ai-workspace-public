#!/usr/bin/env node
// tools/product_os/tests/security.test.mjs
// Phase 42: Security scan over Product OS. No secrets, no send, no publish, no production mutation, no real data.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GEN = path.resolve(ROOT, '../../_generated/product_os');

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

function walk(dir) { const out = []; if (!existsSync(dir)) return out; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!/node_modules|\.git/.test(e.name)) out.push(...walk(p)); } else out.push(p); } return out; }
const files = [...walk(ROOT), ...walk(GEN)].filter((f) => /\.(mjs|js|json|md|txt|html)$/.test(f) && statSync(f).size < 2 * 1024 * 1024);

const SECRET_RX = [
  { name: 'telegram_token', re: /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/ },
  { name: 'private_key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'password_assign', re: /(PASSWORD|SMTP_PASS|API_KEY)\s*[:=]\s*["']?[^\s"',}]{8,}/i },
];
const REAL_EMAIL_RX = /[A-Za-z0-9._%+-]+@(?!.*\.test\b)(?!example\.)(?!demo\.)[A-Za-z0-9.-]+\.(ru|com|org|net|io)\b/;

let secretHits = 0, sendHits = 0, pubHits = 0, prodHits = 0, statusWriteHits = 0, contactHits = 0, sendAllowedTrue = 0;
for (const f of files) {
  const txt = readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f);
  for (const s of SECRET_RX) if (s.re.test(txt)) { secretHits++; console.log(`  secret-like (${s.name}) in ${rel}`); }
  if (!/tests[\\/]|validators\.mjs$|claims\.mjs$|qa\.mjs$/.test(rel)) {
    if (/(nodemailer|createTransport|\.sendMail\s*\(|bot\.sendMessage\s*\()/.test(txt)) { sendHits++; console.log(`  send in ${rel}`); }
    if (/(publishSite|deploySite|goLive|publishAsset)\s*\(/.test(txt)) { pubHits++; console.log(`  publish in ${rel}`); }
    if (/(ssh2|195\.96\.132\.82|exec.*systemctl)/.test(txt)) { prodHits++; console.log(`  prod access in ${rel}`); }
    if (/writeFileSync\([^)]*product_catalog\.json|setProductStatus|writeCatalogStatus/.test(txt)) { statusWriteHits++; console.log(`  canonical status write in ${rel}`); }
  }
  if (/fixtures|samples|generated/.test(rel)) { if (REAL_EMAIL_RX.test(txt)) { contactHits++; console.log(`  real email in ${rel}`); } }
  if (/samples|generated/.test(rel) && /"send_allowed"\s*:\s*true/.test(txt)) sendAllowedTrue++;
}

ok('no secret-like values', secretHits === 0, `hits=${secretHits}`);
ok('no send methods', sendHits === 0, `hits=${sendHits}`);
ok('no publish methods', pubHits === 0, `hits=${pubHits}`);
ok('no production/VPS access', prodHits === 0, `hits=${prodHits}`);
ok('no canonical status write', statusWriteHits === 0, `hits=${statusWriteHits}`);
ok('no real contacts in fixtures/samples', contactHits === 0, `hits=${contactHits}`);
ok('no send_allowed=true in generated output', sendAllowedTrue === 0, `count=${sendAllowedTrue}`);

console.log(`\n[security.test] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
