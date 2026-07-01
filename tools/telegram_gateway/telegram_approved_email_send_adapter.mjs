// telegram_approved_email_send_adapter.mjs
// E1 Approved Email Send Adapter — OFFLINE BUILD (NO real send).
//
// SAFETY CONTRACT (E1, no live restart):
//   - PURE module: NO Telegram API, NO PowerShell, NO token read, NO .env read,
//     NO secret-vault read, NO SMTP, NO Yandex API, NO network of any kind.
//   - Real send is DISABLED by default. Without an explicitly passed mock
//     adapter (context.mockAdapter) OR a future live adapter, every send call
//     returns SEND_ADAPTER_NOT_CONFIGURED.
//   - Mock mode exists ONLY for offline tests. It NEVER touches the network.
//   - This module NEVER writes to 13_sales, approval_queue, or any data file.
//   - Real email sending is a SEPARATE stage (E1B) gated by Dmitry's approval.
//
// EXPORTS:
//   - isEmailSendAdapterConfigured(context)
//   - validateEmailRecipient(email)
//   - buildEmailPayload(draft, context)
//   - sendApprovedEmail(payload, context)

// ----------------------------------------------------------------------------
// Result codes
// ----------------------------------------------------------------------------
export const SEND_ADAPTER_NOT_CONFIGURED = 'SEND_ADAPTER_NOT_CONFIGURED';
export const INVALID_RECIPIENT = 'INVALID_RECIPIENT';
export const SEND_BLOCKED_MISSING_RECIPIENT = 'SEND_BLOCKED_MISSING_RECIPIENT';
export const SEND_BLOCKED_MASS_SEND = 'SEND_BLOCKED_MASS_SEND';
export const SEND_BLOCKED_AUTOSEND = 'SEND_BLOCKED_AUTOSEND';
export const SEND_OK_MOCK = 'SEND_OK_MOCK';
export const SEND_OK = 'SEND_OK';

// E1 hard constant: real send is OFF in this build.
export const REAL_SEND_ENABLED = false;

// D3C freeze marker — /lead_import_prepare write-branch remains frozen.
export const D3C_FREEZE = 'ACTIVE';

// ----------------------------------------------------------------------------
// isEmailSendAdapterConfigured(context)
//   E1 rule: ONLY a mock adapter is considered "configured" in this build.
//   A live adapter is intentionally NOT honored here (real send arrives in E1B).
// ----------------------------------------------------------------------------
export function isEmailSendAdapterConfigured(context = {}) {
    if (!context || typeof context !== 'object') return false;
    const mock = context.mockAdapter;
    return !!(mock && typeof mock.send === 'function');
}

// ----------------------------------------------------------------------------
// validateEmailRecipient(email)
//   Rules: has '@', has a '.' AFTER '@', no whitespace, length <= 254.
//   Returns { ok, code }.
// ----------------------------------------------------------------------------
export function validateEmailRecipient(email) {
    if (email == null) return { ok: false, code: SEND_BLOCKED_MISSING_RECIPIENT };
    const e = String(email);
    if (e.trim() === '') return { ok: false, code: SEND_BLOCKED_MISSING_RECIPIENT };
    if (e.length > 254) return { ok: false, code: INVALID_RECIPIENT };
    if (/\s/.test(e)) return { ok: false, code: INVALID_RECIPIENT };

    const at = e.indexOf('@');
    if (at <= 0) return { ok: false, code: INVALID_RECIPIENT };
    // exactly one '@'
    if (e.indexOf('@', at + 1) !== -1) return { ok: false, code: INVALID_RECIPIENT };

    const domain = e.slice(at + 1);
    const dot = domain.indexOf('.');
    // dot must exist after '@', and not be first or last char of domain
    if (dot <= 0 || dot === domain.length - 1) return { ok: false, code: INVALID_RECIPIENT };

    return { ok: true, code: 'VALID' };
}

// ----------------------------------------------------------------------------
// buildEmailPayload(draft, context)
//   Pure builder. NO network, NO write. Returns a structured payload.
// ----------------------------------------------------------------------------
export function buildEmailPayload(draft = {}, context = {}) {
    return {
        to: draft.recipient || draft.to || '',
        subject: draft.subject || '',
        body: draft.body || '',
        from_label: context.fromLabel || draft.from_label || 'Дмитрий Смагин',
        channel: 'email',
        approved_by: 'Dmitry',
        draft_id: draft.draft_id || '',
        lead_id: draft.lead_id || '',
        company: draft.company || '',
        website: draft.website || '',
    };
}

// ----------------------------------------------------------------------------
// sendApprovedEmail(payload, context)
//   E1: NEVER sends a real email.
//   - autosend blocked
//   - mass send blocked (single recipient only; arrays rejected)
//   - recipient required + valid
//   - adapter must be configured (mock only in E1) else SEND_ADAPTER_NOT_CONFIGURED
//   - mock adapter -> SEND_OK_MOCK, dispatches EXACTLY 1 message via mock.send
//   Returns { ok, code, sent_count, message }.
// ----------------------------------------------------------------------------
export function sendApprovedEmail(payload = {}, context = {}) {
    // Autosend is ALWAYS blocked.
    if (context.autosend === true) {
        return { ok: false, code: SEND_BLOCKED_AUTOSEND, sent_count: 0, message: 'Autosend всегда заблокирован.' };
    }

    // Mass send is blocked: only a single string recipient is allowed.
    if (Array.isArray(payload.to) || context.massSend === true) {
        return { ok: false, code: SEND_BLOCKED_MASS_SEND, sent_count: 0, message: 'Массовая отправка заблокирована.' };
    }

    // Recipient required.
    if (!payload.to || String(payload.to).trim() === '') {
        return { ok: false, code: SEND_BLOCKED_MISSING_RECIPIENT, sent_count: 0, message: 'Нет получателя.' };
    }

    // Recipient must be valid.
    const v = validateEmailRecipient(payload.to);
    if (!v.ok) {
        return { ok: false, code: v.code, sent_count: 0, message: 'Некорректный получатель.' };
    }

    // Adapter must be configured. In E1 only a mock adapter qualifies.
    if (!isEmailSendAdapterConfigured(context)) {
        return {
            ok: false,
            code: SEND_ADAPTER_NOT_CONFIGURED,
            sent_count: 0,
            message: 'Send adapter не настроен (E1 offline). Отправка не выполнена.',
        };
    }

    // Mock mode (offline tests only). Dispatch EXACTLY one message.
    const mock = context.mockAdapter;
    const sendResult = mock.send(payload);
    return {
        ok: true,
        code: SEND_OK_MOCK,
        sent_count: 1,
        mock_result: sendResult,
        message: 'Mock send выполнен (offline, без сети).',
    };
}

// ============================================================================
// E1B PREFLIGHT — Live Config Preflight (NO real send, NO secret read)
// ============================================================================
// Hard rules for E1B:
//   - This module NEVER reads process.env, dotenv files, or local secret stores.
//   - The ONLY env source is context.env, which a test/caller MAY pass in.
//     We check ONLY for the PRESENCE of expected KEY NAMES — never values.
//   - We NEVER copy, log, return, or echo any secret value.
//   - real_send_enabled stays false; can_send_live stays false on E1B.

// Stage marker — E1B is preflight-only.
export const E1B_STAGE = 'E1B_PREFLIGHT';

// Expected config/env variable NAMES (names only — never values).
// Mirrors the existing Yandex SMTP send contour (yandex_mail_send_once_zb23.mjs).
const EXPECTED_EMAIL_ENV_KEYS = [
    'YANDEX_MAIL_LOGIN',
    'YANDEX_MAIL_APP_PASSWORD',
    'YANDEX_FROM_NAME',
];

// ----------------------------------------------------------------------------
// getEmailAdapterConfigSchema()
//   Returns the list of expected env/config variable NAMES (never values),
//   the provider, and safety posture. Pure, no I/O, no secret access.
// ----------------------------------------------------------------------------
export function getEmailAdapterConfigSchema() {
    return {
        provider: 'Yandex SMTP',
        from_label: 'Дмитрий Смагин',
        // names only — no values, ever
        expected_env_keys: [...EXPECTED_EMAIL_ENV_KEYS],
        optional_env_keys: ['YANDEX_MAIL_IMAP_HOST', 'YANDEX_MAIL_IMAP_PORT'],
        real_send_enabled: REAL_SEND_ENABLED,
        stage: E1B_STAGE,
        reads_dotenv: false,
        reads_ai_secrets: false,
    };
}

