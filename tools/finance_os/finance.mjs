#!/usr/bin/env node
// tools/finance_os/finance.mjs
// Phase 35: Finance OS CLI. Offline, deterministic, no bank, no send, no real invoice, no prod mutation.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { FINANCE_ROOT, GENERATED_ROOT, FIXTURE_DIR, arg, nowStamp } from './lib/common.mjs';
import { buildInvoice } from './lib/invoice.mjs';
import { buildReceivables } from './lib/receivables.mjs';
import { reconcile, reconcileSplit } from './lib/reconcile.mjs';
import { classifySet } from './lib/expense.mjs';
import { productEconomics, projectProfitability } from './lib/economics.mjs';
import { buildPnL } from './lib/pnl.mjs';
import { buildCashflow } from './lib/cashflow.mjs';
import { summarizeBudgets } from './lib/budget.mjs';
import { evaluateReserves, taxEstimate } from './lib/reserves.mjs';
import { evaluateDebt } from './lib/debt.mjs';
import { forecast, forecastSet, breakEven } from './lib/forecast.mjs';
import { unitSummary } from './lib/assets.mjs';
import { buildDashboard, ownerCommandCenter, generateAlerts } from './lib/dashboard.mjs';
import { evaluateClose } from './lib/close.mjs';
import { validateAll } from './lib/validators.mjs';

const cmd = process.argv[2];
const TS = nowStamp(arg('--ts'));
const OUT = path.join(GENERATED_ROOT, 'samples');
function out(name, data) { mkdirSync(OUT, { recursive: true }); const f = path.join(OUT, name); writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data, null, 2)); return f; }
function fx() { return JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'finance.json'), 'utf8')); }
function invFixture(id) { return fx().invoices.find((i) => i.fixture_id === id); }

