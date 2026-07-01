// tools/revenue_os/lib/economics.mjs
// Phase 17: Revenue economics. Strict separation of confirmed/invoiced/paid/outstanding/target/
// forecast/estimate/pipeline. Never treats targets as actual revenue. Scenario engine.

const REVENUE_CLASSES = ['confirmed', 'invoiced', 'paid', 'outstanding', 'target', 'forecast', 'estimate', 'pipeline'];

// events: [{type, amount, currency, confirmed, test_only}]
export function summarize(events) {
  const totals = Object.fromEntries(REVENUE_CLASSES.map((c) => [c, 0]));
  let test_only = 0;
  for (const e of events) {
    if (e.test_only) test_only++;
    if (REVENUE_CLASSES.includes(e.type)) totals[e.type] += (e.amount || 0);
  }
  return {
    totals,
    actual_revenue: totals.confirmed + totals.paid,   // ONLY confirmed/paid count as actual
    not_actual: { target: totals.target, forecast: totals.forecast, estimate: totals.estimate, pipeline: totals.pipeline },
    test_only_events: test_only,
    note: 'actual_revenue = confirmed + paid ONLY. target/forecast/estimate/pipeline are NOT revenue.',
  };
}

// Scenario engine. Inputs explicit + editable. Returns probability-adjusted pipeline etc.
// scenario: { name, deals:[{value, probability}], product_price, expected_volume, capacity_limit }
export function scenario(input) {
  const deals = input.deals || [];
  const probabilityAdjusted = deals.reduce((s, d) => s + (d.value || 0) * (d.probability ?? 0), 0);
  const rawPipeline = deals.reduce((s, d) => s + (d.value || 0), 0);
  const volume = input.expected_volume ?? null;
  const price = input.product_price ?? null;
  let modeled = (volume != null && price != null) ? volume * price : null;
  let capacityLimited = modeled;
  if (modeled != null && input.capacity_limit != null && price != null) {
    capacityLimited = Math.min(modeled, input.capacity_limit * price);
  }
  return {
    name: input.name || 'scenario',
    label: 'MODEL_ESTIMATE',
    raw_pipeline_value: rawPipeline,
    probability_adjusted_pipeline: Math.round(probabilityAdjusted),
    modeled_revenue: modeled != null ? Math.round(modeled) : 'UNKNOWN',
    capacity_limited_revenue: capacityLimited != null ? Math.round(capacityLimited) : 'UNKNOWN',
    assumptions: {
      product_price: price ?? 'UNKNOWN',
      expected_volume: volume ?? 'UNKNOWN',
      capacity_limit: input.capacity_limit ?? 'UNKNOWN',
    },
    disclaimer: 'Forecast, not guarantee. Inputs are explicit assumptions.',
  };
}

// Built-in scenario templates (conservative/base/target/capacity-limited) operate on the SAME inputs.
export function scenarioSet(base) {
  const mk = (name, mult, cap) => scenario({
    name, product_price: base.product_price, expected_volume: Math.round((base.expected_volume || 0) * mult),
    capacity_limit: cap ?? base.capacity_limit, deals: base.deals || [],
  });
  return {
    conservative: mk('conservative', 0.5),
    base: mk('base', 1),
    target: mk('target', 1.5),
    capacity_limited: mk('capacity_limited', 1.5, base.capacity_limit),
  };
}
