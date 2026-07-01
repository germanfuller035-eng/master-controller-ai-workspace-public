// tools/finance_os/lib/pnl.mjs
// Phase 13: Managerial P&L. accrual + cash views. Labeled MANAGERIAL_INTERNAL, not official accounting.
import { round2 } from './common.mjs';

// entries: [{section, category, amount, currency, kind:'accrual'|'cash'|'both', status}]
// sections: revenue, direct_costs, operating_expenses, finance_costs, tax_reserve
export function buildPnL(entries, opts = {}) {
  const currencies = new Set(entries.map((e) => e.currency));
  if (currencies.size > 1 && !opts.normalized) {
    return { ok: false, error: 'multi-currency P&L requires normalization', currencies: [...currencies] };
  }
  const sum = (section, view) => entries
    .filter((e) => e.section === section && (e.kind === 'both' || e.kind === view))
    .reduce((s, e) => s + (e.amount || 0), 0);

  const build = (view) => {
    const revenue = sum('revenue', view);
    const direct = sum('direct_costs', view);
    const grossProfit = revenue - direct;
    const opex = sum('operating_expenses', view);
    const operatingResult = grossProfit - opex;
    const finance = sum('finance_costs', view);
    const tax = sum('tax_reserve', view);
    const net = operatingResult - finance - tax;
    return {
      revenue: round2(revenue), direct_costs: round2(direct), gross_profit: round2(grossProfit),
      operating_expenses: round2(opex), operating_result: round2(operatingResult),
      finance_costs: round2(finance), tax_reserve: round2(tax), estimated_net_result: round2(net),
    };
  };

  return {
    ok: true,
    label: 'MANAGERIAL_INTERNAL (not official accounting)',
    period: opts.period || 'unspecified',
    currency: [...currencies][0] || 'RUB',
    accrual_view: build('accrual'),
    cash_view: build('cash'),
    note: 'Forecast/target entries excluded unless explicitly confirmed. Verify with accountant for statutory use.',
  };
}
