// tools/executive_os/lib/policy.mjs
// Phase 23: Executive Policy Engine. Configurable, versioned policies. Validates proposed actions.

export const POLICY_VERSION = '1.0';

// Each policy: id, rule, check(action) -> {ok, reason}
export const POLICIES = [
  { id: 'product_active_requires_readiness', check: (a) => !(a.type === 'product_activate' && (a.readiness !== 'READY_FOR_PILOT' || !a.owner_approved)) },
  { id: 'project_start_requires_capacity', check: (a) => !(a.type === 'project_start' && a.capacity_available !== true) },
  { id: 'project_start_requires_scope', check: (a) => !(a.type === 'project_start' && !a.scope) },
  { id: 'project_start_requires_financial_viability', check: (a) => !(a.type === 'project_start' && a.financial_viable === false) },
  { id: 'invoice_requires_approved_price', check: (a) => !(a.type === 'invoice' && a.price_approved !== true) },
  { id: 'client_ready_requires_qa', check: (a) => !(a.type === 'client_ready_asset' && a.qa_passed !== true) },
  { id: 'case_publish_requires_permission', check: (a) => !(a.type === 'case_publish' && a.client_permission !== true) },
  { id: 'no_production_deploy_during_freeze', check: (a) => !(a.type === 'production_deploy' && a.freeze === true) },
  { id: 'no_send_without_approval', check: (a) => !(a.type === 'send' && a.owner_approved !== true) },
  { id: 'no_forecast_labelled_confirmed', check: (a) => !(a.type === 'label' && a.kind === 'forecast' && a.label === 'CONFIRMED') },
  { id: 'expense_requires_classification', check: (a) => !(a.type === 'expense_approve' && a.scope === 'ambiguous') },
  { id: 'no_duplicate_system', check: (a) => !(a.type === 'create_system' && a.duplicate === true) },
  { id: 'no_pass_without_evidence', check: (a) => !(a.type === 'mark_pass' && !a.evidence) },
  { id: 'no_decision_executed_automatically', check: (a) => !(a.type === 'execute_decision' && a.actor !== 'owner') },
];

export function checkAction(action) {
  const violations = [];
  for (const p of POLICIES) {
    try { if (!p.check(action)) violations.push(p.id); } catch { /* ignore */ }
  }
  return { ok: violations.length === 0, violations, policy_version: POLICY_VERSION };
}

export function listPolicies() { return { version: POLICY_VERSION, count: POLICIES.length, ids: POLICIES.map((p) => p.id) }; }
