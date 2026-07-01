#!/usr/bin/env node
// tools/executive_os/tests/executive.test.mjs
// Phase 39: Comprehensive offline test suite for Executive OS. Deterministic. Real exit code.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../../revenue_os/lib/schema.mjs';
import { SCHEMAS } from '../schemas/domain.mjs';
import { detectConflicts } from '../lib/sot.mjs';
import { validateHierarchy } from '../lib/goals.mjs';
import { buildQueue, buildPacket } from '../lib/decisions.mjs';
import { mapStatus, validateMapping } from '../lib/status.mjs';
import { buildSnapshot } from '../lib/snapshot.mjs';
import { prioritize, gate } from '../lib/portfolio.mjs';
import { nextBestAction } from '../lib/nba.mjs';
import { attentionBudget } from '../lib/attention.mjs';
import { analyzeDependencies } from '../lib/dependencies.mjs';
import { aggregateRisks } from '../lib/risk.mjs';
import { detectExceptions } from '../lib/exceptions.mjs';
import { evaluateKPIs, weeklyReview, monthlyReview, quarterlyPlanning } from '../lib/reviews.mjs';
import { checkAction } from '../lib/policy.mjs';
import { runScenario, runAll } from '../lib/scenarios.mjs';
import { allocate, decisionDebt } from '../lib/allocation.mjs';
import { classifyChange, releaseGate, continuityPlan } from '../lib/governance.mjs';
import { ownerCommandCenter, buildReport } from '../lib/reports.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const fx = JSON.parse(readFileSync(path.join(ROOT, 'fixtures/executive.json'), 'utf8'));
const backlog = JSON.parse(readFileSync(path.join(ROOT, 'data/decision_backlog.json'), 'utf8')).decisions;

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

