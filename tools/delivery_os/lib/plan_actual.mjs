// tools/delivery_os/lib/plan_actual.mjs
// Phase 20: Plan vs Actual model. TEST_ONLY fixtures. Variance reasons enumerated.

export const VARIANCE_REASONS = [
  'client_delay', 'scope_change', 'underestimation', 'technical_issue', 'rework',
  'unclear_acceptance', 'unavailable_input', 'owner_delay', 'third_party_failure',
];

// input: { planned:{duration_days, owner_hours, ai_effort, revisions, cost, margin, deliverables},
//          actual:{...}, variance_notes:[{metric, reason}] }
export function comparePlanActual(input) {
  const p = input.planned || {};
  const a = input.actual || {};
  const metrics = ['duration_days', 'owner_hours', 'ai_effort', 'revisions', 'cost', 'margin', 'deliverables', 'accepted_deliverables'];
  const variances = {};
  for (const m of metrics) {
    const pv = p[m]; const av = a[m];
    if (pv == null || av == null) { variances[m] = { planned: pv ?? 'UNKNOWN', actual: av ?? 'UNKNOWN', variance: 'UNKNOWN' }; continue; }
    const diff = av - pv;
    const pct = pv ? Math.round((diff / pv) * 100) : null;
    variances[m] = { planned: pv, actual: av, variance: diff, variance_pct: pct };
  }
  // Validate variance reasons are from the known set.
  const badReasons = (input.variance_notes || []).filter((n) => !VARIANCE_REASONS.includes(n.reason));
  const overruns = Object.entries(variances).filter(([, v]) => typeof v.variance === 'number' && v.variance > 0 && ['owner_hours', 'duration_days', 'cost', 'revisions'].includes(arguments)).map(([k]) => k);

  return {
    label: 'TEST_ONLY plan-vs-actual',
    variances,
    overruns: Object.entries(variances).filter(([k, v]) => ['owner_hours', 'duration_days', 'cost', 'revisions'].includes(k) && typeof v.variance === 'number' && v.variance > 0).map(([k]) => k),
    margin_erosion: (typeof variances.margin?.variance === 'number' && variances.margin.variance < 0),
    variance_reasons: input.variance_notes || [],
    invalid_reasons: badReasons.map((n) => n.reason),
  };
}
