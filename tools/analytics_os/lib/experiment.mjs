// tools/analytics_os/lib/experiment.mjs
// Experiment governance + hypothesis standard (Phase 14-15). Read-only.
// RUNNING_ALLOWED=NO during this task. No experiment is ever started.

export const STATUSES = ['IDEA', 'HYPOTHESIS_DEFINED', 'MEASUREMENT_READY', 'OWNER_REVIEW', 'APPROVED', 'READY', 'RUNNING', 'STOPPED', 'ANALYZED', 'ACCEPTED', 'REJECTED', 'INCONCLUSIVE'];
export const TYPES = ['message', 'offer', 'price', 'product_routing', 'audit_format', 'onboarding', 'support', 'workflow'];
export const RUNNING_ALLOWED = false;

// Required hypothesis fields.
const HYPOTHESIS_FIELDS = ['population', 'baseline', 'intervention', 'primary_metric', 'guardrails', 'duration', 'sample_requirement', 'stop_criteria', 'risk', 'owner_approval'];

// Render the canonical hypothesis statement.
export function renderHypothesis(h) {
  return `For ${h.population}, changing ${h.variable} from ${h.baseline} to ${h.variant} is expected to change ${h.primary_metric} within ${h.duration}, because ${h.reason}, while guardrails remain acceptable.`;
}

// Validate a hypothesis; returns blocking reasons.
export function validateHypothesis(h) {
  const blocks = [];
  for (const f of HYPOTHESIS_FIELDS) {
    if (h[f] === undefined || h[f] === null || h[f] === '') blocks.push(`missing ${f}`);
  }
  if (h.guardrails && Array.isArray(h.guardrails) && h.guardrails.length === 0) blocks.push('no guardrail defined');
  if (h.vague === true || (h.primary_metric && /more|better|improve/i.test(String(h.primary_metric)) && !h.metric_definition)) blocks.push('vague hypothesis (metric not concretely defined)');
  if (h.owner_approval !== true) blocks.push('no owner approval');
  if (h.privacy_impacting === true) blocks.push('privacy-impacting experiment blocked');
  if (h.requires_outreach === true) blocks.push('outreach during freeze blocked');
  if (h.targets_opt_out_customer === true) blocks.push('opt-out customer targeted');
  if (h.unsupported_claim === true) blocks.push('unsupported claim');
  return blocks;
}

// Governance transition check: never allow a transition INTO RUNNING during this task.
export function canTransition(from, to) {
  if (to === 'RUNNING') return { allowed: false, reason: 'RUNNING_ALLOWED=NO (production freeze)' };
  if (!STATUSES.includes(to)) return { allowed: false, reason: `unknown status ${to}` };
  return { allowed: true };
}

// Evaluate an experiment record for readiness WITHOUT starting it.
export function evaluateExperiment(x) {
  const blocks = validateHypothesis(x.hypothesis || {});
  const ready = blocks.length === 0 && x.status === 'APPROVED';
  return {
    experiment_id: x.experiment_id,
    type: x.type,
    status: x.status,
    hypothesis_statement: x.hypothesis ? renderHypothesis(x.hypothesis) : null,
    blocks,
    measurement_ready: ready,
    running_allowed: RUNNING_ALLOWED,
    will_start: false,
  };
}