// Source of truth
{
  const c = detectConflicts();
  ok('sot: no conflicts', c.ok, c.errors.join(';'));
  ok('sot: singletons present', c.singletons_present.length === 3);
}
// Goals
{
  const good = [{ objective_id: 'v1', name: 'Vision', description: 'd', category: 'c', status: 'ACTIVE', priority: 'P0', time_horizon: 'VISION', owner: 'o', metric_ids: ['m'], source_status: 'OWNER_TARGET', parent_id: null }];
  ok('goals: valid hierarchy', validateHierarchy(good).ok);
  ok('goals: missing metric caught', !validateHierarchy([{ ...good[0], objective_id: 'b', metric_ids: [] }]).ok);
  const dup = [good[0], { ...good[0], objective_id: 'v2' }];
  ok('goals: duplicate caught', !validateHierarchy(dup).ok);
}
// Domain schema
{
  const d = backlog[0];
  ok('schema: decision valid', validate(d, SCHEMAS.executive_decision, 'd').ok);
}
// Decisions
{
  const q = buildQueue(backlog);
  ok('decisions: queue built', q.total === 19);
  ok('decisions: ready+needs split', q.ready_for_owner + q.needs_data === q.total);
  ok('decisions: no auto-approve (pre-set verdict rejected)', !buildPacket({ ...backlog[0], status: 'APPROVED' }).ok);
}
// Status
{
  ok('status: DRAFT->NOT_SELLABLE', mapStatus('product', 'DRAFT').executive_summary_status === 'NOT_SELLABLE');
  ok('status: forecast target labeled', mapStatus('finance', 'OWNER_TARGET').executive_summary_status === 'TARGET');
  ok('status: mapping valid', validateMapping().ok);
}
// Snapshot
{
  const s = buildSnapshot({ ts: 'T' });
  ok('snapshot: has provenance', s.provenance.length >= 2);
  ok('snapshot: projects from index', s.projects.length > 0);
  ok('snapshot: missing-data warnings', s.warnings.length >= 1);
}
// Portfolio
{
  const p = prioritize(fx.portfolio.stable);
  ok('portfolio: ranked', p.ranked[0].rank === 1);
  ok('portfolio: mini_audit focus', p.ranked.find((r) => r.project_id === 'mini_audit').recommended_action === 'FOCUS_NOW');
  ok('portfolio: weights visible', !!p.weights);
}
// Gate
{
  ok('gate: GO', gate({ outcome: 'x', owner: 'o', capacity_available: true, source_of_truth: 'y', expected_value: 'z', done_definition: 'd' }).decision === 'GO');
  ok('gate: STOP on duplicate', gate(fx.gates.duplicate_system).decision === 'STOP_RECOMMENDED');
  ok('gate: PAUSE no capacity', gate(fx.gates.revenue_no_capacity).decision === 'PAUSE');
}
// NBA
{
  const nba = nextBestAction({ decisions: [{ decision_id: 'd1', score: 11, status: 'READY_FOR_OWNER' }], capacityKnown: false, aiCandidates: ['weekly review', 'deploy to production'], freeze: true });
  ok('nba: production blocked during freeze', nba.blocked_actions.some((b) => /deploy/.test(b.action)));
  ok('nba: primary is owner action', nba.primary_owner_action.kind === 'owner_decision' || nba.primary_owner_action.kind === 'owner_input');
  ok('nba: ai actions separated', nba.ai_actions_without_owner.length >= 1);
}
// Attention
{
  ok('attention: UNKNOWN without capacity', attentionBudget(fx.attention.capacity_unknown).status === 'UNKNOWN');
  ok('attention: overload computed', attentionBudget(fx.attention.owner_overloaded).overload_risk === 'HIGH');
}
// Dependencies
{
  ok('deps: cycle detected', !!analyzeDependencies(fx.dependencies.circular.nodes, fx.dependencies.circular.edges).circular_dependency);
  ok('deps: blocked chain (sold before ready)', analyzeDependencies(fx.dependencies.blocked_chain.nodes, fx.dependencies.blocked_chain.edges).blocked_chains.length >= 1);
  ok('deps: owner dependency', analyzeDependencies(fx.dependencies.owner_dependency.nodes, fx.dependencies.owner_dependency.edges).owner_dependencies.length >= 1);
}
// Risk / exceptions
{
  const r = aggregateRisks(fx.risks);
  ok('risk: critical detected', r.by_severity.CRITICAL >= 1);
  ok('risk: references source', r.risks[0].source_risk_id != null);
  const e = detectExceptions({ capacity_unknown: true, negative_cash_forecast: true });
  ok('exceptions: critical', e.critical.length >= 1);
  ok('exceptions: no notifications note', /no external notifications/i.test(e.note));
}
// KPI / reviews
{
  ok('kpi: 10 referencing authoritative', evaluateKPIs({}).every((k) => k.references_authoritative));
  ok('weekly: review + actions', !!weeklyReview({ owner_tasks: ['a'] }).actions);
  ok('monthly: finance close source', /Finance OS monthly close/.test(monthlyReview({}).json.finance_close_source));
  ok('quarterly: proposed internal', quarterlyPlanning({}).label === 'PROPOSED_INTERNAL');
}
// Policy
{
  ok('policy: deploy-freeze blocked', !checkAction({ type: 'production_deploy', freeze: true }).ok);
  ok('policy: auto-decision blocked', !checkAction({ type: 'execute_decision', actor: 'ai' }).ok);
  ok('policy: invoice unapproved-price blocked', !checkAction({ type: 'invoice', price_approved: false }).ok);
  ok('policy: forecast-confirmed blocked', !checkAction({ type: 'label', kind: 'forecast', label: 'CONFIRMED' }).ok);
  ok('policy: offline test allowed', checkAction({ type: 'offline_tests' }).ok);
}
// Scenarios
{
  ok('scenarios: 12', Object.keys(runAll(fx.scenarios_base)).length === 12);
  ok('scenarios: no_new_sales zero revenue', runScenario('no_new_sales', fx.scenarios_base).revenue_implication === 0);
  ok('scenarios: assumptions visible', !!runScenario('base', fx.scenarios_base).assumptions);
}
// Allocation / decision debt
{
  ok('allocation: UNKNOWN without capacity', allocate({ demands: { p: { owner_hours: 5 } } }).status === 'UNKNOWN_OWNER_CAPACITY');
  ok('allocation: over-allocation warned', allocate({ owner_weekly_hours: 10, demands: { p: { owner_hours: 20 } } }).over_allocated);
  const dd = decisionDebt(fx.decision_overdue, '2026-06-17');
  ok('decision debt: overdue detected', dd.overdue.length === 1);
  ok('decision debt: stale detected', dd.stale_repeated_deferrals.length === 1);
}
// Governance
{
  ok('change: product_price needs owner', classifyChange('product_price').requires_owner_approval);
  ok('change: offline_tests AI-allowed', classifyChange('offline_tests').ai_allowed);
  ok('release: accepted-without-deployed blocked', !releaseGate(fx.gates.release_not_accepted).valid);
  ok('release: soak T+0 blocked', !releaseGate(fx.gates.soak_in_progress).valid);
  ok('continuity: 11 risks, no secrets', continuityPlan().items.length === 11);
}
// Reports / OCC
{
  ok('OCC: references domain dashboards', Object.keys(ownerCommandCenter({}).references).length === 5);
  ok('OCC: does not duplicate (note)', /does NOT duplicate/i.test(ownerCommandCenter({}).note));
  ok('report: internal owner only', buildReport('daily_owner_brief', {}).json.label === 'INTERNAL_OWNER_ONLY');
  ok('report: no send', buildReport('daily_owner_brief', {}).json.send_allowed === false);
}

console.log(`\n[executive.test] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
