// outbound_channel_router.mjs
// Multi-channel approved-send router — email / telegram / whatsapp / max.
// Channel priority for outreach queues is fixed as:
//   1) ready_email
//   2) email_discovery_queue / needs_email_verification
//   3) ready_telegram_draft
//   4) ready_max_draft
//   5) hold_whatsapp_later
// WhatsApp must not be treated as an active current queue while email discovery
// and verification remain incomplete.
//
// WHY THIS EXISTS:
//   The mini-audit sales system originally shipped with a single live send
//   contour: email (Yandex SMTP, see telegram_approved_email_send_adapter.mjs).
//   The roadmap always called for the SAME approved-send flow to reach a client
//   over their preferred channel: Telegram, WhatsApp or MAX, not only email.
//   This module is the ONE seam that selects a channel, validates the recipient
//   for that channel, and applies the SAME safety gates for every channel.
//
// HARD SAFETY CONTRACT (identical posture to the email adapter):
//   - PURE module: NO Telegram API, NO PowerShell, NO token read, NO .env read,
//     NO secret-vault read, NO network of any kind in build/test.
//   - Autosend is ALWAYS blocked.
//   - Mass send is ALWAYS blocked (single recipient string only; arrays reject).
//   - Owner approval is REQUIRED (owner_confirmed === true && approved_by === 'Dmitry').
//   - Real send for a channel is only attempted via an explicitly injected,
//     channel-specific live adapter (context.adapters[channel].send). Without it
//     the router returns SEND_ADAPTER_NOT_CONFIGURED — it NEVER invents transport.
//   - A mock adapter (context.mockAdapter / context.adapters[channel] in tests)
//     dispatches EXACTLY one message and NEVER touches the network.
//
// This keeps the email contour untouched while giving every channel one
// consistent, owner-gated, single-message send path.

import {
    sendApprovedClientEmail,
    isP1ClientRecipientValid,
} from './telegram_approved_email_send_adapter.mjs';

// ----------------------------------------------------------------------------
// Channels
// ----------------------------------------------------------------------------
export const CHANNELS = ['email', 'telegram', 'whatsapp', 'max'];

export function isSupportedChannel(channel) {
    return CHANNELS.includes(normalizeChannel(channel));
}

// Normalize loose user/lead input ("Email", "ВатсАп", "ТГ", "вотсап") to a
// canonical channel id. Returns '' for anything unrecognized.
export function normalizeChannel(channel) {
    if (channel == null) return '';
    const c = String(channel).trim().toLowerCase();
    if (!c) return '';
    if (['email', 'e-mail', 'mail', 'почта', 'емейл', 'эмейл'].includes(c)) return 'email';
    if (['telegram', 'tg', 'тг', 'телеграм', 'телеграмм'].includes(c)) return 'telegram';
    if (['whatsapp', 'wa', 'ватсап', 'вотсап', 'вацап', 'whats app'].includes(c)) return 'whatsapp';
    if (['max', 'макс'].includes(c)) return 'max';
    return '';
}

// ----------------------------------------------------------------------------
// Result codes (shared with the email adapter where it makes sense)
// ----------------------------------------------------------------------------
export const SEND_ADAPTER_NOT_CONFIGURED = 'SEND_ADAPTER_NOT_CONFIGURED';
export const SEND_BLOCKED_AUTOSEND = 'SEND_BLOCKED_AUTOSEND';
export const SEND_BLOCKED_MASS_SEND = 'SEND_BLOCKED_MASS_SEND';
export const SEND_BLOCKED_NOT_OWNER_APPROVED = 'SEND_BLOCKED_NOT_OWNER_APPROVED';
export const SEND_BLOCKED_UNSUPPORTED_CHANNEL = 'SEND_BLOCKED_UNSUPPORTED_CHANNEL';
export const SEND_BLOCKED_INVALID_RECIPIENT = 'SEND_BLOCKED_INVALID_RECIPIENT';
export const SEND_BLOCKED_EMPTY_BODY = 'SEND_BLOCKED_EMPTY_BODY';
export const SEND_OK_MOCK = 'SEND_OK_MOCK';
export const SEND_UNCERTAIN_MISSING_SMTP_PROOF = 'SEND_UNCERTAIN_MISSING_SMTP_PROOF';

