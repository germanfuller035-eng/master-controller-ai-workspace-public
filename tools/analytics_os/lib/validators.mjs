// tools/analytics_os/lib/validators.mjs
// Read-only invariant + shape validators for Analytics OS artifacts.
import { validateMetricSet, isFunnelView, isAnomaly, isReport } from '../schemas/domain.mjs';
import { CANONICAL_WRITE_ALLOWED, SEND_ALLOWED, TRACKING_ALLOWED, NEW_DASHBOARD_ALLOWED, PRODUCTION_FREEZE } from './common.mjs';

// Verify the global safety invariants are all in their locked (read-only) state.
export function validateInvariants() {
  const errors = [];
  if (CANONICAL_WRITE_ALLOWED) errors.push('CANONICAL_WRITE_ALLOWED must be false');
  if (SEND_ALLOWED) errors.push('SEND_ALLOWED must be false');
  if (TRACKING_ALLOWED) errors.push('TRACKING_ALLOWED must be false');
  if (NEW_DASHBOARD_ALLOWED) errors.push('NEW_DASHBOARD_ALLOWED must be false');
  if (!PRODUCTION_FREEZE) errors.push('PRODUCTION_FREEZE must be true');
  return errors;
}

// Validate a full report object.
export function validateReport(r) {
  const errors = [];
  if (!isReport(r)) errors.push('report fails shape check');
  errors.push(...validateMetricSet(r.metrics || []));
  if (r.funnel_view && !isFunnelView(r.funnel_view)) errors.push('funnel_view invalid');
  (r.anomalies?.anomalies || []).forEach((a, i) => { if (!isAnomaly(a)) errors.push(`anomaly[${i}] invalid`); });
  return errors;
}

// Run all validations and return a structured result.
export function validateAll(report) {
  const inv = validateInvariants();
  const rep = report ? validateReport(report) : [];
  const errors = [...inv.map((e) => `invariant: ${e}`), ...rep.map((e) => `report: ${e}`)];
  return { ok: errors.length === 0, error_count: errors.length, errors };
}
