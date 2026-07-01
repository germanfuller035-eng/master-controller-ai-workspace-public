#!/usr/bin/env node
// tools/conversation_hub/tests/security.test.mjs
// Security scan over Conversation Hub: NO network, NO send, NO SMTP/IMAP, NO Telegram/WhatsApp/MAX
// API, NO production mutation, NO live canonical reads, NO secrets, NO real contacts, NO unofficial
// channel automation. The negative-example fixture block is fenced + intentional.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SEND_ALLOWED, NETWORK_ALLOWED, SMTP_ALLOWED, IMAP_ALLOWED, TELEGRAM_API_ALLOWED,
  WHATSAPP_API_ALLOWED, MAX_API_ALLOWED, CANONICAL_WRITE_ALLOWED, PRODUCTION_READ_ALLOWED,
  LIVE_CHANNEL_CONNECT_ALLOWED, UNOFFICIAL_CHANNEL_AUTOMATION_ALLOWED,
} from '../lib/common.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GEN = path.resolve(ROOT, '../../_generated/conversation_hub');

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

function walk(dir) { const out = []; if (!existsSync(dir)) return out; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!/node_modules|\.git/.test(e.name)) out.push(...walk(p)); } else out.push(p); } return out; }
const files = [...walk(ROOT), ...walk(GEN)].filter((f) => /\.(mjs|js|json|md|txt|html)$/.test(f) && statSync(f).size < 2 * 1024 * 1024);

