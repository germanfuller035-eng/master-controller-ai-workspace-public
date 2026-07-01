// tools/analytics_os/schemas/domain.mjs
// Analytics OS domain model + lightweight validators. Dependency-free, deterministic.
// All shapes describe DERIVED read-only artifacts; none represent canonical writes.
import { DATA_STATUS, TREND_DIRECTION, PERIOD, SEVERITY, ANOMALY_KIND } from '../lib/common.mjs';

// A Metric is a derived numeric observation referencing an upstream source-of-record.
// { key, label, value, unit, period, source_system, source_field, status, threshold? }
export function isMetric(m) {
  return !!m && typeof m.key === 'string' && typeof m.source_system === 'string'
    && DATA_STATUS.includes(m.status) && (m.period === undefined || PERIOD.includes(m.period));
}

// A TimePoint is one period observation for a series: { period_label, value, status }
export function isTimePoint(p) {
  return !!p && typeof p.period_label === 'string' && (typeof p.value === 'number' || p.value === null);
}

// A Trend summarizes a series: { key, direction, change_abs, change_pct, points, status }
export function isTrend(t) {
  return !!t && typeof t.key === 'string' && TREND_DIRECTION.includes(t.direction);
}

// A FunnelView is a derived conversion view referencing an existing funnel definition.
// It NEVER defines a new funnel — funnel_ref points to the canonical Revenue OS funnel.
// { funnel_ref, stages:[{name,count,conv_from_top,conv_from_prev}], overall_conversion, status }
export function isFunnelView(f) {
  return !!f && typeof f.funnel_ref === 'string' && Array.isArray(f.stages);
}

// A Cohort summarizes retention/activity for a grouping: { cohort_key, size, retained, retention_rate, periods }
export function isCohort(c) {
  return !!c && typeof c.cohort_key === 'string' && typeof c.size === 'number';
}

// An Anomaly is a flagged deviation: { metric_key, kind, severity, observed, expected?, note, status }
export function isAnomaly(a) {
  return !!a && typeof a.metric_key === 'string' && ANOMALY_KIND.includes(a.kind) && SEVERITY.includes(a.severity);
}

// A Report bundles derived views for a period: { report_id, period, generated_ts, metrics, anomalies:{anomalies:[...]} }
export function isReport(r) {
  return !!r && typeof r.report_id === 'string' && Array.isArray(r.metrics)
    && !!r.anomalies && Array.isArray(r.anomalies.anomalies);
}

// Aggregate validator returning structured errors (used by validators.mjs + tests).
export function validateMetricSet(metrics) {
  const errors = [];
  if (!Array.isArray(metrics)) return ['metrics is not an array'];
  metrics.forEach((m, i) => { if (!isMetric(m)) errors.push(`metric[${i}] invalid (key=${m && m.key})`); });
  return errors;
}

export const DOMAIN = {
  artifacts: ['Metric', 'TimePoint', 'Trend', 'FunnelView', 'Cohort', 'Anomaly', 'Report'],
  note: 'All artifacts are derived/read-only. funnel_ref references existing Revenue OS funnels; no funnel is created here.',
};
