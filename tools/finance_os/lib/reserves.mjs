// tools/finance_os/lib/reserves.mjs
// Phase 16-17: Reserve Engine + Tax Planning Model. Separates policy target / available / shortfall.
import { round2 } from './common.mjs';

export const RESERVE_CATEGORIES = ['tax', 'emergency', 'warranty_support', 'refund', 'project_risk', 'equipment', 'software_api', 'debt_service', 'owner_minimum_income'];

// reserves: [{category, policy_target, current_available, confidence}]
export function evaluateReserves(reserves) {
  const out = reserves.map((r) => {
    const target = r.policy_target ?? null;
    const available = r.current_available ?? null;
    const shortfall = (target != null && available != null) ? Math.max(0, round2(target - available)) : null;
    return {
      category: r.category,
      policy_target: target ?? 'UNKNOWN',
      current_available: available ?? 'UNKNOWN',
      shortfall: shortfall != null ? shortfall : 'UNKNOWN',
      status: shortfall == null ? 'UNKNOWN' : (shortfall > 0 ? 'SHORTFALL' : 'OK'),
      confidence: r.confidence || 'MODEL_ESTIMATE',
    };
  });
  return {
    label: 'MANAGERIAL_INTERNAL',
    reserves: out,
    shortfalls: out.filter((r) => r.status === 'SHORTFALL').map((r) => r.category),
  };
}

// Tax planning — configurable, NOT legal advice. Rate/regime must be supplied; not hard-coded.
// input: { tax_regime, tax_base_method, rate, taxable_base, payment_frequency, source, as_of }
export function taxEstimate(input) {
  const warnings = ['ESTIMATE — VERIFY WITH ACCOUNTANT'];
  const missing = [];
  if (input.rate == null) missing.push('rate');
  if (input.taxable_base == null) missing.push('taxable_base');
  if (!input.tax_regime) missing.push('tax_regime');

  let reserve = null;
  if (input.rate != null && input.taxable_base != null) {
    reserve = round2(input.taxable_base * input.rate);
  }
  return {
    label: 'ESTIMATE — VERIFY WITH ACCOUNTANT',
    tax_regime: input.tax_regime || 'UNKNOWN',
    tax_base_method: input.tax_base_method || 'UNKNOWN',
    rate: input.rate ?? 'UNKNOWN',
    taxable_base: input.taxable_base ?? 'UNKNOWN',
    estimated_reserve: reserve != null ? reserve : 'UNKNOWN',
    payment_frequency: input.payment_frequency || 'UNKNOWN',
    source: input.source || 'UNKNOWN',
    status: missing.length ? 'UNKNOWN' : 'ESTIMATE',
    missing_data: missing,
    warnings,
    note: 'Tax rates/rules are external/configurable. Not hard-coded as permanent fact. Not tax/legal advice.',
  };
}
