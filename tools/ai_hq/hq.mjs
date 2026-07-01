#!/usr/bin/env node
// tools/ai_hq/hq.mjs
// Minimal command layer for AI Operations HQ. Wraps the tools; offline; redacts; no prod writes.
//
// Usage: node tools/ai_hq/hq.mjs <command> [args]
//   workspace-health
//   project-list
//   project-status <id>
//   context-pack <id> --agent <claude|cline|chatgpt> [--task "..."]
//   registry-validate
//   links-check
//   orphans-report
//   backup-verify
//   git-bundle-create
//   git-bundle-verify
//   secret-scan-safe
//   dashboard-refresh
//   task-ledger-validate
// Exit codes propagate from underlying tools.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GENERATED_ROOT } from './lib/common.mjs';
import { allSeeds } from './lib/projects.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const T = (f) => path.join(__dirname, f);
const cmd = process.argv[2];
const rest = process.argv.slice(3);

function run(script, args = []) {
  try {
    execFileSync('node', [script, ...args], { stdio: 'inherit' });
    return 0;
  } catch (e) { return e.status ?? 1; }
}
function getArg(name) {
  const i = rest.indexOf(name);
  return i >= 0 && rest[i + 1] ? rest[i + 1] : null;
}

function projectList() {
  for (const p of allSeeds()) {
    console.log(`${p.project_id.padEnd(28)} ${p.status.padEnd(20)} ${p.priority.padEnd(16)} ${p.sensitive ? '[sensitive]' : ''}`);
  }
}
function projectStatus(id) {
  const p = allSeeds().find((x) => x.project_id === id);
  if (!p) { console.error(`unknown project: ${id}`); process.exit(2); }
  console.log(JSON.stringify(p, null, 2));
}
function workspaceHealth() {
  const inv = path.join(GENERATED_ROOT, 'inventory', 'inventory_latest.json');
  if (fs.existsSync(inv)) {
    const i = JSON.parse(fs.readFileSync(inv, 'utf8'));
    console.log(`files=${i.totals.files} projects=${i.projects.length} present=${i.projects.filter((p) => p.exists).length}`);
    console.log(`sensitive_files=${i.totals.sensitive_files} secret_contours=${i.totals.secret_contour_files} artifacts=${i.totals.release_artifacts}`);
  } else {
    console.log('no inventory yet — run: node tools/ai_hq/inventory.mjs');
  }
}

let code = 0;
switch (cmd) {
  case 'workspace-health': workspaceHealth(); break;
  case 'project-list': projectList(); break;
  case 'project-status': projectStatus(rest[0]); break;
  case 'context-pack':
    code = run(T('context_pack_builder.mjs'), ['--project', rest[0], '--agent', getArg('--agent') || 'claude', '--task', getArg('--task') || 'general']);
    break;
  case 'registry-validate':
  case 'links-check':
    code = run(T('validate.mjs'), ['--docs', 'docs_canonical_proposed', '--now', '2026-06-17']);
    break;
  case 'orphans-report': code = run(T('orphans.mjs'), ['--now', '2026-06-17']); break;
  case 'backup-verify': code = run(T('backup_verify.mjs'), ['manifest', '--src', rest[0] || '_generated/ai_hq/backups']); break;
  case 'git-bundle-create': code = run(T('backup_verify.mjs'), ['bundle', '--repo', '.']); break;
  case 'git-bundle-verify': code = run(T('backup_verify.mjs'), ['verify-bundle', '--bundle', rest[0]]); break;
  case 'secret-scan-safe': code = run(T('secret_scan.mjs'), ['--workspace', getArg('--workspace') || '.']); break;
  case 'dashboard-refresh': code = run(T('dashboard.mjs')); break;
  case 'task-ledger-validate': code = run(T('task_ledger_validate.mjs')); break;
  default:
    console.log('AI HQ commands: workspace-health | project-list | project-status <id> | context-pack <id> --agent X |');
    console.log('  registry-validate | links-check | orphans-report | backup-verify | git-bundle-create |');
    console.log('  git-bundle-verify <bundle> | secret-scan-safe | dashboard-refresh | task-ledger-validate');
    process.exit(cmd ? 3 : 0);
}
process.exit(code);
