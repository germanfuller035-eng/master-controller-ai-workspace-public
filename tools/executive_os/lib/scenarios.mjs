// tools/executive_os/lib/scenarios.mjs
// Phase 24: Executive Scenario Planner. All assumptions visible. Forecast != fact.
import { round2 } from './common.mjs';

export const SCENARIOS = ['conservative', 'base', 'growth', 'capacity_limited', 'no_new_sales', 'delayed_payments', 'product_delay', 'infrastructure_failure', 'owner_unavailable', 'cost_increase', 'one_client_concentration', 'controlled_commercial_cycle'];

// base inputs (explicit assumptions).
export function runScenario(name, input) {
  const a = { ...input };
  const deals = a.monthly_deals ?? 0;
  const price = a.avg_deal_value ?? 0;
  const mult = { conservative: 0.5, base: 1, growth: 1.8, capacity_limited: 1, no_new_sales: 0, delayed_payments: 1, product_delay: 0.7, infrastructure_failure: 0.6, owner_unavailable: 0.3, cost_increase: 1, one_client_concentration: 1, controlled_commercial_cycle: 0.6 }[name] ?? 1;
  let effDeals = deals * mult;
  if (name === 'capacity_limited' && a.capacity_limit != null) effDeals = Math.min(effDeals, a.capacity_limit);
  const revenue = round2(effDeals * price);
  let cashReceipts = revenue;
  if (name === 'delayed_payments') cashReceipts = round2(revenue * 0.4);
  let costs = a.monthly_costs ?? 0;
  if (name === 'cost_increase') costs = round2(costs * 1.4);
  if (name === 'infrastructure_failure') costs = round2(costs + (a.incident_cost ?? 0));
  const ownerLoad = round2(effDeals * (a.owner_hours_per_deal ?? 0));
  const deliveryLoad = round2(effDeals * (a.delivery_hours_per_deal ?? 0));

  const risks = [];
  if (name === 'owner_unavailable') risks.push('owner bottleneck');
  if (name === 'one_client_concentration') risks.push('single-client dependency');
  if (name === 'no_new_sales') risks.push('pipeline dry');
  if (cashReceipts - costs < 0) risks.push('negative cash');

  return {
    scenario: name, label: 'MODEL_ESTIMATE (assumptions visible)',
    revenue_implication: revenue, cash_implication: round2(cashReceipts - costs),
    delivery_load_hours: deliveryLoad, owner_load_hours: ownerLoad,
    project_priorities: name === 'no_new_sales' ? ['delivery', 'collections'] : ['mini_audit', 'pipeline'],
    risks,
    decisions_required: name === 'controlled_commercial_cycle' ? ['approve first cycle + daily limit'] : (name === 'owner_unavailable' ? ['delegate to Claude/Cline'] : []),
    assumptions: a,
  };
}

export function runAll(input) { return Object.fromEntries(SCENARIOS.map((s) => [s, runScenario(s, input)])); }
