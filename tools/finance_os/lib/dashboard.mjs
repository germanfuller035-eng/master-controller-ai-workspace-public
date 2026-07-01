// tools/finance_os/lib/dashboard.mjs
// Phase 26-27-28: Owner Finance Dashboard + Command Center + Alert engine. Strict status labels. No notifications.
import { round2 } from './common.mjs';

// Build the canonical finance dashboard from already-computed sub-results.
// input: { cash, receivables, pnl, projectProfit:[], productEcon:[], reserves, debt, units, capacity, period }
export function buildDashboard(input) {
  const r = input.receivables || {};
  const cf = input.cashflow || {};
  return {
    schema: 'finance_os.dashboard.v1',
    label_legend: ['CONFIRMED', 'OWNER_TARGET', 'MODEL_ESTIMATE', 'IMPORTED_UNVERIFIED', 'UNKNOWN'],
    period: input.period || 'unspecified',
    sections: {
      current_cash_references: input.cash_references || 'UNKNOWN',
      expected_cashflow_7_30_90: input.cashflow_horizons || { '7': 'UNKNOWN', '30': cf.expected?.closing ?? 'UNKNOWN', '90': 'UNKNOWN' },
      unpaid_invoices: r.metrics ? r.metrics.total_receivable : 'UNKNOWN',
      overdue_amounts: r.metrics ? r.metrics.overdue : 'UNKNOWN',
      revenue_this_month: input.revenue_this_month || 'UNKNOWN',
      payments_this_month: input.payments_this_month || 'UNKNOWN',
      project_profitability: (input.projectProfit || []).map((p) => ({ project: p.project_id, margin: p.margin_pct, confidence: p.confidence })),
      product_profitability: (input.productEcon || []).map((p) => ({ product: p.product_id, status: p.status, margin: p.margin_pct ?? 'UNKNOWN' })),
      fixed_costs: input.fixed_costs || 'UNKNOWN',
      reserve_status: input.reserves ? input.reserves.shortfalls : 'UNKNOWN',
      debt_service: input.debt ? input.debt.monthly_debt_service : 'UNKNOWN',
      capacity: input.capacity || 'UNKNOWN',
      business_units: input.units || [],
      risks: input.risks || [],
      owner_decisions: input.owner_decisions || [],
      unknown_data: input.unknown_data || [],
    },
    note: 'Facts and estimates are NOT mixed — every value carries a status label.',
  };
}

// Owner daily/weekly/monthly command center.
export function ownerCommandCenter(input) {
  const r = input.receivables || {};
  const overdue = r.buckets ? [...(r.buckets.overdue_1_7 || []), ...(r.buckets.overdue_8_30 || []), ...(r.buckets.overdue_31_plus || [])] : [];
  return {
    schema: 'finance_os.owner_command_center.v1',
    daily: {
      overdue_receivables: overdue.map((x) => x.invoice_id),
      payments_needing_confirmation: input.payments_unverified || [],
      unexpected_expenses: input.unexpected_expenses || [],
      cash_warnings: input.cashflow?.risks?.cash_gap ? ['negative cash point detected'] : [],
      blocked_project_payments: input.blocked_payments || [],
    },
    weekly: {
      expected_receipts: input.expected_receipts ?? 'UNKNOWN',
      bills: input.bills ?? 'UNKNOWN',
      cash_runway: input.cash_runway ?? 'UNKNOWN',
      project_margins: (input.projectProfit || []).map((p) => ({ project: p.project_id, margin: p.margin_pct })),
      owner_workload: input.owner_workload ?? 'UNKNOWN',
      budget_variance: input.budget_variance ?? 'UNKNOWN',
      reserve_shortfall: input.reserves?.shortfalls || [],
    },
    monthly: ['close', 'pnl', 'cashflow', 'budget', 'tax_reserve', 'product_economics', 'business_unit_decisions'],
    note: 'No real notifications. Owner-facing summary only.',
  };
}

// Phase 28: Alert engine. Recommendations only, no external messages.
export const ALERT_RULES = [
  'invoice_overdue', 'payment_mismatch', 'duplicate_payment', 'duplicate_expense', 'negative_cash_forecast',
  'reserve_shortfall', 'project_margin_below_threshold', 'product_underpriced', 'owner_capacity_exceeded',
  'expense_above_budget', 'debt_payment_risk', 'client_concentration_risk', 'unverified_large_transaction',
  'personal_business_ambiguity',
];

export function generateAlerts(ctx) {
  const alerts = [];
  const add = (rule, detail, severity = 'MEDIUM') => alerts.push({ rule, detail, severity, action: 'recommendation_only', send_allowed: false });

  if (ctx.receivables?.buckets) {
    const od = [...(ctx.receivables.buckets.overdue_1_7 || []), ...(ctx.receivables.buckets.overdue_8_30 || []), ...(ctx.receivables.buckets.overdue_31_plus || [])];
    if (od.length) add('invoice_overdue', `${od.length} overdue invoice(s)`, 'HIGH');
  }
  if (ctx.cashflow?.risks?.cash_gap) add('negative_cash_forecast', `negative cash point ${JSON.stringify(ctx.cashflow.risks.negative_cash_point)}`, 'CRITICAL');
  if (ctx.reserves?.shortfalls?.length) add('reserve_shortfall', `shortfalls: ${ctx.reserves.shortfalls.join(',')}`, 'HIGH');
  for (const p of (ctx.projectProfit || [])) if (typeof p.margin_pct === 'number' && p.margin_pct < 20) add('project_margin_below_threshold', `${p.project_id} margin ${p.margin_pct}%`, 'MEDIUM');
  for (const p of (ctx.productEcon || [])) if (typeof p.margin_pct === 'number' && p.margin_pct < 30) add('product_underpriced', `${p.product_id} margin ${p.margin_pct}%`, 'MEDIUM');
  if (ctx.duplicate_payments?.length) add('duplicate_payment', `${ctx.duplicate_payments.length}`, 'HIGH');
  if (ctx.duplicate_expenses?.length) add('duplicate_expense', `${ctx.duplicate_expenses.length}`, 'MEDIUM');
  if (ctx.ambiguous_expenses?.length) add('personal_business_ambiguity', `${ctx.ambiguous_expenses.length}`, 'MEDIUM');
  if (ctx.client_concentration_pct != null && ctx.client_concentration_pct > 40) add('client_concentration_risk', `${ctx.client_concentration_pct}%`, 'HIGH');
  if (ctx.capacity_exceeded) add('owner_capacity_exceeded', 'capacity exceeded', 'HIGH');
  if (ctx.debt?.coverage_risk === 'HIGH') add('debt_payment_risk', 'low debt coverage', 'HIGH');

  return { label: 'RECOMMENDATIONS_ONLY', count: alerts.length, alerts, note: 'No external messages. Owner reviews.' };
}
