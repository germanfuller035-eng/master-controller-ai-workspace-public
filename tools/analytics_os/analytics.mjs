#!/usr/bin/env node
// tools/analytics_os/analytics.mjs
// Analytics OS CLI. Offline, deterministic, READ-ONLY.
// Never writes canonical data, sends, enables tracking, creates dashboards/funnels, or mutates production.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ANALYTICS_ROOT, GENERATED_ROOT, FIXTURE_DIR, arg, nowStamp } from './lib/common.mjs';
import { rollupLatest, rollupAggregates, groupBySystem } from './lib/rollup.mjs';
import { trendAll } from './lib/trends.mjs';
import { funnelView } from './lib/funnel.mjs';
import { cohortSummary } from './lib/cohort.mjs';
import { scan } from './lib/anomaly.mjs';
import { buildReport, renderMarkdown } from './lib/reports.mjs';
import { validateAll } from './lib/validators.mjs';

const cmd = process.argv[2];
const TS = nowStamp(arg('--ts'));
const OUT = path.join(GENERATED_ROOT, 'samples');

function out(name, data) {
  mkdirSync(OUT, { recursive: true });
  const f = path.join(OUT, name);
  writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  return f;
}
function fx() { return JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'analytics.json'), 'utf8')); }

function main() {
  const f = fx();
  const labels = f.period_labels;
  switch (cmd) {
    case 'kpis': {
      const m = rollupLatest(f.kpi_series, labels);
      out('kpis.json', m);
      m.forEach((x) => console.log(`  ${x.key}=${x.value ?? '—'} ${x.unit || ''} [${x.source_system}/${x.status}]`));
      return 0;
    }
    case 'aggregates': {
      const a = rollupAggregates(f.kpi_series);
      out('aggregates.json', a);
      console.log(`aggregated ${a.length} series`); return 0;
    }
    case 'trends': {
      const t = trendAll(f.kpi_series, labels);
      out('trends.json', t);
      t.forEach((x) => console.log(`  ${x.key}: ${x.direction} Δ=${x.change_abs ?? '—'} (${x.change_pct == null ? '—' : (x.change_pct * 100).toFixed(1) + '%'})`));
      return 0;
    }
    case 'funnel': {
      const v = funnelView(f.funnel.funnel_ref, f.funnel.stages);
      out('funnel_view.json', v);
      console.log(`funnel_ref=${v.funnel_ref} overall=${v.overall_conversion == null ? '—' : (v.overall_conversion * 100).toFixed(1) + '%'} (references existing funnel)`);
      return 0;
    }
    case 'cohorts': {
      const c = cohortSummary(f.cohorts);
      out('cohorts.json', c);
      console.log(`cohorts=${c.total_cohorts} blended_retention=${c.blended_retention_rate == null ? '—' : (c.blended_retention_rate * 100).toFixed(1) + '%'}`);
      return 0;
    }
    case 'anomalies': {
      const s = scan(rollupLatest(f.kpi_series, labels), f.kpi_series, labels, f.thresholds || {});
      out('anomalies.json', s);
      console.log(`anomalies total=${s.total} by_severity=${JSON.stringify(s.by_severity)}`);
      return 0;
    }
    case 'report': {
      const period = arg('--period', 'monthly');
      const r = buildReport(f, { period, ts: TS });
      const jf = out(`report_${period}.json`, r);
      const mf = out(`report_${period}.md`, renderMarkdown(r));
      console.log(`report generated: ${path.basename(jf)} + ${path.basename(mf)} (anomalies=${r.anomalies.total})`);
      return 0;
    }
    case 'validate': {
      const r = buildReport(f, { period: 'monthly', ts: TS });
      const v = validateAll(r);
      out('validation.json', v);
      console.log(`validate: ${v.ok ? 'OK' : 'FAIL'} errors=${v.error_count}`);
      return v.ok ? 0 : 1;
    }
    case 'all': {
      const period = arg('--period', 'monthly');
      const r = buildReport(f, { period, ts: TS });
      out('kpis.json', r.metrics); out('aggregates.json', r.aggregates); out('trends.json', r.trends);
      out('funnel_view.json', r.funnel_view); out('cohorts.json', r.cohorts); out('anomalies.json', r.anomalies);
      out(`report_${period}.json`, r); out(`report_${period}.md`, renderMarkdown(r));
      out('validation.json', validateAll(r));
      console.log(`all artifacts generated for period=${period} (read-only, no canonical writes)`);
      return 0;
    }
    default:
      console.log('Analytics OS CLI (read-only). Commands: kpis | aggregates | trends | funnel | cohorts | anomalies | report [--period P] | validate | all [--period P] [--ts STAMP]');
      return cmd ? 2 : 0;
  }
}

process.exit(main());
