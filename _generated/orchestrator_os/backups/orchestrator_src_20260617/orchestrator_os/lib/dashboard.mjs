// tools/orchestrator_os/lib/dashboard.mjs
// MP38-39 — Agent Orchestration Dashboard + Owner Command Center. Derived, read-only.
import { SCENARIOS, runScenario } from './simulator.mjs';

export function buildDashboard(ds, ts) {
  const scen = ds.fixtures?.scenarios || [];
  const tasks = scen.filter((s) => s.task).map((s) => s.task);
  const byStatus = (st) => tasks.filter((t) => t.status === st).length;
  const ownerGated = tasks.filter((t) => ['OWNER_GATED', 'PRODUCTION_PROHIBITED'].includes(t.execution_mode));
  const prodProhibited = tasks.filter((t) => t.execution_mode === 'PRODUCTION_PROHIBITED' || /R5|R6/.test(t.risk_level));
  return {
    schema: 'orchestrator_os.dashboard.v1',
    generated_ts: ts || 'UNSTAMPED',
    synthetic: true,
    note: 'Derived orchestration view. No real agent/scheduler/queue. References AI HQ task ledger + Executive priorities.',
    tasks_total: tasks.length,
    running_synthetic_simulations: SCENARIOS.length,
    ready: byStatus('READY'),
    waiting_dependency: byStatus('WAITING_DEPENDENCY'),
    waiting_owner: byStatus('WAITING_OWNER') + ownerGated.length,
    budget_warnings: scen.filter((s) => /budget/i.test(s.id)).length,
    retries: scen.filter((s) => /retry/i.test(s.id)).length,
    failures: byStatus('FAILED_TERMINAL') + byStatus('FAILED_RETRYABLE'),
    dead_letters: byStatus('DEAD_LETTER') + scen.filter((s) => /dead_letter/i.test(s.id)).length,
    verification_pending: scen.filter((s) => /verification/i.test(s.id)).length,
    agent_allocation: { CLAUDE_CODE: 'repo-wide', CLINE: 'file-local', DETERMINISTIC: 'validation/reports', HUMAN_OWNER: 'gated' },
    token_estimates: 'ESTIMATED only; confirmed=UNKNOWN (no real runs)',
    context_freshness: 'reuses AI HQ context_pack_builder (deterministic content-date freshness)',
    production_prohibited_tasks: prodProhibited.length,
  };
}

export function buildOwnerCenter(ds, ts) {
  const scen = ds.fixtures?.scenarios || [];
  const tasks = scen.filter((s) => s.task).map((s) => s.task);
  const ownerGate = tasks.find((t) => ['OWNER_GATED'].includes(t.execution_mode) || /R4|R5|R6/.test(t.risk_level));
  const highRisk = [...tasks].sort((a, b) => (b.risk_level || '').localeCompare(a.risk_level || ''))[0];
  return {
    schema: 'orchestrator_os.owner_command_center.v1',
    generated_ts: ts || 'UNSTAMPED',
    synthetic: true,
    highest_priority_owner_gate: ownerGate ? ownerGate.task_id : null,
    highest_risk_task: highRisk ? `${highRisk.task_id} (${highRisk.risk_level})` : null,
    largest_token_estimate: 'UNKNOWN (no real runs; estimates only)',
    duplicate_task_prevented: scen.some((s) => /duplicate/i.test(s.id)) ? 'yes (anti-loop BLOCK_DUPLICATE)' : 'none',
    failed_verification: scen.some((s) => /verification_fail/i.test(s.id)) ? 'present' : 'none',
    dead_letter: scen.some((s) => /dead_letter/i.test(s.id)) ? 'present' : 'none',
    task_ready_for_safe_local_execution: tasks.find((t) => t.status === 'READY' && /R0|R1|R2/.test(t.risk_level))?.task_id || null,
    production_request_intentionally_blocked: tasks.find((t) => /R5|R6/.test(t.risk_level))?.task_id || null,
    next_orchestration_action: 'Owner: review owner-gated tasks; all R3+ remain contract/policy-only this block',
    intentionally_not_done: ['no real agent launched', 'no scheduler created', 'no background process', 'no production/network/send', 'no proposed doc applied'],
  };
}
