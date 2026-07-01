#!/usr/bin/env node
// tools/ai_hq/task_ledger_validate.mjs
// Validates the anti-loop task ledger (JSONL). Read-only. Deterministic. Real exit codes.
//
// Usage: node tools/ai_hq/task_ledger_validate.mjs [--ledger PATH] [--now YYYY-MM-DD] [--stale-days N]
// Exit: 0 ok, 1 warnings, 2 errors, 3 bad invocation.

import fs from 'node:fs';
import path from 'node:path';
import { GENERATED_ROOT } from './lib/common.mjs';
import { allSeeds } from './lib/projects.mjs';

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const LEDGER = path.resolve(arg('--ledger', path.join(GENERATED_ROOT, 'task_ledger.jsonl')));
const NOW = arg('--now', process.env.AI_HQ_NOW || '2026-06-17');
const STALE_DAYS = parseInt(arg('--stale-days', '14'), 10);

const VALID_STATUS = new Set([
  'PLANNED', 'IN_PROGRESS', 'PARTIAL', 'BLOCKED', 'IMPLEMENTED', 'TESTED',
  'DEPLOYED', 'LIVE_VERIFIED', 'ACCEPTED', 'SUPERSEDED', 'CANCELLED',
]);
const knownIds = new Set(allSeeds().map((p) => p.project_id));

const errors = [];
const warnings = [];

function main() {
  if (!fs.existsSync(LEDGER)) { console.error(`[ledger] not found: ${LEDGER}`); process.exit(3); }
  const lines = fs.readFileSync(LEDGER, 'utf8').split('\n').filter((l) => l.trim());
  const tasks = [];
  lines.forEach((line, i) => {
    let t;
    try { t = JSON.parse(line); } catch { errors.push(`line ${i + 1}: invalid JSON`); return; }
    tasks.push(t);
  });

  const seenIds = new Map();
  const goalKey = new Map(); // duplicate-goal detection

  for (const t of tasks) {
    const id = t.task_id || '(no id)';
    if (!t.task_id) errors.push('task missing task_id');
    if (seenIds.has(t.task_id)) errors.push(`duplicate task_id: ${t.task_id}`);
    else seenIds.set(t.task_id, t);

    if (!VALID_STATUS.has(t.status)) errors.push(`${id}: invalid status ${t.status}`);
    if (t.project_id && !knownIds.has(t.project_id)) warnings.push(`${id}: unknown project_id ${t.project_id}`);

    // Evidence rules
    const terminal = ['IMPLEMENTED', 'TESTED', 'DEPLOYED', 'LIVE_VERIFIED', 'ACCEPTED'];
    if (terminal.includes(t.status) && !t.evidence) errors.push(`${id}: ${t.status} without evidence`);
    if (['DEPLOYED', 'LIVE_VERIFIED'].includes(t.status) && !t.commit && !t.deployment) {
      errors.push(`${id}: deployed/live without commit or deployment record`);
    }
    if (t.status === 'TESTED' && !t.tests) errors.push(`${id}: TESTED (PASS) without tests record`);
    if (t.status === 'LIVE_VERIFIED' && !/(live|vps|soak|proof)/i.test(JSON.stringify(t.evidence || '') + (t.deployment || ''))) {
      warnings.push(`${id}: LIVE_VERIFIED but evidence lacks live/VPS proof keyword`);
    }

    // Blocker without scope / missing next action
    if (t.status === 'BLOCKED' && !t.blocker) errors.push(`${id}: BLOCKED without blocker description`);
    if (['IN_PROGRESS', 'PARTIAL', 'BLOCKED', 'PLANNED'].includes(t.status) && !t.next_action) {
      warnings.push(`${id}: open task missing next_action`);
    }

    // Stale in-progress
    if (t.status === 'IN_PROGRESS' && t.started_at) {
      const age = Math.round((Date.parse(NOW) - Date.parse(t.started_at)) / 86400000);
      if (age > STALE_DAYS) warnings.push(`${id}: IN_PROGRESS stale (${age}d > ${STALE_DAYS}d)`);
    }

    // Duplicate goal (same project + near-identical goal, not marked supersedes/duplicate_of)
    if (t.project_id && t.goal) {
      const k = `${t.project_id}::${t.goal.slice(0, 40).toLowerCase()}`;
      if (goalKey.has(k) && !t.supersedes && !t.duplicate_of) {
        warnings.push(`${id}: possible duplicate goal of ${goalKey.get(k)} (set supersedes/duplicate_of)`);
      } else if (!goalKey.has(k)) goalKey.set(k, id);
    }
  }

  // Conflicting statuses: same project both ACCEPTED and IN_PROGRESS for same goal handled above.
  console.log(`[ledger] tasks=${tasks.length} errors=${errors.length} warnings=${warnings.length}`);
  for (const e of errors) console.log(`  ERROR  ${e}`);
  for (const w of warnings) console.log(`  WARN   ${w}`);

  if (errors.length) process.exit(2);
  if (warnings.length) process.exit(1);
  process.exit(0);
}

main();
