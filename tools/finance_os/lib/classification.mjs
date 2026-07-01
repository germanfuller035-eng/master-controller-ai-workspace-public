// tools/finance_os/lib/classification.mjs
// Phase 4: Financial Data Classification. Blocks money-category confusion + status misuse.
import { DATA_STATUS, MONEY_KINDS } from './common.mjs';

// Rules that must never be violated (kindA must not be treated as kindB).
const CONFUSION_RULES = [
  ['forecast', 'booked_revenue'], ['invoiced', 'payment'], ['payment', 'profit'],
  ['profit', 'cash_balance'], ['target', 'booked_revenue'], ['credit_availability', 'booked_revenue'],
  ['asset_valuation', 'cash_balance'], ['personal_funds', 'booked_revenue'],
];

// Validate a typed amount object.
export function validateAmount(a, label = 'amount') {
  const errors = [];
  if (!a || typeof a !== 'object') return { ok: false, errors: [`${label}: not an object`] };
  if (!DATA_STATUS.includes(a.status)) errors.push(`${label}: invalid status ${a.status}`);
  if (a.amount != null && typeof a.amount !== 'number') errors.push(`${label}: amount not numeric`);
  if (!a.currency) errors.push(`${label}: missing currency`);
  // A CONFIRMED amount must have a source.
  if (a.status === 'CONFIRMED' && !a.source) errors.push(`${label}: CONFIRMED without source`);
  // Owner-target/forecast/estimate cannot be approved as a confirmed result.
  if ((a.status === 'OWNER_TARGET' || a.status === 'MODEL_ESTIMATE') && a.approved_by_owner && a.treated_as === 'CONFIRMED') {
    errors.push(`${label}: ${a.status} cannot be treated as CONFIRMED`);
  }
  return { ok: errors.length === 0, errors };
}

// Validate that a value of kind `actualKind` is not being labeled/used as `claimedKind`.
export function checkKindConfusion(actualKind, claimedKind) {
  const errors = [];
  if (!MONEY_KINDS.includes(actualKind)) errors.push(`unknown money kind ${actualKind}`);
  for (const [a, b] of CONFUSION_RULES) {
    if (actualKind === a && claimedKind === b) errors.push(`category confusion: ${a} treated as ${b}`);
  }
  return { ok: errors.length === 0, errors };
}

// Validate a record that asserts a result. e.g. {kind:'forecast', confirmed:true} is illegal.
export function validateResultAssertion(rec) {
  const errors = [];
  if ((rec.kind === 'forecast' || rec.kind === 'target') && rec.confirmed === true) {
    errors.push(`${rec.kind} labelled confirmed=true is forbidden`);
  }
  if (rec.kind === 'asset_valuation' && rec.counted_as_cash === true) errors.push('asset valuation counted as cash');
  if (rec.kind === 'credit_availability' && rec.counted_as_income === true) errors.push('credit availability counted as income');
  if (rec.kind === 'personal_funds' && rec.counted_as_business_revenue === true) errors.push('personal funds counted as business revenue');
  return { ok: errors.length === 0, errors };
}
