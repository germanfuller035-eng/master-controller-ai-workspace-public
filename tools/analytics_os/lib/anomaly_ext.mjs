// tools/analytics_os/lib/anomaly_ext.mjs
// Extended anomaly detection + RCA helper (Phase 18). Read-only, dependency-free.
// Complements lib/anomaly.mjs (which the imported tests cover); adds richer kinds.
import { round4 } from './common.mjs';

export const KINDS = ['SPIKE', 'DROP', 'MISSING_PERIOD', 'UNEXPECTED_ZERO', 'DUPLICATE_COUNT', 'CONVERSION_OVER_100', 'NEGATIVE_DURATION', 'STALE_SNAPSHOT', 'UNEXPECTED_SEND_CHANGE', 'REVENUE_WITHOUT_LINEAGE', 'PRODUCT_STATUS_JUMP', 'SUPPORT_SPIKE', 'DECISION_BACKLOG_SPIKE'];

// Scan a structured snapshot-like object for the extended anomaly kinds.
export function scanExtended(data) {
  const out = [];
  const add = (kind, ref, severity, note) => out.push({ kind, ref, severity, note });

  if (Array.isArray(data.funnel_stages)) {
    for (let i = 1; i < data.funnel_stages.length; i++) {
      const cur = data.funnel_stages[i], prev = data.funnel_stages[i - 1];
      if (cur.count > prev.count) add('CONVERSION_OVER_100', `${prev.name}->${cur.name}`, 'HIGH', `downstream count ${cur.count} > upstream ${prev.count}`);
    }
  }
  for (const d of data.durations || []) if (d.value < 0) add('NEGATIVE_DURATION', d.ref, 'HIGH', `duration=${d.value}`);
  for (const c of data.counts || []) {
    if (c.value === 0 && c.expected_nonzero) add('UNEXPECTED_ZERO', c.ref, 'MEDIUM', 'zero where nonzero expected');
    if (c.duplicate) add('DUPLICATE_COUNT', c.ref, 'MEDIUM', 'duplicate count detected');
  }
  if (data.snapshot && data.snapshot.age_periods != null && data.snapshot.max_age != null && data.snapshot.age_periods > data.snapshot.max_age) add('STALE_SNAPSHOT', data.snapshot.dataset, 'HIGH', `age ${data.snapshot.age_periods} > ${data.snapshot.max_age}`);
  if (data.sends && data.sends.delta != null && Math.abs(data.sends.delta) > (data.sends.threshold ?? 0)) add('UNEXPECTED_SEND_CHANGE', 'sends', 'HIGH', `send count changed by ${data.sends.delta}`);
  for (const r of data.revenue_records || []) if (!r.lineage_ref) add('REVENUE_WITHOUT_LINEAGE', r.ref, 'HIGH', 'revenue without lineage');
  for (const p of data.product_status_changes || []) if (p.illegal_jump) add('PRODUCT_STATUS_JUMP', p.product_id, 'MEDIUM', `${p.from}->${p.to} skips required state`);
  if (data.support && data.support.current > (data.support.baseline ?? 0) * 2) add('SUPPORT_SPIKE', 'support', 'MEDIUM', `support ${data.support.current} vs baseline ${data.support.baseline}`);
  if (data.decision_backlog && data.decision_backlog.current > (data.decision_backlog.baseline ?? 0) * 2) add('DECISION_BACKLOG_SPIKE', 'decisions', 'MEDIUM', `backlog ${data.decision_backlog.current} vs ${data.decision_backlog.baseline}`);
  for (const m of data.missing_periods || []) add('MISSING_PERIOD', m, 'LOW', 'series missing a period');

  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
  out.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
  return { total: out.length, by_severity: out.reduce((acc, x) => { acc[x.severity] = (acc[x.severity] || 0) + 1; return acc; }, {}), anomalies: out };
}

// RCA helper — structures an analysis WITHOUT asserting an unsupported root cause.
export function buildRCA(anomaly, context = {}) {
  return {
    anomaly,
    timeline: context.timeline || [],
    candidate_causes: context.candidate_causes || [],
    evidence: context.evidence || [],
    excluded_causes: context.excluded_causes || [],
    dependencies: context.dependencies || [],
    corrective_action: context.corrective_action || null,
    validation_plan: context.validation_plan || null,
    root_cause_confirmed: false,
    note: 'Root cause is NOT asserted without supporting evidence; candidates require owner validation.',
  };
}
