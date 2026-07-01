// telegram_approved_send_controller.mjs
// V1 Approved Send Controller — SAFE approval gate around outbound send.
//
// SAFETY CONTRACT (offline build, no live restart):
//   - PURE module: NO Telegram API, NO PowerShell, NO token read, NO .env read.
//   - NEVER performs a real send during build/test. If a real send adapter is
//     not wired through opts.sendAdapter, returns SEND_ADAPTER_NOT_CONFIGURED.
//   - buildSendLogEntry() prepares a log object but does NOT write to 13_sales.
//     Real logging only happens after a live approval (not in this build).
//   - Enforces: owner-only, draft_id required, preview required, recipient
//     required, max 1 message per approval, autosend always blocked.
//   - The bot performs the owner gate; this module also defensively checks the
//     isOwner flag passed in.

import crypto from 'node:crypto';
import {
    isEmailSendAdapterConfigured,
    validateEmailRecipient,
    buildEmailPayload,
    sendApprovedEmail,
    checkEmailAdapterPreflight,
    buildSafePreflightReport,
    INVALID_RECIPIENT,
    SEND_OK_MOCK,
    getEmailTransportCapability,
    sendEmailViaApprovedTransport,
    buildTransportCapabilityReport,
    SEND_OK_MOCK_BRIDGE,
    SEND_BLOCKED_REAL_SEND_DISABLED,
    SEND_TRANSPORT_DEPENDENCY_MISSING,
    SEND_TRANSPORT_NOT_IMPLEMENTED,
    collectEmailEnvPresence,
    buildEmailEnvPresenceResult,
    buildEnvPresenceReport,
    EXPECTED_TRANSPORT_ENV_KEYS,
    E1C2B_STAGE,
    // E1C2C Yandex alias bridge (legacy YANDEX_* -> EMAIL_* aliases, NO send)
    collectYandexMailEnvPresence,
    buildEmailConfigPresenceFromAliases,
    buildYandexAliasPreflightReport,
    CONFIGURED_NO,
    CONFIGURED_YES_PARTIAL,
    CONFIGURED_YES,
    E1C2C_STAGE,
    // MAIL-FINAL-1 live SMTP self-test transport
    sendApprovedSelfTestEmail,
    SEND_OK_TEST_EMAIL,
    SMTP_SEND_FAILED,
    // MAIL-FINAL-P1 single approved TOP-1 client send
    sendApprovedClientEmail,
    SEND_OK_CLIENT_P1,
    P1_REQUIRED,
    P1_BLOCKED_INVALID_RECIPIENT,
    isP1ClientRecipientValid,
} from './telegram_approved_email_send_adapter.mjs';

// PREVIEW-TO-ME: production TOP-1 draft generator (same subject/body source as
// the real client send). Imported read-only; buildDraft NEVER sends.
import { buildDraft } from './telegram_outbound_draft_center.mjs';






export const OWNER_REFUSAL =

    'Команда отправки доступна только владельцу. Доступ отклонён.';

export const SEND_ADAPTER_NOT_CONFIGURED = 'SEND_ADAPTER_NOT_CONFIGURED';
// Honest recipient gate code: emitted when the live draft recipient is missing,
// empty, the self-test mailbox (EMAIL_TEST_TO), or a fake/example/test address.
// This MUST be returned BEFORE any SMTP-config check so a fake recipient never
// masquerades as SEND_ADAPTER_NOT_CONFIGURED.
export const REAL_CLIENT_RECIPIENT_REQUIRED = 'REAL_CLIENT_RECIPIENT_REQUIRED';
export const SEND_BLOCKED_MISSING_RECIPIENT = 'SEND_BLOCKED_MISSING_RECIPIENT';

export const SEND_BLOCKED_NO_DRAFT = 'SEND_BLOCKED_NO_DRAFT';
export const SEND_BLOCKED_NO_PREVIEW = 'SEND_BLOCKED_NO_PREVIEW';
export const SEND_BLOCKED_NOT_OWNER = 'SEND_BLOCKED_NOT_OWNER';
export const SEND_BLOCKED_AUTOSEND = 'SEND_BLOCKED_AUTOSEND';
export const SEND_BLOCKED_RATE_LIMIT = 'SEND_BLOCKED_RATE_LIMIT';

// E1B preflight result codes
export const EMAIL_PREFLIGHT_READY = 'EMAIL_PREFLIGHT_READY';
export const EMAIL_PREFLIGHT_NOT_CONFIGURED = 'EMAIL_PREFLIGHT_NOT_CONFIGURED';
export const NEVER_SEND_ON_PREFLIGHT = 'NEVER_SEND_ON_PREFLIGHT';

