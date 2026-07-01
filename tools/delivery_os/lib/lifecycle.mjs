// tools/delivery_os/lib/lifecycle.mjs
// Phase 4: Project Lifecycle Engine. Deterministic transition validator with entry criteria,
// required evidence/approval, prohibited transitions, rollback, audit record.
import { LIFECYCLE, LIFECYCLE_TRANSITIONS } from './common.mjs';

// Entry criteria + required evidence/approval per target state.
export const STATE_RULES = {
  PROJECT_CREATED: { entry: ['commercial approved', 'product approved'], evidence: ['commercial_reference'], approval: ['owner'] },
  WAITING_INPUTS: { entry: ['client input list defined'], evidence: ['input_catalog'], approval: [] },
  SCOPE_FROZEN: { entry: ['scope defined', 'deliverables defined', 'acceptance defined'], evidence: ['scope_version'], approval: ['owner'] },
  READY_TO_START: { entry: ['scope frozen', 'required inputs received'], evidence: ['inputs_complete'], approval: [] },
  DELIVERY_IN_PROGRESS: { entry: ['ready to start'], evidence: [], approval: [] },
  INTERNAL_QA: { entry: ['deliverables produced'], evidence: ['deliverables'], approval: [] },
  OWNER_REVIEW: { entry: ['internal QA passed'], evidence: ['qa_result'], approval: [] },
  CLIENT_REVIEW: { entry: ['owner review passed'], evidence: ['owner_review'], approval: ['owner'] },
  DELIVERED: { entry: ['client review or owner approved delivery'], evidence: ['qa_result'], approval: ['owner'] },
  ACCEPTED: { entry: ['acceptance criteria met'], evidence: ['acceptance'], approval: ['owner'] },
  SUPPORT: { entry: ['accepted'], evidence: [], approval: [] },
  CLOSED: { entry: ['no open critical risk'], evidence: ['risk_register'], approval: ['owner'] },
  CHANGE_REQUEST: { entry: ['change impact evaluated'], evidence: ['change_request'], approval: [] },
};

// Prohibited transition guards (semantic, beyond the adjacency matrix).
// ctx: { hasScope, requiredInputsReceived, qaPassed, ownerReviewed, acceptancePassed, openCriticalRisk, casePermission, changeImpactEvaluated }
export function validateTransition(from, to, ctx = {}) {
  const errors = [];
  if (!LIFECYCLE.includes(from)) errors.push(`unknown source state ${from}`);
  if (!LIFECYCLE.includes(to)) errors.push(`unknown target state ${to}`);
  if (errors.length) return { ok: false, errors };

  const allowed = LIFECYCLE_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) errors.push(`illegal transition ${from} -> ${to} (allowed: ${allowed.join(', ') || 'none'})`);

  // Semantic guards.
  if (to === 'DELIVERY_IN_PROGRESS' && from !== 'INTERNAL_QA' && from !== 'OWNER_REVIEW' && from !== 'CLIENT_REVIEW' && from !== 'CHANGE_REQUEST' && from !== 'BLOCKED') {
    if (ctx.hasScope === false) errors.push('cannot start delivery without frozen scope');
    if (ctx.requiredInputsReceived === false) errors.push('cannot start delivery without required client inputs');
  }
  if (to === 'DELIVERED' && ctx.qaPassed === false) errors.push('cannot mark DELIVERED without QA pass');
  if (to === 'ACCEPTED' && ctx.acceptancePassed === false) errors.push('cannot mark ACCEPTED without acceptance criteria met');
  if (to === 'CLIENT_REVIEW' && ctx.ownerReviewed === false) errors.push('cannot go to CLIENT_REVIEW without owner review (client-ready needs owner review)');
  if (to === 'CLOSED' && ctx.openCriticalRisk === true) errors.push('cannot CLOSE with an open critical risk');
  if (from === 'CHANGE_REQUEST' && ctx.changeImpactEvaluated === false) errors.push('change request requires impact evaluation before proceeding');

  const rule = STATE_RULES[to];
  const rollback = { DELIVERY_IN_PROGRESS: 'READY_TO_START', INTERNAL_QA: 'DELIVERY_IN_PROGRESS', OWNER_REVIEW: 'INTERNAL_QA', CLIENT_REVIEW: 'OWNER_REVIEW', DELIVERED: 'CLIENT_REVIEW' }[to] || null;

  return {
    ok: errors.length === 0,
    errors,
    entry_criteria: rule ? rule.entry : [],
    required_evidence: rule ? rule.evidence : [],
    required_approval: rule ? rule.approval : [],
    rollback_state: rollback,
    audit_record: { from, to, ok: errors.length === 0 },
  };
}
