// owner_center/telegram_owner.mjs
// ============================================================
// Telegram Owner Transport (0.8.0-rc3) — owner alerts only; DISABLED without credentials.
// ------------------------------------------------------------
// Routes a SMALL allow-list of high-signal owner events to the owner's Telegram. This is an OWNER
// notification channel, NOT client outbound: it never messages a lead/client, never opens a send
// gate, never touches canonical.
//
// HARD INVARIANTS:
//   - LIVE only when BOTH a bot token (MATER_TELEGRAM_TOKEN_API) AND the owner chat id
//     (MATER_OWNER_TELEGRAM_CHAT_ID) are present. Absent chat id => CREDENTIAL_REQUIRED, no send,
//     no invented destination.
//   - Only the allow-listed owner event classes are eligible; P2/P3 noise is never sent.
//   - The sender is injected (testable); this module embeds no token and logs no secret.
export const TELEGRAM_OWNER_VERSION = 'telegram_owner_v1';

// The ONLY event classes allowed to reach the owner's Telegram (high-signal, owner-facing).
export const OWNER_ALERT_CLASSES = Object.freeze([
    'P0_INCIDENT', 'POSITIVE_REPLY', 'PRICE_REQUEST', 'DECISION_SLA',
    'ANDROID_NOTIFS_DOWN', 'OUTBOUND_GATE_CHANGED',
]);

export function botTokenPresent() { return !!(process.env.MATER_TELEGRAM_TOKEN_API && String(process.env.MATER_TELEGRAM_TOKEN_API).length > 10); }
export function ownerChatPresent() { return !!(process.env.MATER_OWNER_TELEGRAM_CHAT_ID && String(process.env.MATER_OWNER_TELEGRAM_CHAT_ID).length > 0); }

export function transportState() {
    if (!ownerChatPresent()) return 'CREDENTIAL_REQUIRED';   // no owner chat id → cannot send (no invented destination)
    if (!botTokenPresent()) return 'CREDENTIAL_REQUIRED';
    if (process.env.MATER_TELEGRAM_OWNER_ENABLED !== 'true') return 'DISABLED_BY_CONFIG';
    return 'LIVE';
}

// Is this event class eligible for an owner Telegram alert?
export function isOwnerAlertEligible(ev) {
    if (!ev) return false;
    const cls = ev.event_type || ev.kind || '';
    if (OWNER_ALERT_CLASSES.includes(cls)) return true;
    // P0 incidents always qualify regardless of exact type.
    return ev.severity === 'P0';
}

// Build the owner-facing Russian message (no secrets, no client content).
export function buildOwnerMessage(ev) {
    const sev = ev.severity ? `[${ev.severity}] ` : '';
    const title = ev.title_ru || ev.event_type || 'Событие системы';
    const summary = ev.summary_ru ? `\n${ev.summary_ru}` : '';
    return `${sev}${title}${summary}`.slice(0, 1000);
}

// Send an owner alert. DISABLED unless transportState()==='LIVE' AND a sender is wired.
// sender({ chatId, text }) must return { ok:boolean }. We never embed an HTTP client/token here.
export async function sendOwnerAlert(ev, { sender = null, test_only = false } = {}) {
    const state = transportState();
    if (!isOwnerAlertEligible(ev)) return { ok: true, sent: false, reason: 'NOT_OWNER_ALERT_CLASS', state };
    if (state !== 'LIVE') return { ok: true, sent: false, reason: state, state, test_only };
    if (typeof sender !== 'function') return { ok: true, sent: false, reason: 'SENDER_NOT_WIRED', state, test_only };
    const text = buildOwnerMessage(ev);
    try {
        const r = await sender({ chatId: process.env.MATER_OWNER_TELEGRAM_CHAT_ID, text });
        return { ok: !!r?.ok, sent: !!r?.ok, reason: r?.ok ? 'SENT' : 'SEND_FAILED', state: 'LIVE', test_only };
    } catch {
        return { ok: false, sent: false, reason: 'SENDER_ERROR', state: 'LIVE', test_only };
    }
}

export function status() {
    return {
        telegram_owner_version: TELEGRAM_OWNER_VERSION,
        transport_state: transportState(),
        bot_token_present: botTokenPresent(),
        owner_chat_present: ownerChatPresent(),
        enabled_flag: process.env.MATER_TELEGRAM_OWNER_ENABLED === 'true',
        allowed_alert_classes: OWNER_ALERT_CLASSES,
        sends_client_messages: false,
        channel: 'TELEGRAM_OWNER',
    };
}

export default { TELEGRAM_OWNER_VERSION, OWNER_ALERT_CLASSES, botTokenPresent, ownerChatPresent, transportState, isOwnerAlertEligible, buildOwnerMessage, sendOwnerAlert, status };