// ----------------------------------------------------------------------------
// handleEmailSendPreflight(context)
//   E1B: Live Config Preflight. NEVER sends, NEVER writes, NEVER touches the
//   network, NEVER reads dotenv / local secret stores, NEVER prints secret values.
//   - Delegates presence-only key checks to checkEmailAdapterPreflight().
//   - Returns EMAIL_PREFLIGHT_READY when all config key NAMES are present
//     (real send still disabled), otherwise EMAIL_PREFLIGHT_NOT_CONFIGURED.
//   - Always carries never_send: NEVER_SEND_ON_PREFLIGHT and can_send_live=false.
// ----------------------------------------------------------------------------
export function handleEmailSendPreflight(context = {}) {
    const preflight = checkEmailAdapterPreflight(context);
    const safe_report = buildSafePreflightReport(preflight);

    const code = preflight.configured
        ? EMAIL_PREFLIGHT_READY
        : EMAIL_PREFLIGHT_NOT_CONFIGURED;

    return {
        ok: true, // preflight itself succeeds; this is a status check, not a send
        code,
        never_send: NEVER_SEND_ON_PREFLIGHT,
        configured: preflight.configured,
        missing_keys: preflight.missing_keys,
        provider: preflight.provider,
        from_label: preflight.from_label,
        real_send_enabled: false, // E1B: always false
        can_send_live: false,     // E1B: always false
        secrets_printed: false,
        reads_dotenv: false,
        reads_ai_secrets: false,
        safe_report,
    };
}


// ----------------------------------------------------------------------------
// Command classification
// ----------------------------------------------------------------------------
export function classifySendCommand(rawText) {
    if (rawText == null) return null;
    const t = String(rawText).trim();
    const low = t.toLowerCase();
    if (!low) return null;

    // /audit_send_approve <draft_id>
    let m = t.match(/^\/audit_send_approve\s+(\S+)$/i);
    if (m) return { action: 'approve', draft_id: m[1] };

    m = t.match(/^\/audit_send_reject\s+(\S+)$/i);
    if (m) return { action: 'reject', draft_id: m[1] };

    // bare approve/reject with no draft_id => blocked downstream
    if (low === '/audit_send_approve') return { action: 'approve', draft_id: '' };
    if (low === '/audit_send_reject') return { action: 'reject', draft_id: '' };

    // RU phrases: "отправь черновик <id>", "одобряю отправку <id>"
    m = t.match(/^отправь\s+черновик\s+(\S+)$/i);
    if (m) return { action: 'approve', draft_id: m[1] };
    m = t.match(/^одобряю\s+отправку\s+(\S+)$/i);
    if (m) return { action: 'approve', draft_id: m[1] };
    m = t.match(/^отклонить\s+черновик\s+(\S+)$/i);
    if (m) return { action: 'reject', draft_id: m[1] };

    return null;
}

// ----------------------------------------------------------------------------
// Send log entry builder — pure, NO write.
// ----------------------------------------------------------------------------
export function buildSendLogEntry(draft, opts = {}) {
    if (!draft) return null;
    return {
        timestamp: opts.timestamp || new Date().toISOString(),
        lead_id: draft.lead_id || '',
        company: draft.company || '',
        recipient: draft.recipient || '',
        subject: draft.subject || '',
        subject_hash: crypto.createHash('sha256').update(String(draft.subject || '')).digest('hex').slice(0, 16),
        body_hash: draft.body_hash || crypto.createHash('sha256').update(String(draft.body || '')).digest('hex').slice(0, 16),
        channel: draft.channel || 'email',
        approved_by: 'Dmitry',
        send_result: opts.send_result || 'PENDING',
        next_followup_at: opts.next_followup_at || '',
    };
}