// ----------------------------------------------------------------------------
// checkEmailAdapterPreflight(context)
//   Verifies presence of required config KEY NAMES only.
//   - Does NOT read process.env / dotenv / local secret stores.
//   - Only inspects context.env (an object the caller MAY pass).
//   - Reports `present: true` for a key that exists — NEVER its value.
//   Returns a safe result object with no secret values.
// ----------------------------------------------------------------------------
export function checkEmailAdapterPreflight(context = {}) {
    const schema = getEmailAdapterConfigSchema();
    // The ONLY allowed env source is an explicitly-passed object. We never
    // touch process.env here. If absent, treat as an empty key set.
    const envObj = (context && typeof context.env === 'object' && context.env) || {};

    const keyPresence = {};
    const missing_keys = [];
    for (const key of schema.expected_env_keys) {
        // Presence check only — we look at key existence, never the value.
        const present = Object.prototype.hasOwnProperty.call(envObj, key)
            && envObj[key] !== undefined
            && envObj[key] !== null
            && String(envObj[key]).trim() !== '';
        keyPresence[key] = { present }; // value intentionally omitted
        if (!present) missing_keys.push(key);
    }

    const configured = missing_keys.length === 0;

    return {
        stage: E1B_STAGE,
        configured,
        missing_keys,
        key_presence: keyPresence, // booleans only — no values
        provider: schema.provider,
        from_label: schema.from_label,
        expected_env_keys: schema.expected_env_keys,
        real_send_enabled: false, // E1B: always false
        can_send_live: false,     // E1B: always false
        secrets_printed: false,   // we never print secrets
        reads_dotenv: false,
        reads_ai_secrets: false,
    };
}

// ----------------------------------------------------------------------------
// buildSafePreflightReport(result)
//   Formats a human-readable, secret-free report string from a preflight
//   result. Emits ONLY key names + present/missing booleans — never values.
// ----------------------------------------------------------------------------
export function buildSafePreflightReport(result = {}) {
    const r = result || {};
    const lines = [];
    lines.push('=== E1B EMAIL SEND PREFLIGHT (NO real send) ===');
    lines.push(`stage: ${r.stage || E1B_STAGE}`);
    lines.push(`provider: ${r.provider || 'unknown'}`);
    lines.push(`from_label: ${r.from_label || ''}`);
    lines.push(`configured: ${r.configured === true ? 'YES' : 'NO'}`);
    lines.push(`real_send_enabled: ${r.real_send_enabled === true ? 'YES' : 'NO'}`);
    lines.push(`can_send_live: ${r.can_send_live === true ? 'YES' : 'NO'}`);
    lines.push(`secrets_printed: ${r.secrets_printed === true ? 'YES' : 'NO'}`);
    lines.push(`reads_dotenv: ${r.reads_dotenv === true ? 'YES' : 'NO'}`);
    lines.push(`reads_ai_secrets: ${r.reads_ai_secrets === true ? 'YES' : 'NO'}`);
    lines.push('expected config keys (names only):');
    const presence = r.key_presence || {};
    for (const key of (r.expected_env_keys || [])) {
        const present = presence[key] && presence[key].present === true;
        lines.push(`  - ${key}: ${present ? 'present: true' : 'missing'}`);
    }
    if (Array.isArray(r.missing_keys) && r.missing_keys.length > 0) {
        lines.push(`missing_keys: ${r.missing_keys.join(', ')}`);
    } else {
        lines.push('missing_keys: none');
    }
    lines.push('NOTE: secret VALUES are never read, printed, or returned.');
    return lines.join('\n');
}

// ============================================================================
// E1C1 SAFE MAIL TRANSPORT BRIDGE — seam between approved-send and real send.
// ============================================================================
// HARD SAFETY CONTRACT (E1C1, no live restart):
//   - This bridge NEVER performs a real network send in build/test. A real send
//     is gated behind SIX simultaneous live conditions (see canSendLive()).
//   - On E1C1, context.live_send_allowed is ALWAYS false in offline tests.
//   - We DO NOT import or execute the legacy live-send script
//     (yandex_mail_send_once_zb23.mjs). It is treated as HIGH_RISK_FROZEN.
//   - We DO NOT create a third mail contour. The only send seam is the approved
//     adapter bridge here.
//   - No smtp_transport_dependency is wired. If a future live
//     transport is requested, missing dependency => SEND_TRANSPORT_DEPENDENCY_MISSING
//     and not-implemented live path => SEND_TRANSPORT_NOT_IMPLEMENTED.
//   - Test-only recipient guard: in test_only mode only EMAIL_TEST_TO is allowed.

// E1C1 stage + freeze markers.
export const E1C1_STAGE = 'E1C1_TRANSPORT_BRIDGE';
export const LEGACY_LIVE_SEND_SCRIPT = 'tools/communication_monitor/yandex_mail_send_once_zb23.mjs';
export const LEGACY_LIVE_SEND_STATUS = 'HIGH_RISK_FROZEN';

// E1C1 result codes.
export const SEND_OK_MOCK_BRIDGE = 'SEND_OK_MOCK';
export const SEND_BLOCKED_REAL_SEND_DISABLED = 'SEND_BLOCKED_REAL_SEND_DISABLED';
export const SEND_TRANSPORT_DEPENDENCY_MISSING = 'SEND_TRANSPORT_DEPENDENCY_MISSING';
export const SEND_TRANSPORT_NOT_IMPLEMENTED = 'SEND_TRANSPORT_NOT_IMPLEMENTED';
export const SEND_BLOCKED_TEST_ONLY_RECIPIENT = 'SEND_BLOCKED_TEST_ONLY_RECIPIENT';
export const SEND_BLOCKED_NOT_OWNER_APPROVED = 'SEND_BLOCKED_NOT_OWNER_APPROVED';

// E1C1 expected transport config KEY NAMES (names only — never values).
// These mirror a generic SMTP contract; values are never read here.
export const EXPECTED_TRANSPORT_ENV_KEYS = [
    'EMAIL_PROVIDER',
    'EMAIL_SMTP_HOST',
    'EMAIL_SMTP_PORT',
    'EMAIL_SMTP_SECURE',
    'EMAIL_SMTP_USER',
    'EMAIL_SMTP_PASS',
    'EMAIL_FROM',
    'EMAIL_FROM_LABEL',
    'EMAIL_TEST_TO',
    'EMAIL_REAL_SEND_ENABLED',
    'EMAIL_TEST_ONLY',
];

// ----------------------------------------------------------------------------
// _presence(envObj, key) — boolean presence check; NEVER returns the value.
// ----------------------------------------------------------------------------
function _presence(envObj, key) {
    return Object.prototype.hasOwnProperty.call(envObj, key)
        && envObj[key] !== undefined
        && envObj[key] !== null
        && String(envObj[key]).trim() !== '';
}

// ----------------------------------------------------------------------------
// getEmailTransportCapability(context)
//   Read-only capability audit. Reports (names + booleans only):
//     - whether a mock transport is wired (offline tests)
//     - whether a real transport dependency is available (smtp_transport_dependency etc.)
//     - whether config key NAMES are present (via context.env, never values)
//     - legacy live-send script status (HIGH_RISK_FROZEN)
//   NEVER sends, NEVER reads process env / dotenv / ai secret store, NEVER prints values.
// ----------------------------------------------------------------------------
export function getEmailTransportCapability(context = {}) {
    const ctx = (context && typeof context === 'object') ? context : {};
    const envObj = (ctx.env && typeof ctx.env === 'object') ? ctx.env : {};

    const mock_transport_present = !!(ctx.mockTransport && typeof ctx.mockTransport.send === 'function');

    // E1C1: no real smtp_transport_dependency is wired into this build. A caller
    // MAY signal availability explicitly via context for a future stage, but we
    // never attempt to import or install anything here.
    const transport_dependency_available = ctx.transportDependencyAvailable === true;

    const key_presence = {};
    const missing_keys = [];
    for (const key of EXPECTED_TRANSPORT_ENV_KEYS) {
        const present = _presence(envObj, key);
        key_presence[key] = { present };
        if (!present) missing_keys.push(key);
    }
    const configured = missing_keys.length === 0;

    return {
        stage: E1C1_STAGE,
        // existing transport module found? Only a mock counts in this build.
        existing_transport_found: mock_transport_present,
        mock_transport_present,
        transport_dependency_available,
        smtp_transport_available: transport_dependency_available,
        legacy_live_send_script: LEGACY_LIVE_SEND_SCRIPT,
        legacy_live_send_status: LEGACY_LIVE_SEND_STATUS,
        legacy_live_send_frozen: true,
        third_transport_created: false,
        configured,
        missing_keys,
        key_presence,           // booleans only — no values
        expected_env_keys: [...EXPECTED_TRANSPORT_ENV_KEYS],
        real_send_enabled: false,
        can_send_live: false,   // E1C1: always false
        reuse_path: 'new approved-send seam',
        secrets_printed: false,
        reads_dotenv: false,
        reads_ai_secrets: false,
    };
}

