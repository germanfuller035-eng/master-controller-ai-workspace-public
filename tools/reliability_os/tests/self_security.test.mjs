#!/usr/bin/env node
// tools/reliability_os/tests/self_security.test.mjs — Reliability boundary self-test.
// Proves the reliability_os tree: no network/live-health/process-launch/scheduler/production/
// alert-send/delete/merge. Invocation checks on code only (data/docs may NAME forbidden things).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NETWORK_ALLOWED, LIVE_HEALTH_ALLOWED, PRODUCTION_MUTATION_ALLOWED, SERVICE_RESTART_ALLOWED,
  MONITORING_INSTALL_ALLOWED, BACKGROUND_PROCESS_ALLOWED, SCHEDULED_TASK_ALLOWED,
  LIVE_BACKUP_ALLOWED, PRODUCTION_RESTORE_ALLOWED, ALERT_SEND_ALLOWED, MERGE_ALLOWED, FILE_DELETE_ALLOWED,
} from '../lib/common.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GEN = path.resolve(ROOT, '../../_generated/reliability_os');

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

function walk(dir) { const out = []; if (!existsSync(dir)) return out; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!/node_modules|\.git|backups/.test(e.name)) out.push(...walk(p)); } else out.push(p); } return out; }
const files = [...walk(ROOT), ...walk(GEN)].filter((f) => /\.(mjs|js|json|md|txt)$/.test(f) && statSync(f).size < 2 * 1024 * 1024);

let net = 0, proc = 0, sched = 0, prod = 0, restart = 0, send = 0, del = 0, merge = 0, secret = 0;
const SECRET = /(password|app_password|smtp_pass|api_key)["']?\s*[:=]\s*["'](?!FAKE|REDACTED|EXAMPLE|env:|process|<)[A-Za-z0-9]{10,}["']/i;
for (const file of files) {
  const txt = readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const isCode = /\.(mjs|js)$/.test(rel);
  if (!/tests\//.test(rel) && SECRET.test(txt)) { secret++; console.log(`  secret value in ${rel}`); }
  if (isCode && !/tests\//.test(rel)) {
    if (/(fetch\s*\(\s*['"]https?:|axios\.(get|post)\s*\(|https?\.request\s*\(|net\.connect\s*\(|new WebSocket)/.test(txt)) { net++; console.log(`  network in ${rel}`); }
    if (/(spawn\s*\(|exec\s*\(|execSync\s*\(|fork\s*\(|setInterval\s*\(|while\s*\(\s*true\s*\))/.test(txt)) { proc++; console.log(`  process/loop in ${rel}`); }
    if (/(crontab|schtasks|systemctl (enable|start|restart)|New-ScheduledTask)/i.test(txt)) { sched++; console.log(`  scheduler/restart in ${rel}`); }
    if (/(?:import[^;\n]*from\s*['"]|require\s*\(\s*['"])[^'"]*mater_controller_api\/src/.test(txt) || /ssh2|\.deploy\s*\(/.test(txt)) { prod++; console.log(`  prod in ${rel}`); }
    if (/(nodemailer|\.sendMail\s*\(|bot\.sendMessage\s*\(|api\.telegram\.org\/bot|smtp\.send\s*\()/.test(txt)) { send++; console.log(`  send/alert in ${rel}`); }
    if (/(rmSync\s*\(|unlinkSync\s*\(|rmdirSync\s*\(|fs\.rm\s*\()/.test(txt)) { del++; console.log(`  delete in ${rel}`); }
    if (/(execSync\s*\(\s*['"]git (merge|push))/.test(txt)) { merge++; console.log(`  merge/push in ${rel}`); }
  }
}

ok('NO_SECRET_VALUE', secret === 0, `hits=${secret}`);
ok('NO_NETWORK', net === 0, `hits=${net}`);
ok('NO_PROCESS_LAUNCH', proc === 0, `hits=${proc}`);
ok('NO_SCHEDULER_OR_RESTART', sched === 0, `hits=${sched}`);
ok('NO_PRODUCTION_ACCESS', prod === 0, `hits=${prod}`);
ok('NO_SEND_OR_ALERT', send === 0, `hits=${send}`);
ok('NO_FILE_DELETE', del === 0, `hits=${del}`);
ok('NO_MERGE_OR_PUSH', merge === 0, `hits=${merge}`);

const inv = { NETWORK_ALLOWED, LIVE_HEALTH_ALLOWED, PRODUCTION_MUTATION_ALLOWED, SERVICE_RESTART_ALLOWED, MONITORING_INSTALL_ALLOWED, BACKGROUND_PROCESS_ALLOWED, SCHEDULED_TASK_ALLOWED, LIVE_BACKUP_ALLOWED, PRODUCTION_RESTORE_ALLOWED, ALERT_SEND_ALLOWED, MERGE_ALLOWED, FILE_DELETE_ALLOWED };
for (const [k, v] of Object.entries(inv)) ok(`${k} false`, v === false);

const stray = files.filter((f) => /_generated[\\/]/.test(f) && !path.resolve(f).startsWith(path.resolve(GEN)));
ok('generated artifacts confined', stray.length === 0, `stray=${stray.length}`);

console.log(`\nself_security.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
