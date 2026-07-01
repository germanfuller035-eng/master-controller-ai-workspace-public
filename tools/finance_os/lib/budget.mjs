// tools/finance_os/lib/budget.mjs
// Phase 15: Budget Engine. States DRAFT..CLOSED. No automatic approval.
import { round2, BUDGET_STATUS } from './common.mjs';

export function evaluateBudget(b) {
  const errors = [];
  if (!BUDGET_STATUS.includes(b.status)) errors.push(`invalid budget status ${b.status}`);
  if (b.status === 'APPROVED' && b.owner_approved !== true) errors.push('APPROVED budget without owner approval');
  if (b.status === 'LOCKED' && b.status_prev && b.status_prev !== 'APPROVED') errors.push('LOCKED requires prior APPROVED');
  const planned = b.planned ?? 0;
  const actual = b.actual ?? null;
  const committed = b.committed ?? 0;
  const variance = actual != null ? round2(planned - actual) : null;
  const variancePct = (actual != null && planned) ? Math.round(((actual - planned) / planned) * 100) : null;
  const overspend = actual != null && actual > planned;
  return {
    ok: errors.length === 0, errors,
    planned: round2(planned), committed: round2(committed), actual: actual != null ? round2(actual) : 'UNKNOWN',
    forecast: b.forecast != null ? round2(b.forecast) : 'UNKNOWN',
    variance: variance != null ? variance : 'UNKNOWN', variance_pct: variancePct != null ? variancePct : 'UNKNOWN',
    overspend, status: b.status, owner_approved: b.owner_approved === true,
  };
}

export function summarizeBudgets(budgets) {
  const evals = budgets.map((b) => ({ budget_id: b.budget_id, ...evaluateBudget(b) }));
  return {
    ok: evals.every((e) => e.ok),
    total: budgets.length,
    overspends: evals.filter((e) => e.overspend).map((e) => e.budget_id),
    unapproved: evals.filter((e) => !e.owner_approved && e.status === 'APPROVED').map((e) => e.budget_id),
    per_budget: evals,
  };
}
