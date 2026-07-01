// tools/customer_success_os/lib/portfolio.mjs
// Phase 32,36,37,38,39,46: Playbooks loader + product feedback loop + portfolio + dashboard + OCC + report factory.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CS_ROOT, PORTFOLIO_ACTIONS } from './common.mjs';

let PB = null;
export function playbooks() { if (!PB) PB = JSON.parse(readFileSync(path.join(CS_ROOT, 'data/playbooks.json'), 'utf8')); return PB.playbooks; }
export function playbook(id) { return playbooks()[id] || null; }

// Phase 36: product feedback loop — proposals to other OS layers (no direct mutation).
export function feedbackLoop(input) {
  return {
    schema: 'cs.feedback_loop.v1', label: 'PROPOSALS_ONLY (no direct mutation)',
    to_product_os: input.product || [], // recurring issue, gap, claim mismatch, onboarding failure, adoption problem, fit, readiness
    to_delivery_os: input.delivery || [], // handoff issue, missing instruction, recurring defect, acceptance gap, support burden, scope ambiguity
    to_revenue_os: input.revenue || [], // wrong expectation, mismatch, qualification, expansion evidence, renewal evidence
    to_finance_os: input.finance || [], // support cost, profitability, unpaid support, refund risk
    to_executive_os: input.executive || [], // critical risk, concentration, reputation, escalation
    note: 'Customer Success OS sends proposals, not direct mutations.',
  };
}

// Phase 37: customer portfolio (synthetic).
export function buildPortfolio(customers) {
  const rows = customers.map((c) => {
    let action = 'MAINTAIN';
    if (c.health === 'CRITICAL') action = 'RECOVER';
    else if (c.health === 'AT_RISK') action = 'REVIEW';
    else if (c.open_critical_support) action = 'SUPPORT';
    else if (c.renewal_due) action = 'RENEW';
    else if (c.expansion_eligible) action = 'EXPAND';
    else if (c.opted_out) action = 'CLOSE';
    else if (c.health === 'UNKNOWN') action = 'OWNER_DECISION_REQUIRED';
    return { customer_ref: c.customer_ref_id, products: c.product_ids || [], health: c.health || 'UNKNOWN', adoption: c.adoption ?? 'UNKNOWN', value: c.value || 'UNKNOWN', support: c.support || 'none', payment: c.payment || 'UNKNOWN', risk: c.risk || 'none', renewal: c.renewal_due ? 'due' : 'n/a', expansion: c.expansion_eligible ? 'eligible' : 'no', owner_action: action, confidence: c.confidence || 'low' };
  });
  return { schema: 'cs.portfolio.v1', label: 'TEST_ONLY (synthetic customers)', total: rows.length, rows, actions_vocab: PORTFOLIO_ACTIONS };
}

// Phase 38: Customer Success Dashboard (does not duplicate domain dashboards).
export function dashboard(customers = []) {
  const by = (pred) => customers.filter(pred).map((c) => c.customer_ref_id);
  return {
    schema: 'cs.dashboard.v1', label: 'INTERNAL_OWNER_ONLY',
    note: 'Does NOT duplicate Revenue/Delivery/Finance/Product dashboards. Post-delivery success focus.',
    onboarding: by((c) => c.status === 'ONBOARDING'),
    activation: by((c) => c.status === 'ACTIVATION'),
    healthy: by((c) => c.health === 'HEALTHY'),
    watch: by((c) => c.health === 'WATCH'),
    at_risk: by((c) => c.health === 'AT_RISK'),
    critical: by((c) => c.health === 'CRITICAL'),
    support_requests: customers.reduce((s, c) => s + (c.open_support || 0), 0),
    incidents: by((c) => c.open_incident),
    renewals: by((c) => c.renewal_due),
    expansion: by((c) => c.expansion_eligible),
    churn: by((c) => c.status === 'CHURNED'),
    case_permissions: by((c) => c.case_permission),
    owner_actions: by((c) => c.health === 'CRITICAL' || c.health === 'AT_RISK' || c.renewal_due),
  };
}

// Phase 39: Owner Customer Command Center (compact).
export function ownerCommandCenter(customers = []) {
  const critical = customers.filter((c) => c.health === 'CRITICAL' || c.open_critical_support);
  const atRisk = customers.filter((c) => c.health === 'AT_RISK');
  return {
    schema: 'cs.owner_command_center.v1', label: 'INTERNAL_OWNER_ONLY',
    primary_customer_action: critical[0] ? `recover ${critical[0].customer_ref_id}` : (atRisk[0] ? `review ${atRisk[0].customer_ref_id}` : 'maintain'),
    critical_support_issue: critical.map((c) => c.customer_ref_id),
    customer_at_risk: atRisk.map((c) => c.customer_ref_id),
    renewal_decision: customers.filter((c) => c.renewal_due).map((c) => c.customer_ref_id),
    expansion_review: customers.filter((c) => c.expansion_eligible).map((c) => c.customer_ref_id),
    high_support_unpaid: customers.filter((c) => c.payment === 'overdue' && (c.open_support || 0) > 2).map((c) => c.customer_ref_id),
    case_approval: customers.filter((c) => c.case_permission === 'REQUESTED').map((c) => c.customer_ref_id),
    needs_product_change: customers.filter((c) => c.product_change_needed).map((c) => c.customer_ref_id),
    needs_delivery_change: customers.filter((c) => c.delivery_change_needed).map((c) => c.customer_ref_id),
    note: 'No external notification.',
  };
}

// Phase 46: report factory.
export const REPORT_TYPES = ['customer_health', 'onboarding', 'adoption', 'value_review', 'support_summary', 'incident_report', 'renewal_assessment', 'expansion_assessment', 'churn_analysis', 'customer_profitability', 'case_permission', 'portfolio_summary', 'owner_customer_brief'];
export function buildReport(type, data, opts = {}) {
  if (!REPORT_TYPES.includes(type)) return { ok: false, error: `unknown report type ${type}` };
  return { ok: true, json: { schema: 'cs.report.v1', type, label: 'INTERNAL_OWNER_ONLY', send_allowed: false, publish_allowed: false, generated_ts: opts.ts || 'UNSTAMPED', data } };
}
