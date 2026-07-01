// tools/revenue_os/lib/recommend.mjs
// Phase 6: Product Recommendation Engine. Deterministic. Uses real product readiness.
// Never offers a PLANNED product as fully client-ready. No outreach generation.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REVENUE_ROOT, isClientOfferable } from './common.mjs';
import { classifyMaturity, MATURITY_MODEL } from './maturity.mjs';

let CATALOG = null;
export function loadCatalog(file) {
  const p = file || path.join(REVENUE_ROOT, 'data/product_catalog.json');
  CATALOG = JSON.parse(readFileSync(p, 'utf8'));
  return CATALOG;
}
function products() { if (!CATALOG) loadCatalog(); return CATALOG.products; }
function byId(id) { return products().find((p) => p.product_id === id) || null; }

const MANUAL_REVIEW_THRESHOLD = 0.5;

// Recommend products for a customer profile. Returns Recommendation object.
export function recommend(profile) {
  const reasonCodes = [];
  const blockers = [];

  // 1. Classify maturity (evidence-backed).
  const mat = classifyMaturity(profile);
  reasonCodes.push(`maturity:${mat.status}`);
  mat.reasons.forEach((r) => reasonCodes.push(`maturity_reason:${r}`));

  // 2. Opt-out hard stop.
  if (profile.opted_out === true) {
    return rec(profile, null, null, ['opted_out'], ['opted_out'], 0, false, 'Do not contact. Honor opt-out. No follow-up.', []);
  }

  // 3. Unknown maturity -> no confident product, manual review.
  if (mat.status === 'UNKNOWN') {
    blockers.push('insufficient_evidence');
    return rec(profile, null, null, [...reasonCodes, 'no_product:insufficient_evidence'], blockers, mat.confidence, true,
      MATURITY_MODEL.UNKNOWN.next_diagnostic, []);
  }

  const model = MATURITY_MODEL[mat.status];
  const eligibleIds = model.eligible_products;
  const doNotOffer = [...model.ineligible_products];

  // 4. Filter by real readiness. Offerable now vs needs-pilot/draft.
  const ranked = eligibleIds.map(byId).filter(Boolean).map((p) => ({
    id: p.product_id,
    status: p.status,
    offerable: isClientOfferable(p.status),
    entry: p.entry_product,
  }));

  // Prefer: offerable + entry first, then offerable, then others (flagged not-ready).
  ranked.sort((a, b) => {
    const score = (x) => (x.offerable ? 0 : 2) + (x.entry ? -0.5 : 0);
    return score(a) - score(b);
  });

  const offerableRanked = ranked.filter((r) => r.offerable);
  const notReady = ranked.filter((r) => !r.offerable).map((r) => r.id);

  let primary = null, secondary = null;
  if (offerableRanked.length) {
    primary = offerableRanked[0].id;
    secondary = offerableRanked[1] ? offerableRanked[1].id : (ranked[1] ? ranked[1].id : null);
  } else if (ranked.length) {
    // Only not-ready products fit -> recommend as internal/manual, never client-ready.
    primary = ranked[0].id;
    blockers.push(`primary_product_not_client_ready:${ranked[0].status}`);
    reasonCodes.push('manual_review:no_active_product_for_segment');
  }

  // 5. Confidence + manual review.
  let confidence = mat.confidence;
  if (profile.budget_signal === 'unknown' || !profile.budget_signal) reasonCodes.push('budget_unknown');
  if (profile.owner_capacity === 'unavailable') { blockers.push('owner_capacity_unavailable'); reasonCodes.push('capacity_blocker'); }
  const manualReview = mat.manual_review || confidence < MANUAL_REVIEW_THRESHOLD || blockers.length > 0 || offerableRanked.length === 0;

  // 6. No-pressure next action.
  const primaryProduct = primary ? byId(primary) : null;
  let nextAction;
  if (!primary) nextAction = 'No product recommended yet — gather evidence; no outreach.';
  else if (!isClientOfferable(primaryProduct.status)) nextAction = `Internal review only: ${primary} is ${primaryProduct.status}, not client-ready. Do not offer.`;
  else nextAction = `Prepare internal ${primary} offer draft (no send). Owner approval required before any contact.`;

  // Add do-not-offer for not-ready in this segment too.
  notReady.forEach((id) => { if (!doNotOffer.includes(id)) doNotOffer.push(`${id}:not_ready`); });

  const priceRange = primaryProduct ? priceLabel(primaryProduct) : null;
  return rec(profile, primary, secondary, reasonCodes, blockers, confidence, manualReview, nextAction, doNotOffer, priceRange);
}

function priceLabel(p) {
  const pr = p.price;
  if (pr.type === 'free') return 'free';
  if (pr.amount != null) return `${pr.amount} ${pr.currency} (${pr.status})`;
  if (pr.amount_min != null && pr.amount_max != null) return `${pr.amount_min}-${pr.amount_max} ${pr.currency} (${pr.status})`;
  return `UNKNOWN (${pr.status})`;
}

function rec(profile, primary, secondary, reasonCodes, blockers, confidence, manualReview, nextAction, doNotOffer, priceRange = null) {
  return {
    recommendation_id: `rec_${profile.profile_id}`,
    customer_profile: profile.profile_id,
    primary_product: primary,
    secondary_product: secondary,
    do_not_offer: doNotOffer,
    reason_codes: reasonCodes,
    evidence: profile.evidence || [],
    confidence: Math.round(confidence * 100) / 100,
    blockers,
    manual_review: manualReview,
    price_range: priceRange,
    recommended_next_action: nextAction,
  };
}
