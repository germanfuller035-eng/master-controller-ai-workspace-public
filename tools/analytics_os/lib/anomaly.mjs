// tools/analytics_os/lib/anomaly.mjs
// Read-only anomaly / threshold flagging. Deterministic, dependency-free.
// Flags only — never executes any action, never sends, never mutates.
import { round4 } from './common.mjs';
import { trend } from './trends.mjs';

// Threshold breach detection against a thresholds map { key: {warning_below|warning_above, severity} }.
export function thresholdAnomalies(metrics, thresholds) {
  const out = [];
  for (const m of metrics) {
    const t = thresholds[m.key];
    if (!t || m.value == null) continue;
    if (t.warning_below != null && m.value < t.warning_below) {
      out.push({ metric_key: m.key, kind: 'THRESHOLD_BREACH', severity: t.severity || 'MEDIUM', observed: m.value, expected: `>= ${t.warning_below}`, note: `${m.key} below warning threshold`, status: m.status });
    }
    if (t.warning_above != null && m.value > t.warning_above) {
      out.push({ metric_key: m.key, kind: 'THRESHOLD_BREACH', severity: t.severity || 'MEDIUM', observed: m.value, expected: `<= ${t.warning_above}`, note: `${m.key} above warning threshold`, status: m.status });
    }
  }
  return out;
}

// Trend-reversal + spike/drop detection over series (period-over-period).
export function seriesAnomalies(kpiSeries, labels, spikePct = 0.5) {
  const out = [];
  for (const [key, series] of Object.entries(kpiSeries)) {
    const pts = (series.points || []);
    const nonNull = pts.filter((p) => p != null);
    if (nonNull.length < 2) {
      out.push({ metric_key: key, kind: 'MISSING_DATA', severity: 'INFO', observed: nonNull.length, note: 'fewer than 2 data points', status: 'UNKNOWN' });
      continue;
    }
    // spike / drop on last consecutive pair
    let prev = null;
    for (const v of pts) {
      if (v == null) continue;
      if (prev != null && prev !== 0) {
        const change = (v - prev) / Math.abs(prev);
        if (change >= spikePct) out.push({ metric_key: key, kind: 'SPIKE', severity: 'LOW', observed: round4(change), note: `${key} rose ${(change * 100).toFixed(0)}% period-over-period`, status: series.status });
        else if (change <= -spikePct) out.push({ metric_key: key, kind: 'DROP', severity: 'MEDIUM', observed: round4(change), note: `${key} fell ${(Math.abs(change) * 100).toFixed(0)}% period-over-period`, status: series.status });
      }
      prev = v;
    }
  }
  return out;
}

// Combined anomaly scan: thresholds + series.
export function scan(metrics, kpiSeries, labels, thresholds) {
  const all = [...thresholdAnomalies(metrics, thresholds), ...seriesAnomalies(kpiSeries, labels)];
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
  all.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
  return { total: all.length, by_severity: countBy(all, 'severity'), anomalies: all };
}

function countBy(arr, field) {
  return arr.reduce((acc, x) => { acc[x[field]] = (acc[x[field]] || 0) + 1; return acc; }, {});
}
