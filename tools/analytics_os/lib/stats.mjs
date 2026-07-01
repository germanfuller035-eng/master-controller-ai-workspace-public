// tools/analytics_os/lib/stats.mjs
// Offline statistical guardrail helpers (Phase 16). Dependency-free, deterministic.
// Never treats weak evidence as conclusive; never asserts causation automatically.
import { round4, round2 } from './common.mjs';

const MIN_SAMPLE = 30;       // below this: small-sample warning
const REC_SAMPLE = 100;      // recommended minimum per arm

export function sampleSizeWarning(n) {
  if (n < MIN_SAMPLE) return { level: 'CRITICAL', message: `n=${n} far below minimum (${MIN_SAMPLE}); not interpretable` };
  if (n < REC_SAMPLE) return { level: 'WARNING', message: `n=${n} below recommended (${REC_SAMPLE}); treat as directional only` };
  return { level: 'OK', message: `n=${n} adequate` };
}

function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
function variance(a) { const m = mean(a); return a.length > 1 ? a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1) : 0; }

// 95% CI for a proportion (Wald, with small-sample caveat).
export function proportionCI(successes, n) {
  if (n === 0) return { p: null, ci: [null, null], caveat: 'no data' };
  const p = successes / n;
  const se = Math.sqrt((p * (1 - p)) / n);
  const margin = 1.96 * se;
  return { p: round4(p), ci: [round4(Math.max(0, p - margin)), round4(Math.min(1, p + margin))], caveat: n < REC_SAMPLE ? 'small sample — wide interval' : null };
}

// Compare two proportions; flags inconclusive when CIs overlap or sample small.
export function compareProportions(s1, n1, s2, n2) {
  const a = proportionCI(s1, n1), b = proportionCI(s2, n2);
  const overlap = a.ci[1] >= b.ci[0] && b.ci[1] >= a.ci[0];
  const small = n1 < REC_SAMPLE || n2 < REC_SAMPLE;
  return {
    a, b,
    diff: a.p != null && b.p != null ? round4(b.p - a.p) : null,
    inconclusive: overlap || small,
    verdict: (overlap || small) ? 'INCONCLUSIVE' : 'DIFFERENCE_OBSERVED',
    causation_disclaimer: 'observed difference is not proof of causation',
  };
}

// 95% CI for a mean.
export function meanCI(arr) {
  if (arr.length < 2) return { mean: arr.length ? round2(arr[0]) : null, ci: [null, null], caveat: 'insufficient data' };
  const m = mean(arr), se = Math.sqrt(variance(arr) / arr.length), margin = 1.96 * se;
  return { mean: round2(m), ci: [round2(m - margin), round2(m + margin)], caveat: arr.length < MIN_SAMPLE ? 'small sample' : null };
}

// Outlier warning via IQR.
export function outlierWarning(arr) {
  if (arr.length < 4) return { outliers: [], caveat: 'too few points' };
  const sorted = [...arr].sort((a, b) => a - b);
  const q = (p) => sorted[Math.floor(p * (sorted.length - 1))];
  const q1 = q(0.25), q3 = q(0.75), iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
  return { outliers: arr.filter((x) => x < lo || x > hi), bounds: [round2(lo), round2(hi)] };
}

// Multiple-comparison warning.
export function multipleComparisonWarning(numComparisons) {
  if (numComparisons > 1) return { level: 'WARNING', message: `${numComparisons} comparisons inflate false-positive risk; apply correction or treat as exploratory` };
  return { level: 'OK' };
}

// Practical significance: difference must exceed a minimum meaningful effect.
export function practicalSignificance(diff, minEffect) {
  return { practically_significant: Math.abs(diff) >= minEffect, diff: round4(diff), min_effect: minEffect };
}
