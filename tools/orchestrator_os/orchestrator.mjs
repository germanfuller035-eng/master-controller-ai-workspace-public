#!/usr/bin/env node
// tools/orchestrator_os/orchestrator.mjs — Agent Automation & Orchestration CLI (MP40).
// OFFLINE, deterministic. No network, no production, no agent launch, no scheduler, no background
// process. Clear exit codes.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { GENERATED_ROOT, FIXTURE_DIR, arg, nowStamp, loadData, AGENT_TYPES, RISK_LEVELS, BUDGET_TYPES, RETRY_CLASSES } from './lib/common.mjs';
import { validateAll } from './lib/validators.mjs';
import { runScenario, SCENARIOS, simulateRun } from './lib/simulator.mjs';
import { buildPlan, analyzeDag, evaluateRetry } from './lib/engines.mjs';
import { buildDashboard, buildOwnerCenter } from './lib/dashboard.mjs';

const cmd = process.argv[2];
const sub = process.argv[3];
const TS = nowStamp(arg('--ts'));
const OUT = path.join(GENERATED_ROOT, 'samples');
function out(name, data) { mkdirSync(OUT, { recursive: true }); const f = path.join(OUT, name); writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data, null, 2)); return f; }
function fixtures() { return JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'orchestrator_fixtures.json'), 'utf8')); }
function tasks() { return fixtures().scenarios.filter((s) => s.task).map((s) => s.task); }
function findTask(id) { return tasks().find((t) => t.task_id === id || t.task_id.endsWith(id)); }
function dataset() {
  return { inventory: loadData('inventory.json'), policies: loadData('policies.json'), agents: loadData('agent_profiles.json'), fixtures: fixtures() };
}

function main() {
  const needsDs = !['help', undefined].includes(cmd);
  const ds = needsDs ? dataset() : null;
  switch (cmd) {
    case 'inventory': { console.log(`rows=${ds.inventory.rows.length} mc_systemd=${ds.inventory.counts.systemd_services} timers=${ds.inventory.counts.systemd_timers}`); return 0; }
    case 'tasks': { tasks().forEach((t) => console.log(`  ${t.task_id} [${t.task_type}] ${t.status} risk=${t.risk_level} mode=${t.execution_mode}`)); return 0; }
    case 'task': { const t = findTask(sub); if (!t) { console.error('not found'); return 2; } console.log(JSON.stringify(t, null, 2)); return 0; }
    case 'plan': { const t = findTask(sub); if (!t) { console.error('not found'); return 2; } const p = buildPlan(t); out(`plan_${t.task_id}.json`, p); console.log(`plan ${p.plan_id} phases=${p.phases.length} approval=${p.approval_state}`); return 0; }
    case 'dependencies': { const d = analyzeDag(tasks()); console.log(`dag ok=${d.ok} has_cycle=${d.has_cycle} issues=${d.issues.length}`); d.issues.forEach((i) => console.log(`  ${i.issue}${i.dep ? ' ' + i.dep : ''}`)); return 0; }
    case 'agents': { ds.agents.agents.forEach((a) => console.log(`  ${a.agent_id} [${a.agent_type}] ceiling=${a.risk_ceiling} gate=${a.requires_owner_gate}`)); return 0; }
    case 'capabilities': { ds.policies.capability_registry.forEach((c) => console.log(`  ${c.capability_id} risk=${c.risk} owner_approval=${c.requires_owner_approval}`)); return 0; }
    case 'policies': { ds.policies.policy_engine.policies.forEach((p) => console.log(`  - ${p}`)); return 0; }
    case 'budgets': { console.log(`budget_types=${BUDGET_TYPES.join(',')}`); console.log(`statuses=${ds.policies.budget_engine.statuses.join(',')}`); return 0; }
    case 'simulate': { const id = (sub || 'A').toUpperCase(); const r = runScenario(id); out(`sim_${id}.json`, r); console.log(`simulate ${r.scenario} ${r.name}: ${r.ok ? 'PASS' : 'FAIL'} steps=${(r.steps || []).length}`); return r.ok ? 0 : 1; }
    case 'checkpoint': { console.log(`checkpoint contract: ${ds.policies.checkpoint_resume.checkpoint_contains.join(', ')}`); return 0; }
    case 'resume': { console.log(`resume validates: ${ds.policies.checkpoint_resume.resume_validates.join(', ')}`); return 0; }
    case 'retries': { RETRY_CLASSES.forEach((c) => { const r = evaluateRetry({ class: c, attempts: 0, max_retries: 3 }); console.log(`  ${c}: retry=${r.retry} action=${r.action}`); }); return 0; }
    case 'dead-letters': { const dl = fixtures().scenarios.filter((s) => s.dead_letter); dl.forEach((s) => console.log(`  ${s.dead_letter.dead_letter_id} ${s.dead_letter.failure_category} owner_action=${s.dead_letter.owner_action}`)); return 0; }
    case 'owner-queue': { const c = buildOwnerCenter(ds, TS); console.log(`owner_gate=${c.highest_priority_owner_gate} high_risk=${c.highest_risk_task} prod_blocked=${c.production_request_intentionally_blocked}`); return 0; }
    case 'agent-queues': { console.log('ready_deterministic | ready_claude | ready_cline | waiting_dependency | waiting_owner | paused | retryable | verification_required'); return 0; }
    case 'artifacts': { console.log('artifact types: code|report|fixture|test_result|backup|git_bundle|proposed_docs|migration_plan|release_artifact (none canonical)'); return 0; }
    case 'metrics': { console.log(`events=${ds.policies.observability_contract.events.length} metrics=${ds.policies.observability_contract.metrics.length} (contracts only, no emitter)`); return 0; }
    case 'dashboard-refresh': { const d = buildDashboard(ds, TS); const c = buildOwnerCenter(ds, TS); out('orchestration_dashboard.json', d); out('owner_command_center.json', c); console.log(`dashboard refreshed tasks=${d.tasks_total} sims=${d.running_synthetic_simulations} owner_gated=${d.waiting_owner} prod_prohibited=${d.production_prohibited_tasks}`); return 0; }
    case 'validate-all': { const r = validateAll(ds); Object.entries(r.dimensions).filter(([, v]) => v !== 'PASS').forEach(([k, v]) => console.log(`  ${k}: ${v}`)); console.log(`validate-all: ${r.blockers === 0 ? 'OK' : 'BLOCKED'} blockers=${r.blockers} dimensions=${Object.keys(r.dimensions).length}`); return r.blockers === 0 ? 0 : 1; }
    default:
      console.error('orchestrator: inventory|tasks|task <id>|plan <id>|dependencies <id>|agents|capabilities|policies|budgets|simulate <A-L>|checkpoint|resume|retries|dead-letters|owner-queue|agent-queues|artifacts|metrics|dashboard-refresh|validate-all');
      return 3;
  }
}
process.exit(main());