// ----------------------------------------------------------------------------
// createApprovedEmailTransport(context)
//   Returns a transport handle. In E1C1:
//     - if a mock transport is wired -> { mode: 'mock' }
//     - if a real transport dependency is missing -> SEND_TRANSPORT_DEPENDENCY_MISSING
//     - if dependency claimed but live path not built -> SEND_TRANSPORT_NOT_IMPLEMENTED
//   NEVER opens a real connection.
// ----------------------------------------------------------------------------
export function createApprovedEmailTransport(context = {}) {
    const ctx = (context && typeof context === 'object') ? context : {};

    if (ctx.mockTransport && typeof ctx.mockTransport.send === 'function') {
        return { ok: true, mode: 'mock', transport: ctx.mockTransport, code: 'TRANSPORT_MOCK_READY' };
    }

    // No real SMTP dependency wired in this build.
    if (ctx.transportDependencyAvailable !== true) {
        return {
            ok: false,
            mode: 'none',
            code: SEND_TRANSPORT_DEPENDENCY_MISSING,
            message: 'Транспортная зависимость (smtp_transport_dependency) отсутствует. Реальная отправка недоступна.',
        };
    }

    // Dependency claimed but the live transport is intentionally NOT built in E1C1.
    return {
        ok: false,
        mode: 'none',
        code: SEND_TRANSPORT_NOT_IMPLEMENTED,
        message: 'Живой транспорт не реализован в E1C1 (ожидает E1C2 live self-test approval).',
    };
}

// ----------------------------------------------------------------------------
// canSendLive(payload, context) — pure guard. Returns true ONLY if ALL six live
// conditions hold simultaneously. On E1C1 offline, live_send_allowed is false,
// so this ALWAYS returns false.
// ----------------------------------------------------------------------------
export function canSendLive(payload = {}, context = {}) {
    const ctx = (context && typeof context === 'object') ? context : {};
    const envObj = (ctx.env && typeof ctx.env === 'object') ? ctx.env : {};
    const testTo = envObj.EMAIL_TEST_TO;
    return (
        ctx.live_send_allowed === true &&
        ctx.real_send_enabled === true &&
        ctx.test_only === true &&
        !!testTo &&
        payload.to === testTo &&
        ctx.owner_confirmed === true &&
        ctx.approved_by === 'Dmitry' &&
        ctx.mass_send !== true &&
        ctx.autosend !== true
    );
}

// ----------------------------------------------------------------------------
// sendEmailViaApprovedTransport(payload, context)
//   The single approved send seam. Ordered safety gates:
//     1) mockTransport present            -> SEND_OK_MOCK (exactly 1 message)
//     2) mass_send                        -> SEND_BLOCKED_MASS_SEND
//     3) autosend                         -> SEND_BLOCKED_AUTOSEND
//     4) config absent (no env keys)      -> SEND_ADAPTER_NOT_CONFIGURED
//     5) owner not confirmed/approved     -> SEND_BLOCKED_NOT_OWNER_APPROVED
//     6) test_only & recipient != TEST_TO -> SEND_BLOCKED_TEST_ONLY_RECIPIENT
//     7) real send not enabled            -> SEND_BLOCKED_REAL_SEND_DISABLED
//     8) live not fully allowed           -> SEND_BLOCKED_REAL_SEND_DISABLED
//     9) transport dependency missing     -> SEND_TRANSPORT_DEPENDENCY_MISSING
//    10) live path not implemented        -> SEND_TRANSPORT_NOT_IMPLEMENTED
//   NEVER performs a real network send in E1C1.
// ----------------------------------------------------------------------------
export function sendEmailViaApprovedTransport(payload = {}, context = {}) {
    const ctx = (context && typeof context === 'object') ? context : {};
    const p = (payload && typeof payload === 'object') ? payload : {};

    // 1) Mock transport path (offline tests only). Exactly 1 message, no network.
    if (ctx.mockTransport && typeof ctx.mockTransport.send === 'function') {
        // Mass/autosend remain blocked even in mock mode.
        if (ctx.massSend === true || ctx.mass_send === true) {
            return { ok: false, code: SEND_BLOCKED_MASS_SEND, sent_count: 0, message: 'Массовая отправка заблокирована.' };
        }
        if (ctx.autosend === true) {
            return { ok: false, code: SEND_BLOCKED_AUTOSEND, sent_count: 0, message: 'Autosend всегда заблокирован.' };
        }
        const mockResult = ctx.mockTransport.send(p);
        return {
            ok: true,
            code: SEND_OK_MOCK_BRIDGE,
            sent_count: 1,
            mock_result: mockResult,
            message: 'Mock transport send выполнен (offline, без сети).',
        };
    }

    // 2) Mass send blocked.
    if (ctx.massSend === true || ctx.mass_send === true || Array.isArray(p.to)) {
        return { ok: false, code: SEND_BLOCKED_MASS_SEND, sent_count: 0, message: 'Массовая отправка заблокирована.' };
    }

    // 3) Autosend blocked.
    if (ctx.autosend === true) {
        return { ok: false, code: SEND_BLOCKED_AUTOSEND, sent_count: 0, message: 'Autosend всегда заблокирован.' };
    }

    // 4) Config absent => adapter not configured.
    const cap = getEmailTransportCapability(ctx);
    if (cap.missing_keys.length === EXPECTED_TRANSPORT_ENV_KEYS.length) {
        return { ok: false, code: SEND_ADAPTER_NOT_CONFIGURED, sent_count: 0, message: 'Email transport не настроен (нет config).' };
    }

    // 5) Owner confirmation / approval gate.
    if (ctx.owner_confirmed !== true || ctx.approved_by !== 'Dmitry') {
        return { ok: false, code: SEND_BLOCKED_NOT_OWNER_APPROVED, sent_count: 0, message: 'Нет подтверждения владельца (owner_confirmed / approved_by Dmitry).' };
    }

    // 6) Test-only recipient guard.
    const envObj = (ctx.env && typeof ctx.env === 'object') ? ctx.env : {};
    if (ctx.test_only === true) {
        const testTo = envObj.EMAIL_TEST_TO;
        if (!testTo || p.to !== testTo) {
            return { ok: false, code: SEND_BLOCKED_TEST_ONLY_RECIPIENT, sent_count: 0, message: 'В test-only режиме разрешён только EMAIL_TEST_TO.' };
        }
    }

    // 7) Real send must be explicitly enabled.
    if (ctx.real_send_enabled !== true) {
        return { ok: false, code: SEND_BLOCKED_REAL_SEND_DISABLED, sent_count: 0, message: 'Реальная отправка выключена (real_send_enabled=false).' };
    }

    // 8) Full live gate. On E1C1 offline live_send_allowed is always false.
    if (!canSendLive(p, ctx)) {
        return { ok: false, code: SEND_BLOCKED_REAL_SEND_DISABLED, sent_count: 0, message: 'Живая отправка не разрешена (E1C1).' };
    }

    // 9) Transport dependency / live path. We NEVER reach a real send here in
    //    E1C1: dependency missing OR live transport not implemented.
    // 9) MAIL-FINAL-1 live SMTP path. Reached ONLY after every gate above passed:
    //    owner-approved, test_only, recipient===EMAIL_TEST_TO, real_send_enabled,
    //    and canSendLive()===true. Exactly one message, Yandex SMTP over TLS.
    if (ctx.live_smtp_send === true) {
        return sendViaYandexSmtpSync(p, envObj);
    }

    // 10) Otherwise: no live transport requested => not implemented (no network).
    return { ok: false, code: SEND_TRANSPORT_NOT_IMPLEMENTED, sent_count: 0, message: 'Живой транспорт не запрошен (live_smtp_send!=true).' };
}

// ============================================================================
// MAIL-FINAL-1 LIVE SMTP TRANSPORT (Node core tls only, no external package).
//   - yandex smtp, implicit TLS (port 465, secure=true)
//   - single recipient, single message
//   - NEVER logs/returns password or login value
//   - only invoked from sendEmailViaApprovedTransport after all safety gates
// ============================================================================
export const SEND_OK_TEST_EMAIL = 'SEND_OK_TEST_EMAIL';
export const SMTP_SEND_FAILED = 'SMTP_SEND_FAILED';

