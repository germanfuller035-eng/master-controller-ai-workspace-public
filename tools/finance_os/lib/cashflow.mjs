// tools/finance_os/lib/cashflow.mjs
// Phase 14: Cashflow Engine. actual/expected/forecast views, horizons, gap detection. Assumptions visible.
import { round2 } from './common.mjs';

// events: [{type, date, amount, currency, status:'actual'|'expected'|'forecast', source_entity}]
// opening: number, now: 'YYYY-MM-DD', horizonDays
export function buildCashflow(events, opts = {}) {
  const opening = opts.opening_cash ?? 0;
  const now = opts.now || null;
  const horizon = opts.horizon_days || 30;
  const cutoff = now ? Date.parse(now) + horizon * 86400000 : null;

  const inHorizon = events.filter((e) => {
    if (!e.date || !now) return true;
    const t = Date.parse(e.date);
    return t >= Date.parse(now) && (cutoff == null || t <= cutoff);
  });

  const INFLOW = ['operating_inflow', 'owner_contribution', 'financing'];
  const OUTFLOW = ['operating_outflow', 'owner_draw', 'debt_service', 'investing'];

  const byView = (view) => {
    const ev = inHorizon.filter((e) => e.status === view || view === 'all');
    const inflow = ev.filter((e) => INFLOW.includes(e.type)).reduce((s, e) => s + (e.amount || 0), 0);
    const outflow = ev.filter((e) => OUTFLOW.includes(e.type)).reduce((s, e) => s + (e.amount || 0), 0);
    return { inflow: round2(inflow), outflow: round2(outflow), net: round2(inflow - outflow), closing: round2(opening + inflow - outflow) };
  };

  // Day-by-day running balance for negative-point detection (expected+actual).
  const dated = inHorizon.filter((e) => e.date && (e.status === 'actual' || e.status === 'expected'))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  let bal = opening; let negativePoint = null; let minBal = opening;
  for (const e of dated) {
    const delta = INFLOW.includes(e.type) ? (e.amount || 0) : -(e.amount || 0);
    bal = round2(bal + delta);
    if (bal < minBal) minBal = bal;
    if (bal < 0 && !negativePoint) negativePoint = { date: e.date, balance: bal };
  }

  // Payment concentration: single inflow > 40% of total inflow.
  const totalInflow = inHorizon.filter((e) => INFLOW.includes(e.type)).reduce((s, e) => s + (e.amount || 0), 0);
  const concentration = inHorizon.filter((e) => INFLOW.includes(e.type) && totalInflow && (e.amount / totalInflow) > 0.4)
    .map((e) => ({ source: e.source_entity, pct: Math.round((e.amount / totalInflow) * 100) }));

  return {
    label: 'MANAGERIAL_INTERNAL',
    horizon_days: horizon,
    opening_cash: round2(opening),
    actual: byView('actual'),
    expected: byView('expected'),
    forecast: byView('forecast'),
    risks: {
      negative_cash_point: negativePoint,
      min_balance: round2(minBal),
      cash_gap: negativePoint ? true : false,
      payment_concentration: concentration,
    },
    assumptions: { opening_cash: opening, horizon_days: horizon, now },
    note: 'Forecast is not guarantee. expected = scheduled but unconfirmed; actual = confirmed only.',
  };
}
