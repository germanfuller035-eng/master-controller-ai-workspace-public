// tools/finance_os/lib/separation.mjs
// Phase 19: Owner money separation policy + ambiguity validator. Does not enforce real transfers.

export const FLOW_TYPES = ['business_revenue', 'business_expense', 'owner_contribution', 'owner_draw', 'reimbursement', 'owner_salary', 'personal_debt', 'business_debt', 'tax_reserve', 'emergency_reserve'];

const PERSONAL = new Set(['owner_draw', 'owner_salary', 'personal_debt']);
const BUSINESS = new Set(['business_revenue', 'business_expense', 'business_debt', 'tax_reserve', 'emergency_reserve', 'reimbursement']);

// tx: { id, flow_type, scope:'business'|'personal'|'ambiguous', amount }
export function validateTransaction(tx) {
  const errors = [];
  const warnings = [];
  if (!FLOW_TYPES.includes(tx.flow_type)) errors.push(`unknown flow_type ${tx.flow_type}`);
  if (tx.scope === 'ambiguous') warnings.push('ambiguous personal/business — owner must classify');
  // Flow/scope mismatch.
  if (PERSONAL.has(tx.flow_type) && tx.scope === 'business') errors.push(`${tx.flow_type} marked business (should be personal)`);
  if (BUSINESS.has(tx.flow_type) && tx.scope === 'personal' && tx.flow_type !== 'owner_contribution') warnings.push(`${tx.flow_type} marked personal — verify`);
  return { ok: errors.length === 0, errors, warnings };
}

export const DECISION_CHECKLIST = [
  'Is this business revenue or owner contribution?',
  'Is this a business expense or personal expense?',
  'Is owner_draw recorded separately from business profit?',
  'Is the tax reserve set aside before owner_draw?',
  'Is personal debt kept out of business P&L?',
  'Is a business reimbursement documented with evidence?',
];

export function buildSeparationPolicy() {
  return {
    label: 'POLICY (no real transfers enforced)',
    rule: 'Business and personal money flows are tracked separately. Owner draw is post-tax-reserve and post-profit, not revenue.',
    flow_types: FLOW_TYPES,
    decision_checklist: DECISION_CHECKLIST,
  };
}
