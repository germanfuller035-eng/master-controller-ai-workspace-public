// tools/analytics_os/lib/forecast.mjs
// Forecast validation (Phase 17). Read-only, deterministic.
// Detects target-as-forecast, optimistic bias, impossible capacity, missing actuals, forecast-as-confirmed.
import { round4, round2 } from './common.mjs';

// Mean Absolute Error.
export function mae(forecast, actual) {
  const pairs = forecast.map((f, i) => [f, actual[i]]).filter(([, a]) => a != null);
  if (!pairs.length) return null;
  return round2(pairs.reduce((s, [f, a]) => s + Math.abs(f - a), 0) / pairs.length);
}

// Mean Absolute Percentage Error (skips zero actuals — undefined there).
export function mape(forecast, actual) {
  const pairs = forecast.map((f, i) => [f, actual[i]]).filter(([, a]) => a != null && a !== 0);
  if (!pairs.length) return { value: null, caveat: 'no valid (non-zero actual) pairs' };
  const v = pairs.reduce((s, [f, a]) => s + Math.abs((a - f) / a), 0) / pairs.length;
  return { value: round4(v), n: pairs.length };
}

// Bias: signed mean error (positive => forecast over actual => optimistic).
export function bias(forecast, actual) {
  const pairs = forecast.map((f, i) => [f, actual[i]]).filter(([, a]) => a != null);
  if (!pairs.length) return null;
  return round2(pairs.reduce((s, [f, a]) => s + (f - a), 0) / pairs.length);
}

// Interval coverage: share of actuals inside their forecast interval.
export function intervalCoverage(intervals, actual) {
  const pairs = intervals.map((iv, i) => [iv, actual[i]]).filter(([, a]) => a != null);
  if (!pairs.length) return null;
  const inside = pairs.filter(([[lo, hi], a]) => a >= lo && a <= hi).length;
  return round4(inside / pairs.length);
}

// Full validation + issue detection.
export function validateForecast({ forecast = [], actual = [], target = null, marked_confirmed = false, capacity_limit = null }) {
  const issues = [];
  const b = bias(forecast, actual);
  if (target != null && JSON.stringify(forecast) === JSON.stringify(Array.isArray(target) ? target : [target])) issues.push({ kind: 'TARGET_COPIED_AS_FORECAST', severity: 'HIGH' });
  if (b != null && b > 0) issues.push({ kind: 'OPTIMISTIC_BIAS', severity: 'MEDIUM', detail: `bias=+${b}` });
  if (capacity_limit != null && forecast.some((f) => f > capacity_limit)) issues.push({ kind: 'IMPOSSIBLE_CAPACITY', severity: 'HIGH', detail: `forecast exceeds capacity ${capacity_limit}` });
  if (actual.some((a) => a == null)) issues.push({ kind: 'ACTUAL_MISSING', severity: 'MEDIUM' });
  if (marked_confirmed === true) issues.push({ kind: 'FORECAST_MARKED_CONFIRMED', severity: 'HIGH' });
  return {
    mae: mae(forecast, actual),
    mape: mape(forecast, actual),
    bias: b,
    issues,
    issue_count: issues.length,
  };
}
