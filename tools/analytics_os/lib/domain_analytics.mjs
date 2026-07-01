// tools/analytics_os/lib/domain_analytics.mjs
// Domain-specific read-only analytics views (Phase 11-12). Synthetic input; no live reads.
// Complements (does not replace) rollup/trends/funnel/cohort/anomaly.
import { pct, round2, round4, avg, sum } from './common.mjs';

// ---- Lead-source analytics ----
export function leadSourceAnalytics(sources) {
  return sources.map((s) => ({
    source: s.source,
    candidates: s.candidates,
    verified_rate: pct(s.verified, s.candidates),
    audit_ready_rate: pct(s.audit_ready, s.verified),
    reply_rate: pct(s.replies, s.sent),
    win_rate: pct(s.won, s.replies),
    source_quality: scoreQuality(s),
    source_health: s.candidates > 0 && s.verified / Math.max(1, s.candidates) >= 0.3 ? 'OK' : 'LOW',
  }));
}
function scoreQuality(s) {
  const v = (s.verified / Math.max(1, s.candidates));
  const w = (s.won / Math.max(1, s.replies || 1));
  return round4((v * 0.5 + w * 0.5));
}

// ---- Product analytics ----
export function productAnalytics(products) {
  return products.map((p) => ({
    product_id: p.product_id,
    readiness_by_dimension: p.readiness_dimensions || {},
    readiness_score: p.readiness_dimensions ? avg(Object.values(p.readiness_dimensions)) : null,
    pilot_outcome: p.pilot_outcome || 'UNKNOWN',
    claim_approval_rate: pct(p.claims_approved, p.claims_total),
    support_burden: p.support_tickets || 0,
    product_profitability: p.revenue != null && p.variable_cost != null ? round2(p.revenue - p.variable_cost) : null,
    product_mismatch: p.state === 'ACTIVE' && p.owner_approved_readiness !== true ? 'ACTIVE_WITHOUT_READINESS' : 'OK',
  }));
}

// ---- Delivery analytics ----
export function deliveryAnalytics(projects) {
  return projects.map((p) => ({
    project_id: p.project_id,
    cycle_time_days: p.start_day != null && p.accepted_day != null ? p.accepted_day - p.start_day : null,
    client_delay_days: p.client_delay_days || 0,
    owner_delay_days: p.owner_delay_days || 0,
    qa_failure: p.qa_result === 'FAIL',
    rework_count: p.rework_count || 0,
    change_requests: p.change_requests || 0,
    acceptance_time_days: p.qa_day != null && p.accepted_day != null ? p.accepted_day - p.qa_day : null,
    plan_vs_actual: p.planned_days != null && p.actual_days != null ? round2(p.actual_days - p.planned_days) : null,
  }));
}

// ---- Finance analytics ----
export function financeAnalytics(period) {
  return {
    invoiced: period.invoiced ?? null,
    collected: period.collected ?? null,
    overdue: period.overdue ?? null,
    margin: period.revenue != null && period.direct_costs != null ? pct(period.revenue - period.direct_costs, period.revenue) : null,
    cashflow: period.inflow != null && period.outflow != null ? round2(period.inflow - period.outflow) : null,
    forecast_error: period.forecast != null && period.actual != null && period.actual !== 0 ? round4(Math.abs(period.actual - period.forecast) / Math.abs(period.actual)) : null,
  };
}

// ---- Customer Success analytics ----
export function customerSuccessAnalytics(customers) {
  const n = customers.length || 1;
  const onboardingComplete = customers.filter((c) => ['ADOPTION', 'HEALTHY', 'ACTIVE'].includes(c.status)).length;
  const adopted = customers.filter((c) => (c.adoption || 0) >= 50).length;
  const health = customers.reduce((acc, c) => { const h = c.health || 'UNKNOWN'; acc[h] = (acc[h] || 0) + 1; return acc; }, {});
  const support = sum(customers.map((c) => c.open_support || 0));
  const incidents = customers.filter((c) => c.open_critical_support === true).length;
  const renewalEligible = customers.filter((c) => c.renewal_eligible === true).length;
  const churn = customers.filter((c) => c.status === 'CHURNED').length;
  const valueEvidence = customers.filter((c) => c.value_evidence === true).length;
  return {
    onboarding_completion: pct(onboardingComplete, n),
    adoption_rate: pct(adopted, n),
    health_distribution: health,
    support_burden: support,
    incidents,
    renewal_eligibility: pct(renewalEligible, n),
    churn_count: churn,
    value_evidence_completeness: pct(valueEvidence, n),
  };
}

// ---- Executive analytics ----
export function executiveAnalytics(exec) {
  return {
    decision_backlog: (exec.decisions || []).filter((d) => ['OPEN', 'READY_FOR_OWNER', 'NEEDS_DATA'].includes(d.status)).length,
    decision_debt: (exec.decisions || []).filter((d) => (d.age_days || 0) > 14 && d.status !== 'APPROVED').length,
    portfolio_concentration: exec.largest_project_share != null ? round4(exec.largest_project_share) : null,
    owner_attention_load: exec.attention_load ?? 'UNKNOWN',
    project_overload: (exec.projects_active || 0) > (exec.owner_capacity_projects || 99) ? 'OVERLOAD' : 'OK',
  };
}
