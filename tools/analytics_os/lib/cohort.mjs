// tools/analytics_os/lib/cohort.mjs
// Read-only cohort retention computation. Deterministic, dependency-free.
import { round4, pct } from './common.mjs';

// Build a cohort summary from { cohort_key, size, retained_by_period:[...] }.
export function cohort(c) {
  const retained = c.retained_by_period || [];
  const latest = retained.length ? retained[retained.length - 1] : c.size;
  return {
    cohort_key: c.cohort_key,
    size: c.size,
    periods_observed: retained.length,
    retention_curve: retained.map((r, i) => ({ period: i, retained: r, rate: pct(r, c.size) })),
    current_retained: latest,
    current_retention_rate: pct(latest, c.size),
    status: 'MODEL_ESTIMATE',
  };
}

// Summarize a list of cohorts plus a blended retention rate.
export function cohortSummary(cohorts) {
  const built = cohorts.map(cohort);
  const totalSize = built.reduce((a, c) => a + c.size, 0);
  const totalRetained = built.reduce((a, c) => a + (c.current_retained || 0), 0);
  return {
    cohorts: built,
    total_cohorts: built.length,
    total_members: totalSize,
    blended_retention_rate: pct(totalRetained, totalSize),
    status: built.length ? 'MODEL_ESTIMATE' : 'MISSING_DATA',
  };
}
