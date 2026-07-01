// tools/customer_success_os/lib/lifecycle_commercial.mjs
// Phase 26-29: Renewal + Expansion + Churn + Customer Profitability.
import { readFileSync } from 'node:fs';
import { REVENUE_CATALOG, RENEWAL_ACTIONS, round2 } from './common.mjs';

let CAT = null;
function product(id) { if (!CAT) CAT = JSON.parse(readFileSync(REVENUE_CATALOG, 'utf8')); return CAT.products.find((p) => p.product_id === id) || null; }

// Phase 26: renewal engine. No live renewal deal, no message.
export function renewalAssessment(input) {
  const p = product(input.product_id);
  const recurring = p && ['retainer', 'monthly', 'support'].some((k) => (p.category === 'retainer') || (p.price && p.price.type === 'monthly'));
  if (!recurring && !input.support_period_ending) return { recommended_action: 'NOT_APPLICABLE', reason: 'not a recurring/support product', owner_approval_required: false };
  const blockers = [];
  if (input.unresolved_critical_incident) blockers.push('unresolved_critical_incident');
  if (input.payment_status === 'overdue') blockers.push('payment_overdue');
  if (!input.communication_permission) blockers.push('no_communication_permission');
  if (input.health === 'CRITICAL' || input.health === 'AT_RISK') blockers.push(`health_${input.health}`);

  let action = 'RENEW';
  if (blockers.includes('unresolved_critical_incident')) action = 'DO_NOT_RENEW';
  else if (blockers.length) action = 'REVIEW_FIRST';
  else if (input.value_evidence === false) action = 'REVIEW_FIRST';
  else if (input.owner_capacity === false) action = 'PAUSE';
  return {
    recommended_action: action, blockers, value_evidence: !!input.value_evidence,
    owner_approval_required: true,
    note: 'No live renewal deal created. No renewal message sent.',
  };
}

// Phase 27: expansion/upsell engine. No pressure, no time-based upsell.
export function expansionAssessment(input) {
  const blockers = [];
  if (input.opted_out) blockers.push('opted_out');
  if (input.unresolved_critical_support) blockers.push('unresolved_critical_support');
  if (!input.customer_need_evidence) blockers.push('no_customer_need_evidence');
  if (input.current_product_adopted === false) blockers.push('current_product_not_adopted');
  if (input.candidate_ready === false) blockers.push('candidate_product_not_ready');
  if (input.owner_capacity === false) blockers.push('owner_capacity');
  if (input.financially_viable === false) blockers.push('not_financially_viable');
  const eligible = blockers.length === 0;
  return {
    candidate_product: input.candidate_product || null,
    eligible,
    reason_codes: eligible ? ['unmet_need_evidence', 'current_adopted', 'candidate_ready'] : [],
    blockers,
    owner_approval_required: true,
    note: 'No pressure-based rules. No upsell merely because time passed.',
  };
}

// Phase 28: churn engine. No automatic blame.
export const CHURN_CATEGORIES = ['no_value', 'no_adoption', 'budget', 'timing', 'internal_customer_change', 'product_mismatch', 'delivery_issue', 'support_issue', 'payment_issue', 'competitor', 'business_closure', 'owner_capacity', 'unknown'];
export function classifyChurn(input) {
  const errors = [];
  if (!input.source) errors.push('churn requires source');
  if (!CHURN_CATEGORIES.includes(input.reason)) errors.push(`unknown churn reason ${input.reason}`);
  const preventable = { no_value: 'partially_preventable', no_adoption: 'partially_preventable', delivery_issue: 'preventable', support_issue: 'preventable', product_mismatch: 'partially_preventable', budget: 'not_preventable', business_closure: 'not_preventable', timing: 'not_preventable', unknown: 'unknown' }[input.reason] || 'unknown';
  return {
    ok: errors.length === 0, errors,
    churn: {
      churn_id: input.churn_id, customer_ref_id: input.customer_ref_id, reason: input.reason, source: input.source,
      preventable,
      lessons_for: { product_os: input.reason === 'product_mismatch' || input.reason === 'no_value', delivery_os: input.reason === 'delivery_issue', revenue_os: input.reason === 'product_mismatch', executive_os: true },
    },
    note: 'No automatic blame.',
  };
}

// Phase 29: customer profitability. No profitability without confirmed cost data.
export function customerProfitability(input) {
  const revenue = input.revenue ?? null;
  const cost = input.support_cost ?? null;
  const confirmedCost = input.cost_status === 'confirmed';
  let margin = null, status = 'unknown';
  if (revenue != null && cost != null) { margin = round2(revenue - cost); status = confirmedCost ? 'confirmed' : 'modeled'; }
  return {
    customer_ref_id: input.customer_ref_id,
    revenue: revenue ?? 'UNKNOWN', support_cost: cost ?? 'UNKNOWN',
    margin: margin != null ? margin : 'UNKNOWN',
    high_support_low_margin: (margin != null && revenue && margin / revenue < 0.2),
    confidence: status,
    note: 'No customer profitability without cost data marked confirmed.',
  };
}
