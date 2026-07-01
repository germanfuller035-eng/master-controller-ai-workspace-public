#!/usr/bin/env node
// tools/finance_os/tests/finance.test.mjs
// Phase 38: Comprehensive offline test suite for Finance OS. Deterministic. Real exit code.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../../revenue_os/lib/schema.mjs';
import { SCHEMAS } from '../schemas/domain.mjs';
import { money } from '../lib/common.mjs';
import { checkKindConfusion, validateResultAssertion, validateAmount } from '../lib/classification.mjs';
import { buildInvoice, buildPaymentSchedule, validatePaymentSchedule, canSetInvoiceStatus } from '../lib/invoice.mjs';
import { buildReceivables } from '../lib/receivables.mjs';
import { reconcile, reconcileSplit } from '../lib/reconcile.mjs';
import { classifySet } from '../lib/expense.mjs';
import { productEconomics, projectProfitability } from '../lib/economics.mjs';
import { buildPnL } from '../lib/pnl.mjs';
import { buildCashflow } from '../lib/cashflow.mjs';
import { summarizeBudgets } from '../lib/budget.mjs';
import { evaluateReserves, taxEstimate } from '../lib/reserves.mjs';
import { evaluateDebt } from '../lib/debt.mjs';
import { validateTransaction } from '../lib/separation.mjs';
import { forecast, forecastSet, breakEven } from '../lib/forecast.mjs';
import { evaluateKPIs } from '../lib/kpi.mjs';
import { evaluateClose } from '../lib/close.mjs';
import { generateAlerts } from '../lib/dashboard.mjs';
import { importDryRun } from '../lib/import_contracts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const fx = JSON.parse(readFileSync(path.join(ROOT, 'fixtures/finance.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