function _acceptedRecipientCount(result = {}) {
    const accepted = result.accepted_recipients ?? result.accepted ?? result.acceptedRecipientCount ?? result.accepted_recipient_count;
    if (Array.isArray(accepted)) return accepted.length;
    const n = Number(accepted);
    return Number.isFinite(n) ? n : 0;
}

export function hasEmailSmtpProof(result = {}) {
    const r = (result && typeof result === 'object') ? result : {};
    const acceptedCount = _acceptedRecipientCount(r);
    const hasMessageId = typeof r.messageId === 'string' && r.messageId.trim() !== '';
    return r.ok === true && acceptedCount > 0 && (
        r.smtp_accepted === true
        || Number(r.smtp_response_code) === 250
        || hasMessageId
    );
}

export function normalizeSendResult(result, channel = '') {
    const r = (result && typeof result === 'object') ? result : null;
    if (!r || r.ok !== true) {
        return {
            ...(r || {}),
            ok: false,
            status: (r && r.status) || 'send_failed',
            reason: (r && (r.reason || r.code)) || 'adapter_result_not_ok',
            channel,
            sent_count: 0,
        };
    }
    if (channel === 'email' && !hasEmailSmtpProof(r)) {
        return {
            ...r,
            ok: false,
            status: 'send_uncertain',
            reason: 'missing_smtp_proof',
            code: SEND_UNCERTAIN_MISSING_SMTP_PROOF,
            channel,
            sent_count: 0,
        };
    }
    return { ...r, ok: true, channel, sent_count: Number(r.sent_count || 1) };
}

// ----------------------------------------------------------------------------
// Per-channel recipient validation. Pure, no I/O.
//   - email:    reuse the real-client email guard (no test/fixture/example).
//   - telegram: @username (5-32 chars) OR numeric chat id.
//   - whatsapp: E.164-ish phone (+ and 7..15 digits).
//   - max:      MAX profile phone (E.164-ish) OR @username handle.
// Returns { ok, reason }.
// ----------------------------------------------------------------------------
const TG_USERNAME = /^@[A-Za-z][A-Za-z0-9_]{4,31}$/;
const TG_CHAT_ID = /^-?\d{5,20}$/;
const PHONE_E164 = /^\+\d{7,15}$/;

export function validateRecipientForChannel(channel, recipient, env = {}) {
    const ch = normalizeChannel(channel);
    if (!ch) return { ok: false, reason: 'unsupported_channel' };
    if (recipient == null || String(recipient).trim() === '') {
        return { ok: false, reason: 'missing' };
    }
    const r = String(recipient).trim();

    if (ch === 'email') {
        const v = isP1ClientRecipientValid(r, env);
        return v.ok ? { ok: true, reason: 'VALID' } : { ok: false, reason: v.reason };
    }
    if (ch === 'telegram') {
        if (TG_USERNAME.test(r) || TG_CHAT_ID.test(r)) return { ok: true, reason: 'VALID' };
        return { ok: false, reason: 'invalid_telegram' };
    }
    if (ch === 'whatsapp') {
        if (PHONE_E164.test(r)) return { ok: true, reason: 'VALID' };
        return { ok: false, reason: 'invalid_whatsapp' };
    }
    if (ch === 'max') {
        if (PHONE_E164.test(r) || TG_USERNAME.test(r)) return { ok: true, reason: 'VALID' };
        return { ok: false, reason: 'invalid_max' };
    }
    return { ok: false, reason: 'unsupported_channel' };
}

// ----------------------------------------------------------------------------
// resolveSendChannel(lead, requested)
//   Pick the channel for a lead. Priority:
//     1) an explicit, supported `requested` channel
//     2) the lead's own preferred/declared channel field
//     3) email as the universal fallback
//   Returns a canonical channel id (always one of CHANNELS).
// ----------------------------------------------------------------------------
export function resolveSendChannel(lead = {}, requested = '') {
    const req = normalizeChannel(requested);
    if (req) return req;
    const pref = normalizeChannel(lead.preferred_channel || lead.channel || '');
    if (pref) return pref;
    return 'email';
}

