// tools/revenue_os/lib/funnel.mjs
// Phase 19: Sales Funnel Simulator. Offline, deterministic. All assumptions visible. No guarantees.

export const STAGES = [
  'candidates', 'verified', 'audit_ready', 'draft_ready', 'approved',
  'contacted', 'delivered', 'replied', 'interested', 'proposal', 'won',
];

// input: { stage_counts:{candidates:N}, conversions:{verified:0.6,...}, time_days:{...},
//          product_price, capacity_limit }
export function simulate(input) {
  const conv = input.conversions || {};
  const counts = {};
  let prev = input.stage_counts?.candidates ?? 0;
  counts.candidates = prev;
  for (let i = 1; i < STAGES.length; i++) {
    const stage = STAGES[i];
    const rate = conv[stage] ?? defaultRate(stage);
    prev = prev * rate;
    counts[stage] = Math.round(prev * 100) / 100;
  }
  // Capacity caps "delivered".
  let capacityNote = null;
  if (input.capacity_limit != null && counts.delivered > input.capacity_limit) {
    capacityNote = `delivered capped by capacity_limit ${input.capacity_limit} (was ${counts.delivered})`;
    const ratioRemaining = input.capacity_limit / counts.delivered;
    counts.delivered = input.capacity_limit;
    for (const s of ['replied', 'interested', 'proposal', 'won']) counts[s] = Math.round(counts[s] * ratioRemaining * 100) / 100;
  }

  const price = input.product_price ?? null;
  const expectedDeals = counts.won;
  const revenueMid = price != null ? Math.round(expectedDeals * price) : 'UNKNOWN';
  const revenueLow = price != null ? Math.round(expectedDeals * price * 0.7) : 'UNKNOWN';
  const revenueHigh = price != null ? Math.round(expectedDeals * price * 1.3) : 'UNKNOWN';

  // Bottleneck = stage with the largest proportional drop.
  let bottleneck = null, worst = 1;
  for (let i = 1; i < STAGES.length; i++) {
    const r = (conv[STAGES[i]] ?? defaultRate(STAGES[i]));
    if (r < worst) { worst = r; bottleneck = STAGES[i]; }
  }

  // Required candidate volume for a target won count.
  let requiredCandidates = 'UNKNOWN';
  if (input.target_won != null) {
    let cumulative = 1;
    for (let i = 1; i < STAGES.length; i++) cumulative *= (conv[STAGES[i]] ?? defaultRate(STAGES[i]));
    requiredCandidates = cumulative > 0 ? Math.ceil(input.target_won / cumulative) : 'UNKNOWN';
  }

  return {
    label: 'MODEL_ESTIMATE (forecast, not guarantee)',
    stage_counts: counts,
    expected_deals: expectedDeals,
    expected_revenue_range: { low: revenueLow, mid: revenueMid, high: revenueHigh, currency: 'RUB' },
    bottleneck: bottleneck ? `${bottleneck} (rate ${worst})` : 'none',
    capacity_note: capacityNote,
    required_candidates_for_target: requiredCandidates,
    assumptions: { conversions: STAGES.slice(1).reduce((o, s) => (o[s] = conv[s] ?? defaultRate(s), o), {}), product_price: price ?? 'UNKNOWN', capacity_limit: input.capacity_limit ?? 'none' },
  };
}

function defaultRate(stage) {
  // Conservative defaults; explicit and overridable.
  const d = {
    verified: 0.6, audit_ready: 0.8, draft_ready: 0.9, approved: 0.7,
    contacted: 0.95, delivered: 0.9, replied: 0.2, interested: 0.4, proposal: 0.5, won: 0.3,
  };
  return d[stage] ?? 0.5;
}
