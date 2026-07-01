// tools/customer_success_os/lib/handoff.mjs
// Phase 6 + 8: Delivery-to-Success handoff + Mini Audit stage hierarchy loader.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CS_ROOT } from './common.mjs';

let HIER = null;
export function miniAuditHierarchy() {
  if (!HIER) HIER = JSON.parse(readFileSync(path.join(CS_ROOT, 'data/mini_audit_stage_hierarchy.json'), 'utf8'));
  return HIER;
}

// Phase 6: validate + build a delivery-to-success handoff. Requires accepted delivery.
// input: { project_id, accepted, acceptance_evidence, critical_defect_open, support_terms,
//          customer_actions, owner, product_version, deliverables, known_limitations, lessons }
export function buildHandoff(input) {
  const errors = [];
  if (input.accepted !== true) errors.push('project not accepted');
  if (!input.acceptance_evidence) errors.push('acceptance evidence missing');
  if (input.critical_defect_open === true) errors.push('critical defect open');
  if (!input.support_terms) errors.push('support terms undefined');
  if (!input.customer_actions || input.customer_actions.length === 0) errors.push('customer actions undefined');
  if (!input.owner) errors.push('owner undefined');
  if (!input.product_version) errors.push('product version missing');

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    handoff: {
      project_id: input.project_id,
      what_delivered: input.deliverables || [],
      what_accepted: input.accepted,
      what_remains: input.known_limitations || [],
      how_to_use: input.usage_guide || 'see getting-started guide',
      customer_actions: input.customer_actions,
      support_boundaries: input.support_terms,
      review_cadence: input.review_cadence || 'post-handoff + 30-day',
      expected_outcomes: input.expected_outcomes || [],
      risks: input.risks || [],
      escalation_path: input.escalation || 'owner',
      product_version: input.product_version,
      lessons: input.lessons || [],
      send_allowed: false,
    },
    note: 'Handoff package internal. No customer message sent.',
  };
}
