// tools/commercial_core/lib/transport_approval.mjs
// Gate C1-C transport-readiness CONTRACT. Pure, dependency-free, NO send. Defines the immutable
// owner send-approval object and the one-message limiter. Nothing here transmits anything; it only
// builds and validates the approval that a future (separately-approved) send path would require.
//
// SAFETY: this module never imports a transport, never writes to the send ledger, and never flips a
// flag. Activation requires COMMERCIAL_SEND=ON + SEND_ALLOWED_LIVE=ON (both OFF), which is out of scope.
import crypto from 'node:crypto';

export function sha256(s) {
    return crypto.createHash('sha256').update(String(s == null ? '' : s)).digest('hex');
}

// Deterministic approval id from its binding (so the same binding cannot yield two approvals).
function approvalId(binding) {
    return 'sndapr_' + sha256([
        binding.ownerId, binding.leadId, binding.channel, binding.offerId,
        binding.recipientHash, binding.subjectHash, binding.bodyHash, binding.productSnapshotHash,
        binding.approvedAt,
    ].join('|')).slice(0, 16);
}

/**
 * Build an immutable, single-use send approval. recipient/subject/body are hashed (no PII stored).
 * The approval binds to exact content hashes; any later change to recipient/subject/body invalidates
 * it (verified by validateApproval). approvedAt/expiresAt are passed in (no Date.now in pure code).
 */
export function buildSendApproval({
    ownerId, leadId, channel = 'email', offerId, recipient, subject, body,
    productSnapshotHash, price, currency = 'RUB', approvedAt, ttlSeconds = 3600,
}) {
    if (!ownerId) return { ok: false, code: 'OWNER_REQUIRED' };
    if (!leadId) return { ok: false, code: 'LEAD_REQUIRED' };
    if (!offerId) return { ok: false, code: 'OFFER_REQUIRED' };
    if (!recipient || !subject || !body) return { ok: false, code: 'CONTENT_REQUIRED' };
    if (!approvedAt) return { ok: false, code: 'APPROVED_AT_REQUIRED' };
    const recipientHash = sha256(recipient);
    const subjectHash = sha256(subject);
    const bodyHash = sha256(body);
    const approvedMs = Date.parse(approvedAt);
    const expiresAt = new Date(approvedMs + ttlSeconds * 1000).toISOString();
    const binding = { ownerId, leadId, channel, offerId, recipientHash, subjectHash, bodyHash, productSnapshotHash, approvedAt };
    return {
        ok: true,
        approval: {
            approval_id: approvalId(binding),
            owner_id: ownerId, lead_id: leadId, channel, offer_id: offerId,
            recipient_hash: recipientHash, subject_hash: subjectHash, body_hash: bodyHash,
            product_snapshot_hash: productSnapshotHash || null,
            price: price ?? null, currency,
            approved_at: approvedAt, expires_at: expiresAt,
            single_use: true, consumed: false,
        },
    };
}

/**
 * Validate an approval against the CURRENT content + clock. Returns { ok, code }.
 * Fails closed: any hash mismatch, expiry, prior consumption, or missing approval → not valid.
 */
export function validateApproval(approval, { recipient, subject, body, nowIso }) {
    if (!approval) return { ok: false, code: 'NO_APPROVAL' };
    if (approval.consumed === true) return { ok: false, code: 'APPROVAL_ALREADY_CONSUMED' };
    if (!nowIso || Date.parse(nowIso) > Date.parse(approval.expires_at)) return { ok: false, code: 'APPROVAL_EXPIRED' };
    if (sha256(recipient) !== approval.recipient_hash) return { ok: false, code: 'RECIPIENT_CHANGED' };
    if (sha256(subject) !== approval.subject_hash) return { ok: false, code: 'SUBJECT_CHANGED' };
    if (sha256(body) !== approval.body_hash) return { ok: false, code: 'BODY_CHANGED' };
    return { ok: true };
}

// One-message pilot limiter config. Bounds a future real send to exactly one message to one lead on
// one channel before an expiry. NOT activated here.
export function oneMessageLimiter({ leadId, channel = 'email', expiresAt }) {
    return {
        MAX_REAL_SENDS: 1,
        ALLOWED_LEAD_ID: leadId || null,
        ALLOWED_CHANNEL: channel,
        EXPIRES_AT: expiresAt || null,
        FOLLOWUP_AUTOSEND: 'OFF',
        active: false, // limiter is prepared, NOT armed
    };
}

/**
 * Classify a (hypothetical) SMTP outcome WITHOUT ever sending. Used to define the uncertain-outcome
 * policy: only a confirmed transport result with an smtp message id becomes a ledger SENT; a timeout
 * or unknown outcome goes to the reconciliation queue and is NEVER a blind resend.
 */
export function classifySmtpOutcome({ delivered, smtpMessageId, timedOut }) {
    if (timedOut || delivered == null) return { ledger: 'NONE', queue: 'RECONCILIATION', resendAllowed: false, treatAsSent: false };
    if (delivered === true && smtpMessageId) return { ledger: 'SENT', queue: null, resendAllowed: false, treatAsSent: true };
    if (delivered === false) return { ledger: 'FAILED', queue: 'OWNER_REVIEW', resendAllowed: false, treatAsSent: false };
    return { ledger: 'NONE', queue: 'RECONCILIATION', resendAllowed: false, treatAsSent: false };
}
