// tools/analytics_os/lib/reports.mjs
// Read-only scheduled report builder. Assembles derived views into a report object + markdown.
// Generates files only into _generated/analytics_os/samples. Creates NO dashboards.
import { rollupLatest, rollupAggregates, groupBySystem } from './rollup.mjs';
import { trendAll } from './trends.mjs';
import { funnelView } from './funnel.mjs';
import { cohortSummary } from './cohort.mjs';
import { scan } from './anomaly.mjs';

// Build the full derived report object for a period.
export function buildReport(fx, { period = 'monthly', ts = 'UNSTAMPED' } = {}) {
  const labels = fx.period_labels;
  const metrics = rollupLatest(fx.kpi_series, labels);
  const aggregates = rollupAggregates(fx.kpi_series);
  const trends = trendAll(fx.kpi_series, labels);
  const fv = funnelView(fx.funnel.funnel_ref, fx.funnel.stages);
  const cohorts = cohortSummary(fx.cohorts);
  const anomalies = scan(metrics, fx.kpi_series, labels, fx.thresholds || {});
  return {
    report_id: `analytics_${period}_${ts}`,
    period,
    generated_ts: ts,
    source_note: 'Derived read-only from canonical OS sources; no dashboards/funnels created; no canonical writes.',
    by_system: groupBySystem(metrics),
    metrics,
    aggregates,
    trends,
    funnel_view: fv,
    cohorts,
    anomalies,
  };
}

const ARROW = { UP: '▲', DOWN: '▼', FLAT: '▬', INSUFFICIENT_DATA: '·' };

// Render the report object to markdown (no external deps).
export function renderMarkdown(r) {
  const lines = [];
  lines.push(`# Analytics OS — ${r.period} report`);
  lines.push('');
  lines.push(`generated_ts: ${r.generated_ts}`);
  lines.push(`report_id: ${r.report_id}`);
  lines.push('');
  lines.push(`> ${r.source_note}`);
  lines.push('');
  lines.push('## KPI snapshot (latest)');
  lines.push('| KPI | Value | Unit | Source | Status |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const m of r.metrics) lines.push(`| ${m.key} | ${fmt(m.value)} | ${m.unit || ''} | ${m.source_system} | ${m.status} |`);
  lines.push('');
  lines.push('## Trends (first → last)');
  lines.push('| KPI | Dir | Δ abs | Δ % | Points |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const t of r.trends) lines.push(`| ${t.key} | ${ARROW[t.direction] || ''} ${t.direction} | ${fmt(t.change_abs)} | ${pctStr(t.change_pct)} | ${t.n_points} |`);
  lines.push('');
  lines.push('## Funnel conversion view');
  lines.push(`funnel_ref: \`${r.funnel_view.funnel_ref}\` (references existing Revenue OS funnel — not redefined)`);
  lines.push(`overall conversion: ${pctStr(r.funnel_view.overall_conversion)}`);
  if (r.funnel_view.biggest_drop_stage) lines.push(`biggest drop: ${r.funnel_view.biggest_drop_stage.stage} (${pctStr(r.funnel_view.biggest_drop_stage.drop)})`);
  lines.push('');
  lines.push('| Stage | Count | From top | From prev |');
  lines.push('| --- | --- | --- | --- |');
  for (const s of r.funnel_view.stages) lines.push(`| ${s.stage} | ${s.count} | ${pctStr(s.conv_from_top)} | ${pctStr(s.conv_from_prev)} |`);
  lines.push('');
  lines.push('## Cohort retention');
  lines.push(`blended retention: ${pctStr(r.cohorts.blended_retention_rate)} across ${r.cohorts.total_cohorts} cohorts`);
  lines.push('');
  lines.push('## Anomalies');
  lines.push(`total: ${r.anomalies.total} — by severity: ${JSON.stringify(r.anomalies.by_severity)}`);
  if (r.anomalies.total) {
    lines.push('');
    lines.push('| Metric | Kind | Severity | Observed | Note |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const a of r.anomalies.anomalies) lines.push(`| ${a.metric_key} | ${a.kind} | ${a.severity} | ${fmt(a.observed)} | ${a.note} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function fmt(v) { return v == null ? '—' : (typeof v === 'number' ? String(v) : v); }
function pctStr(v) { return v == null ? '—' : `${(v * 100).toFixed(1)}%`; }
