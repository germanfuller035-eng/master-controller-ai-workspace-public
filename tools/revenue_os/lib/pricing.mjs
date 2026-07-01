// tools/revenue_os/lib/pricing.mjs
// Phase 10: Pricing Engine. Never auto-changes prices. Computes internal economics + price guard.
// Estimates are never returned as confirmed prices.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REVENUE_ROOT, CURRENCY } from './common.mjs';

let CATALOG = null;
function product(id) {
  if (!CATALOG) CATALOG = JSON.parse(readFileSync(path.join(REVENUE_ROOT, 'data/product_catalog.json'), 'utf8'));
  return CATALOG.products.find((p) => p.product_id === id) || null;
}

// Default internal economics assumptions (editable; clearly an ESTIMATE).
export const ECONOMICS_ASSUMPTIONS = {
  owner_hourly_value: 3000,      // RUB/hour internal opportunity cost (ESTIMATE)
  ai_hourly_cost: 100,           // RUB/hour tooling (ESTIMATE)
  direct_cost_ratio: 0.05,       // % of price as direct cost (ESTIMATE)
  risk_reserve_ratio: 0.1,       // % reserve (ESTIMATE)
};

// Resolve a price for display. NEVER promotes estimate->confirmed.
export function resolvePrice(productId) {
  const p = product(productId);
  if (!p) return { ok: false, error: `unknown product ${productId}` };
  const pr = p.price;
  return {
    ok: true,
    product_id: productId,
    type: pr.type,
    amount: pr.amount ?? null,
    amount_min: pr.amount_min ?? null,
    amount_max: pr.amount_max ?? null,
    currency: pr.currency,
    status: pr.status,         // CONFIRMED / OWNER_TARGET / ESTIMATE / UNKNOWN
    approved_by_owner: pr.approved_by_owner,
    display: priceDisplay(pr),
  };
}

function priceDisplay(pr) {
  if (pr.type === 'free') return 'free';
  if (pr.amount != null) return `${pr.amount} ${pr.currency}`;
  if (pr.amount_min != null && pr.amount_max != null) return `${pr.amount_min}–${pr.amount_max} ${pr.currency}`;
  return `UNKNOWN`;
}

// Internal economics for a product (all values labeled as estimate unless hours are known).
export function economics(productId, overrides = {}) {
  const p = product(productId);
  if (!p) return { ok: false, error: `unknown product ${productId}` };
  const a = { ...ECONOMICS_ASSUMPTIONS, ...overrides };
  const price = p.price.amount ?? p.price.amount_min ?? null;
  const ownerHours = p.owner_hours ?? null;
  const totalHours = p.estimated_hours ?? null;
  const aiHours = (totalHours != null && ownerHours != null) ? Math.max(0, totalHours - ownerHours) : null;

  const ownerCost = ownerHours != null ? ownerHours * a.owner_hourly_value : null;
  const aiCost = aiHours != null ? aiHours * a.ai_hourly_cost : null;
  const directCost = price != null ? price * a.direct_cost_ratio : null;
  const riskReserve = price != null ? price * a.risk_reserve_ratio : null;
  const totalCost = [ownerCost, aiCost, directCost, riskReserve].every((x) => x != null)
    ? ownerCost + aiCost + directCost + riskReserve : null;
  const grossMargin = (price != null && totalCost != null) ? price - totalCost : null;
  const marginPct = (grossMargin != null && price) ? Math.round((grossMargin / price) * 100) : null;
  const revPerOwnerHour = (price != null && ownerHours) ? Math.round(price / ownerHours) : null;

  return {
    ok: true,
    product_id: productId,
    currency: CURRENCY,
    price_basis: price != null ? price : 'UNKNOWN',
    price_status: p.price.status,
    estimated_delivery_hours: totalHours ?? 'UNKNOWN',
    owner_hours: ownerHours ?? 'UNKNOWN',
    ai_hours: aiHours ?? 'UNKNOWN',
    direct_cost: directCost != null ? Math.round(directCost) : 'UNKNOWN',
    risk_reserve: riskReserve != null ? Math.round(riskReserve) : 'UNKNOWN',
    estimated_gross_margin: grossMargin != null ? Math.round(grossMargin) : 'UNKNOWN',
    estimated_margin_pct: marginPct != null ? marginPct : 'UNKNOWN',
    revenue_per_owner_hour: revPerOwnerHour != null ? revPerOwnerHour : 'UNKNOWN',
    label: 'MODEL_ESTIMATE (not confirmed financials)',
  };
}

// Price guard. Returns {ok, errors[], warnings[]}.
export function priceGuard(productId, proposed) {
  const p = product(productId);
  const errors = [];
  const warnings = [];
  if (!p) return { ok: false, errors: [`unknown product ${productId}`], warnings };
  const pr = p.price;

  if (proposed == null && pr.type !== 'free') {
    if (pr.status === 'UNKNOWN') errors.push('price missing/UNKNOWN — owner must define before any client use');
  }
  if (proposed != null) {
    if (typeof proposed !== 'number' || proposed < 0) errors.push('negative or non-numeric price');
    const min = pr.amount_min ?? (pr.amount != null ? pr.amount : null);
    const max = pr.amount_max ?? (pr.amount != null ? pr.amount : null);
    if (min != null && proposed < min) errors.push(`proposed ${proposed} below min ${min}`);
    if (max != null && proposed > max) errors.push(`proposed ${proposed} above max ${max}`);
  }
  // Expiry.
  if (pr.valid_until && pr.valid_until < (process.env.REVENUE_OS_NOW || '2026-06-17')) errors.push('price expired');
  // Approval requirement: any product needing approval must be owner-approved before client-ready.
  if (p.approval_required && !pr.approved_by_owner) warnings.push('price not owner-approved (required before client contact)');
  // Currency.
  if (pr.currency !== CURRENCY) warnings.push(`currency ${pr.currency} != system ${CURRENCY}`);
  // Estimate used as confirmed.
  if (pr.status === 'ESTIMATE') warnings.push('price is ESTIMATE — do not present as confirmed');

  return { ok: errors.length === 0, errors, warnings, status: pr.status, approved: pr.approved_by_owner };
}
