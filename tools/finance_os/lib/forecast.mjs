// tools/finance_os/lib/forecast.mjs
// Phase 22-23: Financial Forecast Engine + Break-even. All assumptions visible. Forecast != fact.
import { round2 } from './common.mjs';

export const SCENARIOS = ['conservative', 'base', 'target', 'stress', 'capacity_limited', 'no_new_sales', 'delayed_payments', 'expense_spike'];

// input (base assumptions, all explicit):
// { monthly_deals, avg_deal_value, conversion, product_mix, capacity_limit_deals, monthly_fixed_costs,
//   monthly_variable_ratio, opening_cash, payment_delay_months, debt_service, reserves_target }
export function forecast(scenarioName, input) {
  const a = { ...input };
  const mult = { conservative: 0.5, base: 1, target: 1.5, stress: 0.4, capacity_limited: 1, no_new_sales: 0, delayed_payments: 1, expense_spike: 1 }[scenarioName] ?? 1;

  let deals = round2((a.monthly_deals ?? 0) * mult);
  if (scenarioName === 'capacity_limited' && a.capacity_limit_deals != null) deals = Math.min(deals, a.capacity_limit_deals);
  if (scenarioName === 'no_new_sales') deals = 0;

  const revenue = round2(deals * (a.avg_deal_value ?? 0));
  // Cash receipts shifted by payment delay (delayed_payments pushes a fraction to next period -> 0 this period).
  let cashReceipts = revenue;
  if (scenarioName === 'delayed_payments') cashReceipts = round2(revenue * 0.4);
  const variable = round2(revenue * (a.monthly_variable_ratio ?? 0.1));
  let fixed = a.monthly_fixed_costs ?? 0;
  if (scenarioName === 'expense_spike') fixed = round2(fixed * 1.5);
  const debtService = a.debt_service ?? 0;
  const profit = round2(revenue - variable - fixed);
  const cashBalance = round2((a.opening_cash ?? 0) + cashReceipts - variable - fixed - debtService);

  const ownerHoursPerDeal = a.owner_hours_per_deal ?? null;
  const ownerWorkload = (ownerHoursPerDeal != null) ? round2(deals * ownerHoursPerDeal) : 'UNKNOWN';

  return {
    scenario: scenarioName,
    label: 'MODEL_ESTIMATE (forecast, not guarantee)',
    deals, monthly_revenue: revenue, monthly_cash_receipts: cashReceipts,
    expenses: round2(variable + fixed), profit_estimate: profit, cash_balance: cashBalance,
    owner_workload_hours: ownerWorkload,
    cash_gap: cashBalance < 0,
    reserve_status: (a.reserves_target != null && cashBalance < a.reserves_target) ? 'BELOW_TARGET' : 'ok_or_unknown',
    assumptions: a,
  };
}

export function forecastSet(input) {
  return Object.fromEntries(SCENARIOS.map((s) => [s, forecast(s, input)]));
}

// Break-even. If inputs unknown, return required inputs (do not invent).
export function breakEven(input) {
  const missing = [];
  if (input.monthly_fixed_costs == null) missing.push('monthly_fixed_costs');
  if (input.avg_contribution_margin == null) missing.push('avg_contribution_margin');
  if (missing.length) return { status: 'UNKNOWN', required_inputs: missing, note: 'cannot compute break-even without these' };

  const fixed = input.monthly_fixed_costs;
  const cm = input.avg_contribution_margin;
  const cmRatio = input.avg_deal_value ? cm / input.avg_deal_value : null;
  const breakevenRevenue = cmRatio ? round2(fixed / cmRatio) : 'UNKNOWN';
  const breakevenDeals = cm ? Math.ceil(fixed / cm) : 'UNKNOWN';
  const ownerHourBreakeven = (input.owner_hours_per_deal && breakevenDeals !== 'UNKNOWN') ? round2(breakevenDeals * input.owner_hours_per_deal) : 'UNKNOWN';

  return {
    status: 'MODEL_ESTIMATE',
    monthly_fixed_costs: fixed,
    avg_contribution_margin: cm,
    break_even_revenue: breakevenRevenue,
    break_even_deal_count: breakevenDeals,
    owner_hour_break_even: ownerHourBreakeven,
    assumptions: input,
  };
}
