// tools/product_os/lib/productize.mjs
// Phase 9-17: Product priority, per-product packs, Mini Audit reference blueprint, boundaries.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PRODUCT_ROOT } from './common.mjs';
import { product, playbook } from './catalog.mjs';
import { validateSpec } from './spec.mjs';

let PACKS = null;
function packs() { if (!PACKS) PACKS = JSON.parse(readFileSync(path.join(PRODUCT_ROOT, 'data/product_packs.json'), 'utf8')); return PACKS; }

export function prioritySelection() { return packs().priority_selection; }
export function getPack(productId) { return packs().packs[productId] || null; }

// Phase 10: Mini Audit reference blueprint extracted from canonical data.
export function miniAuditReference() {
  const p = product('mini_audit');
  if (!p) return { ok: false, error: 'mini_audit not in catalog' };
  const pb = playbook('mini_audit');
  return {
    ok: true,
    blueprint: {
      product_id: 'mini_audit', name: p.name,
      price: { amount: p.price.amount, currency: p.price.currency, status: p.price.status },  // confirmed, unaltered
      scope: p.scope_included, exclusions: p.scope_excluded, deliverables: p.deliverables,
      delivery_stages: pb && pb.milestones ? pb.milestones.length : 0,
      qa: pb ? pb.qa : null, acceptance: p.acceptance_criteria,
      spec_valid: validateSpec('mini_audit').ok,
      reference_for: 'all audit-category products',
    },
    readiness_matrix_ref: 'product readiness assess(mini_audit)',
    note: 'Confirmed price 10000 RUB not altered. Reference template only.',
  };
}

// Phase 16-17: boundary analysis for Lead System / AI Front Office (decision packets).
export function boundaryAnalysis(productId) {
  const pack = getPack(productId);
  if (!pack) return { ok: false, error: `no pack for ${productId}` };
  return {
    ok: true,
    product_id: productId,
    options: pack.options || pack.safe_variants,
    recommended: pack.recommended || pack.prohibited_default ? `default prohibits: ${pack.prohibited_default}` : null,
    keep_status: pack.keep_status,
    owner_decision: pack.owner_decision,
    boundary_risk: pack.boundary_risk || 'autonomous-action risk',
    note: 'No reusable client product created automatically. Owner decides packaging.',
  };
}

// Generic productization summary for a priority product.
export function productize(productId) {
  const p = product(productId);
  if (!p) return { ok: false, error: `unknown product ${productId}` };
  const pack = getPack(productId);
  const spec = validateSpec(productId);
  return {
    ok: true,
    product_id: productId,
    status: p.status,
    spec_valid: spec.ok,
    spec_gaps: spec.errors || [],
    pack: pack || 'reference (mini_audit) or no dedicated pack',
    price_status: p.price.status,
    has_playbook: !!playbook(productId),
  };
}
