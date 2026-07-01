// tools/conversation_hub/lib/drafts.mjs
// MP15-20, MP25 — draft request factory + validation + approval model + handoff contracts +
// retry/idempotency + conversation summary. Pure, offline. send_allowed is ALWAYS false.
import { checksum } from './common.mjs';

// ---------------------------------------------------------------------------
// MP15 — Draft request factory. Builds an INTERNAL draft REQUEST (send_allowed=false).
// Inputs may come from Growth/Revenue/Customer Success/Delivery/Finance/Executive.
// ---------------------------------------------------------------------------
export function buildDraft(req) {
  // req: { conversation_id, source_system, message_type, channel, recipient_evidence,
  //        subject, body, claims, evidence_refs, product_id?, canonical_lead_id? }
  const draft = {
    draft_id: req.draft_id || `draft_${checksum(req).slice(7, 19)}`,
    conversation_id: req.conversation_id || null,
    message_type: req.message_type || 'PLAIN',
    channel: req.channel,
    recipient_evidence: req.recipient_evidence || null,
    subject: req.subject || null,
    body: req.body || '',
    claims: req.claims || [],
    evidence_refs: req.evidence_refs || [],
    product_id: req.product_id || null,
    canonical_lead_id: req.canonical_lead_id || null,
    source_system: req.source_system || 'UNKNOWN',
    status: 'INTERNAL_DRAFT',
    approval_required: true,
    send_allowed: false,
    revision: req.revision || 1,
    synthetic: true,
  };
  return draft;
}

// ---------------------------------------------------------------------------
// MP16 — Draft validation. Returns blocking errors. Empty => READY_FOR_OWNER_REVIEW.
// context: { opt_outs?, product_ready?, price_approved?, allowed_claims?, identity_state?,
//            consent?, allowed_channels?, evidence_fresh? }
// ---------------------------------------------------------------------------
export function validateDraft(draft, context = {}) {
  const errors = [];
  if (draft.send_allowed !== false) errors.push('send_allowed must be false');
  // recipient evidence
  if (!draft.recipient_evidence || draft.recipient_evidence.guessed === true || !draft.recipient_evidence.verified) errors.push('recipient guessed or unverified');
  // identity conflict
  if (context.identity_state === 'CONFLICT') errors.push('identity conflict');
  if (context.identity_state === 'AMBIGUOUS') errors.push('identity ambiguous - owner review required');
  // opt-out
  const oo = (context.opt_outs || []).find((o) => o.canonical_lead_id && o.canonical_lead_id === draft.canonical_lead_id && ['ALL_COMMERCIAL', 'CHANNEL_ONLY'].includes(o.scope) && o.status !== 'WITHDRAWN');
  if (oo && draft.message_type !== 'SUPPORT') errors.push('blocked by opt-out');
  // claims support
  const allowed = context.allowed_claims || null;
  if (allowed) {
    for (const c of draft.claims) if (!allowed.includes(c)) errors.push(`unsupported claim: ${c}`);
  } else if (draft.claims.length > 0 && context.allowed_claims === undefined) {
    // if no claim registry provided and draft asserts claims, require explicit evidence refs
    if (draft.evidence_refs.length === 0) errors.push('claims present without evidence_refs or allowed_claims registry');
  }
  // product readiness
  if (context.product_ready === false) errors.push('product not ready');
  // price
  if (context.price_approved === false) errors.push('price unapproved');
  // channel
  if (context.allowed_channels && !context.allowed_channels.includes(draft.channel)) errors.push(`wrong channel: ${draft.channel}`);
  // attachment present-but-missing
  if (draft.requires_attachment && !(draft.attachment_refs && draft.attachment_refs.length)) errors.push('attachment missing');
  // privacy
  if (context.privacy_violation === true) errors.push('privacy violation');
  // approval requirement
  if (draft.approval_required !== true) errors.push('approval requirement missing');
  // stale evidence / product version
  if (context.evidence_fresh === false) errors.push('expired source evidence');
  if (context.product_version_stale === true) errors.push('stale product version');
  // canonical reference for non-test draft
  if (draft.synthetic !== true && !draft.canonical_lead_id) errors.push('no canonical reference for non-test draft');

  const status = errors.length ? 'VALIDATION_FAILED' : 'READY_FOR_OWNER_REVIEW';
  return { ok: errors.length === 0, status, errors };
}

// ---------------------------------------------------------------------------
// MP17 — Approval model. Hub DISPLAYS approval requests; Master Controller OWNS approval.
// ---------------------------------------------------------------------------
export function buildApprovalRequest(draft, validation, opts = {}) {
  if (!validation.ok) return { error: 'draft not READY_FOR_OWNER_REVIEW', status: 'NOT_REQUESTED' };
  return {
    approval_request_id: `appr_${draft.draft_id}`,
    draft_id: draft.draft_id,
    canonical_lead_id: draft.canonical_lead_id || null,
    requested_by: draft.source_system,
    requested_at: opts.requested_at || null,
    risk_flags: opts.risk_flags || [],
    validation: { ok: validation.ok, errors: validation.errors },
    status: 'REQUESTED',
    owner_decision_reference: null,
    revision: draft.revision,
    // The approval PACKAGE Master Controller would consume (Hub never sends it itself).
    package: {
      draft_ref: draft.draft_id,
      recipient_evidence: draft.recipient_evidence,
      claims: draft.claims,
      evidence_refs: draft.evidence_refs,
      channel: draft.channel,
      idempotency_key: opts.idempotency_key || `idem_${checksum({ d: draft.draft_id, r: draft.revision })}`,
      preview: `[${draft.channel}] ${draft.subject || ''}\n${(draft.body || '').slice(0, 280)}`,
      send_allowed: false,
    },
    note: 'Conversation Hub display reference only. Master Controller remains canonical approval owner.',
  };
}

