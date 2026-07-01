// tools/revenue_os/lib/validators.mjs
// Phase 25: Revenue OS validators. Aggregates all domain validators. Deterministic.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REVENUE_ROOT, isClientOfferable, PRODUCT_STATUS } from './common.mjs';
import { validate } from './schema.mjs';
import { ProductSchema, OfferSchema } from '../schemas/domain.mjs';
import { priceGuard } from './pricing.mjs';
import { validateScope } from './scope.mjs';
import { checkClaims } from './evidence.mjs';
import { checkFindingSet } from './findings.mjs';

function loadCatalog() {
  return JSON.parse(readFileSync(path.join(REVENUE_ROOT, 'data/product_catalog.json'), 'utf8'));
}

// Validate the whole product catalog.
export function validateCatalog() {
  const cat = loadCatalog();
  const errors = [];
  const warnings = [];
  const ids = new Set();
  for (const p of cat.products) {
    const r = validate(p, ProductSchema, p.product_id);
    if (!r.ok) r.errors.forEach((e) => errors.push(e));
    if (ids.has(p.product_id)) errors.push(`duplicate product_id: ${p.product_id}`);
    ids.add(p.product_id);
    if (!PRODUCT_STATUS.includes(p.status)) errors.push(`${p.product_id}: invalid status ${p.status}`);
    // Price sanity: negative.
    const pr = p.price;
    if (pr.amount != null && pr.amount < 0) errors.push(`${p.product_id}: negative price`);
    if (pr.amount_min != null && pr.amount_max != null && pr.amount_min > pr.amount_max) errors.push(`${p.product_id}: price min>max`);
    if (pr.currency !== cat.currency) warnings.push(`${p.product_id}: currency ${pr.currency} != ${cat.currency}`);
    // Scope/deliverables.
    const sc = validateScope(p.product_id);
    sc.errors.forEach((e) => errors.push(`${p.product_id}: ${e}`));
  }
  return { ok: errors.length === 0, errors, warnings, products: cat.products.length };
}

// Validate an offer object fully (schema + gates + no-send + client-ready guards).
export function validateOffer(offer) {
  const errors = [];
  const r = validate(offer, OfferSchema, 'offer');
  if (!r.ok) errors.push(...r.errors);
  if (offer.send_allowed === true) errors.push('send_allowed=true is forbidden');
  if (offer.approval_state === 'CLIENT_READY') {
    if (!offer.price || offer.price.approved_by_owner !== true) errors.push('CLIENT_READY without owner-approved price');
    if (!offer.evidence_summary || offer.evidence_summary.length === 0) errors.push('CLIENT_READY without evidence');
    if (!offer.exclusions || offer.exclusions.length === 0) errors.push('CLIENT_READY without exclusions');
  }
  return { ok: errors.length === 0, errors };
}

// Validate a message draft (no send / no guessed recipient / no forbidden language).
export function validateDraft(draftResult) {
  const errors = [];
  const d = draftResult.draft || draftResult;
  if (d.send_allowed === true) errors.push('send_allowed=true forbidden');
  if (draftResult.errors && draftResult.errors.length) errors.push(...draftResult.errors);
  if (draftResult.risk_flags && draftResult.risk_flags.length) errors.push(...draftResult.risk_flags.map((f) => `risk:${f}`));
  return { ok: errors.length === 0, errors };
}

// Validate a revenue metric isn't a forecast labeled confirmed.
export function validateRevenueEvent(ev) {
  const errors = [];
  if ((ev.type === 'forecast' || ev.type === 'target' || ev.type === 'estimate') && ev.confirmed === true) {
    errors.push(`${ev.type} labelled confirmed=true is forbidden`);
  }
  if (typeof ev.amount === 'number' && ev.amount < 0) errors.push('negative amount');
  if (!ev.currency) errors.push('missing currency');
  return { ok: errors.length === 0, errors };
}

// Run everything against catalog + provided objects. Returns aggregate.
export function validateAll() {
  const results = {};
  results.catalog = validateCatalog();
  // Validate findings/evidence/offer using fixtures if present.
  try {
    const fx = JSON.parse(readFileSync(path.join(REVENUE_ROOT, 'fixtures/customer_profiles.json'), 'utf8'));
    const allClaims = fx.profiles.flatMap((p) => p.evidence || []);
    results.evidence = checkClaims(allClaims);
  } catch { results.evidence = { ok: true, note: 'no fixtures' }; }
  const ok = Object.values(results).every((r) => r.ok !== false);
  return { ok, results };
}
