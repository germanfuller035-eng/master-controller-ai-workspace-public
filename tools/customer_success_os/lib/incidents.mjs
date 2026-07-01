// tools/customer_success_os/lib/incidents.mjs
// Phase 18-21: Incident management + known issues + knowledge base + support draft factory.
import { INCIDENT_STATUS } from './common.mjs';
import { scanAssetForProhibited } from '../../product_os/lib/claims.mjs';

const INCIDENT_TRANSITIONS = {
  DETECTED: ['TRIAGED'], TRIAGED: ['MITIGATING'], MITIGATING: ['MONITORING'], MONITORING: ['RESOLVED'],
  RESOLVED: ['POSTMORTEM'], POSTMORTEM: ['CLOSED'], CLOSED: [],
};

// Phase 18: incident lifecycle. Synthetic only, no real messages.
export function incidentTransition(from, to) {
  if (!INCIDENT_STATUS.includes(from) || !INCIDENT_STATUS.includes(to)) return { ok: false, error: 'unknown state' };
  const allowed = INCIDENT_TRANSITIONS[from] || [];
  return { ok: allowed.includes(to), allowed, error: allowed.includes(to) ? null : `illegal ${from}->${to}` };
}
export function buildIncident(input) {
  return {
    incident_id: input.incident_id, customer_ref_id: input.customer_ref_id || null, product_id: input.product_id || null,
    severity: input.severity, impact: input.impact, status: 'DETECTED',
    timeline: [], mitigation: null, root_cause: null, resolution: null,
    customer_communication_draft: { label: 'INTERNAL_DRAFT', send_allowed: false, body: 'incident update (draft, not sent)' },
    owner_decision_required: true, lessons: [], test_only: true,
    note: 'No real incident messages. No production monitoring integration.',
  };
}

// Phase 19: known issue register.
export function evaluateKnownIssue(issue) {
  const errors = [];
  if (issue.fixed && !issue.fixed_version) errors.push('issue marked fixed without fixed_version');
  if (issue.fixed && !issue.test_evidence) errors.push('issue fixed without test evidence');
  if (issue.repeated_manual_workaround && !issue.product_change_proposed) errors.push('repeated manual workaround without product change proposal');
  if (issue.severity === 'SEV1_CRITICAL' && issue.hidden) errors.push('hidden critical defect');
  return { ok: errors.length === 0, errors, issue_id: issue.issue_id, status: issue.fixed ? 'FIXED' : 'OPEN' };
}

// Phase 20: knowledge base factory. INTERNAL_DRAFT default, no public publication.
export const KB_TYPES = ['getting_started', 'faq', 'how_to', 'troubleshooting', 'known_issue', 'support_policy', 'escalation', 'product_limitation', 'ownership_handoff', 'billing_explanation', 'privacy_security_guidance'];
export function buildKbArticle(type, productId, opts = {}) {
  if (!KB_TYPES.includes(type)) return { ok: false, error: `unknown KB type ${type}` };
  let status = 'INTERNAL_DRAFT';
  if (opts.requested === 'CUSTOMER_READY') status = opts.owner_approved ? 'CUSTOMER_READY' : 'INTERNAL_REVIEW';
  return { ok: true, article: { type, product_id: productId, status, publish_allowed: false, content: `${type} for ${productId} (synthetic, no real customer data)` } };
}

// Phase 21: support response draft factory. send_allowed always false.
export const DRAFT_TYPES = ['acknowledgement', 'request_for_details', 'workaround', 'resolution', 'out_of_scope_explanation', 'change_request_explanation', 'delay_update', 'incident_update', 'closure', 'training_suggestion'];
export function buildSupportDraft(input) {
  const errors = [];
  if (!DRAFT_TYPES.includes(input.type)) errors.push(`unknown draft type ${input.type}`);
  const body = renderDraft(input.type);
  const scan = scanAssetForProhibited(body + ' ' + (input.claims || []).join(' '));
  const risk_flags = [];
  if (!scan.ok) risk_flags.push(`prohibited_claim:${scan.prohibited_hits.join(',')}`);
  if (input.type === 'resolution' && !input.evidence) risk_flags.push('resolution_without_evidence');
  if (input.promise_without_capacity) risk_flags.push('promise_without_capacity');
  if (input.attachment_claim && !input.has_attachment) risk_flags.push('attachment_claim_without_asset');
  return {
    ok: errors.length === 0 && risk_flags.length === 0, errors, risk_flags,
    draft: { draft_id: `d_${input.support_request_id}_${input.type}`, support_request_id: input.support_request_id, type: input.type, claims: input.claims || [], evidence: input.evidence || null, approval_state: 'INTERNAL_DRAFT', send_allowed: false, body },
    note: 'No promise without capacity, no false resolution, no blame, no send.',
  };
}
function renderDraft(type) {
  const m = {
    acknowledgement: 'Спасибо за обращение, мы его получили (черновик, не отправлять без approval).',
    request_for_details: 'Уточните, пожалуйста, детали, чтобы мы могли помочь.',
    workaround: 'Временное решение: ... (проверено).',
    resolution: 'Вопрос решён по согласованному объёму.',
    out_of_scope_explanation: 'Этот запрос выходит за рамки текущего объёма; можем оформить как отдельную работу.',
    change_request_explanation: 'Это доработка вне текущего объёма — подготовим отдельное предложение.',
    delay_update: 'Обновление по срокам: ...',
    incident_update: 'Обновление по инциденту: ...',
    closure: 'Обращение закрыто. Если вопрос вернётся — напишите.',
    training_suggestion: 'Рекомендуем короткое обучение по этой функции.',
  };
  return m[type] || '(draft)';
}
