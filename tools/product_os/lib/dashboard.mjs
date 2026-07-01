// tools/product_os/lib/dashboard.mjs
// Phase 30-31-32-33: Product roadmap + owner decision packets + Product Dashboard + Owner Command Center.
import { catalog, product } from './catalog.mjs';
import { statusGate } from './readiness.mjs';
import { getPack } from './productize.mjs';

// Phase 30: roadmap.
export function roadmap() {
  return {
    schema: 'product_os.roadmap.v1', label: 'PROPOSED_INTERNAL',
    now: [
      { product_id: 'mini_audit', goal: 'refine reference + readiness evidence', pilot: 'reference pilot', readiness_target: 'READY_FOR_PILOT (owner)', owner_action: 'approve pilot' },
      { product_id: 'digital_presence_check', goal: 'internal pilot + spec', pilot: '6 scenarios', readiness_target: 'READY_FOR_INTERNAL_TEST', owner_action: 'set price' },
      { product_id: 'full_business_audit', goal: 'internal pilot + distinction', pilot: 'happy+fail', readiness_target: 'READY_FOR_INTERNAL_TEST', owner_action: 'approve scope' },
    ],
    next: [
      { product_id: 'start_page_sprint', goal: 'resolve price conflict + pilot', owner_action: 'resolve d_startpack_conflict' },
      { product_id: 'landing_sprint', goal: 'pilot + price', owner_action: 'set price' },
      { product_id: 'business_website', goal: 'tier scope, control scope creep', owner_action: 'approve tiers' },
    ],
    later: [
      { product_id: 'lead_system', goal: 'packaging decision', owner_action: 'd_lead_system_packaging' },
      { product_id: 'ai_front_office', goal: 'boundary decision', owner_action: 'd_ai_front_office_boundary' },
      { product_id: 'growth_support', goal: 'define retainer', owner_action: 'define' },
    ],
    note: 'Every item: goal/dependency/owner action/product action/pilot/readiness target/done definition.',
  };
}

// Phase 31: owner product decision packets.
export function ownerDecisions() {
  return {
    schema: 'product_os.owner_decisions.v1',
    decisions: [
      { id: 'p_confirm_statuses', title: 'Confirm product catalog statuses', status: 'READY_FOR_OWNER' },
      { id: 'p_approve_prices', title: 'Approve/reject product prices', status: 'READY_FOR_OWNER' },
      { id: 'p_startpack_conflict', title: 'Resolve Start Pack price conflict (50k vs 90-250k)', status: 'READY_FOR_OWNER' },
      { id: 'p_pilot_products', title: 'Choose products for pilot', status: 'READY_FOR_OWNER' },
      { id: 'p_pause_products', title: 'Choose products to pause', status: 'READY_FOR_OWNER' },
      { id: 'p_lead_system', title: 'Decide Lead System packaging', status: 'NEEDS_DATA' },
      { id: 'p_ai_front_office', title: 'Decide AI Front Office boundaries', status: 'NEEDS_DATA' },
      { id: 'p_approve_claims', title: 'Approve product claims', status: 'NEEDS_DATA' },
      { id: 'p_approve_assets', title: 'Approve sample/demo assets', status: 'READY_FOR_OWNER' },
      { id: 'p_readiness_promotion', title: 'Approve readiness promotion', status: 'READY_FOR_OWNER' },
    ],
    note: 'No decision executed. Owner decides.',
  };
}

// Phase 32: Product Dashboard.
export function dashboard(flags = {}) {
  const products = catalog();
  const byStatus = {};
  for (const p of products) (byStatus[p.status] = byStatus[p.status] || []).push(p.product_id);
  const pilotCandidates = ['mini_audit', 'digital_presence_check', 'full_business_audit', 'start_page_sprint', 'landing_sprint', 'business_website'];
  return {
    schema: 'product_os.dashboard.v1', label: 'INTERNAL_OWNER_ONLY',
    note: 'Does NOT duplicate Revenue Dashboard. Product readiness focus.',
    catalog_count: products.length,
    by_status: byStatus,
    active: byStatus.ACTIVE || [],
    delivery_defined: ['mini_audit'],
    pilot_candidates: pilotCandidates,
    blocked: [],
    paused: byStatus.PAUSED || [],
    owner_decisions: ownerDecisions().decisions.filter((d) => d.status === 'READY_FOR_OWNER').length,
    consistency_warnings: 'see consistency report',
    claims_warnings: 'see claims report',
    next_product_action: 'mini_audit pilot review + digital_presence_check internal pilot',
  };
}

// Phase 33: Owner Command Center (compact).
export function ownerCommandCenter() {
  return {
    schema: 'product_os.owner_command_center.v1', label: 'INTERNAL_OWNER_ONLY',
    top_product_decision: 'Approve mini_audit for pilot / confirm statuses',
    product_ready_now: [],
    product_almost_ready: ['mini_audit (DELIVERY_DEFINED -> needs pilot+owner)'],
    product_blocked: ['lead_system (packaging)', 'ai_front_office (boundary)'],
    product_to_pause: ['edera_rest_mini_audit (low readiness)'],
    pricing_decisions: ['digital_presence_check (set price)', 'landing_sprint (set price)', 'start_page (conflict)'],
    claim_approvals: ['pending for all priority products'],
    pilot_approvals: ['mini_audit'],
    capacity_implications: 'UNKNOWN until owner confirms weekly hours',
    references: { revenue: '[[09_dashboards/revenue_command_dashboard]]', portfolio: '[[09_dashboards/project_portfolio_dashboard]]' },
  };
}
