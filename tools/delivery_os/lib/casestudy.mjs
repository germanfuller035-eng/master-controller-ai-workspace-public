// tools/delivery_os/lib/casestudy.mjs
// Phase 24: Case Study Factory. Stages CANDIDATE..PUBLISHED. Prohibits invented metrics, publishing
// without permission, revealing identity without approval.
import { CASE_STAGE } from './common.mjs';

// case: { case_id, project_id, product_id, stage, before, after, deliverables, metrics:[{name,value,source}],
//         client_permission, anonymized, publishable }
export function evaluateCase(c) {
  const errors = [];
  if (!CASE_STAGE.includes(c.stage)) errors.push(`invalid stage ${c.stage}`);

  // Metrics must have a source (no invented metrics).
  for (const m of (c.metrics || [])) {
    if (m.value != null && (!m.source || m.source === 'estimate' || m.source === 'invented')) {
      errors.push(`metric ${m.name} has no verified source (no invented metrics)`);
    }
  }
  // Publishable requires permission + (identity approval or anonymized).
  if (c.publishable === true) {
    if (c.client_permission !== true) errors.push('publishable without client permission');
    if (c.anonymized !== true && !c.identity_approved) errors.push('publishable revealing identity without approval');
  }
  if (c.stage === 'PUBLISHED' && (c.client_permission !== true || c.publishable !== true)) {
    errors.push('PUBLISHED requires client_permission + publishable');
  }
  // Stage progression sanity.
  if (c.stage === 'APPROVED_FOR_USE' && c.client_permission !== true) errors.push('APPROVED_FOR_USE requires client permission');

  // Allowed claims = only those backed by sourced metrics or verified before/after.
  const allowed_claims = (c.metrics || []).filter((m) => m.source && m.source !== 'estimate' && m.source !== 'invented').map((m) => `${m.name}: ${m.value}`);

  return {
    ok: errors.length === 0,
    errors,
    stage: c.stage,
    allowed_claims,
    publishable: c.publishable === true && errors.length === 0,
  };
}

export function newCaseDraft(projectId, productId) {
  return {
    case_id: `case_${projectId}`, project_id: projectId, product_id: productId, stage: 'CANDIDATE',
    before: null, after: null, deliverables: [], metrics: [],
    client_permission: false, anonymized: true, publishable: false,
  };
}