// ----------------------------------------------------------------------------
// Core approval logic. Returns a structured result; NEVER throws on a blocked
// state. Real sending only happens when opts.allowRealSend === true AND a
// sendAdapter is provided — which is NEVER the case in offline build/test.
// ----------------------------------------------------------------------------
export function processApproval(parsed, opts = {}) {
    if (!parsed) return { ok: false, code: 'NO_COMMAND' };

    const isOwner = opts.isOwner === true;
    if (!isOwner) {
        return { ok: false, code: SEND_BLOCKED_NOT_OWNER, message: OWNER_REFUSAL };
    }

    // Autosend is ALWAYS blocked, regardless of flags.
    if (opts.autosend === true) {
        return { ok: false, code: SEND_BLOCKED_AUTOSEND, message: 'Autosend всегда заблокирован.' };
    }

    if (parsed.action === 'reject') {
        if (!parsed.draft_id) {
            return { ok: false, code: SEND_BLOCKED_NO_DRAFT, message: 'Нужен draft_id для reject.' };
        }
        return { ok: true, code: 'REJECTED', draft_id: parsed.draft_id, message: `Черновик ${parsed.draft_id} отклонён. Отправка не выполнена.` };
    }

    // action === 'approve'
    if (!parsed.draft_id) {
        return { ok: false, code: SEND_BLOCKED_NO_DRAFT, message: 'Нельзя одобрить отправку без draft_id.' };
    }

    // Preview must exist and match the draft_id. The bot supplies the previously
    // generated draft via opts.draft (preview gate). If only a runtime store is
    // provided (C1), look up the latest draft state (with updated recipient) by
    // draft_id. The store is runtime-only and NEVER backed by 13_sales.
    let draft = opts.draft;
    if ((!draft || draft.draft_id !== parsed.draft_id) && opts.store instanceof Map) {
        const fromStore = opts.store.get(parsed.draft_id);
        if (fromStore && fromStore.draft_id === parsed.draft_id) draft = fromStore;
    }
    if (!draft || draft.draft_id !== parsed.draft_id) {

        return { ok: false, code: SEND_BLOCKED_NO_PREVIEW, message: 'Нет preview для этого draft_id. Сначала /audit_preview.' };
    }

    if (!draft.recipient) {
        return { ok: false, code: SEND_BLOCKED_MISSING_RECIPIENT, message: 'Нет получателя — отправка заблокирована.' };
    }

    // Recipient must be a syntactically valid email.
    const recipientCheck = validateEmailRecipient(draft.recipient);
    if (!recipientCheck.ok && recipientCheck.code === INVALID_RECIPIENT) {
        return { ok: false, code: INVALID_RECIPIENT, message: 'Некорректный email получателя — отправка заблокирована.' };
    }

    // Rate limit: max 1 message per approval. opts.alreadySentInThisApproval
    // models a second send attempt within the same approval.
    if (opts.alreadySentInThisApproval === true) {
        return { ok: false, code: SEND_BLOCKED_RATE_LIMIT, message: 'Максимум 1 сообщение за 1 approval.' };
    }

    // E1 email adapter path. If a mock email adapter is wired via opts.mockAdapter
    // (offline tests ONLY), route through the offline-safe email adapter which
    // returns SEND_OK_MOCK and dispatches EXACTLY one mock message — never a real
    // network send. Mass send / autosend remain blocked inside the adapter too.
    if (isEmailSendAdapterConfigured(opts)) {
        const payload = buildEmailPayload(draft, opts);
        const emailResult = sendApprovedEmail(payload, opts);
        const logEntry = buildSendLogEntry(draft, { send_result: emailResult.code });
        if (emailResult.ok && emailResult.code === SEND_OK_MOCK) {
            return {
                ok: true,
                code: SEND_OK_MOCK,
                draft_id: parsed.draft_id,
                sent_count: emailResult.sent_count,
                payload,
                log_entry: logEntry,
                message: 'Mock send выполнен (offline, без сети). Лог подготовлен, но не записан.',
            };
        }
        return { ok: false, code: emailResult.code, draft_id: parsed.draft_id, payload, log_entry: logEntry, message: emailResult.message };
    }

    // Real send is only attempted with an explicit live flag AND a wired adapter.

    // Offline build/test never sets both -> SEND_ADAPTER_NOT_CONFIGURED.
    const adapter = opts.sendAdapter;
    const allowRealSend = opts.allowRealSend === true;
    if (!allowRealSend || !adapter || typeof adapter.send !== 'function') {
        const logEntry = buildSendLogEntry(draft, { send_result: SEND_ADAPTER_NOT_CONFIGURED });
        return {
            ok: false,
            code: SEND_ADAPTER_NOT_CONFIGURED,
            draft_id: parsed.draft_id,
            message: 'Реальная отправка недоступна: send adapter не настроен (offline-safe). Лог подготовлен, но не записан.',
            log_entry: logEntry,
        };
    }

    // NOTE: This branch is intentionally unreachable in offline build/test.
    const sendResult = adapter.send(draft);
    const logEntry = buildSendLogEntry(draft, { send_result: sendResult && sendResult.ok ? 'SENT' : 'FAILED' });
    return { ok: true, code: 'SENT', draft_id: parsed.draft_id, send_result: sendResult, log_entry: logEntry };
}

export function formatApprovalResult(result) {
    if (!result) return 'Send: нет результата.';
    if (result.ok && result.code === 'SENT') {
        return `✅ Отправлено (draft ${result.draft_id}).`;
    }
    if (result.ok && result.code === 'REJECTED') {
        return result.message;
    }
    // blocked / not configured
    return `🚫 ${result.code}: ${result.message || 'отправка заблокирована.'}`;
}

export function handleSendCommand(parsed, opts = {}) {
    const result = processApproval(parsed, opts);
    return { result, text: formatApprovalResult(result) };
}

// ----------------------------------------------------------------------------
// UX1 inline-button entry points. These are thin, safe wrappers used by the
// callback_query router in the master bot. They NEVER send in offline build.
// ----------------------------------------------------------------------------

// Owner-facing messages (UX1 copy).
export const MSG_EDIT_MISSING_RECIPIENT =
    '⛔ Отправка заблокирована: нет получателя. Нажми ✏️ Редактировать или добавь получателя.';
export const MSG_ADAPTER_NOT_CONFIGURED =
    '⛔ SEND_ADAPTER_NOT_CONFIGURED. Отправка не выполнена.';
export const MSG_NO_PREVIEW_FOUND =
    '⛔ NO_PREVIEW_FOUND. Сначала сформируй черновик.';
export const MSG_NOT_OWNER = '⛔ Доступно только владельцу.';

export const EDIT_MODE_PLANNED = 'EDIT_MODE_PLANNED';
export const EDIT_INSTRUCTION = [
    'Режим редактирования черновика.',
    'Чтобы изменить получателя: /audit_edit_recipient <draft_id> email@example.com',
    'Чтобы изменить текст: /audit_edit_body <draft_id> <новый текст>',
    'На этом этапе изменения безопасны и не отправляются без повторного preview + approval.',
].join('\n');

