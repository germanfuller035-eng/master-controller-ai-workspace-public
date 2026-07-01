#!/usr/bin/env node
// tools/revenue_os/tests/security.test.mjs
// Phase 29: Security + privacy scan over Revenue OS source, data, fixtures, generated output.
// No secret values printed. Fails on real contacts in fixtures or send methods.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GEN = path.resolve(ROOT, '../../_generated/revenue_os');

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.git/.test(e.name)) out.push(...walk(p)); }
    else out.push(p);
  }
  return out;
}

const TEXT_RX = /\.(mjs|js|json|md|txt|html)$/;
const files = [...walk(ROOT), ...walk(GEN)].filter((f) => TEXT_RX.test(f) && statSync(f).size < 2 * 1024 * 1024);

// Secret patterns (presence only, never print value).
const SECRET_RX = [
  { name: 'telegram_token', re: /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/ },
  { name: 'private_key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'aws_key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'password_assign', re: /(PASSWORD|PASSWD|SMTP_PASS|IMAP_PASS)\s*[:=]\s*["']?[^\s"',}]{6,}/i },
];
// Real-contact patterns disallowed in fixtures (only TEST/.test domains allowed).
const REAL_EMAIL_RX = /[A-Za-z0-9._%+-]+@(?!.*\.test\b)(?!example\.)[A-Za-z0-9.-]+\.(ru|com|org|net|io)\b/;
const REAL_PHONE_RX = /(\+7|8)[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/;

let secretHits = 0, sendMethodHits = 0, realContactHits = 0;
const sendHitFiles = [];

for (const f of files) {
  const txt = readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f);
  for (const s of SECRET_RX) if (s.re.test(txt)) { secretHits++; console.log(`  secret-like (${s.name}) in ${rel}`); }
  // send methods: actual send operations. Skip the test files themselves (they contain detection patterns as strings).
  if (!/tests[\\/]/.test(rel) && /(nodemailer|createTransport|\.sendMail\s*\(|sendApprovedMessage\s*\(|smtp\.send|bot\.sendMessage\s*\()/.test(txt)) { sendMethodHits++; sendHitFiles.push(rel); }
  // real contacts only matter in fixtures + generated samples
  if (/fixtures|samples|generated/.test(rel)) {
    if (REAL_EMAIL_RX.test(txt)) { realContactHits++; console.log(`  real-email-like in ${rel}`); }
    if (REAL_PHONE_RX.test(txt)) { realContactHits++; console.log(`  real-phone-like in ${rel}`); }
  }
}

ok('no secret-like values in Revenue OS', secretHits === 0, `hits=${secretHits}`);
ok('no send methods present', sendMethodHits === 0, sendHitFiles.join(','));
ok('no real contacts in fixtures/samples', realContactHits === 0, `hits=${realContactHits}`);

// send_allowed must be false everywhere it appears in generated offers/drafts/proposals.
let sendAllowedTrue = 0;
for (const f of files.filter((x) => /samples|offers|drafts|proposals/.test(x))) {
  if (/"send_allowed"\s*:\s*true/.test(readFileSync(f, 'utf8'))) sendAllowedTrue++;
}
ok('no generated output sets send_allowed=true', sendAllowedTrue === 0, `count=${sendAllowedTrue}`);

console.log(`\n[security.test] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