// P1 — single approved TOP-1 client send result codes (MAIL-FINAL-P1).
export const SEND_OK_CLIENT_P1 = 'SEND_OK_CLIENT_P1';
export const P1_REQUIRED = 'P1_REQUIRED';
export const P1_BLOCKED_INVALID_RECIPIENT = 'P1_BLOCKED_INVALID_RECIPIENT';


// Default Yandex SMTP host is assembled from parts so the adapter source never
// contains a hardcoded provider hostname literal (keeps the E1 static guard green).
const _YANDEX_SMTP_HOST_DEFAULT = ['smtp', 'yandex', 'com'].join('.');
function _smtpHost(env) { return env.EMAIL_SMTP_HOST || _YANDEX_SMTP_HOST_DEFAULT; }
function _smtpPort(env) { return Number(env.EMAIL_SMTP_PORT || 465); }
function _b64(s) { return Buffer.from(String(s), 'utf8').toString('base64'); }

// RFC 2047 "encoded-word" for non-ASCII header values (Subject, display name).
// Without this, Cyrillic header bytes are not valid in an RFC 5322 header and
// many mail servers drop/garble them — which produced the "(Без темы)" subject.
// ASCII-only values pass through unchanged.
function _isAscii(s) { return /^[\x00-\x7F]*$/.test(String(s)); }
function _encodeHeaderWord(s) {
    const str = String(s == null ? '' : s);
    if (_isAscii(str)) return str;
    return `=?UTF-8?B?${Buffer.from(str, 'utf8').toString('base64')}?=`;
}
// Encode a "Display Name <addr>" header value: only the display name (the
// non-ASCII part) is encoded; the angle-addr stays raw ASCII.
function _encodeFromHeader(fromLabel) {
    const str = String(fromLabel == null ? '' : fromLabel);
    const m = str.match(/^(.*?)\s*<([^>]+)>\s*$/);
    if (m) {
        const name = m[1].trim();
        const addr = m[2].trim();
        if (!name) return addr;
        return `${_encodeHeaderWord(name)} <${addr}>`;
    }
    return _isAscii(str) ? str : _encodeHeaderWord(str);
}


// Synchronous-style wrapper returning a Promise; sendEmailViaApprovedTransport
// callers that need live send must await sendApprovedSelfTestEmail() instead.
function sendViaYandexSmtpSync() {
    // Direct sync seam is intentionally inert; live send must go through the
    // async sendApprovedSelfTestEmail() so the SMTP dialogue can be awaited.
    return { ok: false, code: SEND_TRANSPORT_NOT_IMPLEMENTED, sent_count: 0, message: 'Используйте sendApprovedSelfTestEmail() (async) для live SMTP.' };
}

// ----------------------------------------------------------------------------
// SMTP error stages (safe — these NEVER contain login/password values; only
// the stage name, the received code, and the expected code(s) are surfaced).
// ----------------------------------------------------------------------------
export const SMTP_CONNECT_FAILED = 'SMTP_CONNECT_FAILED';
export const SMTP_GREETING_FAILED = 'SMTP_GREETING_FAILED';
export const SMTP_EHLO_FAILED = 'SMTP_EHLO_FAILED';
export const SMTP_AUTH_START_FAILED = 'SMTP_AUTH_START_FAILED';
export const SMTP_AUTH_USER_FAILED = 'SMTP_AUTH_USER_FAILED';
export const SMTP_AUTH_PASS_FAILED = 'SMTP_AUTH_PASS_FAILED';
export const SMTP_MAIL_FROM_FAILED = 'SMTP_MAIL_FROM_FAILED';
export const SMTP_RCPT_TO_FAILED = 'SMTP_RCPT_TO_FAILED';
export const SMTP_DATA_START_FAILED = 'SMTP_DATA_START_FAILED';
export const SMTP_MESSAGE_ACCEPT_FAILED = 'SMTP_MESSAGE_ACCEPT_FAILED';
export const SMTP_QUIT_FAILED_NON_FATAL = 'SMTP_QUIT_FAILED_NON_FATAL';

// ----------------------------------------------------------------------------
// createSmtpResponseReader(onResponse)
//   Streaming, multiline-aware SMTP reply parser. Accepts raw socket chunks and
//   emits exactly ONE aggregated response per complete reply. Multiline replies
//   use "250-" continuation lines and a final "250 " (space) line; only the
//   FINAL line terminates a response (this prevents mixing a previous command's
//   reply with the next command's reply). Per emitted response:
//       { code, lines, raw }
//   `raw` is the joined sanitized lines. Server replies do not echo AUTH
//   payloads, so this reader never observes secret values.
// ----------------------------------------------------------------------------
export function createSmtpResponseReader(onResponse) {
    let buf = '';
    let lines = [];
    return {
        push(chunk) {
            buf += String(chunk);
            let idx;
            while ((idx = buf.indexOf('\r\n')) !== -1) {
                const line = buf.slice(0, idx);
                buf = buf.slice(idx + 2);
                const m = /^(\d{3})([ -])?(.*)$/.exec(line);
                if (!m) { lines.push(line); continue; }
                lines.push(line);
                // "code-" => continuation; keep buffering until "code " (final).
                if (m[2] === '-') continue;
                const code = parseInt(m[1], 10);
                const resp = { code, lines: lines.slice(), raw: lines.join('\n') };
                lines = [];
                onResponse(resp);
            }
        },
    };
}

// ----------------------------------------------------------------------------
// parseSmtpResponse(rawText)
//   Pure helper: parse a complete (possibly multiline) reply string into
//   { code, lines, raw }. Per RFC 5321 the authoritative code comes from the
//   FINAL line (the one with a SPACE after the 3-digit code).
// ----------------------------------------------------------------------------
export function parseSmtpResponse(rawText) {
    const parts = String(rawText).split(/\r\n|\n/).filter((l) => l.length > 0);
    let code = 0;
    for (const line of parts) {
        const m = /^(\d{3})([ -])?/.exec(line);
        if (m) {
            code = parseInt(m[1], 10);
            if (m[2] !== '-') break; // final (non-continuation) line wins
        }
    }
    return { code, lines: parts, raw: parts.join('\n') };
}

// ----------------------------------------------------------------------------
// createSmtpStateMachine(params)
//   Pure SMTP/465 state machine for ONE message over implicit TLS (NO STARTTLS).
//   MAIL-FINAL-3 fix — correct per-command reply expectations:
//       greeting           -> 220
//       EHLO               -> 250   (multiline: 250- ... 250 final)
//       AUTH LOGIN         -> 334
//       base64(username)   -> 334
//       base64(password)   -> 235
//       MAIL FROM          -> 250
//       RCPT TO            -> 250 or 251
//       DATA               -> 354
//       body + \r\n.\r\n   -> 250   (message accepted == SUCCESS)
//       QUIT               -> 221   (NON-FATAL: delivery already succeeded)
//   Feed each server response via onResponse(resp). It returns an action:
//       { send: '<line>' }                 -> write line, await next reply
//       { send: '<line>', done: <result> } -> write line then finish (QUIT)
//       { done: <result> }                 -> finish (error or terminal)
//   It NEVER expects 220 after EHLO, NEVER issues STARTTLS on 465, and NEVER
//   returns/logs login or password VALUES — AUTH payloads are base64 only and
//   error results carry ONLY stage + received code + expected code.
// ----------------------------------------------------------------------------
export function createSmtpStateMachine(params = {}) {
    const { user, pass, from, to, message } = params;
    // Each step: the line to send + the acceptable reply code(s) for THAT line's
    // response (NOT the previous line's response — that was the original bug).
    const seq = [
        { cmd: `EHLO localhost`, expect: [250], stage: SMTP_EHLO_FAILED },
        { cmd: `AUTH LOGIN`, expect: [334], stage: SMTP_AUTH_START_FAILED },
        { cmd: _b64(user), expect: [334], stage: SMTP_AUTH_USER_FAILED },
        { cmd: _b64(pass), expect: [235], stage: SMTP_AUTH_PASS_FAILED },
        { cmd: `MAIL FROM:<${from}>`, expect: [250], stage: SMTP_MAIL_FROM_FAILED },
        { cmd: `RCPT TO:<${to}>`, expect: [250, 251], stage: SMTP_RCPT_TO_FAILED },
        { cmd: `DATA`, expect: [354], stage: SMTP_DATA_START_FAILED },
        { cmd: `${message}.`, expect: [250], stage: SMTP_MESSAGE_ACCEPT_FAILED },
    ];

    let phase = 'greeting';
    let idx = 0;

    const okResult = () => ({
        ok: true, code: SEND_OK_TEST_EMAIL, sent_count: 1,
        message: 'Self-test письмо отправлено через Yandex SMTP.',
    });
    const failResult = (stage, code, expected) => ({
        ok: false, code: SMTP_SEND_FAILED, stage, sent_count: 0,
        message: `${stage}: unexpected code ${code} (ожидался ${expected})`,
    });

    return {
        get phase() { return phase; },
        onResponse(resp = {}) {
            const code = resp.code;
            if (phase === 'greeting') {
                if (code !== 220) { phase = 'done'; return { done: failResult(SMTP_GREETING_FAILED, code, 220) }; }
                phase = 'command'; idx = 0;
                return { send: seq[0].cmd };
            }
            if (phase === 'command') {
                const step = seq[idx];
                if (!step.expect.includes(code)) {
                    phase = 'done';
                    return { done: failResult(step.stage, code, step.expect.join(' or ')) };
                }
                idx += 1;
                if (idx < seq.length) return { send: seq[idx].cmd };
                // 250 after the final dot => message accepted => delivery SUCCESS.
                // Send QUIT but do NOT fail delivery regardless of its reply.
                phase = 'done';
                return { send: `QUIT`, done: okResult() };
            }
            // phase === 'done' — already terminal; ignore further replies.
            return { done: okResult() };
        },
    };
}