// handleDraftConfirm — ✅ Подтвердить
// Validates: owner, draft_id exists, preview exists, recipient exists,
// send adapter exists, one-message-only, autosend blocked. Otherwise BLOCKED.
export function handleDraftConfirm(draft_id, context = {}) {
    const isOwner = context.isOwner === true;
    if (!isOwner) {
        return { ok: false, code: SEND_BLOCKED_NOT_OWNER, text: MSG_NOT_OWNER };
    }
    if (!draft_id) {
        return { ok: false, code: SEND_BLOCKED_NO_DRAFT, text: MSG_NO_PREVIEW_FOUND };
    }

    const parsed = { action: 'approve', draft_id };
    const result = processApproval(parsed, {
        ...context,
        isOwner: true,
        autosend: false,
        allowRealSend: false, // never real-send from a button in build/test
    });

    if (result.ok) {
        // Unreachable in offline build (no adapter), but kept defensive.
        return { ok: true, code: result.code, text: formatApprovalResult(result), result };
    }

    let text;
    switch (result.code) {
        case SEND_BLOCKED_NO_PREVIEW:
            text = MSG_NO_PREVIEW_FOUND;
            break;
        case SEND_BLOCKED_MISSING_RECIPIENT:
            text = MSG_EDIT_MISSING_RECIPIENT;
            break;
        case SEND_ADAPTER_NOT_CONFIGURED:
            text = MSG_ADAPTER_NOT_CONFIGURED;
            break;
        default:
            text = formatApprovalResult(result);
    }
    return { ok: false, code: result.code, text, result };
}

// handleDraftEdit — ✏️ Редактировать
// Owner-only. Never sends, never writes 13_sales. Returns instruction.
export function handleDraftEdit(draft_id, context = {}) {
    const isOwner = context.isOwner === true;
    if (!isOwner) {
        return { ok: false, code: SEND_BLOCKED_NOT_OWNER, text: MSG_NOT_OWNER };
    }
    return {
        ok: true,
        code: EDIT_MODE_PLANNED,
        draft_id: draft_id || '',
        text: EDIT_INSTRUCTION,
    };
}

// ----------------------------------------------------------------------------
// MAIL-FINAL-P1: single approved TOP-1 client send confirm path.
// handleClientSendConfirm(draft_id, context) — ✅ Подтвердить for a TOP-1 draft.
//   This is the ONLY controller path that can route to a REAL client email.
//   It still enforces every gate before delegating to sendApprovedClientEmail:
//     - owner-only (context.isOwner === true)
//     - draft_id present + preview/draft resolved (recipient required)
//     - recipient must be a real client (NOT EMAIL_TEST_TO / example.com / test)
//     - exactly one message (message_count === 1)
//     - p1_client_send_approved === true && owner_confirmed === true
//     - autosend / mass_send always blocked
//   On success: SEND_OK_CLIENT_P1 (sent_count: 1). Otherwise a safe BLOCK code.
//   NEVER writes to queue / approval_queue / 13_sales here.
export async function handleClientSendConfirm(draft_id, context = {}) {
    const isOwner = context.isOwner === true;
    if (!isOwner) {
        return { ok: false, code: SEND_BLOCKED_NOT_OWNER, text: MSG_NOT_OWNER };
    }
    if (!draft_id) {
        return { ok: false, code: SEND_BLOCKED_NO_DRAFT, text: MSG_NO_PREVIEW_FOUND };
    }

    // Resolve the draft/preview (runtime-only store, never 13_sales).
    let draft = context.draft;
    if ((!draft || draft.draft_id !== draft_id) && context.store instanceof Map) {
        const fromStore = context.store.get(draft_id);
        if (fromStore && fromStore.draft_id === draft_id) draft = fromStore;
    }
    if (!draft || draft.draft_id !== draft_id) {
        return { ok: false, code: SEND_BLOCKED_NO_PREVIEW, text: MSG_NO_PREVIEW_FOUND };
    }
    const envObj = (context && typeof context.env === 'object' && context.env) || {};

    // HONEST RECIPIENT GATE (runs BEFORE the SMTP-config check inside the adapter).
    // A missing / empty / fake / example / test / EMAIL_TEST_TO recipient must be
    // reported as REAL_CLIENT_RECIPIENT_REQUIRED — NEVER as SEND_ADAPTER_NOT_CONFIGURED.
    if (!draft.recipient || String(draft.recipient).trim() === '') {
        return {
            ok: false,
            code: REAL_CLIENT_RECIPIENT_REQUIRED,
            sent_count: 0,
            reason: 'missing',
            text: '🚫 REAL_CLIENT_RECIPIENT_REQUIRED: нет реального получателя. Укажи реальный email клиента (не test/example/EMAIL_TEST_TO).',
        };
    }

    // Recipient must be a real client (not the self-test / example / fixture set).
    const recipientCheck = isP1ClientRecipientValid(draft.recipient, envObj);
    if (!recipientCheck || recipientCheck.ok !== true) {
        return {
            ok: false,
            code: REAL_CLIENT_RECIPIENT_REQUIRED,
            sent_count: 0,
            reason: recipientCheck && recipientCheck.reason,
            text: `🚫 REAL_CLIENT_RECIPIENT_REQUIRED: получатель невалиден (${(recipientCheck && recipientCheck.reason) || 'invalid'}). Нужен реальный email клиента (не test/example/EMAIL_TEST_TO).`,
        };
    }


    // Autosend / mass send are always blocked, regardless of approval flags.
    if (context.autosend === true) {
        return { ok: false, code: SEND_BLOCKED_AUTOSEND, sent_count: 0, text: '🚫 SEND_BLOCKED_AUTOSEND.' };
    }
    if (context.mass_send === true) {
        return { ok: false, code: 'SEND_BLOCKED_MASS_SEND', sent_count: 0, text: '🚫 SEND_BLOCKED_MASS_SEND.' };
    }

    const payload = {
        to: draft.recipient,
        subject: draft.subject || '',
        body: draft.body || '',
        from_label: envObj.EMAIL_FROM_LABEL || 'Дмитрий Смагин',
        channel: 'email',
        approved_by: 'Dmitry',
        message_count: 1,
    };

    const liveCtx = {
        env: envObj,
        owner_confirmed: context.owner_confirmed === true,
        approved_by: 'Dmitry',
        p1_client_send_approved: context.p1_client_send_approved === true,
        real_send_enabled: String(envObj.EMAIL_REAL_SEND_ENABLED || '').toLowerCase() === 'true',
        mass_send: false,
        autosend: false,
    };

    const result = await sendApprovedClientEmail(payload, liveCtx);

    const ok = result.ok === true && result.code === SEND_OK_CLIENT_P1;
    let text;
    if (ok) {
        text = '✅ SEND_OK_CLIENT_P1: письмо TOP-1 клиенту отправлено (sent_count: 1).';
    } else if (result.code === SMTP_SEND_FAILED) {
        text = `🚫 SMTP_SEND_FAILED: ${result.message || 'не удалось отправить (без пароля).'}`;
    } else if (result.code === P1_REQUIRED) {
        text = '🚫 P1_REQUIRED: нужна явная P1-аппрув и подтверждение владельца.';
    } else {
        text = `🚫 ${result.code}: ${result.message || 'client send заблокирован.'}`;
    }

    return {
        ok,
        code: result.code,
        sent_count: result.sent_count || 0,
        secrets_printed: false,
        reads_dotenv: false,
        reads_ai_secrets: false,
        text,
        result,
    };
}

