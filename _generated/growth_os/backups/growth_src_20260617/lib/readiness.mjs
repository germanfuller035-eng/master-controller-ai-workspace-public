// tools/growth_os/lib/readiness.mjs
// Campaign readiness gate (MP23) + campaign economics (MP24). Read-only, deterministic.
// ACTIVE is prohibited this task: even a fully-ready campaign caps at READY.
import { round2, pct } from './common.mjs';

// The 13 gate conditions a campaign must satisfy to become READY.
export const GATE_CONDITIONS = [
  'product_ready', 'segment_defined', 'icp_defined', 'claim_approved', 'assets_valid',
  'price_approved', 'delivery_capacity_confirmed', 'support_capacity_confirmed', 'owner_capacity_confirmed',
  'metrics_defined', 'stop_criteria_defined', 'opt_out_policy_defined', 'approval_flow_defined',
];

// Evaluate readiness from a context object of booleans. Returns gate result + permitted status.
export function evaluateReadiness(campaign, ctx) {
  const failed = GATE_CONDITIONS.filter((c) => ctx[c] !== true);
  const ready = failed.length === 0;
  // Even when all gates pass, ACTIVE is never granted in this task.
  const permitted_status = ready ? 'READY' : (campaign.status === 'IDEA' ? 'IDEA' : 'DRAFT');
  return {
    campaign_id: campaign.campaign_id,
    ready,
    permitted_status,
    active_allowed: false,
    failed_conditions: failed,
    blockers: failed.map((c) => ({ condition: c, severity: c === 'product_ready' || c === 'price_approved' ? 'HIGH' : 'MEDIUM' })),
  };
}

// Campaign economics. Every output carries a confidence status; nothing estimated is CONFIRMED.
export function computeEconomics(input) {
  const {
    budget = 0, owner_hours = 0, owner_hour_value = null, ai_effort = 0, tooling_cost = 0,
    candidates = null, verified = null, replies = null, opportunities = null, wins = null,
    deal_value = null, gross_margin_rate = null, capacity_ceiling = null, source_status = 'MODEL_ESTIMATE',
  } = input;

  const owner_cost = owner_hour_value != null ? owner_hours * owner_hour_value : null;
  const total_cost = budget + tooling_cost + (owner_cost || 0);
  const safe = (n, d) => (d && d > 0 ? round2(n / d) : null);

  const cost_per_candidate = safe(total_cost, candidates);
  const cost_per_verified = safe(total_cost, verified);
  const cost_per_reply = safe(total_cost, replies);
  const cost_per_opportunity = safe(total_cost, opportunities);
  const cost_per_win = safe(total_cost, wins);
  const gross_per_win = deal_value != null && gross_margin_rate != null ? round2(deal_value * gross_margin_rate) : null;
  const break_even_wins = gross_per_win && gross_per_win > 0 ? Math.ceil(total_cost / gross_per_win) : null;

  return {
    economics_id: input.economics_id || null,
    total_cost: owner_cost == null ? null : round2(total_cost),
    total_cost_status: owner_cost == null ? 'UNKNOWN' : source_status,
    cost_per_candidate, cost_per_verified, cost_per_reply, cost_per_opportunity, cost_per_win,
    gross_per_win, break_even_wins,
    capacity_ceiling,
    confidence: source_status,
    viable: break_even_wins != null && capacity_ceiling != null ? break_even_wins <= capacity_ceiling : 'UNKNOWN',
    note: 'send is never counted as a result; outcomes require Analytics OS evidence',
  };
}