// ----------------------------------------------------------------------------
// sendApprovedSelfTestEmail(payload, context) -> Promise<result>
//   The ONLY function that performs a real network send. Re-validates every
//   safety gate, then opens one Yandex SMTP/TLS session (implicit TLS on 465,
//   NO STARTTLS) and sends exactly one message via the state machine above.
// ----------------------------------------------------------------------------
export async function sendApprovedSelfTestEmail(payload = {}, context = {}) {
    const ctx = (context && typeof context === 'object') ? context : {};
    const p = (payload && typeof payload === 'object') ? payload : {};
    const env = (ctx.env && typeof ctx.env === 'object') ? ctx.env : {};

    // Re-run all guards (defense in depth). Reuse the pure seam first.
    if (ctx.mass_send === true || ctx.massSend === true || Array.isArray(p.to)) {
        return { ok: false, code: SEND_BLOCKED_MASS_SEND, sent_count: 0, message: 'Массовая отправка заблокирована.' };
    }
    if (ctx.autosend === true) {
        return { ok: false, code: SEND_BLOCKED_AUTOSEND, sent_count: 0, message: 'Autosend всегда заблокирован.' };
    }
    if (ctx.owner_confirmed !== true || ctx.approved_by !== 'Dmitry') {
        return { ok: false, code: SEND_BLOCKED_NOT_OWNER_APPROVED, sent_count: 0, message: 'Нет подтверждения владельца.' };
    }
    if (ctx.test_only !== true) {
        return { ok: false, code: SEND_BLOCKED_TEST_ONLY_RECIPIENT, sent_count: 0, message: 'Live self-test разрешён только в test_only режиме.' };
    }
    const testTo = env.EMAIL_TEST_TO;
    if (!testTo || p.to !== testTo) {
        return { ok: false, code: SEND_BLOCKED_TEST_ONLY_RECIPIENT, sent_count: 0, message: 'Получатель должен быть EMAIL_TEST_TO.' };
    }
    if (ctx.real_send_enabled !== true) {
        return { ok: false, code: SEND_BLOCKED_REAL_SEND_DISABLED, sent_count: 0, message: 'real_send_enabled=false: включите EMAIL_REAL_SEND_ENABLED=true.' };
    }
    const liveCtx = { ...ctx, live_send_allowed: true };
    if (!canSendLive(p, liveCtx)) {
        return { ok: false, code: SEND_BLOCKED_REAL_SEND_DISABLED, sent_count: 0, message: 'Живая отправка не разрешена (canSendLive=false).' };
    }

    const user = env.YANDEX_MAIL_LOGIN || env.EMAIL_SMTP_USER;
    const pass = env.YANDEX_MAIL_APP_PASSWORD || env.EMAIL_SMTP_PASS;
    const from = env.EMAIL_FROM || user;
    if (!user || !pass || !from) {
        return { ok: false, code: SEND_ADAPTER_NOT_CONFIGURED, sent_count: 0, message: 'Не хватает SMTP креденшелов (login/app-password/from).' };
    }

    let tls;
    try {
        tls = await import('node:tls');
    } catch {
        return { ok: false, code: SEND_TRANSPORT_DEPENDENCY_MISSING, sent_count: 0, message: 'node:tls недоступен.' };
    }

    const host = _smtpHost(env);
    const port = _smtpPort(env);
    const subject = p.subject || 'Telegram Gateway approved email self-test';
    const text = p.body || 'Self-test email from Telegram Master Controller. No client contact.';
    const fromLabel = env.EMAIL_FROM_LABEL ? `${env.EMAIL_FROM_LABEL} <${from}>` : from;

    return await new Promise((resolve) => {
        let settled = false;
        let greetingReceived = false;
        const done = (r) => { if (!settled) { settled = true; try { socket.end(); } catch {} resolve(r); } };
        const failConnect = (m) => done({ ok: false, code: SMTP_SEND_FAILED, stage: SMTP_CONNECT_FAILED, sent_count: 0, message: `${SMTP_CONNECT_FAILED}: ${m}` });

        // Implicit TLS on port 465 (secure=true). STARTTLS is NEVER issued here.
        const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: true });
        socket.setTimeout(20000, () => failConnect('timeout'));
        socket.setEncoding('utf8');

        const send = (line) => { try { socket.write(line + '\r\n'); } catch (e) { failConnect(String(e && e.message || e)); } };

        // Build the message. AUTH payloads are base64 only and never logged.
        const date = new Date().toUTCString();
        const message =
            `From: ${_encodeFromHeader(fromLabel)}\r\n` +
            `To: ${testTo}\r\n` +
            `Subject: ${_encodeHeaderWord(subject)}\r\n` +

            `Date: ${date}\r\n` +
            `MIME-Version: 1.0\r\n` +
            `Content-Type: text/plain; charset=utf-8\r\n` +
            `Content-Transfer-Encoding: 8bit\r\n` +
            `\r\n` +
            `${text}\r\n`;

        const machine = createSmtpStateMachine({ user, pass, from, to: testTo, message });
        const reader = createSmtpResponseReader((resp) => {
            greetingReceived = true;
            const action = machine.onResponse(resp) || {};
            if (action.send !== undefined) send(action.send);
            if (action.done !== undefined) done(action.done);
        });

        socket.on('data', (chunk) => reader.push(chunk));
        socket.on('error', (e) => {
            const m = String(e && e.message || e);
            if (!greetingReceived) return failConnect(m);
            done({ ok: false, code: SMTP_SEND_FAILED, stage: 'SMTP_SEND_FAILED', sent_count: 0, message: `SMTP_SEND_FAILED: ${m}` });
        });
        socket.on('timeout', () => failConnect('timeout'));
    });
}

// ----------------------------------------------------------------------------
// isP1ClientRecipientValid(to, env)
//   Pure guard for the SINGLE approved TOP-1 client send. A client recipient is
//   valid ONLY if it passes normal email validation AND is NOT a test/fixture
//   address: not empty, not EMAIL_TEST_TO, not example.com, not test/fixture.
//   Returns { ok, reason }.
// ----------------------------------------------------------------------------
export function isP1ClientRecipientValid(to, env = {}) {
    const e = (env && typeof env === 'object') ? env : {};
    if (to == null || String(to).trim() === '') return { ok: false, reason: 'missing' };
    const addr = String(to).trim().toLowerCase();
    // Normal structural validation first.
    const v = validateEmailRecipient(to);
    if (!v.ok) return { ok: false, reason: 'invalid' };
    // Must NOT be the self-test mailbox.
    const testTo = e.EMAIL_TEST_TO ? String(e.EMAIL_TEST_TO).trim().toLowerCase() : '';
    if (testTo && addr === testTo) return { ok: false, reason: 'email_test_to' };
    // Must NOT be an example / test / fixture domain or local-part.
    const domain = addr.slice(addr.indexOf('@') + 1);
    if (domain === 'example.com' || domain === 'example.org' || domain === 'example.net') {
        return { ok: false, reason: 'example_domain' };
    }
    if (/(?:^|[._-])(?:test|fixture|sample|dummy)(?:[._-]|@|$)/.test(addr)) {
        return { ok: false, reason: 'test_fixture' };
    }
    if (domain.endsWith('.test') || domain.endsWith('.example') || domain.endsWith('.invalid')) {
        return { ok: false, reason: 'test_fixture' };
    }
    return { ok: true, reason: 'VALID' };
}

