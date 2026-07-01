// tools/orchestrator_os/lib/validators.mjs
// MP42 — validators across all entities + policies + safety boundary. Pure, offline.
import { validateEntity } from '../schemas/domain.mjs';
import {
  PRODUCTION_MUTATION_ALLOWED, LIVE_AGENT_EXECUTION_ALLOWED, BACKGROUND_PROCESS_ALLOWED,
  SCHEDULER_CREATION_ALLOWED, NETWORK_ALLOWED, SEND_ALLOWED, CANONICAL_WRITE_ALLOWED,
  PRODUCTION_QUEUE_WRITE_ALLOWED, SECRET_ACCESS_ALLOWED, DEPLOY_ALLOWED, MERGE_ALLOWED,
  DOC_APPLY_ALLOWED, FILE_DELETE_ALLOWED, exceedsMaxRisk,
} from './common.mjs';
import { analyzeDag } from './engines.mjs';

export function validateTask(o) { return validateEntity('task', o); }
export function validatePlan(o) { return validateEntity('plan', o); }
export function validateRun(o) { return validateEntity('run', o); }
export function validatePhase(o) { return validateEntity('phase', o); }
export function validateAgent(o) { return validateEntity('agent_profile', o); }
export function validateCapability(o) { return validateEntity('capability', o); }
export function validateBudget(o) { return validateEntity('budget', o); }
export function validateCheckpoint(o) { return validateEntity('checkpoint', o); }
export function validateVerification(o) { return validateEntity('verification', o); }
export function validateDeadLetter(o) { return validateEntity('dead_letter', o); }
export function validateLease(o) { return validateEntity('lease', o); }
export function validateArtifact(o) { return validateEntity('artifact', o); }

// Risk ceiling: no task above MAX_RISK_THIS_BLOCK may be EXECUTABLE (must be owner-gated/contract-only).
export function validateRiskCeiling(task) {
  const e = [];
  if (exceedsMaxRisk(task.risk_level) && !['OWNER_GATED', 'PRODUCTION_PROHIBITED', 'DRY_RUN'].includes(task.execution_mode)) {
    e.push(`task ${task.task_id}: risk ${task.risk_level} exceeds block max and is not owner-gated/contract-only`);
  }
  return e;
}

// Capability policy: agent must not be granted a prohibited capability.
export function validateAgentCapability(agent, capability) {
  const e = [];
  if ((agent.prohibited_capabilities || []).includes(capability.capability_id) && (capability.allowed_agents || []).includes(agent.agent_type)) {
    e.push(`${agent.agent_id}: capability ${capability.capability_id} both prohibited and allowed`);
  }
  if (capability.requires_owner_approval && !(capability.allowed_agents || []).every((a) => a === 'HUMAN_OWNER') && (capability.allowed_agents || []).length > 0) {
    // owner-approval capabilities should be human-only at agent level
  }
  return e;
}

// Approval gate: must reference an authoritative decision (no agent self-approval).
export function validateApprovalGate(gate) {
  const e = [];
  if (gate.granted === true && !gate.decision_reference) e.push('approval granted without authoritative decision_reference (no self-approval)');
  if (gate.granted_by === 'agent') e.push('agent cannot self-approve');
  return e;
}

// Production boundary: orchestration must not write production queue or canonical.
export function validateProductionBoundary(boundary) {
  const e = [];
  const orc = boundary.agent_orchestration || [];
  if (orc.some((x) => /canonical|production_lead|operational_jobs/.test(x))) e.push('orchestration must not own production operational scope');
  if (boundary.shared_writable_queue === true) e.push('no shared writable queue allowed');
  return e;
}

// Token accounting: no fabricated confirmed cost.
export function validateTokenAccounting(rec) {
  const e = [];
  if (rec.confirmed_cost != null && rec.status !== 'CONFIRMED') e.push('confirmed_cost requires status CONFIRMED');
  if (rec.status === 'CONFIRMED' && rec.source == null) e.push('confirmed cost needs a source');
  return e;
}

export function validateSafetyInvariants() {
  const e = [];
  const must = {
    PRODUCTION_MUTATION_ALLOWED, LIVE_AGENT_EXECUTION_ALLOWED, BACKGROUND_PROCESS_ALLOWED,
    SCHEDULER_CREATION_ALLOWED, NETWORK_ALLOWED, SEND_ALLOWED, CANONICAL_WRITE_ALLOWED,
    PRODUCTION_QUEUE_WRITE_ALLOWED, SECRET_ACCESS_ALLOWED, DEPLOY_ALLOWED, MERGE_ALLOWED,
    DOC_APPLY_ALLOWED, FILE_DELETE_ALLOWED,
  };
  for (const [k, v] of Object.entries(must)) if (v !== false) e.push(`${k} must be false`);
  return e;
}

export function validateAll(ds) {
  const dims = {};
  let blockers = 0;
  const add = (name, errs) => { dims[name] = errs.length === 0 ? 'PASS' : `FAIL(${errs.length})`; blockers += errs.length; };
  add('safety_invariants', validateSafetyInvariants());
  add('agent_profiles', (ds.agents?.agents || []).flatMap(validateAgent));
  add('capabilities', (ds.policies?.capability_registry || []).flatMap(validateCapability));
  // Only positive task fixtures (negative fixtures intentionally fail their own validator).
  const positiveTasks = (ds.fixtures?.scenarios || []).filter((s) => s.task && s.expect?.valid !== false);
  add('tasks', positiveTasks.flatMap((s) => validateTask(s.task)));
  add('risk_ceiling', positiveTasks.flatMap((s) => validateRiskCeiling(s.task)));
  add('production_boundary', validateProductionBoundary(ds.policies?.production_queue_boundary || {}));
  // DAG over any fixture task graph
  const tasks = (ds.fixtures?.scenarios || []).filter((s) => s.task).map((s) => s.task);
  if (tasks.length) add('dependency_dag', analyzeDag(tasks).issues.filter((i) => i.issue === 'cycle'));
  return { blockers, dimensions: dims };
}
