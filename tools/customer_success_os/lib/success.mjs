// tools/customer_success_os/lib/success.mjs
// Phase 7,9,10,11: Onboarding + Success Plan + Outcome Library + Adoption model.
import { readFileSync } from 'node:fs';
import { REVENUE_CATALOG } from './common.mjs';

let CAT = null;
function product(id) { if (!CAT) CAT = JSON.parse(readFileSync(REVENUE_CATALOG, 'utf8')); return CAT.products.find((p) => p.product_id === id) || null; }

// Phase 10: allowed outcomes per product (deliverable / adoption / business separated).
export const OUTCOME_LIBRARY = {
  mini_audit: {
    deliverable: ['customer understands verified issues', 'priorities ranked', 'recommended actions documented', 'next product recommendation may exist'],
    adoption: ['report reviewed', 'priorities discussed', 'recommendations selected'],
    business: [],  // revenue/conversion only if later confirmed by customer evidence
    prohibited: ['revenue increased', 'conversion increased', 'sales increased'],
  },
  digital_presence_check: {
    deliverable: ['digital channels identified', 'identity risks identified', 'contactability assessed', 'presence gaps documented'],
    adoption: ['presence map reviewed'], business: [], prohibited: ['guaranteed leads'],
  },
  business_website: {
    deliverable: ['agreed pages delivered', 'forms function', 'mobile QA passed', 'analytics configured if in scope', 'ownership handed off'],
    adoption: ['site launched', 'owner access confirmed', 'forms tested', 'analytics viewed'],
    business: [], prohibited: ['guaranteed traffic', 'guaranteed sales'],
  },
  lead_system: { deliverable: ['per future product boundary'], adoption: [], business: [], prohibited: ['autonomous sending'] },
  ai_front_office: { deliverable: ['safe approved variant only'], adoption: [], business: [], prohibited: ['autonomous client communication'] },
};
export function allowedOutcomes(productId) { return OUTCOME_LIBRARY[productId] || { deliverable: [], adoption: [], business: [], prohibited: [] }; }

// Phase 7: onboarding plan generator. INTERNAL_DRAFT, no send.
export function buildOnboarding(customerRef, productId) {
  const p = product(productId);
  if (!p) return { ok: false, error: `unknown product ${productId}` };
  const planned = ['lead_system', 'ai_front_office', 'process_comm_audit', 'growth_support'].includes(productId) || p.status === 'PLANNED';
  return {
    ok: true,
    onboarding: {
      customer_ref_id: customerRef, product_id: productId,
      stages: ['welcome_internal_prep', 'handoff_review', 'access_instructions', 'customer_responsibilities', 'initial_activation', 'first_success_checkpoint', 'support_orientation', 'review_scheduling'],
      assets: ['onboarding_checklist', 'getting_started_guide', 'responsibilities_matrix', 'support_guide', 'faq', 'first_review_agenda', 'customer_action_list'],
      status: 'INTERNAL_DRAFT',
      specification_only: planned,
      send_allowed: false,
    },
    note: planned ? 'PLANNED product -> specification only' : 'product-specific onboarding (internal draft, no send)',
  };
}

// Phase 9: success plan generator.
export function buildSuccessPlan(input) {
  const p = product(input.product_id);
  if (!p) return { ok: false, error: `unknown product ${input.product_id}` };
  const lib = allowedOutcomes(input.product_id);
  const noValueRisk = !input.baseline_evidence;
  return {
    ok: true,
    plan: {
      success_plan_id: `sp_${input.customer_ref_id}_${input.product_id}`,
      customer_ref_id: input.customer_ref_id, product_id: input.product_id,
      expected_outcomes: lib.deliverable,
      customer_actions: input.customer_actions || ['review deliverables', 'implement recommendations'],
      owner_actions: input.owner_actions || ['confirm delivery', 'run value review'],
      milestones: ['handoff', 'activation', '30-day value review'],
      metrics: (input.metrics || []).map((m) => ({ metric: m, status: 'PROPOSED' })),
      risks: noValueRisk ? ['baseline missing -> value may be unmeasurable'] : [],
      review_cadence: input.review_cadence || 'post-handoff + 30-day',
      status: 'PROPOSED',
      no_value_risk: noValueRisk,
    },
  };
}

// Phase 11: adoption assessment. Evidence-based; no fabricated analytics.
export function assessAdoption(input) {
  const p = product(input.product_id);
  if (!p) return { ok: false, error: `unknown product ${input.product_id}` };
  const indicators = {
    mini_audit: ['report_reviewed', 'priorities_discussed', 'recommendations_selected', 'followup_review_completed'],
    business_website: ['site_launched', 'owner_access_confirmed', 'forms_tested', 'analytics_viewed', 'content_process_understood'],
    lead_system: ['source_connected', 'queue_reviewed', 'approvals_used', 'no_send_safety_understood'],
  }[input.product_id] || ['delivered'];
  const observed = input.observed || {};  // {indicator: status}
  const results = indicators.map((i) => ({ indicator: i, status: observed[i] || 'UNKNOWN' }));
  const confirmed = results.filter((r) => ['CONFIRMED', 'CUSTOMER_REPORTED', 'SYSTEM_OBSERVED'].includes(r.status)).length;
  return {
    ok: true, customer_ref_id: input.customer_ref_id, product_id: input.product_id,
    indicators: results,
    adoption_level: indicators.length ? Math.round((confirmed / indicators.length) * 100) : 0,
    note: 'No fabricated analytics. UNKNOWN where unobserved.',
  };
}
