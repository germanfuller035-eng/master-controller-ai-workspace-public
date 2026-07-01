// tools/orchestrator_os/schemas/domain.mjs
// MP5 — Agent Orchestration domain model. Pure validation predicates over plain objects.
// No live datastore. Every entity carries synthetic markers; tasks carry execution_mode + risk.
import { TASK_STATUS, TASK_TYPES, EXECUTION_MODES, RISK_LEVELS, AGENT_TYPES, BUDGET_TYPES, BUDGET_STATUS, LEASE_STATUS } from '../lib/common.mjs';

const isStr = (v) => typeof v === 'string' && v.length > 0;
const isArr = (v) => Array.isArray(v);
const inSet = (set, v) => set.includes(v);

export const SCHEMAS = {
  task: {
    validate(o) {
      const e = [];
      if (!isStr(o.task_id)) e.push('task_id required');
      if (!isStr(o.project_id)) e.push('project_id required');
      if (!inSet(TASK_TYPES, o.task_type)) e.push(`bad task_type: ${o.task_type}`);
      if (!inSet(TASK_STATUS, o.status)) e.push(`bad status: ${o.status}`);
      if (!inSet(RISK_LEVELS, o.risk_level)) e.push(`bad risk_level: ${o.risk_level}`);
      if (!inSet(EXECUTION_MODES, o.execution_mode)) e.push(`bad execution_mode: ${o.execution_mode}`);
      if (!o.done_definition) e.push('done_definition required');
      if (!isArr(o.allowed_paths)) e.push('allowed_paths must be array');
      if (!isArr(o.forbidden_paths)) e.push('forbidden_paths must be array');
      if (o.synthetic !== true) e.push('synthetic must be true');
      if (typeof o.revision !== 'number') e.push('revision must be number');
      return e;
    },
  },
  plan: {
    validate(o) {
      const e = [];
      if (!isStr(o.plan_id)) e.push('plan_id required');
      if (!isStr(o.task_id)) e.push('task_id required');
      if (!isArr(o.phases) || o.phases.length === 0) e.push('phases must be non-empty array');
      if (!o.dependency_graph) e.push('dependency_graph required');
      return e;
    },
  },
  run: {
    validate(o) {
      const e = [];
      if (!isStr(o.run_id)) e.push('run_id required');
      if (!isStr(o.task_id)) e.push('task_id required');
      if (!inSet(TASK_STATUS, o.status)) e.push(`bad status: ${o.status}`);
      if (o.synthetic !== true) e.push('synthetic must be true (no real run in this task)');
      return e;
    },
  },
  phase: {
    validate(o) {
      const e = [];
      if (!isStr(o.phase_id)) e.push('phase_id required');
      if (!isStr(o.run_id)) e.push('run_id required');
      if (typeof o.sequence !== 'number') e.push('sequence must be number');
      return e;
    },
  },
  agent_profile: {
    validate(o) {
      const e = [];
      if (!isStr(o.agent_id)) e.push('agent_id required');
      if (!inSet(AGENT_TYPES, o.agent_type)) e.push(`bad agent_type: ${o.agent_type}`);
      if (!inSet(RISK_LEVELS, o.risk_ceiling)) e.push(`bad risk_ceiling: ${o.risk_ceiling}`);
      if (!isArr(o.supported_capabilities)) e.push('supported_capabilities must be array');
      return e;
    },
  },
  capability: {
    validate(o) {
      const e = [];
      if (!isStr(o.capability_id)) e.push('capability_id required');
      if (!inSet(RISK_LEVELS, o.risk)) e.push(`bad risk: ${o.risk}`);
      if (typeof o.requires_owner_approval !== 'boolean') e.push('requires_owner_approval must be boolean');
      return e;
    },
  },
  budget: {
    validate(o) {
      const e = [];
      if (!isStr(o.budget_id)) e.push('budget_id required');
      if (!inSet(BUDGET_STATUS, o.status)) e.push(`bad budget status: ${o.status}`);
      // no fabricated confirmed cost: a confirmed cost requires OBSERVED status
      if (o.confirmed_cost != null && o.status !== 'OBSERVED' && o.status !== 'EXCEEDED') e.push('confirmed_cost only valid when OBSERVED/EXCEEDED');
      return e;
    },
  },
  checkpoint: {
    validate(o) {
      const e = [];
      if (!isStr(o.checkpoint_id)) e.push('checkpoint_id required');
      if (!isStr(o.run_id)) e.push('run_id required');
      if (!o.state_hash) e.push('state_hash required');
      if (!o.next_safe_action) e.push('next_safe_action required');
      return e;
    },
  },
  verification: {
    validate(o) {
      const e = [];
      if (!isStr(o.verification_id)) e.push('verification_id required');
      if (!o.gate) e.push('gate required');
      // agent claim is not sufficient: require command + actual + status
      if (o.command == null) e.push('command required (claim is not evidence)');
      if (o.exit_code == null && o.actual == null) e.push('exit_code or actual required');
      if (!['PASS', 'FAIL'].includes(o.status)) e.push(`bad verification status: ${o.status}`);
      return e;
    },
  },
  dead_letter: {
    validate(o) {
      const e = [];
      if (!isStr(o.dead_letter_id)) e.push('dead_letter_id required');
      if (!o.failure_category) e.push('failure_category required');
      if (!o.owner_action) e.push('owner_action required (no automatic production recovery)');
      return e;
    },
  },
  lease: {
    validate(o) {
      const e = [];
      if (!isStr(o.lease_id)) e.push('lease_id required');
      if (!inSet(LEASE_STATUS, o.status)) e.push(`bad lease status: ${o.status}`);
      return e;
    },
  },
  artifact: {
    validate(o) {
      const e = [];
      if (!isStr(o.artifact_id)) e.push('artifact_id required');
      if (!o.hash) e.push('hash required');
      if (o.canonical === true) e.push('orchestration artifact must not be canonical');
      return e;
    },
  },
};

export function validateEntity(kind, obj) {
  const s = SCHEMAS[kind];
  if (!s) return [`unknown entity kind: ${kind}`];
  return s.validate(obj);
}
