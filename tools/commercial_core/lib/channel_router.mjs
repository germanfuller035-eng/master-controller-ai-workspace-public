// tools/commercial_core/lib/channel_router.mjs
// PURE unified channel router + webhook security helpers. No I/O, no network, no send. Ingests inbound
// messages into a channel-neutral contract, prepares outbound DRAFTS, and refuses dispatch for all new
// channels this wave. Webhook helpers verify signature/timestamp/replay and quarantine unknowns.
import crypto from 'node:crypto';
import { evaluatePolicy } from './consent_policy.mjs';

export const CHANNELS = ['EMAIL', 'VK', 'MAX', 'TELEGRAM', 'WEB_FORM', 'WHATSAPP', 'SMS', 'PHONE', 'AVITO'];
export const WEBHOOK_EVENT_STATES = ['RECEIVED', 'VERIFIED', 'PROCESSED', 'DUPLICATE', 'REJECTED', 'QUARANTINED'];

// Dispatch is OFF for every new channel this wave. EMAIL keeps its existing seam (not routed here).
const DISPATCH_ENABLED = new Set([]); // intentionally empty: no new-channel dispatch

const redactKeys = /(token|secret|authorization|api[_-]?key|password|access[_-]?token)/i;
export function redactSecrets(obj) {
    if (obj == null || typeof obj !== 'object') return obj;
    const out = Array.isArray(obj) ? [] : {};
    for (const [k, v] of Object.entries(obj)) out[k] = redactKeys.test(k) ? '[REDACTED]' : (typeof v === 'object' ? redactSecrets(v) : v);
    return out;
}

// Channel-neutral message from a raw inbound payload. Never stores raw secrets.
export function ingestInbound({ channel, payload, leadId = null, companyId = null, at = null }) {
    const externalMessageId = String(payload.external_message_id || payload.message_id || payload.id || '');
    return {
        message_id: `msg_${crypto.createHash('sha256').update(`${channel}:${externalMessageId}`).digest('hex').slice(0, 16)}`,
        channel, direction: 'inbound',
        conversation_id: payload.conversation_id || null,
        lead_id: leadId, company_id: companyId,
        external_thread_id: payload.thread_id || payload.peer_id || null,
        external_message_id: externalMessageId || null,
        sender_identity: payload.sender_identity || null,
        subject: payload.subject || null,
        body: String(payload.body || payload.text || '').slice(0, 8000),
        attachments_meta: (payload.attachments || []).map((a) => ({ type: a.type || 'unknown', size: a.size || null })),
        delivery_status: 'RECEIVED_INBOUND',
        received_at: at,
        raw_payload_hash: crypto.createHash('sha256').update(JSON.stringify(redactSecrets(payload))).digest('hex'),
    };
}

// Prepare an outbound DRAFT (never sends). Carries the policy decision and stays undispatchable.
export function prepareOutbound({ channel, leadId, body, consentStatus = 'UNKNOWN', direction = 'reply' }) {
    const policy = evaluatePolicy({ channel, consentStatus, direction, priorConversation: direction === 'reply' });
    return {
        message_id: `draft_${crypto.randomBytes(8).toString('hex')}`,
        channel, direction: 'outbound', lead_id: leadId,
        body: String(body || '').slice(0, 8000),
        contact_policy_decision: policy,
        approval_id: null, // no approval issued
        delivery_status: 'DRAFT',
        dispatchable: false, // never dispatchable for new channels this wave
    };
}

// Dispatch is refused for all new channels. Returns a structured refusal (no send ever happens here).
export function dispatch(draft) {
    if (!DISPATCH_ENABLED.has(draft.channel)) {
        return { ok: false, code: 'DISPATCH_DISABLED', channel: draft.channel, sent: false };
    }
    return { ok: false, code: 'NO_TRANSPORT', sent: false };
}

// ---- Webhook security ----
// Verify HMAC signature + timestamp freshness + replay (seen-id set provided by caller).
export function verifyWebhook({ rawBody, signatureHeader, secret, timestamp, nowMs, seenIds, eventId, maxSkewMs = 300000 }) {
    if (!secret) return { state: 'QUARANTINED', reason: 'no_secret_configured' };
    if (!signatureHeader) return { state: 'REJECTED', reason: 'missing_signature' };
    const expected = crypto.createHmac('sha256', secret).update(String(rawBody || '')).digest('hex');
    // constant-time compare
    const a = Buffer.from(expected); const b = Buffer.from(String(signatureHeader));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { state: 'REJECTED', reason: 'bad_signature' };
    if (timestamp != null && nowMs != null && Math.abs(nowMs - Number(timestamp)) > maxSkewMs) return { state: 'REJECTED', reason: 'stale_timestamp' };
    if (eventId && seenIds && seenIds.has(eventId)) return { state: 'DUPLICATE', reason: 'replay_or_duplicate' };
    return { state: 'VERIFIED', reason: 'ok' };
}

// Quarantine an event whose delivery/identity is unknown — never auto-acted upon.
export function quarantineEvent(eventId, reason) {
    return { event_id: eventId, state: 'QUARANTINED', reason, owner_review_required: true };
}
