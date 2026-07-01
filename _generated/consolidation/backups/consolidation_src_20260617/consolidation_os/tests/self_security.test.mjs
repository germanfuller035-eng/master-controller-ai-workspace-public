#!/usr/bin/env node
// tools/consolidation_os/tests/self_security.test.mjs — Consolidation boundary self-test.
// Proves the consolidation_os tree: no network/production/send/tag/push/remote/branch-delete/
// worktree-delete/file-delete, no secret value, no production-vault write target.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NETWORK_ALLOWED, PRODUCTION_ACCESS_ALLOWED, PRODUCTION_CANONICAL_WRITE_ALLOWED, SEND_ALLOWED,
  DEPLOY_ALLOWED, PRODUCTION_BRANCH_MERGE_ALLOWED, TAG_CREATE_ALLOWED, GIT_PUSH_ALLOWED,
  GIT_REMOTE_ALLOWED, BRANCH_DELETE_ALLOWED, WORKTREE_DELETE_ALLOWED, FILE_DELETE_ALLOWED,
} from '../lib/common.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GEN = path.resolve(ROOT, '../../_generated/consolidation');

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

function walk(dir) { const out = []; if (!existsSync(dir)) return out; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!/node_modules|\.git|backups/.test(e.name)) out.push(...walk(p)); } else out.push(p); } return out; }
const files = [...walk(ROOT), ...walk(GEN)].filter((f) => /\.(mjs|js|json|md|txt)$/.test(f) && statSync(f).size < 2 * 1024 * 1024);

let net = 0, send = 0, prod = 0, tag = 0, push = 0, del = 0, secret = 0;
const SECRET = /(password|app_password|smtp_pass|api_key)["']?\s*[:=]\s*["'](?!FAKE|REDACTED|EXAMPLE|env:|process|real|<)[A-Za-z0-9]{10,}["']/i;
for (const file of files) {
  const txt = readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const isCode = /\.(mjs|js)$/.test(rel);
  if (!/tests\//.test(rel) && SECRET.test(txt)) { secret++; console.log(`  secret value in ${rel}`); }
  if (isCode && !/tests\//.test(rel)) {
    if (/(fetch\s*\(\s*['"]https?:|axios\.(get|post)\s*\(|https?\.request\s*\(|net\.connect\s*\(|new WebSocket)/.test(txt)) { net++; console.log(`  network in ${rel}`); }
    if (/(nodemailer|\.sendMail\s*\(|bot\.sendMessage\s*\(|smtp\.send\s*\()/.test(txt)) { send++; console.log(`  send in ${rel}`); }
    // production vault write or systemctl/ssh
    if (/(ssh2|systemctl|\.deploy\s*\()/.test(txt)) { prod++; console.log(`  prod in ${rel}`); }
    if (/(execSync\s*\(\s*['"]git tag|git\s+tag\s)/.test(txt)) { tag++; console.log(`  tag in ${rel}`); }
    if (/(execSync\s*\(\s*['"]git (push|remote)|git\s+push|git\s+remote)/.test(txt)) { push++; console.log(`  push/remote in ${rel}`); }
    if (/(rmSync\s*\(|unlinkSync\s*\(|rmdirSync\s*\(|fs\.rm\s*\(|git\s+(branch\s+-D|worktree\s+remove))/.test(txt)) { del++; console.log(`  delete in ${rel}`); }
  }
}

ok('NO_SECRET_VALUE', secret === 0, `hits=${secret}`);
ok('NO_NETWORK', net === 0, `hits=${net}`);
ok('NO_SEND', send === 0, `hits=${send}`);
ok('NO_PRODUCTION_ACCESS', prod === 0, `hits=${prod}`);
ok('NO_TAG_CREATE', tag === 0, `hits=${tag}`);
ok('NO_PUSH_OR_REMOTE', push === 0, `hits=${push}`);
ok('NO_DELETE', del === 0, `hits=${del}`);

const inv = { NETWORK_ALLOWED, PRODUCTION_ACCESS_ALLOWED, PRODUCTION_CANONICAL_WRITE_ALLOWED, SEND_ALLOWED, DEPLOY_ALLOWED, PRODUCTION_BRANCH_MERGE_ALLOWED, TAG_CREATE_ALLOWED, GIT_PUSH_ALLOWED, GIT_REMOTE_ALLOWED, BRANCH_DELETE_ALLOWED, WORKTREE_DELETE_ALLOWED, FILE_DELETE_ALLOWED };
for (const [k, v] of Object.entries(inv)) ok(`${k} false`, v === false);

console.log(`\nself_security.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