// ----------------------------------------------------------------------------
// E1C1 transport bridge wiring through the controller.
// ----------------------------------------------------------------------------

// E1C1 controller result codes.
export const EMAIL_PREFLIGHT_NOT_CONFIGURED_TRANSPORT = 'EMAIL_PREFLIGHT_NOT_CONFIGURED';
export const EMAIL_SELF_TEST_NEVER_SENDS_IN_BUILD = 'EMAIL_SELF_TEST_NEVER_SENDS_IN_BUILD';

// handleEmailPreflightCommand(context) — /email_preflight.
//   NEVER sends. Owner-only. Read-only transport capability audit (names +
//   booleans only, never secret values). Returns EMAIL_PREFLIGHT_READY when all
//   transport config key NAMES are present, otherwise EMAIL_PREFLIGHT_NOT_CONFIGURED.
export function handleEmailPreflightCommand(context = {}) {
    const isOwner = context.isOwner === true;
    if (!isOwner) {
        return { ok: false, code: SEND_BLOCKED_NOT_OWNER, text: MSG_NOT_OWNER, never_send: NEVER_SEND_ON_PREFLIGHT };
    }

    const cap = getEmailTransportCapability(context);

    // E1C2B live env presence bridge: inspect the runtime env-like object for the
    // PRESENCE of EMAIL_* config key NAMES only. Secret VALUES are never read,
    // copied, returned, or printed. On E1C2B real_send_enabled and can_send_live
    // stay forced-false even if EMAIL_REAL_SEND_ENABLED is present (E1C2C gates send).
    const runtimeEnv = (context && typeof context.env === 'object' && context.env) || {};
    const env_presence = buildEmailEnvPresenceResult(runtimeEnv); // booleans only
    const env_presence_report = buildEnvPresenceReport(env_presence);

    // E1C2C YANDEX alias bridge: map already-present legacy YANDEX_* keys onto the
    // EMAIL_* config slots as ALIASES (+ safe Yandex defaults). Presence-only —
    // login + password VALUES are never read, copied, returned, or printed. On
    // E1C2C real_send_enabled and can_send_live stay forced-false even when both
    // YANDEX_* keys are found (a separate approval gate is required before send).
    const alias = buildEmailConfigPresenceFromAliases(runtimeEnv);
    const alias_report = buildYandexAliasPreflightReport(alias);

    const transport_report = buildTransportCapabilityReport(cap);
    const safe_report = `${alias_report}\n\n${env_presence_report}\n\n${transport_report}`;

    // MAIL-FINAL-2: compute real_send_enabled / can_send_live for the owner-only
    // self-test path ONLY (never client send). Presence/boolean gates only —
    // credential VALUES are never read, copied, returned, or printed.
    const realSendEnabled = String(runtimeEnv.EMAIL_REAL_SEND_ENABLED || '').toLowerCase() === 'true';
    const testOnly = String(runtimeEnv.EMAIL_TEST_ONLY || '').toLowerCase() === 'true';
    const testToPresent = !!(runtimeEnv.EMAIL_TEST_TO && String(runtimeEnv.EMAIL_TEST_TO).trim());
    // can_send_live is TRUE only for the self-test seam (owner-only, EMAIL_TEST_TO),
    // and never enables client send.
    const canSendLiveSelfTest = realSendEnabled && testOnly && testToPresent;


    // configured comes from the alias bridge:
    //   NO | YES_PARTIAL | YES. We treat NO as not-configured for the result code;
    //   YES_PARTIAL / YES both count as configured (alias coverage present), but
    //   real send always stays OFF and can_send_live always NO.
    const configured_state = alias.configured; // 'NO' | 'YES_PARTIAL' | 'YES'
    const configured = configured_state !== CONFIGURED_NO;
    const code = configured
        ? EMAIL_PREFLIGHT_READY
        : EMAIL_PREFLIGHT_NOT_CONFIGURED;

    return {
        ok: true, // status check, not a send
        code,
        never_send: NEVER_SEND_ON_PREFLIGHT,
        configured,
        configured_state, // 'NO' | 'YES_PARTIAL' | 'YES'
        // E1C2C YANDEX alias coverage (presence/source labels only — no values)
        yandex_alias_detected: alias.yandex_alias_detected,
        yandex_login_present: alias.yandex_login_present,
        yandex_app_password_present: alias.yandex_app_password_present,
        email_coverage: alias.email_coverage,
        email_test_to_missing: alias.email_test_to_missing,
        alias_stage: alias.stage, // E1C2C_YANDEX_ALIAS
        login_value_printed: false,
        password_value_printed: false,
        missing_keys: env_presence.missing_keys,
        key_presence: env_presence.key_presence, // booleans only — no values
        expected_env_keys: env_presence.expected_env_keys,
        env_presence_stage: env_presence.stage, // E1C2B_ENV_PRESENCE
        existing_transport_found: cap.existing_transport_found,
        smtp_transport_available: cap.smtp_transport_available,
        legacy_live_send_frozen: cap.legacy_live_send_frozen,
        third_transport_created: cap.third_transport_created,
        // MAIL-FINAL-2: self-test-only flags. can_send_live/real_send_enabled
        // reflect the owner-only self-test seam ONLY; client send stays blocked.
        can_send_live: canSendLiveSelfTest, // self-test path only
        real_send_enabled: realSendEnabled, // from EMAIL_REAL_SEND_ENABLED
        test_only: testOnly,
        test_recipient_present: testToPresent,
        client_send_enabled: false, // client send remains P1-blocked
        email_sent: false,

        secrets_printed: false,
        reads_dotenv: false,
        reads_ai_secrets: false,
        safe_report,
        text: safe_report,
    };
}



