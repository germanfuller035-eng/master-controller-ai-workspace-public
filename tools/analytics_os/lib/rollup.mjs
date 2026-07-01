// tools/analytics_os/lib/rollup.mjs
// Read-only KPI rollup. Consumes synthetic/canonical metric series and produces derived Metric
// objects referencing the upstream source-of-record. Never redefines a KPI; references definitions.
import { round2, round4, sum, avg } from './common.mjs';

// Build a point-in-time Metric from a kpi series entry (latest non-null point).
export function latestMetric(key, series, labels) {
  const pts = series.points || [];
  let idx = pts.length - 1;
  while (idx >= 0 && pts[idx] == null) idx--;
  const value = idx >= 0 ? pts[idx] : null;
  return {
    key,
    label: key,
    value,
    unit: series.unit,
    period: series.period,
    period_label: idx >= 0 && labels ? labels[idx] : null,
    source_system: series.source_system,
    source_field: series.source_field,
    status: value == null ? 'UNKNOWN' : series.status,
  };
}

// Roll up all kpi series into a flat list of latest Metrics.
export function rollupLatest(kpiSeries, labels) {
  return Object.entries(kpiSeries).map(([key, series]) => latestMetric(key, series, labels));
}

// Aggregate a single series across periods: sum / avg / min / max / count (non-null).
export function aggregateSeries(key, series) {
  const pts = (series.points || []).filter((p) => p != null);
  return {
    key,
    source_system: series.source_system,
    unit: series.unit,
    count: pts.length,
    sum: round2(sum(pts)),
    avg: avg(pts),
    min: pts.length ? Math.min(...pts) : null,
    max: pts.length ? Math.max(...pts) : null,
    status: series.status,
  };
}

// Roll up aggregates for every series.
export function rollupAggregates(kpiSeries) {
  return Object.entries(kpiSeries).map(([key, series]) => aggregateSeries(key, series));
}

// Group latest metrics by source_system for a per-system summary view.
export function groupBySystem(metrics) {
  const groups = {};
  for (const m of metrics) {
    (groups[m.source_system] ||= []).push(m.key);
  }
  return Object.entries(groups).map(([source_system, keys]) => ({ source_system, metric_count: keys.length, keys }));
}