// Domain
{
  const inv = { invoice_id: 'i', client_reference: 'c', business_unit_id: 'mini_audit', number: 'n', currency: 'RUB', subtotal: 10000, tax: 0, total: 10000, status: 'DRAFT', price_status: 'CONFIRMED', test_only: true, revision: 1 };
  ok('domain: valid invoice', validate(inv, SCHEMAS.invoice).ok);
  ok('domain: invalid currency rejected', !validate({ ...inv, currency: 'XYZ' }, SCHEMAS.invoice).ok);
  ok('domain: missing required rejected', !validate({ ...inv, total: undefined }, SCHEMAS.invoice).ok);
}
// Classification
{
  ok('class: forecast!=revenue', !checkKindConfusion('forecast', 'booked_revenue').ok);
  ok('class: invoiced!=payment', !checkKindConfusion('invoiced', 'payment').ok);
  ok('class: payment!=profit', !checkKindConfusion('payment', 'profit').ok);
  ok('class: forecast confirmed blocked', !validateResultAssertion({ kind: 'forecast', confirmed: true }).ok);
  ok('class: personal!=business revenue', !validateResultAssertion({ kind: 'personal_funds', counted_as_business_revenue: true }).ok);
  ok('class: confirmed needs source', !validateAmount(money(1, 'CONFIRMED')).ok);
}
// Invoice
{
  ok('invoice: valid 50/50', buildInvoice({ ...invFx('F01_mini_audit_prepaid').input, test_only: true }).ok);
  ok('invoice: dup number blocked', !buildInvoice({ product_id: 'mini_audit', client_reference: 'c', number: 'X', test_only: true }, ['X']).ok);
  ok('invoice: unapproved draft price blocked', !buildInvoice({ ...invFx('F10_unapproved_draft_price').input }).ok);
  ok('invoice: schedule total guard', !validatePaymentSchedule([{ percentage: 40, amount: 4000 }], 10000).ok);
  ok('invoice: PAID needs confirmed payment', !canSetInvoiceStatus({}, 'PAID', { confirmed_payment: false }).ok);
  ok('invoice: APPROVED needs owner', !canSetInvoiceStatus({}, 'APPROVED', { owner_approved: false }).ok);
  ok('invoice: send_allowed false', buildInvoice({ ...invFx('F01_mini_audit_prepaid').input, test_only: true }).send_allowed === false);
}
function invFx(id) { return fx.invoices.find((i) => i.fixture_id === id); }
// Payments / receivables
{
  const r = reconcile({ invoice_id: 'i', number: 'n', total: 10000, currency: 'RUB', client_reference: 'acme' }, { amount: 10000, currency: 'RUB', client_hint: 'acme', reference: 'x' });
  ok('recon: probable not auto-confirmed', r.result === 'probable_match' && r.auto_confirm === false);
  const exact = reconcile({ invoice_id: 'i', number: 'n', total: 10000, currency: 'RUB', client_reference: 'acme' }, { amount: 10000, currency: 'RUB', client_hint: 'acme', reference: 'i' });
  ok('recon: exact match', exact.result === 'exact_match');
  const over = reconcile({ invoice_id: 'i', number: 'n', total: 10000, currency: 'RUB', client_reference: 'a' }, { amount: 12000, currency: 'RUB', client_hint: 'a' });
  ok('recon: overpayment', over.result === 'overpayment');
  const dup = reconcile({ invoice_id: 'i', number: 'n', total: 10000, currency: 'RUB', client_reference: 'a' }, { amount: 10000, currency: 'RUB', reference: 'P1', client_hint: 'a' }, { seenReferences: ['P1'] });
  ok('recon: duplicate detected', dup.result === 'duplicate');
  const rec = buildReceivables([{ invoice_id: 'i1', client_reference: 'A', total: 10000, currency: 'RUB', status: 'ISSUED_EXTERNAL', due_date: '2026-05-01' }], '2026-06-17');
  ok('receivables: overdue 31+', rec.buckets.overdue_31_plus.length === 1);
  ok('receivables: reminder drafts not sent', rec.reminder_drafts.every((d) => d.send_allowed === false));
}
// Expenses
{
  const r = classifySet([{ expense_id: 'e1', category: 'hosting', amount: 500, currency: 'RUB', vendor: 'v', date: '2026-06-01', source: 'CONFIRMED', status: 'CONFIRMED', tax_relevance: 'deductible', recurring: false, scope: 'business', direct: false, evidence: 'r', test_only: true }, { expense_id: 'e2', category: 'hosting', amount: 500, currency: 'RUB', vendor: 'v', date: '2026-06-01', source: 'CONFIRMED', status: 'CONFIRMED', tax_relevance: 'deductible', recurring: false, scope: 'ambiguous', direct: false, evidence: 'r', test_only: true }]);
  ok('expense: duplicate detected', r.duplicates.length === 1);
  ok('expense: ambiguous flagged', r.ambiguous.length === 1);
  const neg = classifySet([{ expense_id: 'e3', category: 'hosting', amount: -10, currency: 'RUB', source: 'CONFIRMED', status: 'CONFIRMED', tax_relevance: 'unknown', recurring: false, scope: 'business', direct: false, evidence: 'r', test_only: true }]);
  ok('expense: negative blocked', !neg.ok);
}
// Profitability / economics
{
  ok('econ: mini_audit modeled', productEconomics('mini_audit').status === 'MODEL_ESTIMATE');
  ok('econ: ai_front_office unknown', productEconomics('ai_front_office').status === 'UNKNOWN');
  const p = projectProfitability(fx.scenarios.profitable_unpaid);
  ok('profit: profitable-but-unpaid flag', p.flags.includes('profitable_on_paper_but_unpaid'));
}
// P&L / cashflow / budget
{
  const pl = buildPnL([{ section: 'revenue', amount: 10000, currency: 'RUB', kind: 'both' }, { section: 'direct_costs', amount: 500, currency: 'RUB', kind: 'both' }], { period: '2026-06' });
  ok('pnl: cash + accrual', pl.ok && pl.accrual_view && pl.cash_view);
  ok('pnl: multi-currency blocked', !buildPnL([{ section: 'revenue', amount: 1, currency: 'RUB', kind: 'both' }, { section: 'revenue', amount: 1, currency: 'USD', kind: 'both' }]).ok);
  const cf = buildCashflow(fx.negative_cashflow.events, fx.negative_cashflow);
  ok('cashflow: negative point detected', cf.risks.cash_gap === true);
  const b = summarizeBudgets([{ budget_id: 'b', status: 'APPROVED', owner_approved: true, planned: 1000, actual: 1500, business_unit_id: 'x' }]);
  ok('budget: overspend detected', b.overspends.length === 1);
}
// Reserves / tax / debt / separation
{
  ok('reserve: shortfall detected', evaluateReserves([fx.tax_reserve_shortfall]).shortfalls.includes('tax'));
  ok('tax: unknown without rate', taxEstimate({ tax_regime: 'USN', taxable_base: 100000 }).status === 'UNKNOWN');
  ok('tax: estimate label', taxEstimate({ tax_regime: 'USN', taxable_base: 100000, rate: 0.06 }).label.includes('VERIFY WITH ACCOUNTANT'));
  const d = evaluateDebt(fx.debt_stress.debts, { monthly_cash_inflow: fx.debt_stress.monthly_cash_inflow });
  ok('debt: high coverage risk', d.coverage_risk === 'HIGH');
  ok('separation: owner_draw as business blocked', !validateTransaction({ id: 't', flow_type: 'owner_draw', scope: 'business', amount: 1 }).ok);
}
// Forecast / break-even / KPI / close
{
  const set = forecastSet({ monthly_deals: 20, avg_deal_value: 10000, monthly_fixed_costs: 30000, monthly_variable_ratio: 0.1, opening_cash: 50000 });
  ok('forecast: 8 scenarios', Object.keys(set).length === 8);
  ok('forecast: no_new_sales zero revenue', set.no_new_sales.monthly_revenue === 0);
  ok('forecast: target not labeled fact', set.target.label.includes('not guarantee'));
  ok('break-even: unknown returns required inputs', breakEven({}).status === 'UNKNOWN');
  ok('break-even: computed', breakEven({ monthly_fixed_costs: 30000, avg_contribution_margin: 9000, avg_deal_value: 10000 }).break_even_deal_count === 4);
  ok('kpi: 16 defined', evaluateKPIs({}).length === 16);
  ok('kpi: warning detection', evaluateKPIs({ gross_margin: { value: 0.4 } }).find((k) => k.key === 'gross_margin').warning === true);
  ok('close: lock blocked before reconciliation', !evaluateClose({ period: 'p', completed: ['record_confirmed_revenue'], lock_requested: true }).errors.length === 0 ? true : evaluateClose({ period: 'p', completed: [], lock_requested: true }).errors.length > 0);
  ok('close: can lock when done', evaluateClose({ period: 'p', completed: ['reconcile_invoices', 'reconcile_payments', 'reconcile_expenses', 'review_receivables', 'update_cashflow'] }).can_lock_period);
}
// Alerts / import
{
  const a = generateAlerts({ cashflow: { risks: { cash_gap: true, negative_cash_point: {} } }, reserves: { shortfalls: ['tax'] } });
  ok('alerts: generated', a.count >= 2);
  ok('alerts: no send', a.alerts.every((x) => x.send_allowed === false));
  const imp = importDryRun('bank_csv', [{ date: '2026-06-01', amount: 100, currency: 'rub', reference: 'r', counterparty: 'c', masked_account: '****1', account: '40817810099910004321' }]);
  ok('import: dry-run', imp.mode === 'DRY_RUN');
  ok('import: account redacted', imp.rows[0].normalized.account === '«REDACTED»');
  ok('import: label unverified', imp.label === 'IMPORTED_UNVERIFIED');
}

console.log(`\n[finance.test] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
