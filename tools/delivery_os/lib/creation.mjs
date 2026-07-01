// tools/delivery_os/lib/creation.mjs
// Phase 5: Project Creation Contract validator. Consumes Revenue OS handoff + product catalog.
// Fails on PLANNED product, unapproved price, missing scope/deliverables/acceptance/inputs, etc.
import { readFileSync } from 'node:fs';
import { REVENUE_CATALOG } from './common.mjs';
import { validate } from '../../revenue_os/lib/schema.mjs';
import { ClientProjectSchema } from '../schemas/domain.mjs';

let CATALOG = null;
function product(id) {
  if (!CATALOG) CATALOG = JSON.parse(readFileSync(REVENUE_CATALOG, 'utf8'));
  return CATALOG.products.find((p) => p.product_id === id) || null;
}
function isClientOfferable(status) { return status === 'ACTIVE' || status === 'READY_FOR_PILOT'; }

// request: { deal_id, test_only, product_id, scope, price_approved, client_identity, owner,
//            timeline, deliverables, acceptance_criteria, client_inputs, risks, commercial_reference,
//            canonical_lead_id }
export function validateCreation(request) {
  const errors = [];
  const warnings = [];
  const p = product(request.product_id);

  if (!request.deal_id && !request.test_only) errors.push('missing deal_id (and not test_only)');
  if (!p) { errors.push(`unknown product ${request.product_id}`); return { ok: false, errors, warnings }; }

  // Product readiness: PLANNED never allowed; DRAFT allowed only for test_only with a warning.
  if (p.status === 'PLANNED') errors.push(`product ${request.product_id} is PLANNED — not deliverable`);
  if (p.status === 'DRAFT' && !request.test_only) errors.push(`product ${request.product_id} is DRAFT — not client-deliverable (test_only only)`);
  if (p.status === 'DRAFT' && request.test_only) warnings.push(`product ${request.product_id} is DRAFT — TEST_ONLY simulation`);

  // Price approval.
  if (request.price_approved !== true && p.price.type !== 'free') {
    if (!request.test_only) errors.push('price not approved');
    else warnings.push('price not approved (test_only)');
  }

  // Required structures.
  if (!request.scope || (Array.isArray(request.scope) && request.scope.length === 0)) errors.push('scope missing');
  if (!request.deliverables || request.deliverables.length === 0) errors.push('deliverables missing');
  if (!request.acceptance_criteria || request.acceptance_criteria.length === 0) errors.push('acceptance criteria missing');
  if (!request.client_inputs || request.client_inputs.length === 0) errors.push('client input list missing');
  if (!request.commercial_reference) errors.push('commercial reference missing');
  if (!request.owner) errors.push('owner missing');

  // Canonical lead ID required for non-test projects.
  if (!request.test_only && !request.canonical_lead_id) errors.push('canonical lead ID missing for non-test project');

  // Build the ClientProject if valid.
  let project = null;
  if (errors.length === 0) {
    project = {
      project_id: request.project_id || `${request.test_only ? 'TEST_' : ''}proj_${request.product_id}_${request.deal_id || 'x'}`,
      deal_id: request.deal_id || null,
      canonical_lead_id: request.canonical_lead_id || null,
      product_id: request.product_id,
      name: request.name || `${p.name} project`,
      status: 'PLANNED',
      priority: request.priority || 'P2',
      owner: request.owner,
      project_manager: request.project_manager || request.owner,
      created_at: null, planned_start: null, actual_start: null, planned_end: null, actual_end: null,
      scope_version: 1,
      commercial_reference: request.commercial_reference,
      client_reference: request.client_reference || null,
      revision: 1,
      test_only: !!request.test_only,
    };
    const shape = validate(project, ClientProjectSchema, 'project');
    if (!shape.ok) { errors.push(...shape.errors); project = null; }
  }

  return { ok: errors.length === 0, errors, warnings, project, product_status: p.status };
}
