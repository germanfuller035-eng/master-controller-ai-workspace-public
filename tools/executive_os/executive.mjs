#!/usr/bin/env node
// tools/executive_os/executive.mjs
// Phase 36: Executive OS CLI. Offline, deterministic, no production mutation, no send, no decision execution.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { EXEC_ROOT, GENERATED_ROOT, FIXTURE_DIR, arg, nowStamp } from './lib/common.mjs';
import { buildSnapshot, summarizeSnapshot } from './lib/snapshot.mjs';
import { buildQueue } from './lib/decisions.mjs';
import { prioritize, gate } from './lib/portfolio.mjs';
import { nextBestAction } from './lib/nba.mjs';
import { attentionBudget } from './lib/attention.mjs';
import { analyzeDependencies } from './lib/dependencies.mjs';
import { aggregateRisks } from './lib/risk.mjs';
import { detectExceptions } from './lib/exceptions.mjs';
import { evaluateKPIs, dailyView, weeklyReview, monthlyReview, quarterlyPlanning, operatingCadence } from './lib/reviews.mjs';
import { runAll } from './lib/scenarios.mjs';
import { allocate } from './lib/allocation.mjs';
import { continuityPlan } from './lib/governance.mjs';
import { ownerCommandCenter } from './lib/reports.mjs';
import { validateAll } from './lib/validators.mjs';

const cmd = process.argv[2];
const TS = nowStamp(arg('--ts'));
const OUT = path.join(GENERATED_ROOT, 'samples');
function out(name, data) { mkdirSync(OUT, { recursive: true }); const f = path.join(OUT, name); writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data, null, 2)); return f; }
function fx() { return JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'executive.json'), 'utf8')); }
function backlog() { return JSON.parse(readFileSync(path.join(EXEC_ROOT, 'data/decision_backlog.json'), 'utf8')).decisions; }

function main() {
  switch (cmd) {
    case 'snapshot': { const s = buildSnapshot({ ts: TS }); out('snapshot.json', s); console.log(JSON.stringify(summarizeSnapshot(s))); return 0; }
    case 'owner-next': {
      const q = buildQueue(backlog());
      const nba = nextBestAction({ decisions: q.queue.map((p) => ({ decision_id: p.decision_id, score: p.score, status: p.status })), capacityKnown: false, aiCandidates: ['generate weekly review', 'refresh snapshot'], freeze: true });
      out('owner_next.json', nba); console.log(`primary: ${JSON.stringify(nba.primary_owner_action)} | blocked: ${nba.blocked_actions.length}`); return 0;
    }
    case 'decisions': { const q = buildQueue(backlog()); out('decisions.json', q); console.log(`total=${q.total} ready_for_owner=${q.ready_for_owner} needs_data=${q.needs_data}`); return 0; }
    case 'decision': { const id = process.argv[3]; const d = backlog().find((x) => x.decision_id === id); if (!d) { console.error('not found'); return 2; } console.log(JSON.stringify(d, null, 2)); return 0; }
    case 'portfolio': case 'prioritize': { const p = prioritize(fx().portfolio.stable); out('portfolio.json', p); p.ranked.forEach((r) => console.log(`  ${r.rank} ${r.project_id} score=${r.score} -> ${r.recommended_action}`)); return 0; }
    case 'dependencies': { const d = analyzeDependencies(fx().dependencies.blocked_chain.nodes, fx().dependencies.blocked_chain.edges); out('dependencies.json', d); console.log(`blocked_chains=${d.blocked_chains.length} cycle=${!!d.circular_dependency} critical_path=${d.critical_path.join('->')}`); return 0; }
    case 'risks': { const r = aggregateRisks(fx().risks); out('risks.json', r); console.log(`total=${r.total} by_severity=${JSON.stringify(r.by_severity)}`); return 0; }
    case 'exceptions': { const e = detectExceptions({ capacity_unknown: true, negative_cash_forecast: true, products_not_ready: ['ai_front_office'] }); out('exceptions.json', e); console.log(`total=${e.total} critical=${e.critical.length}`); return 0; }
    case 'kpis': { const k = evaluateKPIs({}); out('kpis.json', k); console.log(`kpis=${k.length} (referencing authoritative metrics)`); return 0; }
    case 'daily': { const d = dailyView({ primary_action: 'confirm weekly capacity' }); out('daily.json', d); console.log(`primary: ${d.primary_action}`); return 0; }
    case 'weekly': { const w = weeklyReview({ top_three: ['close soak', 'owner acceptance', 'confirm capacity'] }); out('weekly_review.md', w.markdown); out('weekly_review.json', w.json); console.log('weekly review generated'); return 0; }
    case 'monthly': { const m = monthlyReview({}); out('monthly_review.md', m.markdown); out('monthly_review.json', m.json); console.log('monthly review generated (Finance OS close as source)'); return 0; }
    case 'quarterly': { const q = quarterlyPlanning({ focus: ['mini_audit'], pause: ['edera'] }); out('quarterly.json', q); console.log(`quarterly: ${q.label}`); return 0; }
    case 'scenarios': { const s = runAll(fx().scenarios_base); out('scenarios.json', s); console.log(`scenarios=${Object.keys(s).length}`); return 0; }
    case 'resources': { const a = allocate({ demands: { p1: { owner_hours: 10, category: 'revenue' }, p2: { owner_hours: 8, category: 'infrastructure' } } }); out('resources.json', a); console.log(`status=${a.status} warnings=${a.warnings.length}`); return 0; }
    case 'continuity': { const c = continuityPlan(); out('continuity.json', c); console.log(`continuity items=${c.items.length}`); return 0; }
    case 'dashboard-refresh': { const occ = ownerCommandCenter({ critical_risks: ['negative cash (model)'] }); out('owner_command_center.json', occ); console.log(`OCC refreshed (references ${Object.keys(occ.references).length} domain dashboards)`); return 0; }
    case 'validate-all': { const r = validateAll(); console.log(`validate-all ok=${r.ok}`); for (const [k, v] of Object.entries(r.results)) console.log(`  ${k}: ok=${v.ok} ${v.errors ? 'errors=' + v.errors.length : ''}`); return r.ok ? 0 : 1; }
    default:
      console.log('executive commands: snapshot | owner-next | decisions | decision <id> | portfolio | prioritize |');
      console.log('  dependencies | risks | exceptions | kpis | daily | weekly | monthly | quarterly |');
      console.log('  scenarios | resources | continuity | dashboard-refresh | validate-all');
      return cmd ? 3 : 0;
  }
}
process.exit(main());
