#!/usr/bin/env node
// tools/analytics_os/tests/analytics.test.mjs — functional tests for Analytics OS derivation libs.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rollupLatest, rollupAggregates, groupBySystem } from '../lib/rollup.mjs';
import { trend, trendAll, deltas, movingAverage } from '../lib/trends.mjs';
import { funnelView } from '../lib/funnel.mjs';
import { cohortSummary } from '../lib/cohort.mjs';
import { scan, thresholdAnomalies, seriesAnomalies } from '../lib/anomaly.mjs';
import { buildReport, renderMarkdown } from '../lib/reports.mjs';
import { validateAll } from '../lib/validators.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(readFileSync(path.resolve(__dirname, '../fixtures/analytics.json'), 'utf8'));
const labels = fx.period_labels;

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };
const eq = (n, a, b) => ok(n, a === b, `expected ${b} got ${a}`);

// rollup
const metrics = rollupLatest(fx.kpi_series, labels);
eq('rollupLatest count', metrics.length, Object.keys(fx.kpi_series).length);
const booked = metrics.find((m) => m.key === 'booked_revenue');
eq('latest booked_revenue value', booked.value, 25000);
eq('latest booked_revenue label', booked.period_label, '2026-06');
ok('every metric has source_system', metrics.every((m) => !!m.source_system));
ok('every metric has valid status', metrics.every((m) => typeof m.status === 'string'));

const aggs = rollupAggregates(fx.kpi_series);
const bookedAgg = aggs.find((a) => a.key === 'booked_revenue');
eq('booked sum', bookedAgg.sum, 45000);
eq('booked max', bookedAgg.max, 25000);
eq('booked count non-null', bookedAgg.count, 5);

const groups = groupBySystem(metrics);
ok('groupBySystem includes Finance_OS', groups.some((g) => g.source_system === 'Finance_OS'));

// trends
const t = trend('cash_runway', fx.kpi_series.cash_runway, labels);
eq('cash_runway direction', t.direction, 'DOWN');
eq('cash_runway change_abs', t.change_abs, -2.5);
eq('cash_runway change_pct', t.change_pct, -0.5);
const ar = trend('acceptance_rate', fx.kpi_series.acceptance_rate, labels);
eq('acceptance_rate first non-null', ar.first, 1.0);
eq('acceptance_rate n_points', ar.n_points, 3);
const flat = trend('flatk', { points: [5, 5, 5], source_system: 'X', status: 'CONFIRMED' }, ['a', 'b', 'c']);
eq('flat direction', flat.direction, 'FLAT');
const none = trend('emptyk', { points: [null, null], source_system: 'X', status: 'UNKNOWN' }, ['a', 'b']);
eq('insufficient direction', none.direction, 'INSUFFICIENT_DATA');
eq('trendAll count', trendAll(fx.kpi_series, labels).length, 6);
eq('deltas booked count', deltas(fx.kpi_series.booked_revenue).length, 4);
eq('movingAverage length', movingAverage(fx.kpi_series.booked_revenue, 2).length, 5);

// funnel
const fv = funnelView(fx.funnel.funnel_ref, fx.funnel.stages);
eq('funnel ref preserved', fv.funnel_ref, 'revenue_os/funnel_base');
eq('funnel stages count', fv.stages.length, 6);
eq('funnel overall conversion', fv.overall_conversion, 0.005);
eq('funnel top conv_from_prev=1', fv.stages[0].conv_from_prev, 1);
ok('funnel biggest_drop present', !!fv.biggest_drop_stage);
const fvEmpty = funnelView('x', []);
eq('empty funnel status', fvEmpty.status, 'MISSING_DATA');

// cohort
const cs = cohortSummary(fx.cohorts);
eq('cohort total', cs.total_cohorts, 3);
eq('cohort total members', cs.total_members, 9);
ok('blended retention in (0,1]', cs.blended_retention_rate > 0 && cs.blended_retention_rate <= 1);

// anomaly
const thr = thresholdAnomalies(metrics, fx.thresholds);
ok('cash_runway threshold breach flagged', thr.some((a) => a.metric_key === 'cash_runway' && a.kind === 'THRESHOLD_BREACH'));
const sa = seriesAnomalies(fx.kpi_series, labels);
ok('series anomalies produced', sa.length > 0);
const s = scan(metrics, fx.kpi_series, labels, fx.thresholds);
ok('scan total matches list', s.total === s.anomalies.length);
ok('scan sorted by severity', s.anomalies.every((a, i, arr) => i === 0 || sevRank(arr[i - 1].severity) <= sevRank(a.severity)));
function sevRank(x) { return { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 }[x] ?? 9; }

// report + validation
const r = buildReport(fx, { period: 'monthly', ts: 'TESTSTAMP' });
eq('report_id stamped', r.report_id, 'analytics_monthly_TESTSTAMP');
ok('report metrics present', r.metrics.length === 6);
ok('report markdown renders', renderMarkdown(r).includes('# Analytics OS'));
ok('markdown references existing funnel', renderMarkdown(r).includes('not redefined'));
const v = validateAll(r);
ok('validateAll OK', v.ok, JSON.stringify(v.errors));

// determinism
const r2 = buildReport(fx, { period: 'monthly', ts: 'TESTSTAMP' });
eq('deterministic report', JSON.stringify(r), JSON.stringify(r2));

console.log(`\nanalytics.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
