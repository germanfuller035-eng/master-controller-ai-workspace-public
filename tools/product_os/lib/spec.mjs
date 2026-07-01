// tools/product_os/lib/spec.mjs
// Phase 4-5: Product Specification Standard validator + Duplication/Merge analysis.
import { product, catalog, playbook } from './catalog.mjs';
import { DUP_ACTIONS } from './common.mjs';

// Build a product specification from canonical catalog + delivery playbook (read-only derivation).
export function buildSpec(productId) {
  const p = product(productId);
  if (!p) return { ok: false, error: `unknown product ${productId}` };
  const pb = playbook(productId);
  return {
    ok: true,
    spec: {
      product_id: p.product_id, name: p.name, version: '1.0', category: p.category, status: p.status,
      problem: p.target_problem, customer: p.target_customer, non_customer: (p.disqualifiers || []).join('; '),
      outcome: p.description, inputs: p.evidence_required || [], deliverables: p.deliverables || [],
      scope: p.scope_included || [], exclusions: p.scope_excluded || [], timeline: p.delivery_days || null,
      pricing_reference: `revenue_os:${p.price.status}`,
      delivery_reference: pb ? `delivery_os:${productId}` : null,
      qa_reference: pb && pb.qa ? `delivery_os:${productId}:qa` : (pb && pb.acceptance_tests ? `delivery_os:${productId}:acceptance_tests` : null),
      acceptance_reference: (p.acceptance_criteria || []).length ? `revenue_os:${productId}:acceptance` : null,
      economics_reference: `finance_os:${productId}`,
      claims_reference: `product_os:${productId}:claims`,
      risks: p.risks || [], dependencies: p.dependencies || [],
    },
  };
}

// Validate a spec against the standard. Blocks on missing critical sections.
export function validateSpec(productId) {
  const r = buildSpec(productId);
  if (!r.ok) return { ok: false, errors: [r.error] };
  const s = r.spec;
  const errors = [];
  if (!s.problem) errors.push('problem undefined');
  if (!s.outcome || s.outcome.length < 10) errors.push('outcome vague/undefined');
  if (!s.deliverables.length) errors.push('deliverables missing');
  if (!s.scope.length) errors.push('scope missing');
  if (!s.exclusions.length) errors.push('exclusions missing');
  if (!s.qa_reference) errors.push('QA reference missing');
  if (!s.acceptance_reference) errors.push('acceptance reference missing');
  if (!s.pricing_reference) errors.push('price source missing');
  if (!s.delivery_reference) errors.push('delivery process missing');
  return { ok: errors.length === 0, errors, spec: s };
}

// Phase 5: Duplication / merge analysis across products.
export function analyzeDuplication() {
  const products = catalog();
  const findings = [];
  for (let i = 0; i < products.length; i++) {
    for (let j = i + 1; j < products.length; j++) {
      const a = products[i], b = products[j];
      const sameProblem = simHint(a.target_problem, b.target_problem);
      const sameCustomer = simHint(a.target_customer, b.target_customer);
      const delivOverlap = overlap(a.deliverables, b.deliverables);
      const scopeOverlap = overlap(a.scope_included, b.scope_included);
      let recommendation = null;
      const reasons = [];
      if (delivOverlap > 0.6 && sameProblem) { recommendation = 'OWNER_DECISION_REQUIRED'; reasons.push('high deliverable overlap + same problem (possible merge)'); }
      else if (scopeOverlap > 0.5 && sameCustomer) { reasons.push('scope overlap + same customer (check differentiation)'); recommendation = 'REPOSITION'; }
      if (recommendation) findings.push({ a: a.product_id, b: b.product_id, deliverable_overlap: round(delivOverlap), scope_overlap: round(scopeOverlap), reasons, recommendation });
    }
  }
  // Price-ladder consistency: detect inconsistent ranges.
  const audits = products.filter((p) => p.category === 'audit');
  return { findings, audit_products: audits.length, actions_vocab: DUP_ACTIONS, note: 'No merge/deprecation executed. Recommendations only.' };
}

function tokens(s) { return new Set(String(s || '').toLowerCase().split(/[^a-zа-я0-9]+/).filter((x) => x.length > 3)); }
function overlap(a, b) {
  const ta = tokens((a || []).join(' ')), tb = tokens((b || []).join(' '));
  if (!ta.size || !tb.size) return 0;
  let inter = 0; for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}
function simHint(a, b) { return overlap([a], [b]) > 0.3; }
function round(n) { return Math.round(n * 100) / 100; }
