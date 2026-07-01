// email_send_policy.mjs
// Shared, pure email send policy. No network, no .env reads, no secret output.

export const SEND_POLICY_AVAILABLE = 'AVAILABLE';
export const SEND_POLICY_BLOCKED = 'BLOCKED';

function _truthyFlag(value) {
    return String(value || '').trim().toLowerCase() === 'true';
}

function _falseFlag(value) {
    return String(value || '').trim().toLowerCase() === 'false';
}

function _present(value) {
    return value !== undefined && value !== null && String(value).trim() !== '';
}

export function hasSmtpCredentials(env = {}) {
    const e = (env && typeof env === 'object') ? env : {};
    const hasYandex = _present(e.YANDEX_MAIL_LOGIN) && _present(e.YANDEX_MAIL_APP_PASSWORD);
    const hasFallback = _present(e.EMAIL_SMTP_USER || e.SMTP_USER) && _present(e.EMAIL_SMTP_PASS || e.SMTP_PASS);
    return hasYandex || hasFallback;
}

export function getSmtpCredentialMode(env = {}) {
    const e = (env && typeof env === 'object') ? env : {};
    if (_present(e.YANDEX_MAIL_LOGIN) && _present(e.YANDEX_MAIL_APP_PASSWORD)) return 'YANDEX';
    if (_present(e.EMAIL_SMTP_USER || e.SMTP_USER) && _present(e.EMAIL_SMTP_PASS || e.SMTP_PASS)) return 'SMTP_FALLBACK';
    return 'MISSING';
}

export function countRecipients(to) {
    if (Array.isArray(to)) return to.filter((x) => String(x || '').trim() !== '').length;
    return String(to || '').trim() === '' ? 0 : 1;
}

export function evaluateManualSingleSendPolicy(payload = {}, context = {}) {
    const p = (payload && typeof payload === 'object') ? payload : {};
    const ctx = (context && typeof context === 'object') ? context : {};
    const env = (ctx.env && typeof ctx.env === 'object') ? ctx.env : {};
    const realSendEnabled = ctx.real_send_enabled === true || _truthyFlag(env.EMAIL_REAL_SEND_ENABLED);
    const testOnlyFalse = ctx.test_only === false || _falseFlag(env.EMAIL_TEST_ONLY);
    const recipientCount = countRecipients(p.to);

    if (ctx.owner_confirmed !== true) return { status: SEND_POLICY_BLOCKED, reason: 'OWNER_NOT_CONFIRMED' };
    if (ctx.approved_by !== 'Dmitry') return { status: SEND_POLICY_BLOCKED, reason: 'APPROVER_NOT_DMITRY' };
    if (ctx.autosend === true) return { status: SEND_POLICY_BLOCKED, reason: 'AUTOSEND_BLOCKED' };
    if (ctx.mass_send === true || ctx.massSend === true) return { status: SEND_POLICY_BLOCKED, reason: 'MASS_SEND_BLOCKED' };
    if (ctx.bulk_send === true || ctx.bulkSend === true) return { status: SEND_POLICY_BLOCKED, reason: 'BULK_SEND_BLOCKED' };
    if (Array.isArray(p.to) || recipientCount !== 1 || (ctx.message_count !== undefined && ctx.message_count !== 1)) {
        return { status: SEND_POLICY_BLOCKED, reason: 'RECIPIENT_COUNT_NOT_ONE', recipient_count: recipientCount };
    }
    if (!realSendEnabled) return { status: SEND_POLICY_BLOCKED, reason: 'EMAIL_REAL_SEND_ENABLED_NOT_TRUE' };
    if (!testOnlyFalse) return { status: SEND_POLICY_BLOCKED, reason: 'EMAIL_TEST_ONLY_NOT_FALSE' };
    if (!hasSmtpCredentials(env)) return { status: SEND_POLICY_BLOCKED, reason: 'SMTP_CREDENTIALS_MISSING' };
    return { status: SEND_POLICY_AVAILABLE, reason: 'MANUAL_OWNER_APPROVED_SINGLE_SEND_AVAILABLE', recipient_count: 1 };
}

export function buildEmailSendStatus(env = {}, approvalContext = {}) {
    const ctx = { ...approvalContext, env };
    const manual = evaluateManualSingleSendPolicy({ to: approvalContext.to || 'client@example.org' }, ctx);
    return {
        smtp_config_ready: hasSmtpCredentials(env),
        smtp_credential_mode: getSmtpCredentialMode(env),
        autosend_effective: SEND_POLICY_BLOCKED,
        autosend_reason: 'AUTOSEND_BLOCKED_ALWAYS',
        bulk_send_effective: SEND_POLICY_BLOCKED,
        bulk_send_reason: 'BULK_OR_MASS_SEND_BLOCKED_ALWAYS',
        manual_single_send_effective: manual.status,
        manual_single_send_reason: manual.reason,
    };
}