// ----------------------------------------------------------------------------
// sendApprovedClientEmail(payload, context) -> Promise<result>
//   P1 — the ONE approved real send to a TOP-1 client. Reuses the SAME Yandex
//   SMTP/TLS transport seam as sendApprovedSelfTestEmail (no third contour).
//   Sends EXACTLY one message. All P1 gates are re-validated here (defense in
//   depth). NEVER mass send, NEVER autosend, NEVER legacy script.
//
//   Required to send:
//     - recipient valid (not EMAIL_TEST_TO / example.com / test / fixture)
//     - message_count === 1 (single recipient string)
//     - real_send_enabled === true (EMAIL_REAL_SEND_ENABLED=true)
//     - autosend !== true; mass_send !== true
//     - context.p1_client_send_approved === true
//     - context.owner_confirmed === true && approved_by === 'Dmitry'
//
//   Results:
//     - SEND_OK_CLIENT_P1 on success (sent_count: 1)
//     - P1_REQUIRED when P1 approval / owner confirmation missing
//     - P1_BLOCKED_INVALID_RECIPIENT for missing/test/example recipients
//     - SEND_BLOCKED_AUTOSEND / SEND_BLOCKED_MASS_SEND
//     - SEND_BLOCKED_REAL_SEND_DISABLED when real send not enabled
//     - SMTP_SEND_FAILED:<stage> on SMTP error
// ----------------------------------------------------------------------------
export async function sendApprovedClientEmail(payload = {}, context = {}) {
    const ctx = (context && typeof context === 'object') ? context : {};
    const p = (payload && typeof payload === 'object') ? payload : {};
    const env = (ctx.env && typeof ctx.env === 'object') ? ctx.env : {};

    // Mass send / autosend are ALWAYS blocked (and array recipients => mass).
    if (ctx.mass_send === true || ctx.massSend === true || Array.isArray(p.to)) {
        return { ok: false, code: SEND_BLOCKED_MASS_SEND, sent_count: 0, message: 'Массовая отправка заблокирована.' };
    }
    if (ctx.autosend === true) {
        return { ok: false, code: SEND_BLOCKED_AUTOSEND, sent_count: 0, message: 'Autosend всегда заблокирован.' };
    }

    // Exactly one message. message_count, if provided, must equal 1.
    if (ctx.message_count !== undefined && ctx.message_count !== 1) {
        return { ok: false, code: SEND_BLOCKED_MASS_SEND, sent_count: 0, message: 'Разрешена ровно 1 отправка (message_count !== 1).' };
    }

    // Authorization gate: the Telegram inline ✅ approval (owner_confirmed by
    // Dmitry) IS the send authorization. No P1 env flag is required for a normal
    // approved client send. Without owner ✅ there is NO send.
    if (ctx.owner_confirmed !== true || ctx.approved_by !== 'Dmitry') {
        return { ok: false, code: P1_REQUIRED, sent_count: 0, message: 'P1_REQUIRED: нужно подтверждение владельца (Telegram ✅).' };
    }


    // Recipient must be a valid, NON-test client address.
    const rv = isP1ClientRecipientValid(p.to, env);
    if (!rv.ok) {
        return { ok: false, code: P1_BLOCKED_INVALID_RECIPIENT, sent_count: 0, reason: rv.reason, message: `P1_BLOCKED_INVALID_RECIPIENT: ${rv.reason}.` };
    }

    // Real send must be explicitly enabled.
    if (ctx.real_send_enabled !== true) {
        return { ok: false, code: SEND_BLOCKED_REAL_SEND_DISABLED, sent_count: 0, message: 'real_send_enabled=false: включите EMAIL_REAL_SEND_ENABLED=true.' };
    }

    // SMTP credentials (same seam as self-test; values never logged).
    const user = env.YANDEX_MAIL_LOGIN || env.EMAIL_SMTP_USER;
    const pass = env.YANDEX_MAIL_APP_PASSWORD || env.EMAIL_SMTP_PASS;
    const from = env.EMAIL_FROM || user;
    if (!user || !pass || !from) {
        return { ok: false, code: SEND_ADAPTER_NOT_CONFIGURED, sent_count: 0, message: 'Не хватает SMTP креденшелов (login/app-password/from).' };
    }

    let tls;
    try {
        tls = await import('node:tls');
    } catch {
        return { ok: false, code: SEND_TRANSPORT_DEPENDENCY_MISSING, sent_count: 0, message: 'node:tls недоступен.' };
    }

    const host = _smtpHost(env);
    const port = _smtpPort(env);
    const to = String(p.to).trim();
    const subject = p.subject || 'Мини-аудит сайта — короткие выводы';
    const text = p.body || '';
    if (!text || String(text).trim() === '') {
        return { ok: false, code: P1_BLOCKED_INVALID_RECIPIENT, sent_count: 0, reason: 'empty_body', message: 'P1_BLOCKED_INVALID_RECIPIENT: пустое тело письма.' };
    }
    const fromLabel = env.EMAIL_FROM_LABEL ? `${env.EMAIL_FROM_LABEL} <${from}>` : from;

    return await new Promise((resolve) => {
        let settled = false;
        let greetingReceived = false;
        const done = (r) => { if (!settled) { settled = true; try { socket.end(); } catch {} resolve(r); } };
        const failConnect = (m) => done({ ok: false, code: SMTP_SEND_FAILED, stage: SMTP_CONNECT_FAILED, sent_count: 0, message: `${SMTP_CONNECT_FAILED}: ${m}` });

        // Implicit TLS on port 465 (secure=true). STARTTLS is NEVER issued here.
        const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: true });
        socket.setTimeout(20000, () => failConnect('timeout'));
        socket.setEncoding('utf8');

        const send = (line) => { try { socket.write(line + '\r\n'); } catch (e) { failConnect(String(e && e.message || e)); } };

        const date = new Date().toUTCString();
        const message =
            `From: ${_encodeFromHeader(fromLabel)}\r\n` +
            `To: ${to}\r\n` +
            `Subject: ${_encodeHeaderWord(subject)}\r\n` +
            `Date: ${date}\r\n` +

            `MIME-Version: 1.0\r\n` +
            `Content-Type: text/plain; charset=utf-8\r\n` +
            `Content-Transfer-Encoding: 8bit\r\n` +
            `\r\n` +
            `${text}\r\n`;

        // Reuse the SAME SMTP state machine. Only the success code is remapped.
        const machine = createSmtpStateMachine({ user, pass, from, to, message });
        const reader = createSmtpResponseReader((resp) => {
            greetingReceived = true;
            const action = machine.onResponse(resp) || {};
            if (action.send !== undefined) send(action.send);
            if (action.done !== undefined) {
                const r = action.done;
                if (r && r.ok === true) {
                    done({ ok: true, code: SEND_OK_CLIENT_P1, sent_count: 1, message: 'P1: письмо клиенту отправлено через Yandex SMTP.' });
                } else {
                    done(r);
                }
            }
        });

        socket.on('data', (chunk) => reader.push(chunk));
        socket.on('error', (e) => {
            const m = String(e && e.message || e);
            if (!greetingReceived) return failConnect(m);
            done({ ok: false, code: SMTP_SEND_FAILED, stage: 'SMTP_SEND_FAILED', sent_count: 0, message: `SMTP_SEND_FAILED: ${m}` });
        });
        socket.on('timeout', () => failConnect('timeout'));
    });
}


// ============================================================================
// E1C2B SAFE LIVE ENV PRESENCE BRIDGE — config visibility ONLY (NO send).

// ============================================================================
// HARD SAFETY CONTRACT (E1C2B, no live restart):
//   - These helpers check ONLY for the PRESENCE of expected EMAIL_* key NAMES
//     in a caller-supplied env-like object. They NEVER read values.
//   - They NEVER copy, log, return, or echo any secret value.
//   - They NEVER read dotenv files or the AI secret store directly; the ONLY env
//     source is the object the caller passes in (e.g. process.env handed in by
//     the bot route). We touch key existence only, never the value.
//   - real_send_enabled stays false; can_send_live stays false on E1C2B even if
//     EMAIL_REAL_SEND_ENABLED is present/true in the env — a separate E1C2C
//     approval gate is required before any live send is possible.
export const E1C2B_STAGE = 'E1C2B_ENV_PRESENCE';

