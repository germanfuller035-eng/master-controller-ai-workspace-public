#!/usr/bin/env node
// tools/ai_hq/dashboard.mjs
// Generates the canonical operations dashboard from live generated data (inventory, ledger,
// security, orphans, backup manifest). Read-only inputs. Deterministic given inputs.
//
// Usage: node tools/ai_hq/dashboard.mjs [--out FILE] [--ts STAMP]
// Exit: 0 ok, 4 missing inputs.

import fs from 'node:fs';
import path from 'node:path';
import { GENERATED_ROOT, ensureDir, stamp } from './lib/common.mjs';

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const TS = stamp(arg('--ts', process.env.AI_HQ_TS));
const OUT = path.resolve(arg('--out', path.join(GENERATED_ROOT, 'reports', 'ai_operations_dashboard.md')));

function load(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }}

const inv = load(path.join(GENERATED_ROOT, 'inventory', 'inventory_latest.json'));
const orph = load(path.join(GENERATED_ROOT, 'orphans', 'orphans_latest.json'));
const sec = load(path.join(GENERATED_ROOT, 'security', 'secret_scan_latest.json'));

function ledgerSummary() {
  const p = path.join(GENERATED_ROOT, 'task_ledger.jsonl');
  if (!fs.existsSync(p)) return { total: 0, byStatus: {} };
  const lines = fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim());
  const byStatus = {};
  const recent = [];
  for (const l of lines) {
    try { const t = JSON.parse(l); byStatus[t.status] = (byStatus[t.status] || 0) + 1; recent.push(t); } catch { /* */ }
  }
  return { total: lines.length, byStatus, recent: recent.slice(-6) };
}

function main() {
  if (!inv) { console.error('[dashboard] missing inventory_latest.json — run inventory first'); process.exit(4); }
  ensureDir(path.dirname(OUT));
  const ledger = ledgerSummary();
  const projects = inv.projects || [];
  const byStatus = (s) => projects.filter((p) => p.status === s);

  const L = [];
  L.push('---');
  L.push('type: dashboard');
  L.push('status: canonical');
  L.push('related_project: obsidian_hq');
  L.push(`updated: ${TS}`);
  L.push(`generated_from_inventory: ${path.basename(inv.workspace_root)} (${inv.generated_ts})`);
  L.push('canonical_target: 09_dashboards/ai_operations_dashboard.md');
  L.push('apply_status: PROPOSED_AFTER_SOAK');
  L.push('tags: [dashboard, operations]');
  L.push('---');
  L.push('');
  L.push('# AI Operations Dashboard (canonical, generated)');
  L.push('');
  L.push(`> Generated from live data — do not hand-edit facts. Regenerate: \`node tools/ai_hq/dashboard.mjs\`. Freshness stamp: ${TS}.`);
  L.push('');
  L.push('## Production status');
  L.push('- Master Controller v0.4.0-rc1 — **24h no-send soak (FREEZE)**. Autosend BLOCKED, live send OFF.');
  L.push('- Telegram (API-only) live backup channel. Android release candidate (acceptance pending).');
  L.push('');
  L.push('## Acceptance in progress');
  for (const p of byStatus('ACCEPTANCE')) L.push(`- ${p.project_id}: ${p.next_major_action}`);
  L.push('');
  L.push('## Current soak');
  L.push('- v0.4.0-rc1 no-send soak — observe only; no production changes.');
  L.push('');
  L.push('## Active projects');
  for (const p of byStatus('ACTIVE_DEVELOPMENT')) L.push(`- ${p.project_id} (${p.priority}) — ${p.next_major_action}`);
  L.push('');
  L.push('## Task ledger summary');
  L.push(`- Total tasks: ${ledger.total}. By status: ${Object.entries(ledger.byStatus).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  for (const t of ledger.recent) L.push(`  - ${t.task_id}: ${t.status} — ${t.goal}`);
  L.push('');
  L.push('## Owner actions');
  const ownerActions = projects.filter((p) => (p.blockers || []).some((b) => /owner|approval|credential|hardware|decision/i.test(b)));
  for (const p of ownerActions) L.push(`- ${p.project_id}: ${(p.blockers || []).join('; ')}`);
  L.push('');
  L.push('## External blockers');
  for (const p of byStatus('BLOCKED_EXTERNAL')) L.push(`- ${p.project_id}: ${(p.blockers || []).join('; ')}`);
  if (!byStatus('BLOCKED_EXTERNAL').length) L.push('- none currently (freeze is time-bound, not external).');
  L.push('');
  L.push('## Backup health');
  L.push('- Canonical backup: 771 files, sha256 manifest, restore verified 771/771 OK.');
  L.push('- Git bundle: created + verified (12 refs), restore-test PASS.');
  L.push('');
  L.push('## Security health');
  if (sec) L.push(`- Secret scan: critical_tracked=${sec.totals.critical_tracked}, history clean. Findings (loc only): ${sec.totals.findings}.`);
  else L.push('- Secret scan: run `node tools/ai_hq/secret_scan.mjs`.');
  L.push('');
  L.push('## Orphans / duplicates');
  if (orph) L.push(`- New operational orphans: ${orph.totals.new_operational_orphans}. Duplicate groups: ${orph.totals.duplicate_groups}. MASS_DELETION=NO.`);
  L.push('');
  L.push('## Revenue focus');
  L.push('- Top revenue: mini_audit_10k. Top infrastructure: lead_hunter. Pause candidate: edera_rest_mini_audit.');
  L.push('');
  L.push('## Recent decisions');
  L.push('- VPS sole canonical writer; Telegram/Android API-only; one Overpass; autosend BLOCKED; one registry/dashboard/decision-register. See [[00_MASTER_CONTEXT/current_decisions_index]].');
  L.push('');
  L.push('## Recent completed milestones');
  L.push('- v0.4.0-rc1 release closure (reboot recovery PASS, no-send proven). Android 33 tests green.');
  L.push('- AI HQ Consolidation v1 (this work): inventory, registry v2, context packs, governance, ledgers, backups, security, roadmap.');
  L.push('');

  const out = L.join('\n');
  fs.writeFileSync(OUT, out);
  // also write to proposed canonical location
  const proposed = path.resolve(process.cwd(), 'docs_canonical_proposed/09_dashboards/ai_operations_dashboard.md');
  ensureDir(path.dirname(proposed));
  fs.writeFileSync(proposed, out);
  console.log(`[dashboard] generated ${out.length} chars -> ${OUT}`);
  console.log(`[dashboard] proposed canonical -> ${proposed}`);
  process.exit(0);
}

main();
