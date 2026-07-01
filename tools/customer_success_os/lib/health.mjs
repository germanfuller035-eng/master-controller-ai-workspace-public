// tools/customer_success_os/lib/health.mjs
// Phase 12-13: Customer Health engine + Customer Risk engine. Explainable. Unknown != churn.
import { HEALTH_STATE } from './common.mjs';

export const HEALTH_DIMENSIONS = ['adoption', 'outcome_progress', 'support_load', 'payment_status', 'engagement', 'open_risks', 'product_fit', 'delivery_satisfaction', 'owner_capacity', 'customer_dependency'];

// input: { dimensions: {dim: 'good'|'watch'|'bad'|'unknown'}, unresolved_critical_incident, opted_out }
export function computeHealth(input) {
  const dims = input.dimensions || {};
  const score = { good: 2, watch: 1, bad: 0, unknown: null };
  const known = HEALTH_DIMENSIONS.map((d) => score[dims[d] || 'unknown']).filter((v) => v !== null);
  const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
  const unknownCount = HEALTH_DIMENSIONS.filter((d) => !dims[d] || dims[d] === 'unknown').length;

  const risk_flags = [];
  if (dims.payment_status === 'bad') risk_flags.push('payment_delay (commercial only, not dissatisfaction)');
  if (dims.support_load === 'bad') risk_flags.push('high_support_load (adoption OR product failure)');
  if (dims.adoption === 'bad') risk_flags.push('low_adoption');
  if (input.opted_out) risk_flags.push('opted_out (blocks commercial expansion)');

  // Rules.
  let status;
  if (input.unresolved_critical_incident === true) status = 'CRITICAL';
  else if (avg === null || unknownCount > 5) status = 'UNKNOWN';
  else if (avg >= 1.6) status = 'HEALTHY';
  else if (avg >= 1.1) status = 'WATCH';
  else status = 'AT_RISK';

  // Unknown data cannot produce HEALTHY with high confidence.
  let confidence = unknownCount === 0 ? 'high' : (unknownCount <= 3 ? 'medium' : 'low');
  if (status === 'HEALTHY' && confidence === 'low') status = 'WATCH';

  return {
    status, score: avg !== null ? Math.round(avg * 50) : null, // 0..100
    dimensions: dims, risk_flags,
    confidence,
    owner_review_required: status === 'CRITICAL' || status === 'AT_RISK' || confidence === 'low',
    explanation: { known_dimensions: known.length, unknown_dimensions: unknownCount, rule: 'payment!=dissatisfaction; silence!=churn; high support=adoption-or-failure' },
  };
}

export const RISK_CATEGORIES = ['no_adoption', 'unclear_outcome', 'implementation_incomplete', 'unresolved_support', 'payment_delay', 'scope_mismatch', 'expectation_mismatch', 'product_not_ready', 'owner_unavailable', 'customer_unavailable', 'critical_dependency', 'security_privacy', 'technical_failure', 'value_not_demonstrated', 'excessive_support_cost', 'commercial_pressure', 'churn', 'reputational_risk'];

const SEV = { low: 1, medium: 2, high: 3 };
export function buildRisks(customerRef, risks) {
  return risks.map((r) => {
    const sev = (SEV[r.probability] || 1) * (SEV[r.impact] || 1);
    return {
      customer_risk_id: `crisk_${customerRef}_${r.category}`,
      customer_ref_id: customerRef, category: r.category,
      probability: r.probability, impact: r.impact,
      severity: sev >= 6 ? 'CRITICAL' : sev >= 4 ? 'HIGH' : sev >= 2 ? 'MEDIUM' : 'LOW',
      trigger: r.trigger || null, evidence: r.evidence || null,
      mitigation: r.mitigation || 'monitor', owner: r.owner || 'owner',
      escalation: sev >= 6 ? 'Executive OS' : 'owner', status: r.status || 'OPEN',
    };
  });
}