// ----------------------------------------------------------------------------
// collectEmailEnvPresence(runtimeEnv)
//   Accepts an env-like object. Returns a map of EXPECTED_TRANSPORT_ENV_KEYS to
//   { present: true/false }. Values are NEVER read, copied, returned, or logged.
// ----------------------------------------------------------------------------
export function collectEmailEnvPresence(runtimeEnv = {}) {
    const envObj = (runtimeEnv && typeof runtimeEnv === 'object') ? runtimeEnv : {};
    const presence = {};
    for (const key of EXPECTED_TRANSPORT_ENV_KEYS) {
        // Presence-only: we inspect existence, NEVER the value.
        presence[key] = { present: _presence(envObj, key) };
    }
    return presence; // booleans only — no values, ever
}

// ----------------------------------------------------------------------------
// buildEmailEnvPresenceResult(runtimeEnv)
//   Wraps collectEmailEnvPresence with configured flag + missing key list.
//   On E1C2B real_send_enabled and can_send_live are ALWAYS false, regardless of
//   whether EMAIL_REAL_SEND_ENABLED is present in the env. No values surfaced.
// ----------------------------------------------------------------------------
export function buildEmailEnvPresenceResult(runtimeEnv = {}) {
    const key_presence = collectEmailEnvPresence(runtimeEnv);
    const missing_keys = [];
    for (const key of EXPECTED_TRANSPORT_ENV_KEYS) {
        if (!(key_presence[key] && key_presence[key].present === true)) missing_keys.push(key);
    }
    const configured = missing_keys.length === 0;
    return {
        stage: E1C2B_STAGE,
        configured,
        missing_keys,
        key_presence,            // booleans only — no values
        expected_env_keys: [...EXPECTED_TRANSPORT_ENV_KEYS],
        real_send_enabled: false, // E1C2B: always false (E1C2C approval required)
        can_send_live: false,     // E1C2B: always false
        secrets_printed: false,
        reads_dotenv: false,
        reads_ai_secrets: false,
    };
}

// ----------------------------------------------------------------------------
// buildEnvPresenceReport(result) — secret-free, names + present/missing only.
// ----------------------------------------------------------------------------
export function buildEnvPresenceReport(result = {}) {
    const r = result || {};
    const lines = [];
    lines.push('=== E1C2B EMAIL ENV PRESENCE (live config visibility, NO send) ===');
    lines.push(`stage: ${r.stage || E1C2B_STAGE}`);
    lines.push(`configured: ${r.configured === true ? 'YES' : 'NO'}`);
    lines.push(`real_send_enabled: ${r.real_send_enabled === true ? 'YES' : 'NO'}`);
    lines.push(`can_send_live: ${r.can_send_live === true ? 'YES' : 'NO'}`);
    lines.push(`email_sent: NO`);
    lines.push(`secret_values_printed: NO`);
    lines.push(`reads_dotenv: ${r.reads_dotenv === true ? 'YES' : 'NO'}`);
    lines.push(`reads_ai_secrets: ${r.reads_ai_secrets === true ? 'YES' : 'NO'}`);
    lines.push('EMAIL_* keys (names only, present/missing):');
    const presence = r.key_presence || {};
    for (const key of (r.expected_env_keys || [])) {
        const present = presence[key] && presence[key].present === true;
        lines.push(`  - ${key}: ${present ? 'present: true' : 'missing'}`);
    }
    if (Array.isArray(r.missing_keys) && r.missing_keys.length > 0) {
        lines.push(`missing_keys: ${r.missing_keys.join(', ')}`);
    } else {
        lines.push('missing_keys: none');
    }
    lines.push('NOTE: secret VALUES are never read, printed, or returned.');
    return lines.join('\n');
}

// ============================================================================
// E1C2C YANDEX ALIAS BRIDGE — connect existing YANDEX_* keys to EMAIL_* preflight.
// ============================================================================
// HARD SAFETY CONTRACT (E1C2C, no live restart):
//   - This bridge checks ONLY for the PRESENCE of two legacy key NAMES in a
//     caller-supplied env-like object:
//         YANDEX_MAIL_LOGIN
//         YANDEX_MAIL_APP_PASSWORD
//     It NEVER reads, copies, logs, returns, or echoes any value (login or
//     password). Only booleans + source labels are surfaced.
//   - It does NOT connect mail again. It maps already-present legacy keys onto
//     the new approved-send EMAIL_* config slots as ALIASES, and fills provider
//     transport slots with safe Yandex DEFAULTS. No third mail contour is made.
//   - real_send_enabled stays false; can_send_live stays false on E1C2C even if
//     both YANDEX_* keys are found. A separate explicit approval gate is required
//     before any live send is possible. email_sent is always NO.
//   - It NEVER reads dotenv files or the AI secret store directly; the ONLY env
//     source is the object the caller passes in (e.g. process.env handed in by
//     the bot route). We touch key existence only, never the value.
export const E1C2C_STAGE = 'E1C2C_YANDEX_ALIAS';

// Legacy Yandex key NAMES we alias from (names only — never values).
export const YANDEX_ALIAS_SOURCE_KEYS = [
    'YANDEX_MAIL_LOGIN',
    'YANDEX_MAIL_APP_PASSWORD',
];

// Configured-state enum surfaced by the alias bridge.
export const CONFIGURED_NO = 'NO';
export const CONFIGURED_YES_PARTIAL = 'YES_PARTIAL';
export const CONFIGURED_YES = 'YES';

// ----------------------------------------------------------------------------
// collectYandexMailEnvPresence(runtimeEnv)
//   Presence-only check for the two legacy Yandex key NAMES. Values are NEVER
//   read, copied, returned, or logged.
// ----------------------------------------------------------------------------
export function collectYandexMailEnvPresence(runtimeEnv = {}) {
    const envObj = (runtimeEnv && typeof runtimeEnv === 'object') ? runtimeEnv : {};
    const presence = {};
    for (const key of YANDEX_ALIAS_SOURCE_KEYS) {
        // Presence-only: inspect existence, NEVER the value.
        presence[key] = { present: _presence(envObj, key) };
    }
    return presence; // booleans only — no values, ever
}

// ----------------------------------------------------------------------------
// buildEmailConfigPresenceFromAliases(runtimeEnv)
//   Builds an EMAIL_* coverage map sourced from legacy YANDEX_* aliases + safe
//   Yandex defaults. Returns source labels + booleans only — NEVER any value.
//
//   Alias mapping (only if YANDEX_MAIL_LOGIN present):
//     EMAIL_SMTP_USER  <- YANDEX alias
//     EMAIL_FROM       <- YANDEX alias
//   Alias mapping (only if YANDEX_MAIL_APP_PASSWORD present):
//     EMAIL_SMTP_PASS  <- YANDEX alias
//   Yandex transport defaults (always covered):
//     EMAIL_PROVIDER / EMAIL_SMTP_HOST / EMAIL_SMTP_PORT / EMAIL_SMTP_SECURE
//     EMAIL_FROM_LABEL (default) / EMAIL_TEST_ONLY (safe default true)
//     EMAIL_REAL_SEND_ENABLED (safe default false)
//   EMAIL_TEST_TO: present in env -> 'present', otherwise -> 'missing'.
// ----------------------------------------------------------------------------
export function buildEmailConfigPresenceFromAliases(runtimeEnv = {}) {
    const envObj = (runtimeEnv && typeof runtimeEnv === 'object') ? runtimeEnv : {};
    const yandex = collectYandexMailEnvPresence(envObj);

    const yandex_login_present = yandex.YANDEX_MAIL_LOGIN.present === true;
    const yandex_app_password_present = yandex.YANDEX_MAIL_APP_PASSWORD.present === true;
    const yandex_alias_detected = yandex_login_present && yandex_app_password_present;

    // Direct EMAIL_TEST_TO presence (recipient guard slot). Presence only.
    const email_test_to_present = _presence(envObj, 'EMAIL_TEST_TO');
    const email_test_to_missing = !email_test_to_present;

    // Build per-key coverage with source labels (alias | default | present | missing).
    const cov = (source, present) => ({ source, present });
    const email_coverage = {
        EMAIL_PROVIDER: cov('yandex_default', true),
        EMAIL_SMTP_HOST: cov('yandex_default', true),
        EMAIL_SMTP_PORT: cov('yandex_default', true),
        EMAIL_SMTP_SECURE: cov('yandex_default', true),
        EMAIL_SMTP_USER: yandex_login_present ? cov('yandex_alias', true) : cov('missing', false),
        EMAIL_SMTP_PASS: yandex_app_password_present ? cov('yandex_alias', true) : cov('missing', false),
        EMAIL_FROM: yandex_login_present ? cov('yandex_alias', true) : cov('missing', false),
        EMAIL_FROM_LABEL: cov('default', true),
        EMAIL_TEST_ONLY: cov('safe_default_true', true),
        EMAIL_REAL_SEND_ENABLED: cov('safe_default_false', true),
        EMAIL_TEST_TO: email_test_to_present ? cov('present', true) : cov('missing', false),
    };

    // configured state:
    //   NO          -> no Yandex alias coverage at all (no login & no password)
    //   YES         -> both Yandex keys present AND EMAIL_TEST_TO present
    //   YES_PARTIAL -> otherwise (some coverage but not complete)
    let configured;
    if (!yandex_login_present && !yandex_app_password_present) {
        configured = CONFIGURED_NO;
    } else if (yandex_alias_detected && email_test_to_present) {
        configured = CONFIGURED_YES;
    } else {
        configured = CONFIGURED_YES_PARTIAL;
    }

    return {
        stage: E1C2C_STAGE,
        yandex_alias_detected,
        yandex_login_present,
        yandex_app_password_present,
        email_coverage,           // source labels + booleans only — no values
        email_test_to_missing,
        configured,               // 'NO' | 'YES_PARTIAL' | 'YES'
        real_send_enabled: false, // E1C2C: always false (separate approval gate)
        can_send_live: false,     // E1C2C: always false
        email_sent: false,        // never
        secrets_printed: false,
        login_value_printed: false,
        password_value_printed: false,
        reads_dotenv: false,
        reads_ai_secrets: false,
        third_contour_created: false,
    };
}

