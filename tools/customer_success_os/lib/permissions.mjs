// tools/customer_success_os/lib/permissions.mjs
// Phase 30-31: Case/testimonial/referral permissions + case study handoff.
import { PERMISSION_TYPES, PERMISSION_STATUS } from './common.mjs';

// Permission must have explicit evidence; never inferred from positive feedback.
export function evaluatePermission(perm) {
  const errors = [];
  if (!PERMISSION_TYPES.includes(perm.permission_type)) errors.push(`unknown permission_type ${perm.permission_type}`);
  if (!PERMISSION_STATUS.includes(perm.status)) errors.push(`unknown status ${perm.status}`);
  if (perm.status === 'GRANTED' && !perm.evidence) errors.push('GRANTED permission without evidence');
  if (perm.inferred_from_feedback) errors.push('permission inferred from feedback (not allowed)');
  // Expiry / revocation.
  const effective = perm.status === 'GRANTED' && (!perm.expires_at || perm.expires_at >= (perm.now || '2026-06-17')) && !perm.revoked;
  return { ok: errors.length === 0, errors, permission_type: perm.permission_type, effective, status: perm.revoked ? 'REVOKED' : perm.status };
}

// Check whether an action is allowed by permission state.
export function permissionAllows(action, perms, ctx = {}) {
  const errors = [];
  const has = (type) => perms.find((p) => p.permission_type === type && evaluatePermission(p).effective);
  if (action === 'logo_use' && !has('logo')) errors.push('logo use without permission');
  if (action === 'public_case' && !has('public_case')) errors.push('public case without permission');
  if (action === 'testimonial' && !has('testimonial')) errors.push('testimonial without permission');
  if (action === 'referral_request') {
    if (!has('referral_request')) errors.push('referral without permission');
    if (ctx.recent_complaint || ctx.recent_critical_incident) errors.push('referral request after complaint/critical incident not appropriate');
  }
  if (action === 'public_result' && !ctx.evidence) errors.push('public result without evidence');
  return { ok: errors.length === 0, errors };
}

// Phase 31: case study handoff (uses Delivery case factory + Product claim gate conceptually).
export function caseHandoff(input) {
  const errors = [];
  if (!input.project_accepted) errors.push('case requires accepted project');
  if (!input.evidence) errors.push('case requires evidence');
  if (!input.permission_granted) errors.push('case requires permission');
  if (input.synthetic && input.labelled_real) errors.push('synthetic case labelled real');
  return {
    ok: errors.length === 0, errors,
    case: errors.length === 0 ? {
      project_id: input.project_id, outcome_classification: input.outcome_classification || 'deliverable',
      metrics_source: input.metrics_source || 'customer evidence', anonymized: input.anonymized !== false,
      approved_claims: input.approved_claims || [], known_limitations: input.known_limitations || [],
      publishable: input.permission_granted && !!input.evidence, publish_allowed: false,
    } : null,
    note: 'No synthetic case labelled real. No auto-publication.',
  };
}