const SECRET_RX = [
  { name: 'telegram_token', re: /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/ },
  { name: 'private_key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  // A real secret assignment has a LITERAL value — not a template interpolation (${...}),
  // a pattern-name reference, or a regex. Exclude values containing $ { } / \ ( ) | (code/regex).
  { name: 'password_assign', re: /(password|smtp_pass|api_key|secret)["']?\s*[:=]\s*["'][^\s"'${}()\\|\][]{8,}["']/i },
];
// Real contact = an email NOT on a synthetic/test domain. Fixtures use @synthetic.test / @example.test.
const REAL_EMAIL_RX = /[A-Za-z0-9._%+-]+@(?!synthetic\.test)(?!example\.test)(?!.*\.test\b)[A-Za-z0-9.-]+\.(ru|com|org|net|io)\b/;

// Forbidden module imports/requires — flagged ONLY when actually imported, not when named in a
// prohibition list (data .json) or a comment. This is the real risk surface.
const importsForbidden = (txt, libRe) => new RegExp(`(?:import[^;\\n]*from\\s*['"]|require\\s*\\(\\s*['"])[^'"]*(?:${libRe})`, 'i').test(txt);
// A prod-access import = importing from the live Master Controller source tree (not documenting its path).
const importsProd = (txt) => /(?:import[^;\n]*from\s*['"]|require\s*\(\s*['"])[^'"]*mater_controller_api\/src/.test(txt) || /ssh2|exec.*systemctl|\.deploy\s*\(/.test(txt);

let secret = 0, send = 0, network = 0, smtp = 0, imap = 0, tg = 0, wa = 0, prod = 0, liveRead = 0, contact = 0, unofficial = 0;
for (const file of files) {
  const txt = readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const isTest = /tests\//.test(rel);
  const isCode = /\.(mjs|js)$/.test(rel);      // invocation patterns only matter in executable code; data/docs may NAME forbidden things to forbid/document them
  // secret VALUES (skip this test file's own regex definitions)
  const isThisSecTest = rel.endsWith('tests/security.test.mjs');
  if (!isThisSecTest) for (const s of SECRET_RX) if (s.re.test(txt)) { secret++; console.log(`  secret (${s.name}) in ${rel}`); }
  if (!isTest && isCode) {
    // actual send / transport invocations (not the words in contracts/comments/forbidden lists)
    if (/(nodemailer|createTransport|\.sendMail\s*\(|bot\.sendMessage\s*\(|smtp\.send\s*\(|transporter\.send)/.test(txt)) { send++; console.log(`  send in ${rel}`); }
    if (/(fetch\s*\(\s*['"]https?:|axios\.(get|post)\s*\(|http\.request\s*\(|https\.request\s*\(|net\.connect\s*\(|new WebSocket)/.test(txt)) { network++; console.log(`  network in ${rel}`); }
    if (/(createConnection\s*\([^)]*587|smtp:\/\/[a-z]|transporter\s*=)/.test(txt)) { smtp++; console.log(`  smtp in ${rel}`); }
    if (importsForbidden(txt, 'imapflow|node-imap') || /imap\.connect\s*\(|new Imap\s*\(/.test(txt)) { imap++; console.log(`  imap in ${rel}`); }
    if (/(api\.telegram\.org\/bot|\.sendMessage\s*\(\s*\{)/.test(txt)) { tg++; console.log(`  telegram api in ${rel}`); }
    if (importsForbidden(txt, 'whatsapp-web|@whiskeysockets|baileys') || /graph\.facebook\.com\/v\d/.test(txt)) { wa++; console.log(`  whatsapp/unofficial in ${rel}`); }
    if (importsProd(txt)) { prod++; console.log(`  prod access in ${rel}`); }
    if (/(live_canonical_read\s*\(|\.connect\s*\([^)]*\bdb\b)/.test(txt)) { liveRead++; console.log(`  live read in ${rel}`); }
    if (importsForbidden(txt, 'puppeteer|playwright|whatsapp-web\\.js|telethon')) { unofficial++; console.log(`  unofficial automation in ${rel}`); }
  }
  if (/fixtures|samples|generated|data\//.test(rel) && REAL_EMAIL_RX.test(txt)) { contact++; console.log(`  real contact in ${rel}`); }
}

ok('NO_SECRET_OUTPUT', secret === 0, `hits=${secret}`);
ok('NO_SEND_METHOD', send === 0, `hits=${send}`);
ok('NO_NETWORK_TRANSPORT', network === 0, `hits=${network}`);
ok('NO_SMTP', smtp === 0, `hits=${smtp}`);
ok('NO_IMAP', imap === 0, `hits=${imap}`);
ok('NO_TELEGRAM_API', tg === 0, `hits=${tg}`);
ok('NO_WHATSAPP_OR_UNOFFICIAL', wa === 0, `hits=${wa}`);
ok('NO_PRODUCTION_ACCESS', prod === 0, `hits=${prod}`);
ok('NO_LIVE_CANONICAL_READ', liveRead === 0, `hits=${liveRead}`);
ok('NO_UNOFFICIAL_AUTOMATION', unofficial === 0, `hits=${unofficial}`);
ok('NO_REAL_CONTACTS_IN_FIXTURES', contact === 0, `hits=${contact}`);

// Invariants locked OFF
ok('SEND_ALLOWED false', SEND_ALLOWED === false);
ok('NETWORK_ALLOWED false', NETWORK_ALLOWED === false);
ok('SMTP_ALLOWED false', SMTP_ALLOWED === false);
ok('IMAP_ALLOWED false', IMAP_ALLOWED === false);
ok('TELEGRAM_API_ALLOWED false', TELEGRAM_API_ALLOWED === false);
ok('WHATSAPP_API_ALLOWED false', WHATSAPP_API_ALLOWED === false);
ok('MAX_API_ALLOWED false', MAX_API_ALLOWED === false);
ok('CANONICAL_WRITE_ALLOWED false', CANONICAL_WRITE_ALLOWED === false);
ok('PRODUCTION_READ_ALLOWED false', PRODUCTION_READ_ALLOWED === false);
ok('LIVE_CHANNEL_CONNECT_ALLOWED false', LIVE_CHANNEL_CONNECT_ALLOWED === false);
ok('UNOFFICIAL_CHANNEL_AUTOMATION_ALLOWED false', UNOFFICIAL_CHANNEL_AUTOMATION_ALLOWED === false);

// Generated artifacts confined to _generated/conversation_hub
const stray = files.filter((f) => /_generated[\\/]/.test(f) && !path.resolve(f).startsWith(path.resolve(GEN)));
ok('all generated artifacts under _generated/conversation_hub', stray.length === 0, `stray=${stray.length}`);

// All channels declared NOT_CONNECTED
const ch = JSON.parse(readFileSync(path.join(ROOT, 'data/channel_contracts.json'), 'utf8'));
ok('all channels NOT_CONNECTED', ch.channels.every((c) => c.live_state === 'NOT_CONNECTED'));
ok('no channel implemented_here', ch.channels.every((c) => c.implemented_here === false));

console.log(`\nsecurity.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