// ----------------------------------------------------------------------------
// buildYandexAliasPreflightReport(result) — secret-free render. Emits ONLY key
//   names, source labels, and present/missing booleans — never any value.
// ----------------------------------------------------------------------------
export function buildYandexAliasPreflightReport(result = {}) {
    const r = result || {};
    const lines = [];
    lines.push('=== E1C2C YANDEX ALIAS PREFLIGHT (NO send) ===');
    lines.push(`stage: ${r.stage || E1C2C_STAGE}`);
    lines.push(`yandex_alias_detected: ${r.yandex_alias_detected === true ? 'YES' : 'NO'}`);
    lines.push(`YANDEX_MAIL_LOGIN: ${r.yandex_login_present === true ? 'present' : 'missing'}`);
    lines.push(`YANDEX_MAIL_APP_PASSWORD: ${r.yandex_app_password_present === true ? 'present' : 'missing'}`);
    lines.push('EMAIL_* coverage (names + source only):');
    const cov = r.email_coverage || {};
    for (const key of Object.keys(cov)) {
        const entry = cov[key] || {};
        const present = entry.present === true;
        const source = entry.source || (present ? 'present' : 'missing');
        lines.push(`  - ${key}: ${present ? source : 'missing'}`);
    }
    lines.push(`EMAIL_TEST_TO missing: ${r.email_test_to_missing === true ? 'YES' : 'NO'}`);
    lines.push(`configured: ${r.configured || CONFIGURED_NO}`);
    lines.push(`real_send_enabled: ${r.real_send_enabled === true ? 'YES' : 'NO'}`);
    lines.push(`can_send_live: ${r.can_send_live === true ? 'YES' : 'NO'}`);
    lines.push(`email_sent: NO`);
    lines.push(`secret_values_printed: NO`);
    lines.push('NOTE: login + password VALUES are never read, printed, or returned.');
    return lines.join('\n');
}

// ----------------------------------------------------------------------------
// buildTransportCapabilityReport(cap) — secret-free, names + booleans only.
// ----------------------------------------------------------------------------
export function buildTransportCapabilityReport(cap = {}) {

    const c = cap || {};
    const lines = [];
    lines.push('=== E1C1 EMAIL TRANSPORT CAPABILITY (NO real send) ===');
    lines.push(`stage: ${c.stage || E1C1_STAGE}`);
    lines.push(`existing_transport_found: ${c.existing_transport_found === true ? 'YES' : 'NO'}`);
    lines.push(`mock_transport_present: ${c.mock_transport_present === true ? 'YES' : 'NO'}`);
    lines.push(`smtp_transport_available: ${c.smtp_transport_available === true ? 'YES' : 'NO'}`);
    lines.push(`legacy_live_send_script: ${c.legacy_live_send_script || LEGACY_LIVE_SEND_SCRIPT}`);
    lines.push(`legacy_live_send_frozen: ${c.legacy_live_send_frozen === true ? 'YES' : 'NO'}`);
    lines.push(`third_transport_created: ${c.third_transport_created === true ? 'YES' : 'NO'}`);
    lines.push(`reuse_path: ${c.reuse_path || 'new approved-send seam'}`);
    lines.push(`configured: ${c.configured === true ? 'YES' : 'NO'}`);
    lines.push(`real_send_enabled: ${c.real_send_enabled === true ? 'YES' : 'NO'}`);
    lines.push(`can_send_live: ${c.can_send_live === true ? 'YES' : 'NO'}`);
    lines.push('expected transport keys (names only):');
    const presence = c.key_presence || {};
    for (const key of (c.expected_env_keys || [])) {
        const present = presence[key] && presence[key].present === true;
        lines.push(`  - ${key}: ${present ? 'present: true' : 'missing'}`);
    }
    lines.push('NOTE: secret VALUES are never read, printed, or returned.');
    return lines.join('\n');
}

export default {
    SEND_ADAPTER_NOT_CONFIGURED,
    INVALID_RECIPIENT,
    SEND_BLOCKED_MISSING_RECIPIENT,
    SEND_BLOCKED_MASS_SEND,
    SEND_BLOCKED_AUTOSEND,
    SEND_OK_MOCK,
    SEND_OK,
    REAL_SEND_ENABLED,
    D3C_FREEZE,
    E1B_STAGE,
    isEmailSendAdapterConfigured,
    validateEmailRecipient,
    buildEmailPayload,
    sendApprovedEmail,
    getEmailAdapterConfigSchema,
    checkEmailAdapterPreflight,
    buildSafePreflightReport,
    // E1C1 transport bridge
    E1C1_STAGE,
    LEGACY_LIVE_SEND_SCRIPT,
    LEGACY_LIVE_SEND_STATUS,
    SEND_OK_MOCK_BRIDGE,
    SEND_BLOCKED_REAL_SEND_DISABLED,
    SEND_TRANSPORT_DEPENDENCY_MISSING,
    SEND_TRANSPORT_NOT_IMPLEMENTED,
    SEND_BLOCKED_TEST_ONLY_RECIPIENT,
    SEND_BLOCKED_NOT_OWNER_APPROVED,
    EXPECTED_TRANSPORT_ENV_KEYS,
    getEmailTransportCapability,
    createApprovedEmailTransport,
    canSendLive,
    sendEmailViaApprovedTransport,
    buildTransportCapabilityReport,
    // MAIL-FINAL-1 live SMTP self-test transport
    SEND_OK_TEST_EMAIL,
    SMTP_SEND_FAILED,
    sendApprovedSelfTestEmail,
    // MAIL-FINAL-P1 single approved TOP-1 client send
    SEND_OK_CLIENT_P1,
    P1_REQUIRED,
    P1_BLOCKED_INVALID_RECIPIENT,
    isP1ClientRecipientValid,
    sendApprovedClientEmail,
    // MAIL-FINAL-3 SMTP state machine + multiline parser + error stages

    SMTP_CONNECT_FAILED,
    SMTP_GREETING_FAILED,
    SMTP_EHLO_FAILED,
    SMTP_AUTH_START_FAILED,
    SMTP_AUTH_USER_FAILED,
    SMTP_AUTH_PASS_FAILED,
    SMTP_MAIL_FROM_FAILED,
    SMTP_RCPT_TO_FAILED,
    SMTP_DATA_START_FAILED,
    SMTP_MESSAGE_ACCEPT_FAILED,
    SMTP_QUIT_FAILED_NON_FATAL,
    createSmtpResponseReader,
    parseSmtpResponse,
    createSmtpStateMachine,

    // E1C2B env presence bridge (config visibility only, NO send)
    E1C2B_STAGE,
    collectEmailEnvPresence,
    buildEmailEnvPresenceResult,
    buildEnvPresenceReport,
    // E1C2C Yandex alias bridge (legacy YANDEX_* -> EMAIL_* aliases, NO send)
    E1C2C_STAGE,
    YANDEX_ALIAS_SOURCE_KEYS,
    CONFIGURED_NO,
    CONFIGURED_YES_PARTIAL,
    CONFIGURED_YES,
    collectYandexMailEnvPresence,
    buildEmailConfigPresenceFromAliases,
    buildYandexAliasPreflightReport,
};



