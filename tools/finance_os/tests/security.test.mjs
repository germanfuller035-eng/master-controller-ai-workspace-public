#!/usr/bin/env node
// tools/finance_os/tests/security.test.mjs
// Phase 38: Security + privacy scan over Finance OS. No secrets, no bank access, no real accounts, no send.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GEN = path.resolve(ROOT, '../../_generated/finance_os');

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

function walk(dir) { const out = []; if (!existsSync(dir)) return out; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!/node_modules|\.git/.test(e.name)) out.push(...walk(p)); } else out.push(p); } return out; }
const files = [...walk(ROOT), ...walk(GEN)].filter((f) => /\.(mjs|js|json|md|txt|html|csv)$/.test(f) && statSync(f).size < 2 * 1024 * 1024);

const SECRET_RX = [
  { name: 'telegram_token', re: /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/ },
  { name: 'private_key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'password_assign', re: /(PASSWORD|SMTP_PASS|IMAP_PASS|BANK_PASS)\s*[:=]\s*["']?[^\s"',}]{6,}/i },
];
// Real full bank account / card numbers in fixtures/samples (>=16 digit run, or RU 20-digit account).
const ACCOUNT_RX = /\b\d{16,20}\b/;
const REAL_EMAIL_RX = /[A-Za-z0-9._%+-]+@(?!.*\.test\b)(?!example\.)[A-Za-z0-9.-]+\.(ru|com|org|net|io)\b/;

let secretHits = 0, sendHits = 0, bankHits = 0, accountHits = 0, contactHits = 0, sendAllowedTrue = 0;
for (const f of files) {
  const txt = readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f);
  for (const s of SECRET_RX) if (s.re.test(txt)) { secretHits++; console.log(`  secret-like (${s.name}) in ${rel}`); }
  if (!/tests[\\/]|validators\.mjs$|import_contracts\.mjs$/.test(rel)) {
    if (/(nodemailer|createTransport|\.sendMail\s*\(|bot\.sendMessage\s*\()/.test(txt)) { sendHits++; console.log(`  send in ${rel}`); }
    if (/(fetch\(|https?\.request|bank[._]?api\.|sberbank\.|tinkoff\.|payment_provider\.)/i.test(txt)) { bankHits++; console.log(`  bank/network in ${rel}`); }
    if (/(ssh2|195\.96\.132\.82|exec.*systemctl)/.test(txt)) { bankHits++; console.log(`  prod access in ${rel}`); }
  }
  // Account/contact only matter in fixtures/samples and must be redacted there.
  if (/fixtures|samples|generated/.test(rel)) {
    // The account number appears only as redaction-test INPUT inside test files; fixtures themselves must not carry raw accounts in OUTPUT.
    if (/samples|generated/.test(rel) && ACCOUNT_RX.test(txt) && !/«REDACTED»/.test(txt.match(/.{0,40}\d{16,20}.{0,40}/)?.[0] || '')) { accountHits++; console.log(`  raw account-like in ${rel}`); }
    if (REAL_EMAIL_RX.test(txt)) { contactHits++; console.log(`  real email in ${rel}`); }
  }
  if (/samples|generated/.test(rel) && /"send_allowed"\s*:\s*true/.test(txt)) sendAllowedTrue++;
}

ok('no secret-like values', secretHits === 0, `hits=${secretHits}`);
ok('no send methods', sendHits === 0, `hits=${sendHits}`);
ok('no bank/network/prod access', bankHits === 0, `hits=${bankHits}`);
ok('no raw account numbers in generated output', accountHits === 0, `hits=${accountHits}`);
ok('no real contacts in fixtures/samples', contactHits === 0, `hits=${contactHits}`);
ok('no send_allowed=true in generated output', sendAllowedTrue === 0, `count=${sendAllowedTrue}`);

console.log(`\n[security.test] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