// handleEmailTestSelfCommand(context) — /email_test_self.
//   In build/offline this NEVER performs a real send. With a wired mockTransport
//   it returns SEND_OK_MOCK (exactly 1 mock message). Otherwise it returns the
//   appropriate safe BLOCK code from the approved transport seam
//   (SEND_BLOCKED_REAL_SEND_DISABLED / SEND_TRANSPORT_DEPENDENCY_MISSING /
//   SEND_TRANSPORT_NOT_IMPLEMENTED / SEND_ADAPTER_NOT_CONFIGURED).
//   Owner-only. Recipient is forced to EMAIL_TEST_TO (Dmitry-owned) only.
export async function handleEmailTestSelfCommand(context = {}) {
    const isOwner = context.isOwner === true;
    if (!isOwner) {
        return { ok: false, code: SEND_BLOCKED_NOT_OWNER, text: MSG_NOT_OWNER };
    }

    const envObj = (context && typeof context.env === 'object' && context.env) || {};
    const testTo = envObj.EMAIL_TEST_TO || '';

    // MAIL-FINAL-1 self-test message. Recipient is ALWAYS forced to EMAIL_TEST_TO
    // (Dmitry-owned). No client contact, single message only.
    // Subject/body are fixed sentinels so a successful delivery is unambiguous.
    const payload = {
        to: testTo,
        subject: 'AI_WORKSPACE audit_send selftest',
        body: 'SEND_ADAPTER_OK',
        from_label: envObj.EMAIL_FROM_LABEL || 'Дмитрий Смагин',
        channel: 'email',
        approved_by: 'Dmitry',
    };

    // Read flags from the runtime env (presence/values only used as gate booleans;
    // secret credential VALUES are never printed or returned).
    const realSendEnabled = String(envObj.EMAIL_REAL_SEND_ENABLED || '').toLowerCase() === 'true';
    const testOnly = String(envObj.EMAIL_TEST_ONLY || '').toLowerCase() === 'true';

    // If a mockTransport is wired (offline tests) -> mock path, never network.
    if (context.mockTransport && typeof context.mockTransport.send === 'function') {
        const result = sendEmailViaApprovedTransport(payload, {
            ...context, live_send_allowed: false, test_only: true,
        });
        const ok = result.ok === true && result.code === SEND_OK_MOCK_BRIDGE;
        return {
            ok,
            code: result.code,
            sent_count: result.sent_count || 0,
            real_send_enabled: realSendEnabled,
            secrets_printed: false,
            reads_dotenv: false,
            reads_ai_secrets: false,
            text: ok
                ? '✅ SEND_OK_MOCK: self-test отправлен mock-транспортом (offline, без сети).'
                : `🚫 ${result.code}: ${result.message || 'self-test заблокирован (mock).'}`,
            result,
        };
    }

    // If real send is NOT enabled, return an instruction (no send).
    if (!realSendEnabled) {
        return {
            ok: false,
            code: SEND_BLOCKED_REAL_SEND_DISABLED,
            sent_count: 0,
            real_send_enabled: false,
            secrets_printed: false,
            reads_dotenv: false,
            reads_ai_secrets: false,
            text: '🚫 SEND_BLOCKED_REAL_SEND_DISABLED. Чтобы выполнить self-test, установите EMAIL_REAL_SEND_ENABLED=true (и EMAIL_TEST_ONLY=true) в env, затем перезапустите gateway.',
        };
    }

    // Recipient must equal EMAIL_TEST_TO.
    if (!testTo || payload.to !== testTo) {
        return {
            ok: false,
            code: 'SEND_BLOCKED_TEST_ONLY_RECIPIENT',
            sent_count: 0,
            real_send_enabled: realSendEnabled,
            secrets_printed: false,
            text: '🚫 Получатель должен быть EMAIL_TEST_TO.',
        };
    }

    // LIVE self-test send. All gates enforced again inside sendApprovedSelfTestEmail.
    const liveCtx = {
        env: envObj,
        owner_confirmed: true,
        approved_by: 'Dmitry',
        test_only: testOnly,
        real_send_enabled: realSendEnabled,
        mass_send: false,
        autosend: false,
    };

    const result = await sendApprovedSelfTestEmail(payload, liveCtx);

    const ok = result.ok === true && result.code === SEND_OK_TEST_EMAIL;

    // Safe audit log line. NEVER includes password/login/token — only draft_id,
    // recipient, a SENT/FAILED result code, and an ISO timestamp.
    const sendLog = buildSendLogEntry(
        { draft_id: context.draft_id || 'selftest', recipient: payload.to, subject: payload.subject, body: payload.body, channel: 'email' },
        { send_result: ok ? 'SENT' : 'FAILED' },
    );
    try {
        console.log('[audit_send_selftest]', JSON.stringify({
            draft_id: (sendLog && sendLog.lead_id) || context.draft_id || 'selftest',
            recipient: payload.to,
            result: ok ? 'SENT' : 'FAILED',
            code: result.code,
            timestamp: (sendLog && sendLog.timestamp) || new Date().toISOString(),
        }));
    } catch { /* logging must never throw or leak secrets */ }

    let text;
    if (ok) {
        text = '✅ SEND_OK_TEST_EMAIL: self-test письмо отправлено через Yandex SMTP на EMAIL_TEST_TO.';
    } else if (result.code === SMTP_SEND_FAILED) {
        // Never include password/login — message is sanitized in the adapter.
        text = `🚫 SMTP_SEND_FAILED: ${result.message || 'не удалось отправить (без пароля).'}`;
    } else {
        text = `🚫 ${result.code}: ${result.message || 'self-test заблокирован.'}`;
    }

    return {
        ok,
        code: result.code,
        sent_count: result.sent_count || 0,
        real_send_enabled: realSendEnabled,
        recipient_was_test_to: payload.to === testTo,
        secrets_printed: false,
        reads_dotenv: false,
        reads_ai_secrets: false,
        text,
        result,
    };
}