// Revision conflict detector (MP17)
export function approvalRevisionConflict(approval, currentDraftRevision) {
  if (approval.revision !== currentDraftRevision) return { conflict: true, status: 'REVISION_CONFLICT', reason: `approval rev ${approval.revision} != draft rev ${currentDraftRevision}` };
  return { conflict: false, status: approval.status };
}

// ---------------------------------------------------------------------------
// MP18/19 — Handoff contracts (description objects; no executable transport).
// ---------------------------------------------------------------------------
export const OUTBOUND_HANDOFF = {
  schema: 'conversation_hub.outbound_handoff.v1',
  path: ['Source OS', 'Conversation Hub draft request', 'validation', 'owner preview', 'Master Controller approval', 'Master Controller approved-send seam', 'channel transport adapter', 'transport result', 'Master Controller canonical ledger', 'Conversation Hub derived conversation view'],
  hub_must_never: ['bypass approval', 'call SMTP directly', 'write send ledger', 'mark sent', 'infer success', 'retry non-idempotently'],
};
export const INBOUND_HANDOFF = {
  schema: 'conversation_hub.inbound_handoff.v1',
  path: ['Channel adapter', 'normalized inbound envelope', 'dedupe', 'identity resolution', 'classification', 'Conversation Hub view', 'Master Controller API', 'canonical reply/opt-out state', 'domain routing'],
  runtime_implemented: false,
};

// ---------------------------------------------------------------------------
// MP20 — Retry / idempotency. Decides if a retry is SAFE.
// ---------------------------------------------------------------------------
export function evaluateRetry(attempt) {
  // attempt: { idempotency_key, original_request_id, retry_count, last_result, canonical_approved }
  const reasons = [];
  if (!attempt.idempotency_key) return { safe: false, terminal: false, reason: 'missing idempotency_key', action: 'BLOCK' };
  if (!attempt.canonical_approved) return { safe: false, terminal: false, reason: 'retry only from canonical approved request', action: 'BLOCK' };
  if (attempt.last_result === 'UNKNOWN' || attempt.last_result === 'AMBIGUOUS') return { safe: false, terminal: false, reason: 'ambiguous transport result requires reconciliation before retry', action: 'RECONCILE' };
  if (attempt.last_result === 'DELIVERED_CONFIRMED' || attempt.last_result === 'BOUNCED_HARD' || attempt.last_result === 'REJECTED') return { safe: false, terminal: true, reason: `terminal result ${attempt.last_result}`, action: 'STOP' };
  if ((attempt.retry_count || 0) >= (attempt.max_retries || 3)) return { safe: false, terminal: true, reason: 'max retries reached', action: 'STOP' };
  if (attempt.last_result === 'DEFERRED' || attempt.last_result === 'BOUNCED_SOFT') return { safe: true, terminal: false, reason: 'safe idempotent retry with same key', action: 'RETRY_SAME_KEY' };
  return { safe: false, terminal: false, reason: 'unhandled state', action: 'BLOCK' };
}

// ---------------------------------------------------------------------------
// MP25 — Conversation summary engine. No fabricated content. References source messages.
// ---------------------------------------------------------------------------
export function summarize(conversation, messages, opts = {}) {
  const sorted = [...messages].sort((a, b) => Date.parse(a.received_at || 0) - Date.parse(b.received_at || 0));
  const lastInbound = [...sorted].reverse().find((m) => m.direction === 'INBOUND');
  const lastOutbound = [...sorted].reverse().find((m) => m.direction === 'OUTBOUND');
  const optOut = sorted.find((m) => ['OPT_OUT', 'UNSUBSCRIBE'].includes(m.message_type) || (m.classification && ['opt_out', 'unsubscribe'].includes(m.classification.primary_intent)));
  const support = sorted.find((m) => m.classification && ['support', 'incident', 'complaint'].includes(m.classification.primary_intent));
  const missing = [];
  if (!conversation.canonical_lead_id) missing.push('canonical_lead_id');
  if (!lastInbound) missing.push('no inbound message yet');
  return {
    conversation_id: conversation.conversation_id,
    current_situation: conversation.status,
    latest_inbound_ref: lastInbound ? lastInbound.message_id : null,
    latest_outbound_ref: lastOutbound ? lastOutbound.message_id : null,
    open_question: lastInbound && lastInbound.classification ? lastInbound.classification.primary_intent : null,
    pending_approval: opts.pending_approval || null,
    opt_out: optOut ? { message_id: optOut.message_id, recommendation: 'owner review opt-out' } : null,
    support_issue: support ? support.message_id : null,
    commercial_stage: opts.commercial_stage || 'UNKNOWN',
    owner_next_action: opts.owner_next_action || (lastInbound ? 'review latest inbound + route recommendation' : 'await contact'),
    confidence: lastInbound && lastInbound.classification ? lastInbound.classification.confidence : 0.3,
    missing_data: missing,
    source_message_refs: sorted.map((m) => m.message_id),
    revision: conversation.revision,
    note: 'Summary references source messages only; no fabricated content. Invalidated on new conversation revision.',
    based_on_revision: conversation.revision,
  };
}
