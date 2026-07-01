// tools/orchestrator_os/lib/engines.mjs
// MP13-20 — deterministic orchestration engines. Pure, offline, no agent launch, no network.
//   dependency DAG (MP13) · anti-loop (MP14) · plan builder (MP15) · budget (MP17) · lease (MP18)
//   checkpoint/resume (MP19) · retry (MP20) · agent selection (MP9) · model routing (MP10)
import { checksum, RISK_LEVELS, riskIndex, exceedsMaxRisk } from './common.mjs';

// ---------------------------------------------------------------------------
// MP13 — Dependency DAG. Detects cycles, missing/failed/stale/superseded deps.
// ---------------------------------------------------------------------------
export function analyzeDag(tasks) {
  const byId = new Map(tasks.map((t) => [t.task_id, t]));
  const issues = [];
  // cycle detection (DFS)
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(tasks.map((t) => [t.task_id, WHITE]));
  let cycle = null;
  function dfs(id, stack) {
    color.set(id, GRAY);
    for (const dep of (byId.get(id)?.dependencies || [])) {
      if (!byId.has(dep)) { issues.push({ task: id, issue: 'missing_dependency', dep }); continue; }
      if (color.get(dep) === GRAY) { cycle = [...stack, id, dep]; return true; }
      if (color.get(dep) === WHITE && dfs(dep, [...stack, id])) return true;
    }
    color.set(id, BLACK);
    return false;
  }
  for (const t of tasks) if (color.get(t.task_id) === WHITE) if (dfs(t.task_id, [])) break;
  if (cycle) issues.push({ issue: 'cycle', path: cycle });
  // dependency state checks
  for (const t of tasks) {
    for (const dep of (t.dependencies || [])) {
      const d = byId.get(dep);
      if (!d) continue;
      if (['FAILED_TERMINAL', 'DEAD_LETTER', 'CANCELLED'].includes(d.status)) issues.push({ task: t.task_id, issue: 'failed_dependency', dep });
      if (d.status === 'SUPERSEDED') issues.push({ task: t.task_id, issue: 'superseded_dependency', dep });
    }
  }
  return { ok: issues.length === 0, issues, has_cycle: !!cycle };
}

// can a task run? required deps must be COMPLETED.
export function canRun(task, tasks) {
  const byId = new Map(tasks.map((t) => [t.task_id, t]));
  for (const dep of (task.dependencies || [])) {
    const d = byId.get(dep);
    if (!d || !['COMPLETED', 'COMPLETED_WITH_NOTES'].includes(d.status)) return { runnable: false, reason: `dependency ${dep} incomplete` };
  }
  return { runnable: true };
}

// ---------------------------------------------------------------------------
// MP14 — Anti-loop engine.
// ---------------------------------------------------------------------------
export function antiLoop(candidate, history) {
  // history: [{ task_id, objective_hash, status, approach_hash }]
  const objHash = candidate.objective_hash || checksum(candidate.objective || candidate.title || '');
  const sameObjective = history.filter((h) => h.objective_hash === objHash);
  const completed = sameObjective.find((h) => ['COMPLETED', 'COMPLETED_WITH_NOTES'].includes(h.status));
  if (completed) return { action: 'BLOCK_DUPLICATE', reason: 'identical objective already completed', ref: completed.task_id };
  const checkpointed = sameObjective.find((h) => h.status === 'CHECKPOINTED' || h.status === 'PAUSED');
  if (checkpointed) return { action: 'RESUME', reason: 'prior checkpoint exists', ref: checkpointed.task_id };
  const repeatedFail = sameObjective.filter((h) => h.status === 'FAILED_RETRYABLE' && h.approach_hash === candidate.approach_hash);
  if (repeatedFail.length >= 2) return { action: 'REQUIRE_NEW_EVIDENCE', reason: 'repeated identical failed approach', count: repeatedFail.length };
  if (candidate.supersedes) return { action: 'SUPERSEDE', reason: 'explicitly supersedes prior', ref: candidate.supersedes };
  if (sameObjective.length > 0) return { action: 'OWNER_REVIEW', reason: 'similar objective exists', count: sameObjective.length };
  return { action: 'CONTINUE', reason: 'novel task' };
}

// ---------------------------------------------------------------------------
// MP15 — Plan builder. Phased plan; agent must not stop after each safe phase.
// ---------------------------------------------------------------------------
export function buildPlan(task) {
  const phases = (task.phase_outline || ['inventory', 'implement', 'verify']).map((name, i) => ({
    phase_id: `${task.task_id}_p${i + 1}`,
    name,
    sequence: i + 1,
    inputs: i === 0 ? task.inputs || [] : [`output_of_p${i}`],
    outputs: [`output_of_p${i + 1}`],
    risk: task.risk_level,
    verification: name === 'verify' ? ['unit', 'security'] : ['syntax'],
    checkpoint_required: true,
    continuation_condition: 'AUTO_CONTINUE_IF_SAFE',
  }));
  return {
    plan_id: `plan_${task.task_id}`,
    task_id: task.task_id,
    version: 1,
    phases,
    dependency_graph: { nodes: phases.map((p) => p.phase_id), edges: phases.slice(1).map((p, i) => [phases[i].phase_id, p.phase_id]) },
    risk_controls: { max_risk: task.risk_level, owner_gate: exceedsMaxRisk(task.risk_level) },
    checkpoints: phases.map((p) => p.phase_id),
    verification_gates: ['unit', 'security', 'no-network', 'no-send', 'no-production'],
    rollback: 'git checkout; no canonical state touched',
    estimated_resources: { tokens: 'ESTIMATED', status: 'ESTIMATED' },
    approval_state: exceedsMaxRisk(task.risk_level) ? 'OWNER_GATE_REQUIRED' : 'NOT_REQUIRED',
  };
}

