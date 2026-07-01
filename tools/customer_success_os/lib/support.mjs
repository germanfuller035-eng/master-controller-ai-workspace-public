// tools/customer_success_os/lib/support.mjs
// Phase 14-17: Support request system + triage + boundary + SLA model.
import { readFileSync } from 'node:fs';
import { REVENUE_CATALOG, SEVERITY, SUPPORT_BOUNDARY } from './common.mjs';

let CAT = null;
function product(id) { if (!CAT) CAT = JSON.parse(readFileSync(REVENUE_CATALOG, 'utf8')); return CAT.products.find((p) => p.product_id === id) || null; }

export const CATEGORIES = ['how_to', 'defect', 'configuration', 'access', 'content', 'performance', 'data', 'integration', 'billing_reference', 'scope_question', 'change_request', 'training', 'security', 'privacy', 'outage', 'other'];

// Phase 15: triage a support request. Never auto-resolves security/privacy.
export function triage(req, opts = {}) {
  const flags = [];
  if (!req.customer_ref_id) flags.push('missing_customer_reference');
  if (!req.product_id) flags.push('missing_product');
  if (opts.seenHashes && req.dedupe_hash && opts.seenHashes.includes(req.dedupe_hash)) flags.push('duplicate_ticket');

  // Category-driven classification.
  const isSecurity = /security|privacy|breach|leak|gdpr|данны/i.test(req.description || '') || ['security', 'privacy'].includes(req.category);
  const isChangeReq = /add|new feature|also want|добавить|доработать|новый раздел|ещё одну/i.test(req.description || '') || req.category === 'change_request';
  const isBilling = req.category === 'billing_reference' || /invoice|payment|счет|оплат/i.test(req.description || '');
  const isOutage = req.category === 'outage' || /down|not working|broken|упал|не работает/i.test(req.description || '');

  let kind = 'support';
  if (isChangeReq) kind = 'change_request';
  else if (req.category === 'defect' || isOutage) kind = 'defect';

  // Severity (evidence-based; outage/security default higher).
  let severity = req.severity || 'SEV4_LOW';
  if (isOutage) severity = 'SEV1_CRITICAL';
  else if (isSecurity) severity = 'SEV2_HIGH';
  else if (req.category === 'defect') severity = 'SEV3_MEDIUM';
  else if (req.category === 'how_to' || req.category === 'training') severity = 'QUESTION';

  return {
    support_request_id: req.support_request_id,
    category: req.category, severity,
    product: req.product_id || null,
    likely_owner: kind === 'change_request' ? 'revenue/delivery' : 'owner',
    kind, // support | defect | change_request
    evidence_required: kind === 'defect' || isSecurity,
    safe_next_action: isSecurity ? 'escalate to owner; do NOT auto-resolve' : (isChangeReq ? 'route to change request (new offer)' : 'acknowledge + gather details'),
    response_sla_recommendation: { SEV1_CRITICAL: '1h', SEV2_HIGH: '4h', SEV3_MEDIUM: '1 business day', SEV4_LOW: '2 business days', QUESTION: '2 business days' }[severity],
    escalation: severity === 'SEV1_CRITICAL' || isSecurity,
    flags,
    auto_resolve_blocked: isSecurity,
    note: 'No client communication. Security/privacy never auto-resolved.',
  };
}

// Phase 16: support boundary classification (against scope, with evidence).
export function classifyBoundary(req, productId) {
  const p = product(productId);
  if (!p) return { boundary: 'UNKNOWN', owner_review_required: true, reason: 'unknown product' };
  const text = (req.description || '').toLowerCase();
  const excluded = (p.scope_excluded || []).some((x) => text.includes(x.split(' ')[0].toLowerCase()));
  let boundary = 'UNKNOWN';
  if (/add|new|доработ|добавить/.test(text)) boundary = 'CHANGE_REQUEST';
  else if (req.category === 'defect') boundary = 'DEFECT';
  else if (req.category === 'training' || req.category === 'how_to') boundary = 'TRAINING';
  else if (excluded) boundary = 'OUT_OF_SCOPE';
  else if (req.within_support_period) boundary = 'INCLUDED_SUPPORT';
  return {
    boundary,
    owner_review_required: boundary === 'UNKNOWN',
    evidence: req.evidence || null,
    note: 'Not classified against customer without evidence. UNKNOWN requires owner review.',
  };
}

// Phase 17: SLA model. Targets are not contractual unless owner-approved. Capacity validator.
export function slaModel(input) {
  const errors = [];
  const status = input.owner_approved ? (input.contractual ? 'CONTRACTUAL' : 'OWNER_APPROVED') : 'INTERNAL_TARGET';
  if (input.implies_247 && !input.has_247_coverage) errors.push('24/7 implied without coverage');
  if (input.resolution_target && input.third_party_dependency) errors.push('resolution target depends on third party');
  if (!input.severity_defined) errors.push('severity undefined');
  if (!input.support_window) errors.push('support window missing');
  if (input.promised_response_hours != null && input.owner_capacity_hours_per_week != null && input.promised_response_hours < 1 && input.owner_capacity_hours_per_week < 10) errors.push('promised SLA exceeds owner capacity');
  return {
    status,
    targets: { response: input.response_target || 'UNKNOWN', triage: input.triage_target || 'UNKNOWN', resolution: input.resolution_target || 'UNKNOWN', workaround: input.workaround_target || 'UNKNOWN', update_frequency: input.update_frequency || 'UNKNOWN' },
    capacity_errors: errors,
    ok: errors.length === 0,
    note: 'Targets not contractual unless owner-approved. Do not promise SLA beyond capacity.',
  };
}
