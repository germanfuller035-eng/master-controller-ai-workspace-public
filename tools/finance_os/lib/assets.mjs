// tools/finance_os/lib/assets.mjs
// Phase 20-21: Business Unit model loader + Asset/Liability register. Sensitive details excluded.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FINANCE_ROOT, round2 } from './common.mjs';

let UNITS = null;
export function loadUnits() {
  if (!UNITS) UNITS = JSON.parse(readFileSync(path.join(FINANCE_ROOT, 'data/business_units.json'), 'utf8'));
  return UNITS.units;
}
export function unitSummary() {
  return loadUnits().map((u) => ({
    business_unit_id: u.business_unit_id, name: u.name, status: u.status,
    monthly_target: u.monthly_target.status === 'UNKNOWN' ? 'UNKNOWN' : `${u.monthly_target.amount} (${u.monthly_target.status})`,
    confirmed_revenue: u.confirmed_revenue.status === 'UNKNOWN' ? 'UNKNOWN' : `${u.confirmed_revenue.amount} (${u.confirmed_revenue.status})`,
    confidence: u.confidence,
  }));
}

export const ASSET_CATEGORIES = ['cash_reference', 'receivable', 'equipment', 'software_license', 'property_reference', 'business_inventory', 'deposits', 'crypto_reference', 'intellectual_property'];
export const LIABILITY_CATEGORIES = ['payables', 'loans', 'taxes', 'refunds', 'contractor_commitments', 'subscriptions', 'project_obligations'];

// items: [{category, label, valuation:{amount,status}, sensitive}]
// Sensitive items: included as category + label only, valuation status forced UNKNOWN in output.
export function buildRegister(assets, liabilities) {
  const clean = (items, allowed) => items.map((it) => {
    const valid = allowed.includes(it.category);
    const sensitive = it.sensitive === true;
    return {
      category: it.category,
      label: sensitive ? '(sensitive — reference only)' : it.label,
      valuation: sensitive ? { amount: null, status: 'UNKNOWN' } : (it.valuation || { amount: null, status: 'UNKNOWN' }),
      valid_category: valid,
    };
  });
  const cleanAssets = clean(assets || [], ASSET_CATEGORIES);
  const cleanLiab = clean(liabilities || [], LIABILITY_CATEGORIES);
  const sumKnown = (items) => items.filter((i) => i.valuation.amount != null && i.valuation.status !== 'UNKNOWN').reduce((s, i) => s + i.valuation.amount, 0);

  return {
    label: 'MANAGERIAL_INTERNAL (estimates are not official valuation)',
    assets: cleanAssets,
    liabilities: cleanLiab,
    totals: {
      assets_known: round2(sumKnown(cleanAssets)),
      liabilities_known: round2(sumKnown(cleanLiab)),
      net_known: round2(sumKnown(cleanAssets) - sumKnown(cleanLiab)),
      note: 'Only CONFIRMED/estimate-with-value items summed. Sensitive + UNKNOWN excluded from totals.',
    },
  };
}
