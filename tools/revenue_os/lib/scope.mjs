// tools/revenue_os/lib/scope.mjs
// Phase 11: Scope and Delivery Engine + Scope Validator.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REVENUE_ROOT, isClientOfferable } from './common.mjs';

let CATALOG = null;
function product(id) {
  if (!CATALOG) CATALOG = JSON.parse(readFileSync(path.join(REVENUE_ROOT, 'data/product_catalog.json'), 'utf8'));
  return CATALOG.products.find((p) => p.product_id === id) || null;
}

// A service the workspace can plausibly deliver (no unsupported services in scope).
const SUPPORTED_SERVICE_RX = /(audit|finding|review|landing|website|catalog|form|cta|trust|copy|text|seo|analytics|recovery|presence|telegram|crm|lead|funnel|process|prototype|fix|support|monitoring)/i;

// Build a delivery scope object for a product.
export function buildScope(productId) {
  const p = product(productId);
  if (!p) return { ok: false, error: `unknown product ${productId}` };
  return {
    ok: true,
    product_id: productId,
    included: p.scope_included,
    excluded: p.scope_excluded,
    client_inputs: p.evidence_required.concat(p.dependencies || []),
    dependencies: p.dependencies || [],
    deliverables: p.deliverables,
    milestones: deriveMilestones(p),
    acceptance_criteria: p.acceptance_criteria,
    revision_limits: p.category === 'build' ? '2 revision rounds (default; owner-adjustable)' : '1 review round',
    support_period: p.category === 'retainer' ? 'monthly' : 'none unless agreed',
    ownership: 'client owns deliverables on full payment',
    hosting_domain_responsibility: 'client (unless explicitly scoped)',
    content_responsibility: 'client provides content unless copy is in scope',
    payment_assumptions: p.approval_required ? 'owner-approved terms required' : 'standard',
    change_request_rules: 'changes beyond frozen scope = new estimate + owner approval',
  };
}

function deriveMilestones(p) {
  if (p.deliverables.length <= 1) return ['delivery + acceptance'];
  return ['kickoff + inputs', 'draft delivery', 'review', 'final delivery + acceptance'];
}

// Validate a scope (or product) for completeness/consistency.
export function validateScope(productId) {
  const p = product(productId);
  const errors = [];
  const warnings = [];
  if (!p) return { ok: false, errors: [`unknown product ${productId}`], warnings };

  if (!p.deliverables || p.deliverables.length === 0) errors.push('product has no deliverables');
  if (!p.acceptance_criteria || p.acceptance_criteria.length === 0) errors.push('deliverables without acceptance criteria');

  const hasPrice = p.price.type === 'free' || p.price.amount != null || p.price.amount_min != null;
  if (hasPrice && (!p.scope_included || p.scope_included.length === 0)) errors.push('price exists without scope_included');
  if (p.delivery_days && (!p.dependencies || p.dependencies.length === 0) && p.category !== 'lead_generation') {
    warnings.push('timeline exists without declared dependencies');
  }

  // Scope must not contain unsupported services.
  for (const item of p.scope_included) {
    if (!SUPPORTED_SERVICE_RX.test(item)) warnings.push(`scope item may be unsupported/ambiguous: "${item}"`);
  }
  // Included vs excluded contradiction.
  const incLower = p.scope_included.map((s) => s.toLowerCase());
  for (const ex of p.scope_excluded) {
    if (incLower.includes(ex.toLowerCase())) errors.push(`scope contradiction: "${ex}" both included and excluded`);
  }
  // Duplicate deliverables.
  const seen = new Set();
  for (const d of p.deliverables) {
    const k = d.trim().toLowerCase();
    if (seen.has(k)) errors.push(`duplicate deliverable: "${d}"`); else seen.add(k);
  }
  // Missing client input for build/implementation.
  if (['build', 'implementation'].includes(p.category) && !(p.evidence_required || []).length) {
    warnings.push('build/implementation product without declared client inputs');
  }
  // Owner approval.
  if (p.approval_required && !p.price.approved_by_owner) warnings.push('owner approval missing (required for this product)');

  return { ok: errors.length === 0, errors, warnings };
}