// ----------------------------------------------------------------------------
// _runSharedGates(payload, context) — the gates EVERY channel must pass.
//   Returns a blocking result object, or null when all gates pass.
// ----------------------------------------------------------------------------
function _runSharedGates(payload, context) {
    const ctx = (context && typeof context === 'object') ? context : {};
    const p = (payload && typeof payload === 'object') ? payload : {};

    if (ctx.mass_send === true || ctx.massSend === true || Array.isArray(p.to)) {
        return { ok: false, code: SEND_BLOCKED_MASS_SEND, sent_count: 0, message: 'Массовая отправка заблокирована.' };
    }
    if (ctx.autosend === true) {
        return { ok: false, code: SEND_BLOCKED_AUTOSEND, sent_count: 0, message: 'Autosend всегда заблокирован.' };
    }
    if (ctx.message_count !== undefined && ctx.message_count !== 1) {
        return { ok: false, code: SEND_BLOCKED_MASS_SEND, sent_count: 0, message: 'Разрешена ровно 1 отправка (message_count !== 1).' };
    }
    if (ctx.owner_confirmed !== true || ctx.approved_by !== 'Dmitry') {
        return { ok: false, code: SEND_BLOCKED_NOT_OWNER_APPROVED, sent_count: 0, message: 'Нет подтверждения владельца (Telegram ✅).' };
    }
    return null;
}

// ----------------------------------------------------------------------------
// _pickAdapter(channel, context)
//   The router NEVER invents transport. A live/mock adapter must be injected:
//     - context.adapters[channel] (preferred, per-channel), OR
//     - context.mockAdapter (single test mock used for any non-email channel).
//   Must expose a `.send(payload)` function. Returns the adapter or null.
// ----------------------------------------------------------------------------
function _pickAdapter(channel, context) {
    const ctx = (context && typeof context === 'object') ? context : {};
    const byChannel = ctx.adapters && ctx.adapters[channel];
    if (byChannel && typeof byChannel.send === 'function') return byChannel;
    if (ctx.mockAdapter && typeof ctx.mockAdapter.send === 'function') return ctx.mockAdapter;
    return null;
}