// ---------------------------------------------------------------------------
// MP9/10 — Agent selection + model routing.
// ---------------------------------------------------------------------------
export function selectAgent(task) {
  const t = task.task_type;
  if (['production_mutation'].includes(task.requires) || exceedsMaxRisk(task.risk_level) || riskIndex(task.risk_level) >= riskIndex('R4_PRODUCTION_PREPARATION')) return { agent_type: 'HUMAN_OWNER', reason: 'risk/owner-gated' };
  if (['DOCUMENTATION', 'REPORT', 'TESTING'].includes(t) && task.deterministic_possible) return { agent_type: 'DETERMINISTIC_NODE', reason: 'deterministic alternative exists' };
  if (['CODE_CHANGE', 'SECURITY_REVIEW'].includes(t) && task.scope === 'repo_wide') return { agent_type: 'CLAUDE_CODE', reason: 'repo-wide implementation/analysis' };
  if (['CODE_CHANGE'].includes(t) && task.scope === 'file_local') return { agent_type: 'CLINE', reason: 'bounded file-local change' };
  if (['ANALYSIS', 'RESEARCH'].includes(t)) return { agent_type: 'CLAUDE_CODE', reason: 'reasoning task' };
  return { agent_type: 'CLAUDE_CODE', reason: 'default reasoning agent' };
}
export function routeModel(task) {
  if (exceedsMaxRisk(task.risk_level)) return { model_class: 'high_reasoning', allow_local_model: false, reason: 'critical risk cannot use unverified local model' };
  if (task.deterministic_possible) return { model_class: 'lightweight_validation', allow_local_model: false, reason: 'deterministic preferred' };
  if (task.scope === 'repo_wide') return { model_class: 'high_reasoning', allow_local_model: false };
  return { model_class: 'standard_coding', allow_local_model: false };
}

// ---------------------------------------------------------------------------
// MP17 — Budget engine.
// ---------------------------------------------------------------------------
export function evaluateBudget(budget, usage) {
  const breaches = [];
  for (const [k, limit] of Object.entries(budget.limits || {})) {
    if (limit != null && usage[k] != null && usage[k] > limit) breaches.push({ type: k, limit, used: usage[k] });
  }
  if (breaches.length) return { status: 'EXCEEDED', breaches, action: ['checkpoint', 'stop_new_phase', 'produce_evidence', 'recommend_reduced_scope'] };
  return { status: budget.status || 'ESTIMATED', breaches: [] };
}

// ---------------------------------------------------------------------------
// MP18 — Lease.
// ---------------------------------------------------------------------------
export function evaluateLease(lease, now, existingActive) {
  if (existingActive && existingActive.lease_id !== lease.lease_id && existingActive.status === 'ACTIVE' && existingActive.worktree === lease.worktree) {
    if (existingActive.expires_at && now > existingActive.expires_at) return { grant: true, reason: 'prior lease expired -> recoverable' };
    return { grant: false, reason: 'active writer lease exists on worktree' };
  }
  return { grant: true, reason: 'no conflicting lease' };
}

// ---------------------------------------------------------------------------
// MP19 — Checkpoint / resume.
// ---------------------------------------------------------------------------
export function makeCheckpoint(run, phase, state) {
  return {
    checkpoint_id: `ckpt_${run.run_id}_${phase.phase_id}`,
    run_id: run.run_id,
    phase_id: phase.phase_id,
    state_hash: checksum(state),
    git_commit: state.git_commit || null,
    completed_work: state.completed_work || [],
    remaining_work: state.remaining_work || [],
    next_safe_action: state.next_safe_action || 'continue next phase',
    created_at: state.created_at || null,
  };
}
export function validateResume(checkpoint, current) {
  const issues = [];
  if (checkpoint.branch && current.branch !== checkpoint.branch) issues.push('branch changed');
  for (const c of (checkpoint.source_commits || [])) if (!(current.existing_commits || []).includes(c)) issues.push(`source commit missing: ${c}`);
  if (checkpoint.state_hash && current.unexpected_change === true) issues.push('files unexpectedly changed');
  return { resumable: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------
// MP20 — Retry policy.
// ---------------------------------------------------------------------------
export function evaluateRetry(failure) {
  const NO_RETRY = ['POLICY_BLOCK', 'OWNER_REQUIRED', 'TERMINAL_CODE'];
  if (NO_RETRY.includes(failure.class)) return { retry: false, terminal: true, action: failure.class === 'OWNER_REQUIRED' ? 'OWNER_GATE' : 'STOP', reason: `${failure.class} not retryable` };
  if (failure.class === 'AMBIGUOUS_RESULT') return { retry: false, terminal: false, action: 'RECONCILE', reason: 'ambiguous result requires reconciliation' };
  if ((failure.attempts || 0) >= (failure.max_retries || 3)) return { retry: false, terminal: true, action: 'DEAD_LETTER', reason: 'max retries reached' };
  if (failure.repeated_identical >= 2) return { retry: true, terminal: false, action: 'CHANGE_STRATEGY', reason: 'changed strategy after repeated identical failure' };
  if (['TRANSIENT_TOOL', 'TRANSIENT_RESOURCE', 'VALIDATION', 'DEPENDENCY', 'REVISION_CONFLICT'].includes(failure.class)) return { retry: true, terminal: false, action: 'RETRY_BOUNDED', reason: `${failure.class} is bounded-retryable` };
  return { retry: false, terminal: true, action: 'DEAD_LETTER', reason: 'unhandled failure class' };
}
