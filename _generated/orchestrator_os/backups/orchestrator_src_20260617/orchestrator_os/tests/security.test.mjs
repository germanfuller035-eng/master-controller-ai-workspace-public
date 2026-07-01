#!/usr/bin/env node
// tools/orchestrator_os/tests/security.test.mjs — MP35 security boundary scan. Self-enforcing.
// No live agent launch, no scheduler creation, no background process, no network/send/production,
// no canonical/production-queue write, no secret, no merge/delete. Invocation checks on code only.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRODUCTION_MUTATION_ALLOWED, LIVE_AGENT_EXECUTION_ALLOWED, BACKGROUND_PROCESS_ALLOWED,
  SCHEDULER_CREATION_ALLOWED, NETWORK_ALLOWED, SEND_ALLOWED, CANONICAL_WRITE_ALLOWED,
  PRODUCTION_QUEUE_WRITE_ALLOWED, SECRET_ACCESS_ALLOWED, DEPLOY_ALLOWED, MERGE_ALLOWED,
  DOC_APPLY_ALLOWED, FILE_DELETE_ALLOWED,
} from '../lib/common.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GEN = path.resolve(ROOT, '../../_generated/orchestrator_os');

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

function walk(dir) { const out = []; if (!existsSync(dir)) return out; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!/node_modules|\.git|backups/.test(e.name)) out.push(...walk(p)); } else out.push(p); } return out; }
const files = [...walk(ROOT), ...walk(GEN)].filter((f) => /\.(mjs|js|json|md|txt)$/.test(f) && statSync(f).size < 2 * 1024 * 1024);

const SECRET_RX = [
  { name: 'telegram_token', re: /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/ },
  { name: 'private_key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'password_assign', re: /(password|app_password|smtp_pass|api_key|secret)["']?\s*[:=]\s*["'][^\s"'${}()\\|\][]{8,}["']/i },
];
const REAL_EMAIL_RX = /[A-Za-z0-9._%+-]+@(?!synthetic\.test)(?!example\.test)(?!.*\.test\b)[A-Za-z0-9.-]+\.(ru|com|org|net|io)\b/;
const isSecTest = (rel) => rel.endsWith('tests/security.test.mjs');
const imports = (txt, re) => new RegExp(`(?:import[^;\\n]*from\\s*['"]|require\\s*\\(\\s*['"])[^'"]*(?:${re})`, 'i').test(txt);

let secret = 0, agentLaunch = 0, scheduler = 0, background = 0, network = 0, send = 0, prod = 0, del = 0, merge = 0, contact = 0;
for (const file of files) {
  const txt = readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const isCode = /\.(mjs|js)$/.test(rel); // invocation checks on code only; data/docs may NAME forbidden things
  if (!isSecTest(rel)) for (const s of SECRET_RX) if (s.re.test(txt)) { secret++; console.log(`  secret (${s.name}) in ${rel}`); }
  if (isCode && !/tests\//.test(rel)) {
    // launch a real agent subprocess
    if (/(spawn|execSync|exec)\s*\(\s*['"`].*(claude|cline)\b/i.test(txt) || /child_process.*claude/i.test(txt)) { agentLaunch++; console.log(`  agent launch in ${rel}`); }
    // create scheduler / cron / systemd / windows task
    if (/(crontab|schtasks|systemctl (enable|start)|New-ScheduledTask|registerScheduled)/i.test(txt)) { scheduler++; console.log(`  scheduler in ${rel}`); }
    // background process / daemon
    if (/(setInterval\s*\(|spawn\s*\([^)]*detached|fork\s*\(|daemon\(|while\s*\(\s*true\s*\))/.test(txt)) { background++; console.log(`  background in ${rel}`); }
    if (/(fetch\s*\(\s*['"]https?:|axios\.(get|post)\s*\(|https?\.request\s*\(|net\.connect\s*\(|new WebSocket|api\.telegram\.org\/bot)/.test(txt)) { network++; console.log(`  network in ${rel}`); }
    if (/(nodemailer|createTransport|\.sendMail\s*\(|smtp\.send\s*\(|imapflow|new Imap\s*\()/.test(txt)) { send++; console.log(`  send/imap in ${rel}`); }
    if (/(?:import[^;\n]*from\s*['"]|require\s*\(\s*['"])[^'"]*mater_controller_api\/src/.test(txt) || /ssh2|\.deploy\s*\(/.test(txt)) { prod++; console.log(`  prod in ${rel}`); }
    if (/(rmSync\s*\(|unlinkSync\s*\(|rmdirSync\s*\(|fs\.rm\s*\()/.test(txt)) { del++; console.log(`  delete in ${rel}`); }
    if (/(execSync\s*\(\s*['"]git (merge|push)|git\s+merge|git\s+push)/.test(txt)) { merge++; console.log(`  merge/push in ${rel}`); }
  }
  if (/fixtures|samples|generated|data\//.test(rel) && REAL_EMAIL_RX.test(txt)) { contact++; console.log(`  real contact in ${rel}`); }
}

ok('NO_SECRET_OUTPUT', secret === 0, `hits=${secret}`);
ok('NO_REAL_AGENT_LAUNCH', agentLaunch === 0, `hits=${agentLaunch}`);
ok('NO_SCHEDULER_CREATION', scheduler === 0, `hits=${scheduler}`);
ok('NO_BACKGROUND_PROCESS', background === 0, `hits=${background}`);
ok('NO_NETWORK', network === 0, `hits=${network}`);
ok('NO_SEND_OR_IMAP', send === 0, `hits=${send}`);
ok('NO_PRODUCTION_ACCESS', prod === 0, `hits=${prod}`);
ok('NO_FILE_DELETE', del === 0, `hits=${del}`);
ok('NO_MERGE_OR_PUSH', merge === 0, `hits=${merge}`);
ok('NO_REAL_CONTACTS', contact === 0, `hits=${contact}`);

const inv = { PRODUCTION_MUTATION_ALLOWED, LIVE_AGENT_EXECUTION_ALLOWED, BACKGROUND_PROCESS_ALLOWED, SCHEDULER_CREATION_ALLOWED, NETWORK_ALLOWED, SEND_ALLOWED, CANONICAL_WRITE_ALLOWED, PRODUCTION_QUEUE_WRITE_ALLOWED, SECRET_ACCESS_ALLOWED, DEPLOY_ALLOWED, MERGE_ALLOWED, DOC_APPLY_ALLOWED, FILE_DELETE_ALLOWED };
for (const [k, v] of Object.entries(inv)) ok(`${k} false`, v === false);

const stray = files.filter((f) => /_generated[\\/]/.test(f) && !path.resolve(f).startsWith(path.resolve(GEN)));
ok('generated artifacts confined', stray.length === 0, `stray=${stray.length}`);

console.log(`\nsecurity.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
