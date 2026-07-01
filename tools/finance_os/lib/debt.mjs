// tools/finance_os/lib/debt.mjs
// Phase 18: Debt and Obligations planner. Synthetic fixtures. Never imports/modifies real personal debt.
import { round2 } from './common.mjs';

// debts: [{debt_id, type, creditor, currency, principal, interest_rate, payment, frequency, scope, confirmed}]
export function evaluateDebt(debts, opts = {}) {
  const errors = [];
  const monthly = debts.reduce((s, d) => s + monthlyPayment(d), 0);
  for (const d of debts) {
    if (d.confirmed && (d.principal == null || d.payment == null)) errors.push(`confirmed debt ${d.debt_id} missing principal/payment`);
  }
  const monthlyCash = opts.monthly_cash_inflow ?? null;
  const coverage = (monthlyCash != null && monthly) ? round2(monthlyCash / monthly) : null;
  // Stress scenario: inflow drops by stress_pct.
  const stressPct = opts.stress_pct ?? 0.3;
  const stressCoverage = (monthlyCash != null && monthly) ? round2((monthlyCash * (1 - stressPct)) / monthly) : null;

  return {
    label: 'MANAGERIAL_INTERNAL',
    total_debts: debts.length,
    monthly_debt_service: round2(monthly),
    total_remaining_payments: round2(debts.reduce((s, d) => s + (d.principal || 0), 0)),
    interest_burden: round2(debts.reduce((s, d) => s + ((d.principal || 0) * (d.interest_rate || 0)), 0)),
    cashflow_coverage: coverage != null ? coverage : 'UNKNOWN',
    stress_coverage: stressCoverage != null ? stressCoverage : 'UNKNOWN',
    coverage_risk: coverage != null ? (coverage < 1.2 ? 'HIGH' : (coverage < 2 ? 'MEDIUM' : 'LOW')) : 'UNKNOWN',
    errors,
    note: 'Synthetic fixtures only. Real/personal debt is referenced safely, never copied into general dashboards.',
  };
}

function monthlyPayment(d) {
  if (d.payment == null) return 0;
  const freq = { monthly: 1, quarterly: 1 / 3, annual: 1 / 12, weekly: 4.33 }[d.frequency] ?? 1;
  return (d.payment || 0) * freq;
}