// ----------------------------------------------------------------------------
// PREVIEW-TO-ME: /audit_send_preview_to_me top1
//   Builds the REAL TOP-1 audit_send draft via the production draft generator
//   (buildDraft) — same subject/body as a real client send — then sends EXACTLY
//   ONE preview email to Dmitry (EMAIL_TEST_TO) ONLY, via the self-test SMTP
//   transport (which is itself hard-locked to EMAIL_TEST_TO).
//
//   HARD SAFETY GUARANTEES:
//     - Recipient is FORCED to EMAIL_TEST_TO. The real client recipient from the
//       production draft is discarded and NEVER used.
//     - NO client send. NO lead status change to "contacted". NO client SENT log.
//     - NO autosend / NO mass send (both forced false; transport blocks them too).
//     - A visible header "PREVIEW ONLY — NOT SENT TO CLIENT" is injected at the
//       top of the body.
//     - Owner-only.
export const PREVIEW_HEADER = 'PREVIEW ONLY — NOT SENT TO CLIENT';
export const PREVIEW_BLOCKED_NO_TEST_TO = 'PREVIEW_BLOCKED_NO_TEST_TO';
export const PREVIEW_BLOCKED_NO_DRAFT = 'PREVIEW_BLOCKED_NO_DRAFT';

export async function handleAuditSendPreviewToMe(target = 'top1', context = {}) {
    const isOwner = context.isOwner === true;
    if (!isOwner) {
        return { ok: false, code: SEND_BLOCKED_NOT_OWNER, text: MSG_NOT_OWNER };
    }

    const envObj = (context && typeof context.env === 'object' && context.env) || {};
    const testTo = envObj.EMAIL_TEST_TO || '';
    if (!testTo) {
        return {
            ok: false,
            code: PREVIEW_BLOCKED_NO_TEST_TO,
            sent_count: 0,
            text: '🚫 PREVIEW_BLOCKED_NO_TEST_TO: EMAIL_TEST_TO не задан. Preview не отправлен.',
        };
    }

    // Build the REAL production draft (same subject/body generator as client send).
    // resolve:false so we do NOT need / use the real client recipient at all.
    const draft = buildDraft(target, { ...context, resolve: false });
    if (!draft || draft.ok !== true) {
        return {
            ok: false,
            code: PREVIEW_BLOCKED_NO_DRAFT,
            sent_count: 0,
            text: `🚫 PREVIEW_BLOCKED_NO_DRAFT: не удалось построить ${target} черновик (${draft && draft.code || 'NO_DRAFT'}).`,
        };
    }

    // Real subject is preserved exactly. Body gets the visible preview header.
    const subject = draft.subject || '';
    const body = `${PREVIEW_HEADER}\n\n${draft.body || ''}`;

    // Recipient is FORCED to EMAIL_TEST_TO (Dmitry). Real client recipient ignored.
    const payload = {
        to: testTo,
        subject,
        body,
        from_label: envObj.EMAIL_FROM_LABEL || 'Дмитрий Смагин',
        channel: 'email',
        approved_by: 'Dmitry',
    };

    const realSendEnabled = String(envObj.EMAIL_REAL_SEND_ENABLED || '').toLowerCase() === 'true';
    const testOnly = String(envObj.EMAIL_TEST_ONLY || '').toLowerCase() === 'true';

    if (!realSendEnabled) {
        return {
            ok: false,
            code: SEND_BLOCKED_REAL_SEND_DISABLED,
            sent_count: 0,
            recipient: testTo,
            subject,
            real_client_recipient_used: false,
            text: '🚫 SEND_BLOCKED_REAL_SEND_DISABLED: установите EMAIL_REAL_SEND_ENABLED=true (и EMAIL_TEST_ONLY=true), затем перезапустите gateway.',
        };
    }

    // Route through the self-test SMTP transport. It is hard-locked to
    // EMAIL_TEST_TO and enforces single-message / no-autosend / no-mass-send.
    const liveCtx = {
        env: envObj,
        owner_confirmed: true,
        approved_by: 'Dmitry',
        test_only: testOnly,
        real_send_enabled: realSendEnabled,
        mass_send: false,
        autosend: false,
    };

    const result = await sendApprovedSelfTestEmail(payload, liveCtx);
    const ok = result.ok === true && result.code === SEND_OK_TEST_EMAIL;

    try {
        console.log('[audit_send_preview_to_me]', JSON.stringify({
            target,
            recipient: payload.to,
            subject,
            result: ok ? 'SENT' : 'FAILED',
            code: result.code,
            real_client_recipient_used: false,
            timestamp: new Date().toISOString(),
        }));
    } catch { /* logging must never throw or leak secrets */ }

    let text;
    if (ok) {
        text = [
            '✅ PREVIEW SENT (только тебе, EMAIL_TEST_TO).',
            `subject: ${subject}`,
            `recipient: ${payload.to}`,
            'Реальный клиент НЕ затронут: клиенту НЕ отправлено, статус НЕ изменён, client-лог НЕ записан.',
            'Autosend: BLOCKED.',
        ].join('\n');
    } else if (result.code === SMTP_SEND_FAILED) {
        text = `🚫 SMTP_SEND_FAILED: ${result.message || 'не удалось отправить (без пароля).'}`;
    } else {
        text = `🚫 ${result.code}: ${result.message || 'preview заблокирован.'}`;
    }

    return {
        ok,
        code: result.code,
        sent_count: result.sent_count || 0,
        recipient: payload.to,
        subject,
        recipient_was_test_to: payload.to === testTo,
        real_client_recipient_used: false,
        secrets_printed: false,
        reads_dotenv: false,
        reads_ai_secrets: false,
        text,
        result,
    };
}


