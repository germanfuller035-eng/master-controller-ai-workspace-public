// tools/finance_os/lib/economics.mjs
// Phase 11-12: Product Unit Economics + Project Profitability. Never promotes modeled->confirmed.
import { readFileSync } from 'node:fs';
import { REVENUE_CATALOG, round2 } from './common.mjs';

let CATALOG = null;
function product(id) {
  if (!CATALOG) CATALOG = JSON.parse(readFileSync(REVENUE_CATALOG, 'utf8'));
  return CATALOG.products.find((p) => p.product_id === id) || null;
}

// Default internal cost assumptions (clearly MODEL_ESTIMATE; owner-editable).
export const ASSUMPTIONS = {
  owner_hour_cost: 3000,   // RUB/h opportunity cost (ESTIMATE)
  ai_hour_cost: 100,       // RUB/h (ESTIMATE)
  overhead_ratio: 0.1,     // % of revenue (ESTIMATE)
  risk_reserve_ratio: 0.1,
};

// Product unit economics. Returns UNKNOWN where hours/price absent.
export function productEconomics(productId, overrides = {}) {
  const p = product(productId);
  if (!p) return { ok: false, error: `unknown product ${productId}` };
  const a = { ...ASSUMPTIONS, ...overrides };
  const price = p.price.amount ?? p.price.amount_min ?? null;
  const ownerHours = p.owner_hours ?? null;
  const totalHours = p.estimated_hours ?? null;
  const aiHours = (totalHours != null && ownerHours != null) ? Math.max(0, totalHours - ownerHours) : null;

  const knowable = price != null && ownerHours != null && totalHours != null;
  if (!knowable) {
    return {
      product_id: productId, status: 'UNKNOWN',
      price_status: p.price.status,
      missing: [price == null && 'price', ownerHours == null && 'owner_hours', totalHours == null && 'estimated_hours'].filter(Boolean),
      label: 'UNKNOWN (insufficient data)',
    };
  }
  const ownerCost = ownerHours * a.owner_hour_cost;
  const aiCost = aiHours * a.ai_hour_cost;
  const overhead = price * a.overhead_ratio;
  const riskReserve = price * a.risk_reserve_ratio;
  const directCash = (overrides.direct_cash ?? 0);
  const contractor = (overrides.contractor ?? 0);
  const totalCost = ownerCost + aiCost + overhead + riskReserve + directCash + contractor;
  const grossProfit = price - (aiCost + directCash + contractor); // excludes owner opportunity + overhead
  const contributionMargin = price - (aiCost + directCash + contractor);
  const netEstimate = price - totalCost;

  return {
    product_id: productId,
    status: p.price.status === 'CONFIRMED' ? 'MODEL_ESTIMATE' : 'MODEL_ESTIMATE', // costs always modeled
    price, price_status: p.price.status,
    owner_hours: ownerHours, ai_hours: aiHours,
    direct_cash: directCash, contractor_cost: contractor,
    overhead: round2(overhead), risk_reserve: round2(riskReserve),
    gross_profit: round2(grossProfit),
    contribution_margin: round2(contributionMargin),
    revenue_per_owner_hour: ownerHours ? round2(price / ownerHours) : null,
    net_estimate: round2(netEstimate),
    margin_pct: price ? Math.round((netEstimate / price) * 100) : null,
    label: 'MODEL_ESTIMATE (costs modeled; not confirmed financials)',
  };
}

// Project profitability — integrates Delivery OS plan-vs-actual style inputs.
// input: { project_id, product_id, contracted_value, invoiced, paid, direct_expenses, actual_owner_hours,
//          actual_ai_cost, contractor_costs, overhead, status:'CONFIRMED'|'MODEL_ESTIMATE'|'UNKNOWN' }
export function projectProfitability(input) {
  const a = ASSUMPTIONS;
  const revenue = input.contracted_value ?? 0;
  const ownerCost = (input.actual_owner_hours ?? 0) * a.owner_hour_cost;
  const directExpenses = input.direct_expenses ?? 0;
  const aiCost = input.actual_ai_cost ?? 0;
  const contractor = input.contractor_costs ?? 0;
  const overhead = input.overhead ?? round2(revenue * a.overhead_ratio);
  const grossProfit = revenue - (directExpenses + aiCost + contractor);
  const margin = revenue ? Math.round((grossProfit / revenue) * 100) : null;
  const cashReceived = input.paid ?? 0;
  const receivable = (input.invoiced ?? 0) - cashReceived;

  const flags = [];
  if (grossProfit > 0 && cashReceived === 0) flags.push('profitable_on_paper_but_unpaid');
  if (input.actual_owner_hours && revenue && (revenue / input.actual_owner_hours) < a.owner_hour_cost) flags.push('low_owner_hour_return');
  if (margin != null && margin < 20) flags.push('low_margin');
  if (input.scope_creep) flags.push('scope_creep_reduced_margin');
  if (input.client_delay) flags.push('client_delay_increased_cost');
  if (input.excessive_revisions) flags.push('excessive_revisions');
  if (cashReceived === 0 && input.status_delivery === 'completed') flags.push('unpaid_completed_work');

  return {
    project_id: input.project_id, product_id: input.product_id,
    revenue, invoiced: input.invoiced ?? 0, paid: cashReceived, receivable: Math.round(receivable),
    direct_costs: round2(directExpenses + aiCost + contractor),
    owner_cost_estimate: round2(ownerCost), overhead: round2(overhead),
    gross_profit: round2(grossProfit), margin_pct: margin,
    flags,
    confidence: input.status || 'MODEL_ESTIMATE',
    label: input.status === 'CONFIRMED' ? 'CONFIRMED revenue, MODEL_ESTIMATE costs' : 'MODEL_ESTIMATE',
  };
}
