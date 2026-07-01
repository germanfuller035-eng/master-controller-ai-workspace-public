// tools/delivery_os/lib/capacity.mjs
// Phase 19: Delivery Capacity Model (extends Revenue OS capacity into delivery).
// UNKNOWN when owner hours not confirmed. No invented numbers.

// input: { owner_weekly_hours, active_projects:[{product_id, owner_hours, ai_hours, review_hours, support_hours}],
//          context_switch_cost_pct }
export function deliveryCapacity(input) {
  const ownerWeekly = numOrNull(input.owner_weekly_hours);
  const projects = input.active_projects || [];
  const switchCost = numOrNull(input.context_switch_cost_pct) ?? 0.1;

  const totals = projects.reduce((acc, p) => {
    acc.owner += p.owner_hours || 0; acc.ai += p.ai_hours || 0;
    acc.review += p.review_hours || 0; acc.support += p.support_hours || 0;
    return acc;
  }, { owner: 0, ai: 0, review: 0, support: 0 });
  const ownerLoad = totals.owner + totals.review + totals.support;

  if (ownerWeekly == null) {
    return {
      status: 'UNKNOWN',
      reason: 'owner_weekly_hours not confirmed in canonical Revenue OS / Delivery OS',
      decision_form: { fields: ['owner_weekly_hours', 'per_product_owner_hours', 'context_switch_cost_pct'] },
      parallel_capacity: 'UNKNOWN', bottleneck: 'owner availability unknown',
      overload_warning: 'UNKNOWN', utilization: 'UNKNOWN', delivery_margin_risk: 'UNKNOWN',
      label: 'UNKNOWN_INPUTS',
    };
  }

  const effectiveWeekly = ownerWeekly * (1 - switchCost);
  const utilization = effectiveWeekly ? Math.round((ownerLoad / effectiveWeekly) * 100) : 0;
  const avgOwnerPerProject = projects.length ? ownerLoad / projects.length : null;
  const parallel = avgOwnerPerProject ? Math.max(1, Math.floor(effectiveWeekly / avgOwnerPerProject)) : 'UNKNOWN';

  return {
    status: 'COMPUTED',
    planned_owner_hours: totals.owner, review_hours: totals.review, support_hours: totals.support,
    ai_hours: totals.ai,
    owner_load_hours: ownerLoad,
    effective_weekly_hours: Math.round(effectiveWeekly),
    utilization_pct: utilization,
    parallel_capacity: parallel,
    bottleneck: ownerLoad > effectiveWeekly ? 'owner hours' : 'none',
    overload_warning: utilization > 100 ? 'HIGH' : (utilization > 85 ? 'MEDIUM' : 'LOW'),
    delivery_margin_risk: utilization > 100 ? 'HIGH (overcommitted)' : 'acceptable',
    recommended_product_mix: utilization > 100 ? 'shift to low owner-hour products (mini_audit)' : 'current mix ok',
    label: 'MODEL_ESTIMATE',
  };
}
function numOrNull(v) { return (typeof v === 'number' && !Number.isNaN(v)) ? v : null; }
