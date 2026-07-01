// tools/analytics_os/lib/trends.mjs
// Read-only trend / delta computation over metric series. Deterministic, dependency-free.
import { round2, round4, pct } from './common.mjs';

const FLAT_EPS = 1e-9;

// Classify direction from first→last non-null delta.
function classify(first, last) {
  if (first == null || last == null) return 'INSUFFICIENT_DATA';
  const d = last - first;
  if (Math.abs(d) <= FLAT_EPS) return 'FLAT';
  return d > 0 ? 'UP' : 'DOWN';
}

// Build a Trend from a series of points + labels.
export function trend(key, series, labels) {
  const raw = series.points || [];
  const points = raw.map((value, i) => ({ period_label: labels ? labels[i] : String(i), value }));
  const nonNull = raw.filter((p) => p != null);
  const first = nonNull.length ? nonNull[0] : null;
  const last = nonNull.length ? nonNull[nonNull.length - 1] : null;
  const change_abs = first != null && last != null ? round2(last - first) : null;
  const change_pct = first ? round4((last - first) / Math.abs(first)) : null;
  return {
    key,
    direction: classify(first, last),
    first,
    last,
    change_abs,
    change_pct,
    n_points: nonNull.length,
    source_system: series.source_system,
    status: series.status,
    points,
  };
}

// Period-over-period deltas (consecutive non-null pairs).
export function deltas(series) {
  const pts = series.points || [];
  const out = [];
  let prev = null, prevIdx = -1;
  pts.forEach((v, i) => {
    if (v == null) return;
    if (prev != null) out.push({ from_index: prevIdx, to_index: i, delta: round2(v - prev), delta_pct: prev ? round4((v - prev) / Math.abs(prev)) : null });
    prev = v; prevIdx = i;
  });
  return out;
}

// Trend every series in a kpi set.
export function trendAll(kpiSeries, labels) {
  return Object.entries(kpiSeries).map(([key, series]) => trend(key, series, labels));
}

// Simple moving average smoothing (window w), preserving nulls as gaps.
export function movingAverage(series, w) {
  const pts = series.points || [];
  return pts.map((_, i) => {
    const window = pts.slice(Math.max(0, i - w + 1), i + 1).filter((x) => x != null);
    return window.length ? round2(window.reduce((a, b) => a + b, 0) / window.length) : null;
  });
}
