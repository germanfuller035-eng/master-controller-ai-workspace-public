// tools/delivery_os/lib/acceptance.mjs
// Phase 16: Acceptance Engine. No project becomes ACCEPTED without all required criteria passing
// or an explicit documented waiver.

export const ACCEPTANCE_TYPES = ['document', 'audit', 'prototype', 'website', 'automation', 'integration', 'migration', 'training', 'support'];

// criteria: [{criterion_id, deliverable_type, description, verification_method, evidence, severity, required, status}]
export function evaluateAcceptance(criteria, waivers = []) {
  const errors = [];
  const required = criteria.filter((c) => c.required);
  const waivedIds = new Set(waivers.map((w) => w.criterion_id));

  const failing = required.filter((c) => c.status !== 'PASS' && !waivedIds.has(c.criterion_id));
  const waivedRequired = required.filter((c) => waivedIds.has(c.criterion_id) && c.status !== 'PASS');

  // Critical unresolved defects block acceptance even with a waiver.
  const criticalUnresolved = criteria.filter((c) => c.severity === 'CRITICAL' && c.status !== 'PASS');
  for (const c of criticalUnresolved) {
    if (waivedIds.has(c.criterion_id)) errors.push(`critical criterion ${c.criterion_id} cannot be waived`);
  }

  // Each waiver must be documented (reason + owner approval).
  for (const w of waivers) {
    if (!w.reason || w.owner_approved !== true) errors.push(`waiver ${w.criterion_id} requires reason + owner approval`);
  }

  const status = (failing.length === 0 && criticalUnresolved.filter((c) => !waivedIds.has(c.criterion_id)).length === 0 && errors.length === 0)
    ? 'PASS' : 'FAIL';

  return {
    status,
    ok: status === 'PASS',
    errors,
    required_total: required.length,
    required_passing: required.filter((c) => c.status === 'PASS').length,
    failing: failing.map((c) => c.criterion_id),
    waived: waivedRequired.map((c) => c.criterion_id),
    critical_unresolved: criticalUnresolved.map((c) => c.criterion_id),
    package: {
      deliverables_checklist: criteria.map((c) => ({ id: c.criterion_id, status: c.status })),
      known_limitations: failing.map((c) => c.description),
      unresolved_items: failing.map((c) => c.criterion_id),
      approval_record: { owner_required: true },
    },
  };
}
