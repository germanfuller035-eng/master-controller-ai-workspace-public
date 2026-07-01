// tools/finance_os/lib/close.mjs
// Phase 25: Financial Close process. Checklist + period lock guard. No bank integration.

export const CLOSE_STEPS = [
  'record_confirmed_revenue', 'reconcile_invoices', 'reconcile_payments', 'reconcile_expenses',
  'review_receivables', 'review_project_profitability', 'review_subscriptions', 'update_debt',
  'calculate_tax_reserve_estimate', 'update_cashflow', 'compare_budget', 'lock_period',
  'generate_owner_report', 'record_decisions', 'backup_evidence',
];

// state: { period, completed:[step keys], reconciliations:{invoices,payments,expenses} }
export function evaluateClose(state) {
  const errors = [];
  const completed = new Set(state.completed || []);
  const remaining = CLOSE_STEPS.filter((s) => !completed.has(s));

  // Period cannot be locked until all reconciliations done.
  const reconDone = completed.has('reconcile_invoices') && completed.has('reconcile_payments') && completed.has('reconcile_expenses');
  const wantsLock = state.lock_requested === true;
  if (wantsLock && !reconDone) errors.push('cannot lock period before invoice/payment/expense reconciliation');
  if (wantsLock && !completed.has('review_receivables')) errors.push('cannot lock before receivables review');

  const canLock = reconDone && completed.has('review_receivables') && completed.has('update_cashflow');

  return {
    label: 'MANAGERIAL_INTERNAL',
    period: state.period,
    total_steps: CLOSE_STEPS.length,
    completed: completed.size,
    remaining,
    reconciliations_complete: reconDone,
    can_lock_period: canLock,
    errors,
    complete: completed.size === CLOSE_STEPS.length && errors.length === 0,
    note: 'No actual bank integration. Lock blocked until reconciliations + receivables + cashflow done.',
  };
}
