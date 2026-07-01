// tools/product_os/lib/qa.mjs
// Phase 28: Product QA System. 16 dimensions + hard blockers.
import { product, playbook } from './catalog.mjs';
import { validateSpec, analyzeDuplication } from './spec.mjs';

export const QA_DIMENSIONS = ['clarity', 'differentiation', 'deliverability', 'evidence', 'pricing_consistency', 'scope_clarity', 'exclusions', 'timeline', 'quality_gates', 'acceptance', 'economics', 'capacity', 'risks', 'claims', 'demo_assets', 'pilot_evidence'];

// flags: { economics_known, capacity_known, demo_ready, pilot_passed, claims_clean }
export function productQA(productId, flags = {}) {
  const p = product(productId);
  if (!p) return { ok: false, error: `unknown product ${productId}` };
  const pb = playbook(productId);
  const spec = validateSpec(productId);
  const hardBlockers = [];

  // Hard blockers.
  if (flags.unsupported_claim) hardBlockers.push('unsupported_claim');
  if (!(p.scope_included || []).length) hardBlockers.push('no_scope');
  if (!(p.acceptance_criteria || []).length) hardBlockers.push('no_acceptance');
  if (p.price.status === 'UNKNOWN') hardBlockers.push('no_price_source');
  if (!pb) hardBlockers.push('no_delivery_playbook');
  if (flags.pilot_required && !flags.pilot_passed) hardBlockers.push('no_pilot');
  if (flags.margin_negative_or_unknown_presented_viable) hardBlockers.push('bad_margin_presented_viable');
  if (flags.real_client_data_in_demo) hardBlockers.push('real_client_data_in_demo');
  if (flags.client_ready_without_approval) hardBlockers.push('client_ready_without_approval');

  const dims = {};
  for (const d of QA_DIMENSIONS) dims[d] = 'PASS';
  if (!spec.ok) { dims.clarity = 'FAIL'; dims.scope_clarity = (p.scope_included || []).length ? 'PASS' : 'FAIL'; }
  if (!pb) dims.deliverability = 'FAIL';
  if (!(p.acceptance_criteria || []).length) dims.acceptance = 'FAIL';
  if (p.price.status === 'UNKNOWN') dims.pricing_consistency = 'FAIL';
  if (!flags.economics_known) dims.economics = 'PARTIAL';
  if (!flags.capacity_known) dims.capacity = 'PARTIAL';
  if (!flags.demo_ready) dims.demo_assets = 'PARTIAL';
  if (!flags.pilot_passed) dims.pilot_evidence = 'PARTIAL';

  const fails = Object.values(dims).filter((v) => v === 'FAIL').length;
  return {
    ok: hardBlockers.length === 0 && fails === 0,
    product_id: productId,
    dimensions: dims,
    hard_blockers: hardBlockers,
    fails,
    client_ready: hardBlockers.length === 0 && fails === 0 && flags.owner_approved === true,
    note: 'client_ready requires no blockers + no fails + owner approval.',
  };
}