export default {
    OWNER_REFUSAL,
    SEND_ADAPTER_NOT_CONFIGURED,

    SEND_BLOCKED_MISSING_RECIPIENT,
    SEND_BLOCKED_NO_DRAFT,
    SEND_BLOCKED_NO_PREVIEW,
    SEND_BLOCKED_NOT_OWNER,
    SEND_BLOCKED_AUTOSEND,
    SEND_BLOCKED_RATE_LIMIT,
    MSG_EDIT_MISSING_RECIPIENT,
    MSG_ADAPTER_NOT_CONFIGURED,
    MSG_NO_PREVIEW_FOUND,
    MSG_NOT_OWNER,
    EDIT_MODE_PLANNED,
    EDIT_INSTRUCTION,
    classifySendCommand,
    buildSendLogEntry,
    processApproval,
    formatApprovalResult,
    handleSendCommand,
    handleDraftConfirm,
    handleDraftEdit,
    handleClientSendConfirm,
    SEND_OK_CLIENT_P1,
    P1_REQUIRED,
    P1_BLOCKED_INVALID_RECIPIENT,
    handleEmailSendPreflight,
    handleEmailPreflightCommand,
    handleEmailTestSelfCommand,
    handleAuditSendPreviewToMe,
    PREVIEW_HEADER,
    PREVIEW_BLOCKED_NO_TEST_TO,
    PREVIEW_BLOCKED_NO_DRAFT,

    EMAIL_PREFLIGHT_READY,
    EMAIL_PREFLIGHT_NOT_CONFIGURED,
    NEVER_SEND_ON_PREFLIGHT,
    EMAIL_SELF_TEST_NEVER_SENDS_IN_BUILD,
};



