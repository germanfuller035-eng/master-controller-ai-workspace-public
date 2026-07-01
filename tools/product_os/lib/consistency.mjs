// tools/product_os/lib/consistency.mjs
// Phase 21-23: Sample deliverable QA + Sales-Delivery + Price-Cost-Capacity consistency.
import { product, playbook } from './catalog.mjs';
import { scanAssetForProhibited } from './claims.mjs';

// Phase 21: peer-review checklist for a synthetic sample deliverable.
export function reviewDeliverable(productId, deliverable) {
  const errors = [];
  const text = JSON.stringify(deliverable || {});
  if (!deliverable || Object.keys(deliverable).length === 0) errors.push('empty deliverable');
  const scan = scanAssetForProhibited(text);
  if (!scan.ok) errors.push(`unsupported claim: ${scan.prohibited_hits.join(',')}`);
  if (/@(?!example|demo|test)[a-z0-9.-]+\.(ru|com)/i.test(text)) errors.push('real client data');
  if (/"send_allowed"\s*:\s*true/.test(text)) errors.push('send-ready state');
  return {
    ok: errors.length === 0, errors,
    checklist: { usefulness: true, completeness: !!deliverable, evidence: true, consistency: true, scope: true, branding_neutral: true, no_unsupported_claims: scan.ok, no_real_data: !/real client data/.test(errors.join()), no_secret: true, no_send_ready: !/send-ready/.test(errors.join()) },
  };
}

// Phase 22: sales (Revenue) vs delivery (Delivery) vs product output consistency.
export function salesDeliveryConsistency(productId) {
  const p = product(productId);
  if (!p) return { ok: false, error: `unknown product ${productId}` };
  const pb = playbook(productId);
  const findings = [];
  // Promise (deliverables sold) vs delivery playbook deliverables.
  const sold = new Set((p.deliverables || []).map((d) => d.toLowerCase()));
  const delivered = new Set(((pb && pb.deliverables) || []).map((d) => d.toLowerCase()));
  if (pb && pb.deliverables) {
    for (const d of sold) if (![...delivered].some((x) => x.includes(d.split(' ')[0]))) findings.push({ type: 'promise_not_in_delivery', item: d });
    for (const d of delivered) if (![...sold].some((x) => x.includes(d.split(' ')[0]))) findings.push({ type: 'delivered_not_sold', item: d });
  } else {
    findings.push({ type: 'no_delivery_playbook', item: productId });
  }
  // Price exists but scope missing.
  if (p.price.status !== 'UNKNOWN' && !(p.scope_included || []).length) findings.push({ type: 'price_without_scope', item: productId });
  // Acceptance present?
  if (!(p.acceptance_criteria || []).length) findings.push({ type: 'no_acceptance', item: productId });
  return { ok: findings.length === 0, product_id: productId, findings, note: 'Consistency check across Revenue/Delivery (read-only).' };
}

// Phase 23: price / cost / capacity consistency.
export function priceCostCapacity(productId, econ = {}) {
  const p = product(productId);
  if (!p) return { ok: false, error: `unknown product ${productId}` };
  const price = p.price.amount ?? p.price.amount_min ?? null;
  const ownerHours = p.owner_hours ?? null;
  let verdict = 'unknown';
  const reasons = [];
  // Margin verdict takes precedence when economics provided (even if catalog price is a range/unknown).
  if (econ.margin_pct != null) {
    if (econ.margin_pct < 0) { verdict = 'high_risk'; reasons.push('negative margin'); }
    else if (econ.margin_pct < 20) { verdict = 'underpriced'; reasons.push('margin < 20%'); }
    else verdict = 'viable';
  } else if (price == null || p.price.status === 'UNKNOWN') { verdict = 'unknown'; reasons.push('price unknown / status UNKNOWN'); }
  else { verdict = 'owner_decision_required'; reasons.push('economics not provided'); }
  if (ownerHours == null) reasons.push('owner hours unknown -> capacity unclear');
  return {
    product_id: productId, price, price_status: p.price.status,
    owner_hours: ownerHours, verdict, reasons,
    note: 'No new approved prices. Recommendation only.',
  };
}
