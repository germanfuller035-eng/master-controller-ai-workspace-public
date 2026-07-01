// tools/product_os/lib/claims.mjs
// Phase 6: Product Claims Catalog + validator. Blocks prohibited promises in client-ready assets.

// Prohibited promise patterns (Cyrillic-safe: no \b).
const PROHIBITED = [
  { re: /(гаранти|guarantee)/i, why: 'guaranteed_outcome' },
  { re: /(рост продаж|рост заявок|увеличим продажи|increase (sales|leads)|guaranteed growth)/i, why: 'guaranteed_growth' },
  { re: /(рост конверс|guaranteed conversion)/i, why: 'guaranteed_conversion' },
  { re: /(в топ|top ranking|выведем в топ)/i, why: 'guaranteed_ranking' },
  { re: /(окупаемост|payback|вернём вложения)/i, why: 'guaranteed_payback' },
  { re: /(полностью автоматическ|fully automatic)/i, why: 'unproven_full_automation' },
  { re: /(заменяет сотрудник|replaces an employee|заменит менеджера)/i, why: 'unproven_replacement' },
  { re: /(без участия владельца|without owner involvement|без вашего участия)/i, why: 'unproven_no_owner' },
];

// Classify a claim. Returns the strict type + whether allowed.
export function classifyClaim(claim) {
  for (const p of PROHIBITED) if (p.re.test(claim.claim || '')) {
    return { ...claim, claim_type: 'PROHIBITED', prohibited_reason: p.why, allowed_in_sales: false, allowed_in_delivery: false };
  }
  return claim;
}

// Validate a single claim. FACT requires evidence; PROHIBITED never client-ready.
export function validateClaim(claim) {
  const errors = [];
  const c = classifyClaim(claim);
  if (c.claim_type === 'PROHIBITED') errors.push(`prohibited claim (${c.prohibited_reason})`);
  if (c.claim_type === 'FACT' && !c.evidence) errors.push('FACT claim without evidence');
  if (c.claim_type === 'FACT' && c.allowed_in_sales && !c.owner_approved) errors.push('FACT in sales without owner approval');
  return { ok: errors.length === 0, errors, classified_type: c.claim_type };
}

// Build a claims catalog for a product (default safe claims). No invented results.
export function buildClaimsCatalog(productId, productName) {
  return {
    product_id: productId,
    allowed_facts: [`${productName} delivers the defined scope deliverables`],
    allowed_inferences: ['Addressing verified findings may improve the customer path to a request'],
    allowed_hypotheses: ['It is worth testing whether the fixes affect conversion'],
    prohibited: ['guaranteed revenue/lead/conversion growth', 'guaranteed ranking/payback', 'full automation / employee replacement without proof'],
    required_evidence: ['verified delivery output', 'pilot result'],
    owner_approval_status: 'PENDING',
  };
}

// Validate a client-ready asset body for prohibited claims (hard block).
export function scanAssetForProhibited(text) {
  const hits = [];
  for (const p of PROHIBITED) if (p.re.test(text || '')) hits.push(p.why);
  return { ok: hits.length === 0, prohibited_hits: hits };
}
