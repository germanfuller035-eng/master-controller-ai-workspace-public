// tools/revenue_os/lib/offer.mjs
// Phase 12: Offer Factory. Builds an internal offer object from profile + product + evidence.
// PLANNED/DRAFT products yield INTERNAL_DRAFT_NOT_CLIENT_READY. Never sends. No false personalization.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REVENUE_ROOT, isClientOfferable, APPROVAL_STATE } from './common.mjs';
import { resolvePrice, priceGuard } from './pricing.mjs';
import { buildScope, validateScope } from './scope.mjs';
import { checkClaims } from './evidence.mjs';

let CATALOG = null;
function product(id) {
  if (!CATALOG) CATALOG = JSON.parse(readFileSync(path.join(REVENUE_ROOT, 'data/product_catalog.json'), 'utf8'));
  return CATALOG.products.find((p) => p.product_id === id) || null;
}

// inputs: { profile, product_id, evidence:[claims], lead_reference }
export function buildOffer(inputs) {
  const p = product(inputs.product_id);
  if (!p) return { ok: false, error: `unknown product ${inputs.product_id}` };

  const evidence = inputs.evidence || (inputs.profile && inputs.profile.evidence) || [];
  const evCheck = checkClaims(evidence);
  const price = resolvePrice(inputs.product_id);
  const guard = priceGuard(inputs.product_id, null);
  const scope = buildScope(inputs.product_id);
  const scopeCheck = validateScope(inputs.product_id);

  const clientReady = isClientOfferable(p.status);
  const blockers = [];
  if (!clientReady) blockers.push(`product_${p.status}_not_client_ready`);
  if (!evCheck.ok) blockers.push('evidence_gate_failed');
  if (!scopeCheck.ok) blockers.push('scope_invalid');
  if (!guard.ok) blockers.push('price_invalid');
  if (p.approval_required && !p.price.approved_by_owner) blockers.push('owner_price_approval_required');

  // Approval state: PLANNED/DRAFT -> internal draft. Best case here is INTERNAL_REVIEW (never auto CLIENT_READY).
  let approval_state = clientReady ? 'INTERNAL_REVIEW' : 'DRAFT';
  const not_client_ready_label = clientReady ? null : 'INTERNAL_DRAFT_NOT_CLIENT_READY';

  const offer = {
    offer_id: `offer_${(inputs.profile?.profile_id || inputs.product_id)}_${inputs.product_id}`,
    lead_reference: inputs.lead_reference || null,
    product_id: inputs.product_id,
    product_status: p.status,
    not_client_ready_label,
    owner_summary: ownerSummary(p, price, blockers),
    problem_statement: p.target_problem,
    evidence_summary: evidence.map((e) => ({ claim: e.claim, type: e.claim_type, source: e.source_url || e.source_type })),
    recommended_product: { id: p.product_id, name: p.name, client_name: p.client_name },
    deliverables: p.deliverables,
    timeline: p.delivery_days || 'UNKNOWN (owner to confirm)',
    price: {
      amount: p.price.amount ?? null,
      amount_min: p.price.amount_min ?? null,
      amount_max: p.price.amount_max ?? null,
      currency: p.price.currency,
      type: p.price.type,
      source: p.price.source,
      status: p.price.status,
      valid_from: p.price.valid_from ?? null,
      valid_until: p.price.valid_until ?? null,
      approved_by_owner: p.price.approved_by_owner,
      display: price.display,
    },
    assumptions: ['evidence verified at time of audit', 'client provides required inputs'],
    exclusions: p.scope_excluded,
    client_inputs: scope.client_inputs,
    risks: p.risks,
    next_step: clientReady ? 'Owner reviews and approves before any client contact.' : 'Internal only — product not client-ready.',
    approval_checklist: [
      `price ${price.status}${price.approved_by_owner ? ' (approved)' : ' (NOT approved)'}`,
      `evidence gate ${evCheck.ok ? 'PASS' : 'FAIL'}`,
      `scope ${scopeCheck.ok ? 'valid' : 'invalid'}`,
      `product readiness ${p.status}`,
    ],
    validity_period: '14 days from owner approval',
    approval_state,
    send_allowed: false,
    blockers,
  };

  return { ok: true, offer, evidence_check: evCheck, scope_check: scopeCheck, price_guard: guard };
}

function ownerSummary(p, price, blockers) {
  const ready = isClientOfferable(p.status);
  return `${p.name} for this profile. Price ${price.display} (${price.status}). ` +
    (ready ? (blockers.length ? `Blockers: ${blockers.join(', ')}.` : 'Ready for owner review (no send).') :
    `NOT client-ready (${p.status}) — internal draft only.`);
}