function main() {
  switch (cmd) {
    case 'units': { unitSummary().forEach((u) => console.log(`${u.business_unit_id.padEnd(20)} ${u.status.padEnd(10)} target=${u.monthly_target} confirmed=${u.confirmed_revenue}`)); return 0; }
    case 'invoices': { fx().invoices.forEach((i) => console.log(`${i.fixture_id.padEnd(30)} expect_ok=${i.expect_ok}`)); return 0; }
    case 'create-invoice': {
      const f = invFixture(arg('--fixture')); if (!f) { console.error('fixture not found'); return 2; }
      const r = buildInvoice({ ...f.input, test_only: true }, f.existing_numbers || []);
      if (r.ok) out(`invoice_${f.fixture_id}.json`, r.invoice);
      console.log(`create-invoice ${f.fixture_id}: ok=${r.ok} ${r.ok ? 'total=' + r.invoice.total + ' send_allowed=' + r.send_allowed : 'errors=' + r.errors.join(';')}`);
      return r.ok ? 0 : 1;
    }
    case 'validate-invoice': {
      const data = JSON.parse(readFileSync(process.argv[3], 'utf8'));
      const r = buildInvoice({ ...data, test_only: true });
      console.log(`validate-invoice: ok=${r.ok} ${r.errors ? r.errors.join(';') : ''}`);
      return r.ok ? 0 : 1;
    }
    case 'payments': { const p = fx().payments; console.log(`payment fixtures: ${Object.keys(p).join(', ')}`); return 0; }
    case 'reconcile': {
      const id = arg('--fixture') || 'unmatched'; const p = fx().payments[id];
      if (!p) { console.error('fixture not found'); return 2; }
      const r = p.rows ? reconcileSplit(p.invoice, p.rows) : reconcile(p.invoice, p.row, { seenReferences: [] });
      out(`reconcile_${id}.json`, r);
      console.log(`reconcile ${id}: result=${r.result} auto_confirm=${r.auto_confirm}`);
      return 0;
    }
    case 'receivables': {
      const invoices = [{ invoice_id: 'i1', client_reference: 'A', total: 10000, currency: 'RUB', status: 'ISSUED_EXTERNAL', due_date: '2026-06-01' }];
      const r = buildReceivables(invoices, '2026-06-17'); out('receivables.json', r);
      console.log(`receivables: total=${r.metrics.total_receivable} overdue=${r.metrics.overdue}`); return 0;
    }
    case 'expenses': {
      const r = classifySet(fx().expenses_ambiguous); console.log(`expenses: ok=${r.ok} ambiguous=${r.ambiguous.length} duplicates=${r.duplicates.length}`); return 0;
    }
    case 'profitability': {
      const kind = process.argv[3]; const id = process.argv[4];
      if (kind === 'product') { const e = productEconomics(id); out(`product_econ_${id}.json`, e); console.log(`product ${id}: status=${e.status} ${e.net_estimate != null ? 'net=' + e.net_estimate : 'missing=' + (e.missing || []).join(',')}`); return 0; }
      if (kind === 'project') { const s = fx().scenarios[id] || fx().scenarios.profitable_unpaid; const p = projectProfitability(s); out(`project_profit_${id}.json`, p); console.log(`project ${id}: margin=${p.margin_pct} flags=${p.flags.join(',')}`); return 0; }
      console.error('usage: profitability product|project <id>'); return 3;
    }
    case 'pnl': {
      const entries = [{ section: 'revenue', amount: 10000, currency: 'RUB', kind: 'both', status: 'CONFIRMED' }, { section: 'direct_costs', amount: 500, currency: 'RUB', kind: 'both' }, { section: 'operating_expenses', amount: 1000, currency: 'RUB', kind: 'both' }];
      const r = buildPnL(entries, { period: arg('--period') || '2026-06' }); out('pnl.json', r);
      console.log(`pnl ${r.period}: net(accrual)=${r.accrual_view.estimated_net_result} label=${r.label.slice(0, 20)}`); return 0;
    }
    case 'cashflow': {
      const sc = fx().negative_cashflow; const r = buildCashflow(sc.events, sc); out(`cashflow_${arg('--scenario') || 'base'}.json`, r);
      console.log(`cashflow: cash_gap=${r.risks.cash_gap} min_balance=${r.risks.min_balance}`); return 0;
    }
    case 'budget': {
      const r = summarizeBudgets([{ budget_id: 'b1', status: 'APPROVED', owner_approved: true, planned: 30000, actual: 35000, business_unit_id: 'mini_audit_digital' }]);
      console.log(`budget: overspends=${r.overspends.join(',') || 'none'}`); return 0;
    }
    case 'reserves': {
      const r = evaluateReserves([fx().tax_reserve_shortfall]); console.log(`reserves: shortfalls=${r.shortfalls.join(',') || 'none'}`); return 0;
    }
    case 'debt': {
      const sc = fx().debt_stress; const r = evaluateDebt(sc.debts, { monthly_cash_inflow: sc.monthly_cash_inflow }); out('debt.json', r);
      console.log(`debt: monthly=${r.monthly_debt_service} coverage=${r.cashflow_coverage} risk=${r.coverage_risk}`); return 0;
    }
    case 'forecast': {
      const base = { monthly_deals: 20, avg_deal_value: 10000, monthly_fixed_costs: 30000, monthly_variable_ratio: 0.1, opening_cash: 50000, debt_service: 10000, reserves_target: 90000, capacity_limit_deals: 15, owner_hours_per_deal: 2 };
      const s = arg('--scenario'); const r = s ? forecast(s, base) : forecastSet(base); out(`forecast_${s || 'all'}.json`, r);
      console.log(`forecast ${s || 'all'}: ${s ? 'rev=' + r.monthly_revenue + ' cash=' + r.cash_balance : 'scenarios=' + Object.keys(r).length}`); return 0;
    }
    case 'break-even': {
      const r = breakEven({ monthly_fixed_costs: 30000, avg_contribution_margin: 9000, avg_deal_value: 10000, owner_hours_per_deal: 2 });
      console.log(`break-even: revenue=${r.break_even_revenue} deals=${r.break_even_deal_count}`); return 0;
    }
    case 'close': {
      const r = evaluateClose({ period: arg('--period') || '2026-06', completed: ['record_confirmed_revenue', 'reconcile_invoices', 'reconcile_payments', 'reconcile_expenses', 'review_receivables', 'update_cashflow'] });
      out('close.json', r); console.log(`close ${r.period}: can_lock=${r.can_lock_period} remaining=${r.remaining.length}`); return 0;
    }
    case 'dashboard-refresh': {
      const d = buildDashboard({ period: '2026-06', receivables: { metrics: { total_receivable: 10000, overdue: 0 } } }); out('finance_dashboard.json', d);
      console.log(`dashboard refreshed -> ${OUT}/finance_dashboard.json`); return 0;
    }
    case 'validate-all': {
      const r = validateAll(); console.log(`validate-all ok=${r.ok}`);
      for (const [k, v] of Object.entries(r.results)) console.log(`  ${k}: ok=${v.ok} ${v.errors ? 'errors=' + v.errors.length : ''}`);
      return r.ok ? 0 : 1;
    }
    default:
      console.log('finance commands: units | invoices | create-invoice --fixture <id> | validate-invoice <file> |');
      console.log('  payments | reconcile --fixture <id> | receivables | expenses | profitability product|project <id> |');
      console.log('  pnl --period P | cashflow --scenario S | budget | reserves | debt | forecast --scenario S |');
      console.log('  break-even | close --period P | dashboard-refresh | validate-all');
      return cmd ? 3 : 0;
  }
}
process.exit(main());
