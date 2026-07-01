// tools/revenue_os/lib/capacity.mjs
// Phase 18: Capacity Planner. UNKNOWN where owner availability not confirmed. No invented numbers.

// input: { owner_weekly_hours, product_delivery_hours, ai_automation_pct, revision_reserve_pct,
//          support_load_hours, active_projects, context_switch_cost_pct }
export function plan(input) {
  const ownerWeekly = numOrNull(input.owner_weekly_hours);
  const deliveryHours = numOrNull(input.product_delivery_hours);
  const aiPct = numOrNull(input.ai_automation_pct);          // 0..1 portion done by AI
  const revisionReserve = numOrNull(input.revision_reserve_pct) ?? 0.15;
  const supportLoad = numOrNull(input.support_load_hours) ?? 0;
  const activeProjects = numOrNull(input.active_projects) ?? 0;
  const switchCost = numOrNull(input.context_switch_cost_pct) ?? 0.1;

  if (ownerWeekly == null) {
    return {
      ok: true, status: 'UNKNOWN',
      reason: 'owner_weekly_hours not confirmed in canonical Revenue OS',
      input_fields_needed: ['owner_weekly_hours', 'product_delivery_hours', 'ai_automation_pct'],
      max_parallel_projects: 'UNKNOWN', max_monthly_volume: 'UNKNOWN',
      bottleneck: 'owner availability unknown', owner_workload: 'UNKNOWN', ai_workload: 'UNKNOWN',
      overload_risk: 'UNKNOWN', recommended_product_mix: 'define owner hours first',
      label: 'UNKNOWN_INPUTS',
    };
  }

  const ownerPerProduct = deliveryHours != null ? deliveryHours * (1 - (aiPct ?? 0)) : null;
  const effectiveWeekly = ownerWeekly * (1 - switchCost) - supportLoad;
  const monthlyOwner = effectiveWeekly * 4;

  let maxMonthlyVolume = 'UNKNOWN', maxParallel = 'UNKNOWN', overload = 'UNKNOWN';
  if (ownerPerProduct != null && ownerPerProduct > 0) {
    const perProductWithRevision = ownerPerProduct * (1 + revisionReserve);
    maxMonthlyVolume = Math.floor(monthlyOwner / perProductWithRevision);
    maxParallel = Math.max(1, Math.floor(effectiveWeekly / Math.max(1, perProductWithRevision / 2)));
    overload = activeProjects > maxParallel ? 'HIGH' : (activeProjects === maxParallel ? 'MEDIUM' : 'LOW');
  }

  return {
    ok: true, status: 'COMPUTED',
    max_parallel_projects: maxParallel,
    max_monthly_volume: maxMonthlyVolume,
    bottleneck: ownerPerProduct != null ? 'owner delivery hours' : 'product delivery hours unknown',
    owner_workload: Math.round(monthlyOwner) + ' owner-hours/month available',
    ai_workload: aiPct != null ? Math.round((aiPct) * 100) + '% delivery automatable' : 'UNKNOWN',
    overload_risk: overload,
    recommended_product_mix: maxMonthlyVolume !== 'UNKNOWN'
      ? `prioritize low owner-hour products (e.g. mini_audit) up to ~${maxMonthlyVolume}/month`
      : 'UNKNOWN',
    label: 'MODEL_ESTIMATE',
    assumptions: { owner_weekly_hours: ownerWeekly, product_delivery_hours: deliveryHours, ai_automation_pct: aiPct, revision_reserve_pct: revisionReserve, support_load_hours: supportLoad, context_switch_cost_pct: switchCost },
  };
}

function numOrNull(v) { return (typeof v === 'number' && !Number.isNaN(v)) ? v : null; }
