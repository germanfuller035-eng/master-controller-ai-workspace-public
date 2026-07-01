// tools/revenue_os/lib/evidence.mjs
// Phase 7: Evidence Quality Gate. A FACT claim must have a source; forbidden claims are blocked.
// Separates FACT / INFERENCE / HYPOTHESIS. Deterministic.

import { validate } from './schema.mjs';
import { EvidenceClaimSchema } from '../schemas/domain.mjs';

// Forbidden assertions (cannot be stated as FACT, and some never allowed at all).
// Note: no \b word boundaries — JS \b does not work with Cyrillic.
const FORBIDDEN_FACT_PATTERNS = [
  { re: /(гаранти|guarantee)/i, why: 'guarantee_claim' },
  { re: /(увеличим|увеличит|вырастут заявки|рост продаж|рост заявок|increase (sales|leads)|ROI|окупаемост)/i, why: 'growth_promise' },
  { re: /(в топ|выведем в топ|top rankings)/i, why: 'ranking_promise' },
  { re: /(без штраф|no fines|избежать штраф)/i, why: 'legal_no_fines' },
  { re: /(юридическое заключение|legal opinion)/i, why: 'legal_opinion' },
  { re: /(теряете клиентов|losing customers|теряете деньги)/i, why: 'unproven_loss' },
];

// Claims that REQUIRE a checked source if stated as FACT (verification-required categories).
const VERIFY_REQUIRED = [
  /нет формы|no form|отсутствует форма/i,
  /нет мобильн|not mobile|no mobile/i,
  /медленн|slow|низкая скорость|low speed/i,
  /нет https|no https|без https/i,
  /нет email|no email|email отсутствует/i,
  /decision maker|лицо принимающее реш/i,
];

// Validate a single evidence claim. Returns {ok, errors[], warnings[]}.
export function checkClaim(claim) {
  const errors = [];
  const warnings = [];
  const shape = validate(claim, EvidenceClaimSchema, 'claim');
  if (!shape.ok) errors.push(...shape.errors);

  const text = claim.claim || '';

  // Forbidden claims: never allowed as FACT; flagged anywhere.
  for (const f of FORBIDDEN_FACT_PATTERNS) {
    if (f.re.test(text)) {
      if (claim.claim_type === 'FACT') errors.push(`forbidden FACT (${f.why}): claims cannot assert this as fact`);
      else warnings.push(`claim references ${f.why}; ensure framed as inference/hypothesis only`);
    }
  }

  // FACT claims need a verifiable source + checked_at + excerpt.
  if (claim.claim_type === 'FACT') {
    if (!claim.source_url && claim.source_type !== 'direct_observation') errors.push('FACT without source_url');
    if (!claim.checked_at) errors.push('FACT without checked_at timestamp');
    if (!claim.evidence_excerpt) warnings.push('FACT without evidence_excerpt');
    if (VERIFY_REQUIRED.some((re) => re.test(text)) && !claim.source_url) {
      errors.push('verification-required FACT (absence/measurement claim) without source_url');
    }
    if (claim.confidence < 0.6) warnings.push(`FACT with low confidence (${claim.confidence})`);
  }

  // Stale evidence.
  if (claim.freshness === 'stale') warnings.push('evidence is stale — re-verify before use');

  return { ok: errors.length === 0, errors, warnings };
}

// Validate a list of claims; aggregate.
export function checkClaims(claims) {
  const results = claims.map((c, i) => ({ index: i, claim: c.claim, ...checkClaim(c) }));
  const failed = results.filter((r) => !r.ok);
  return {
    ok: failed.length === 0,
    total: claims.length,
    failed: failed.length,
    facts: claims.filter((c) => c.claim_type === 'FACT').length,
    inferences: claims.filter((c) => c.claim_type === 'INFERENCE').length,
    hypotheses: claims.filter((c) => c.claim_type === 'HYPOTHESIS').length,
    results,
  };
}

// Helper: detect a guessed/unverified email used as a recipient.
export function isGuessedEmail(email, evidence) {
  if (!email) return false;
  const verified = (evidence || []).some((e) =>
    (e.category === 'contact' || e.category === 'identity') &&
    e.claim_type === 'FACT' && e.source_url && (e.evidence_excerpt || '').includes(email));
  // Common guess patterns.
  const guessy = /^(info|sales|admin|office|mail|hello|contact)@/i.test(email);
  return !verified && guessy;
}
