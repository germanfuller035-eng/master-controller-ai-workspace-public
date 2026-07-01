// tools/product_os/lib/readiness.mjs
// Phase 7-8-29: Readiness dimensions matrix + status gate + readiness assessment.
// Recommendation only — never writes canonical status, never auto-promotes.
import { product, playbook } from './catalog.mjs';
import { READINESS_DIMENSIONS, STATUS_ORDER } from './common.mjs';
import { validateSpec } from './spec.mjs';

// Score each dimension COMPLETE/PARTIAL/MISSING/BLOCKED/NOT_APPLICABLE from canonical evidence + flags.
export function dimensionMatrix(productId, flags = {}) {
  const p = product(productId);
  if (!p) return { ok: false, error: `unknown product ${productId}` };
  const pb = playbook(productId);
  const spec = validateSpec(productId);
  const has = (arr) => (arr || []).length > 0;

  const dims = {
    definition: spec.ok ? 'COMPLETE' : 'PARTIAL',
    icp: p.target_customer ? 'COMPLETE' : 'MISSING',
    problem: p.target_problem ? 'COMPLETE' : 'MISSING',
    outcome: p.description ? 'COMPLETE' : 'MISSING',
    deliverables: has(p.deliverables) ? 'COMPLETE' : 'MISSING',
    scope: has(p.scope_included) ? 'COMPLETE' : 'MISSING',
    exclusions: has(p.scope_excluded) ? 'COMPLETE' : 'MISSING',
    price: (p.price.status === 'CONFIRMED') ? 'COMPLETE' : (p.price.status === 'OWNER_TARGET' ? 'PARTIAL' : 'MISSING'),
    delivery_playbook: pb ? (pb.milestones ? 'COMPLETE' : 'PARTIAL') : 'MISSING',
    inputs: has(p.evidence_required) ? 'COMPLETE' : 'PARTIAL',
    milestones: pb && pb.milestones ? 'COMPLETE' : (pb ? 'PARTIAL' : 'MISSING'),
    qa: pb && (pb.qa || pb.acceptance_tests) ? 'COMPLETE' : 'MISSING',
    acceptance: has(p.acceptance_criteria) ? 'COMPLETE' : 'MISSING',
    risks: has(p.risks) ? 'COMPLETE' : 'MISSING',
    capacity: flags.capacity_known ? 'COMPLETE' : 'MISSING',
    economics: flags.economics_known ? 'COMPLETE' : 'PARTIAL',
    demo: flags.demo_ready ? 'COMPLETE' : 'MISSING',
    internal_pilot: flags.pilot_passed ? 'COMPLETE' : (flags.pilot_planned ? 'PARTIAL' : 'MISSING'),
    sales_assets: flags.sales_assets ? 'COMPLETE' : 'PARTIAL',
    delivery_assets: pb ? 'PARTIAL' : 'MISSING',
    case_evidence: flags.case_evidence ? 'COMPLETE' : 'MISSING',
    owner_approval: flags.owner_approved ? 'COMPLETE' : 'MISSING',
  };
  return { ok: true, product_id: productId, dimensions: dims };
}

// Status gate: recommend status from evidence. NEVER auto-promotes.
export function statusGate(productId, flags = {}) {
  const p = product(productId);
  if (!p) return { ok: false, error: `unknown product ${productId}` };
  const m = dimensionMatrix(productId, flags).dimensions;
  const complete = (d) => m[d] === 'COMPLETE';
  const blocking = [];

  const deliveryDefined = ['scope', 'deliverables', 'delivery_playbook', 'qa', 'acceptance', 'risks'].every(complete);
  const internalTestReady = deliveryDefined && complete('definition') && flags.synthetic_fixture && flags.demo_ready && flags.pilot_planned && flags.economics_known;
  const pilotReady = internalTestReady && flags.pilot_passed && p.price.approved_by_owner && complete('qa') && complete('acceptance') && flags.capacity_known && flags.owner_approved;
  const active = pilotReady && flags.real_pilot_completed && flags.client_feedback && flags.actual_hours && flags.lessons_incorporated && flags.owner_approved;

  let recommended = 'PLANNED';
  if (active) recommended = 'ACTIVE';
  else if (pilotReady) recommended = 'READY_FOR_PILOT';
  else if (internalTestReady) recommended = 'READY_FOR_INTERNAL_TEST';
  else if (deliveryDefined) recommended = 'DELIVERY_DEFINED';
  else if (complete('definition')) recommended = 'DRAFT';

  // Blocking gaps for the next step up.
  for (const d of READINESS_DIMENSIONS) if (m[d] === 'MISSING') blocking.push(d);

  return {
    ok: true, product_id: productId,
    current_status: p.status,
    recommended_status: recommended,
    promotion: STATUS_ORDER[recommended] > STATUS_ORDER[p.status] ? 'recommend_promote' : (STATUS_ORDER[recommended] < STATUS_ORDER[p.status] ? 'recommend_review_downgrade' : 'hold'),
    blocking_gaps: blocking,
    owner_decision_required: recommended === 'READY_FOR_PILOT' || recommended === 'ACTIVE' || STATUS_ORDER[recommended] > STATUS_ORDER[p.status],
    auto_promote: false,
    note: 'Recommendation only. Never writes canonical status. READY_FOR_PILOT/ACTIVE require owner approval + pilot evidence.',
  };
}

// Phase 29: full readiness assessment object.
export function assess(productId, flags = {}) {
  const g = statusGate(productId, flags);
  if (!g.ok) return g;
  const m = dimensionMatrix(productId, flags).dimensions;
  const completeCount = Object.values(m).filter((v) => v === 'COMPLETE').length;
  return {
    assessment_id: `assess_${productId}`,
    product_id: productId,
    current_status: g.current_status,
    recommended_status: g.recommended_status,
    score: Math.round((completeCount / READINESS_DIMENSIONS.length) * 100),
    dimensions: m,
    blocking_gaps: g.blocking_gaps,
    owner_decision_required: g.owner_decision_required,
    auto_promote: false,
  };
}
