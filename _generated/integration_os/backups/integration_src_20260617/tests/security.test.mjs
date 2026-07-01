#!/usr/bin/env node
// tools/integration_os/tests/security.test.mjs
// MP35 — security boundary scan over integration_os: no second writer, no direct canonical write,
// no direct send/SMTP/Telegram/unofficial-channel, no secret propagation, no PII in analytics,
// no offline mutation, no duplicate ledger, no merge/migration/doc-apply/delete. Self-enforcing.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRODUCTION_MUTATION_ALLOWED, LIVE_API_ACCESS_ALLOWED, NETWORK_ALLOWED, SEND_ALLOWED,
  CANONICAL_WRITE_ALLOWED, BRANCH_MERGE_ALLOWED, MIGRATION_APPLY_ALLOWED, DOC_APPLY_ALLOWED,
  FILE_DELETE_ALLOWED, GIT_PUSH_ALLOWED, GIT_REMOTE_ALLOWED,
} from '../lib/common.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GEN = path.resolve(ROOT, '../../_generated/integration_os');

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

function walk(dir) { const out = []; if (!existsSync(dir)) return out; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!/node_modules|\.git/.test(e.name)) out.push(...walk(p)); } else out.push(p); } return out; }
const files = [...walk(ROOT), ...walk(GEN)].filter((f) => /\.(mjs|js|json|md|txt)$/.test(f) && statSync(f).size < 2 * 1024 * 1024);

const SECRET_RX = [
  { name: 'telegram_token', re: /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/ },
  { name: 'private_key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'password_assign', re: /(password|smtp_pass|api_key|secret)["']?\s*[:=]\s*["'][^\s"'${}()\\|\][]{8,}["']/i },
];
// Real contact = email NOT on synthetic/test domain. Fixtures use @synthetic.test/@example.test.
const REAL_EMAIL_RX = /[A-Za-z0-9._%+-]+@(?!synthetic\.test)(?!example\.test)(?!.*\.test\b)[A-Za-z0-9.-]+\.(ru|com|org|net|io)\b/;
const isThisSecTest = (rel) => rel.endsWith('tests/security.test.mjs');
const importsForbidden = (txt, libRe) => new RegExp(`(?:import[^;\\n]*from\\s*['"]|require\\s*\\(\\s*['"])[^'"]*(?:${libRe})`, 'i').test(txt);

let secret = 0, send = 0, network = 0, prod = 0, merge = 0, del = 0, contact = 0, unofficial = 0;
for (const file of files) {
  const txt = readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const isCode = /\.(mjs|js)$/.test(rel); // invocation checks apply to code only; data/docs may NAME forbidden things
  if (!isThisSecTest(rel)) for (const s of SECRET_RX) if (s.re.test(txt)) { secret++; console.log(`  secret (${s.name}) in ${rel}`); }
  if (isCode && !/tests\//.test(rel)) {
    if (/(nodemailer|createTransport|\.sendMail\s*\(|bot\.sendMessage\s*\(|smtp\.send\s*\()/.test(txt)) { send++; console.log(`  send in ${rel}`); }
    if (/(fetch\s*\(\s*['"]https?:|axios\.(get|post)\s*\(|https?\.request\s*\(|net\.connect\s*\(|new WebSocket|api\.telegram\.org\/bot)/.test(txt)) { network++; console.log(`  network in ${rel}`); }
    if (importsProd(txt)) { prod++; console.log(`  prod write in ${rel}`); }
    if (/(execSync\s*\(\s*['"]git (merge|push|cherry-pick|rebase)|git\s+merge|git\s+push)/.test(txt)) { merge++; console.log(`  merge/push in ${rel}`); }
    if (/(rmSync\s*\(|unlinkSync\s*\(|rmdirSync\s*\(|fs\.rm\s*\()/.test(txt)) { del++; console.log(`  delete in ${rel}`); }
    if (importsForbidden(txt, 'whatsapp-web|baileys|telethon|puppeteer|playwright')) { unofficial++; console.log(`  unofficial automation in ${rel}`); }
  }
  if (/fixtures|samples|generated|data\//.test(rel) && REAL_EMAIL_RX.test(txt)) { contact++; console.log(`  real contact in ${rel}`); }
}
function importsProd(txt) { return /(?:import[^;\n]*from\s*['"]|require\s*\(\s*['"])[^'"]*mater_controller_api\/src/.test(txt) || /ssh2|exec.*systemctl|\.deploy\s*\(/.test(txt); }

ok('NO_SECRET_OUTPUT', secret === 0, `hits=${secret}`);
ok('NO_SEND_METHOD', send === 0, `hits=${send}`);
ok('NO_NETWORK_OR_LIVE_API', network === 0, `hits=${network}`);
ok('NO_PRODUCTION_CANONICAL_WRITE', prod === 0, `hits=${prod}`);
ok('NO_BRANCH_MERGE_OR_PUSH', merge === 0, `hits=${merge}`);
ok('NO_FILE_DELETE', del === 0, `hits=${del}`);
ok('NO_UNOFFICIAL_AUTOMATION', unofficial === 0, `hits=${unofficial}`);
ok('NO_REAL_CONTACTS', contact === 0, `hits=${contact}`);

// Invariants locked OFF
const inv = { PRODUCTION_MUTATION_ALLOWED, LIVE_API_ACCESS_ALLOWED, NETWORK_ALLOWED, SEND_ALLOWED, CANONICAL_WRITE_ALLOWED, BRANCH_MERGE_ALLOWED, MIGRATION_APPLY_ALLOWED, DOC_APPLY_ALLOWED, FILE_DELETE_ALLOWED, GIT_PUSH_ALLOWED, GIT_REMOTE_ALLOWED };
for (const [k, v] of Object.entries(inv)) ok(`${k} false`, v === false);

// Ownership boundary: exactly one canonical writer; no second writer for MC-owned entities
const ownership = JSON.parse(readFileSync(path.join(ROOT, 'data/ownership_matrix.json'), 'utf8'));
const mcEntities = ['lead', 'approval', 'send_ledger_entry', 'reply', 'opt_out'];
for (const e of mcEntities) {
  const ent = ownership.entities.find((x) => x.entity === e);
  ok(`no second writer: ${e}`, ent && ent.canonical_writer === 'master_controller' && !Array.isArray(ent.canonical_writer));
}
// No duplicate ledger: only one send_ledger_entry owner
ok('no duplicate ledger', ownership.entities.filter((e) => e.entity === 'send_ledger_entry').length === 1);

// Generated artifacts confined
const stray = files.filter((f) => /_generated[\\/]/.test(f) && !path.resolve(f).startsWith(path.resolve(GEN)));
ok('generated artifacts confined', stray.length === 0, `stray=${stray.length}`);

console.log(`\nsecurity.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