// ----------------------------------------------------------------------------
// sendApprovedMessage(payload, context) -> Promise<result>
//   The single multi-channel approved send seam.
//     payload: { to, subject, body, channel?, lead?, company?, website? }
//     context: { owner_confirmed, approved_by, real_send_enabled, env,
//                channel?, adapters?, mockAdapter?, message_count? }
//
//   - email channel reuses the EXISTING Yandex SMTP client send (no new contour).
//   - telegram / whatsapp / max are dispatched via an injected channel adapter.
//     With a mock adapter -> SEND_OK_MOCK (exactly 1 message, no network).
//     Without any adapter  -> SEND_ADAPTER_NOT_CONFIGURED (never invents transport).
//   - Body is required for every channel.
//   Returns { ok, code, channel, sent_count, message }.
// ----------------------------------------------------------------------------
export async function sendApprovedMessage(payload = {}, context = {}) {
    const ctx = (context && typeof context === 'object') ? context : {};
    const p = (payload && typeof payload === 'object') ? payload : {};
    const env = (ctx.env && typeof ctx.env === 'object') ? ctx.env : {};

    // 0) Channel selection. An explicitly REQUESTED but unknown channel is a
    //    hard block — we never silently downgrade an explicit request to email.
    const requested = ctx.channel || p.channel;
    if (requested != null && String(requested).trim() !== '' && !normalizeChannel(requested)) {
        return { ok: false, code: SEND_BLOCKED_UNSUPPORTED_CHANNEL, channel: String(requested), sent_count: 0, message: `Канал не поддерживается: ${requested}.` };
    }
    const channel = resolveSendChannel(p.lead || {}, requested);
    if (!isSupportedChannel(channel)) {
        return { ok: false, code: SEND_BLOCKED_UNSUPPORTED_CHANNEL, channel, sent_count: 0, message: `Канал не поддерживается: ${channel}.` };
    }


    // 1) Shared safety gates (mass/autosend/owner approval) — every channel.
    const blocked = _runSharedGates(p, ctx);
    if (blocked) return { ...blocked, channel };

    // 2) Recipient validation for the chosen channel.
    const rv = validateRecipientForChannel(channel, p.to, env);
    if (!rv.ok) {
        return { ok: false, code: SEND_BLOCKED_INVALID_RECIPIENT, channel, reason: rv.reason, sent_count: 0, message: `Некорректный получатель для ${channel}: ${rv.reason}.` };
    }

    // 3) Body required for every channel.
    if (!p.body || String(p.body).trim() === '') {
        return { ok: false, code: SEND_BLOCKED_EMPTY_BODY, channel, sent_count: 0, message: 'Пустое тело сообщения.' };
    }

    // 4) Email reuses the EXISTING approved client-email send (Yandex SMTP).
    if (channel === 'email') {
        // In offline tests a mock adapter may stand in for the SMTP contour so
        // the router stays pure; otherwise delegate to the real email send seam.
        const mock = _pickAdapter('email', ctx);
        if (mock && ctx.real_send_enabled !== true) {
            const mr = await mock.send({ ...p, channel });
            const normalized = normalizeSendResult(mr, channel);
            return normalized.ok === true
                ? { ...normalized, code: normalized.code || SEND_OK_MOCK, message: normalized.message || 'Mock email send (offline, без сети).' }
                : { ...normalized, message: normalized.message || 'Mock email send не подтверждён SMTP proof.' };
        }
        const r = await sendApprovedClientEmail(p, ctx);
        return normalizeSendResult(r, channel);
    }

    // 5) Telegram / WhatsApp / MAX — dispatch via an injected channel adapter.
    const adapter = _pickAdapter(channel, ctx);
    if (!adapter) {
        return {
            ok: false,
            code: SEND_ADAPTER_NOT_CONFIGURED,
            channel,
            sent_count: 0,
            message: `Адаптер канала "${channel}" не подключён. Отправка не выполнена.`,
        };
    }

    // Mock / live channel adapter: dispatch EXACTLY one message.
    const result = await adapter.send({
        to: String(p.to).trim(),
        body: p.body,
        subject: p.subject || '',
        channel,
        company: p.company || '',
        website: p.website || '',
        approved_by: 'Dmitry',
    });

    const normalized = normalizeSendResult(result, channel);
    return {
        ok: normalized.ok === true,
        code: normalized.ok === true ? (normalized.code || SEND_OK_MOCK) : (normalized.code || 'SEND_FAILED'),
        channel,
        sent_count: normalized.ok === true ? 1 : 0,
        adapter_result: result,
        status: normalized.status,
        reason: normalized.reason,
        message: normalized.ok === true ? `Сообщение отправлено через ${channel}.` : (normalized.message || `Отправка через ${channel} не выполнена.`),
    };
}

// ----------------------------------------------------------------------------
// describeChannelReadiness(context)
//   Read-only capability report: which channels have an adapter wired right now.
//   Pure, no I/O, no secret access. Useful for a /channels status command.
// ----------------------------------------------------------------------------
export function describeChannelReadiness(context = {}) {
    const ctx = (context && typeof context === 'object') ? context : {};
    const out = {};
    for (const ch of CHANNELS) {
        if (ch === 'email') {
            // Email is "ready" when SMTP creds key-names are present in env.
            const env = (ctx.env && typeof ctx.env === 'object') ? ctx.env : {};
            const hasUser = !!(env.YANDEX_MAIL_LOGIN || env.EMAIL_SMTP_USER);
            const hasPass = !!(env.YANDEX_MAIL_APP_PASSWORD || env.EMAIL_SMTP_PASS);
            out[ch] = { adapter: 'yandex_smtp', ready: hasUser && hasPass };
        } else {
            const a = _pickAdapter(ch, ctx);
            out[ch] = { adapter: a ? 'injected' : 'none', ready: !!a };
        }
    }
    return { channels: out, supported: [...CHANNELS] };
}
