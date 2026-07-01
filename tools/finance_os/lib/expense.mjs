// tools/finance_os/lib/expense.mjs
// Phase 10: Expense intake + classification. Detects duplicates, ambiguity, missing evidence.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FINANCE_ROOT } from './common.mjs';
import { validate } from '../../revenue_os/lib/schema.mjs';
import { ExpenseSchema } from '../schemas/domain.mjs';

let COA = null;
function chart() { if (!COA) COA = JSON.parse(readFileSync(path.join(FINANCE_ROOT, 'data/chart_of_accounts.json'), 'utf8')); return COA; }
function knownCategories() {
  const c = chart();
  return [...c.revenue, ...c.direct_costs, ...c.operating_expenses, ...c.owner_personal, ...c.taxes_reserves].map((x) => x.key);
}

export function classifyExpense(e) {
  const errors = [];
  const warnings = [];
  const shape = validate(e, ExpenseSchema, e.expense_id || 'expense');
  if (!shape.ok) errors.push(...shape.errors);

  if (e.category && !knownCategories().includes(e.category)) warnings.push(`category '${e.category}' not in chart of accounts`);
  if (typeof e.amount === 'number' && e.amount < 0) errors.push('negative expense amount');
  if (e.scope === 'ambiguous') warnings.push('personal/business ambiguity — owner must classify');
  if (e.status === 'CONFIRMED' && !e.evidence) errors.push('CONFIRMED expense without evidence');
  if (e.direct === true && !e.project_id && !e.product_id) warnings.push('direct (project) cost without project/product');
  if (e.recurring && !e.vendor) warnings.push('recurring expense (subscription) without vendor/owner');
  if (e.status === 'PLANNED' && e.approved !== true && e.amount > 0) warnings.push('planned expense not approved');

  return { ok: errors.length === 0, errors, warnings };
}

// Duplicate detection across a set (same vendor+amount+date, or recurring same vendor+amount in period).
export function detectDuplicates(expenses) {
  const seen = new Map();
  const duplicates = [];
  const recurringDup = [];
  for (const e of expenses) {
    const key = `${(e.vendor || '').toLowerCase()}::${e.amount}::${e.date || ''}`;
    if (seen.has(key)) duplicates.push({ expense_id: e.expense_id, duplicate_of: seen.get(key) });
    else seen.set(key, e.expense_id);
  }
  // Recurring duplicate: same vendor+amount appearing >1 with recurring=false (possible double entry).
  const byVendorAmt = {};
  for (const e of expenses) {
    const k = `${(e.vendor || '').toLowerCase()}::${e.amount}`;
    (byVendorAmt[k] = byVendorAmt[k] || []).push(e);
  }
  for (const [k, list] of Object.entries(byVendorAmt)) {
    if (list.length > 1 && list.every((e) => !e.recurring)) recurringDup.push({ vendor_amount: k, count: list.length });
  }
  return { duplicates, possible_recurring_duplicates: recurringDup };
}

export function classifySet(expenses) {
  const per = expenses.map((e) => ({ expense_id: e.expense_id, ...classifyExpense(e) }));
  const dups = detectDuplicates(expenses);
  const failed = per.filter((r) => !r.ok).length;
  return {
    ok: failed === 0 && dups.duplicates.length === 0,
    total: expenses.length,
    failed,
    duplicates: dups.duplicates,
    possible_recurring_duplicates: dups.possible_recurring_duplicates,
    ambiguous: expenses.filter((e) => e.scope === 'ambiguous').map((e) => e.expense_id),
    per_expense: per,
  };
}
