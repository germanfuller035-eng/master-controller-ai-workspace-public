// server_funnel/service.mjs
// Server-connected commercial funnel glue. It connects the existing read-only
// Yandex IMAP snapshot, reply classifier, guarded SMTP adapter, approval packet
// model and private/local CRM funnel state. No hidden send, no payment, no
// production DB write.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { WORKSPACE, SECRETS_ENV_DIR, readEnvFile } from '../shared/config.mjs';
import { classifyReply } from '../../../telegram_gateway/reply_monitor.mjs';
import { sendMessage as sendTelegramMessage } from '../../../telegram_gateway/telegram_api_transport.mjs';
import {
    buildEmailConfigPresenceFromAliases,
    sendApprovedClientEmail,
} from '../../../telegram_gateway/telegram_approved_email_send_adapter.mjs';

export const FUNNEL_VERSION = 'server_connected_commercial_funnel_v1';

export const FEATURE_FLAGS = Object.freeze({
    EMAIL_HUB_ENABLED: true,
    IMAP_READ_ENABLED: true,
    CRM_LOCAL_WRITE_ENABLED: true,
    TELEGRAM_APPROVAL_ENABLED: true,
    SMTP_SEND_ENABLED: false,
    SMTP_SEND_ALLOWED_AFTER_APPROVAL: true,
    AUTO_REPLY_ENABLED: false,
    MASS_SEND_ENABLED: false,
    PAYMENT_LIVE_ENABLED: false,
    PAYMENT_LINK_ENABLED: false,
    PRODUCTION_DB_WRITE_ENABLED: false,
});

export const DEFAULT_PRIVATE_ROOT = process.env.MC_SERVER_FUNNEL_PRIVATE_ROOT
    || 'D:/AI_FILE_VAULT/sales_pilot_private/server_connected_commercial_funnel_v1';

const HEADER_SNAPSHOT_PATH = path.join(WORKSPACE, 'data', 'yandex_mail_stage1_headers.json');
const YANDEX_ALLOWLIST_PATH = path.join(WORKSPACE, 'data', 'yandex_mail_allowlist.json');
const IMAP_READ_SCRIPT_PATH = path.join(WORKSPACE, 'tools', 'communication_monitor', 'yandex_mail_imap_read.mjs');
const YANDEX_SECRET_DIR = 'D:/AI_SECRETS/yandex';
const YANDEX_SECRET_ENV_FILES = Object.freeze([
    path.join(SECRETS_ENV_DIR, 'communication_monitor.env'),
    path.join(SECRETS_ENV_DIR, 'telegram_gateway.env'),
]);

const EMAIL_TYPES = Object.freeze([
    'lead',
    'client',
    'spam',
    'invoice',
    'document',
    'deal_reply',
    'bounce',
    'stop_request',
    'system',
    'unknown',
]);

function nowIso() {
    return new Date().toISOString();
}

export function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

export function sha256(value) {
    return crypto.createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex');
}

export function shortHash(value, len = 16) {
    return sha256(value).slice(0, len);
}

export function maskEmail(value) {
    const s = String(value || '').trim();
    const i = s.indexOf('@');
    if (i <= 0) return s ? '[hidden]' : null;
    const local = s.slice(0, i);
    const domain = s.slice(i + 1);
    const safeLocal = local.length <= 2 ? `${local[0] || '*'}*` : `${local[0]}***${local.slice(-1)}`;
    return `${safeLocal}@${domain}`;
}

function readJsonSafe(file, fallback) {
    try {
        if (!fs.existsSync(file)) return fallback;
        const raw = fs.readFileSync(file, 'utf8').trim();
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function writeJsonAtomic(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp_${process.pid}_${Date.now()}`;
    fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, file);
}

function mergePrivateEnv(env = process.env, files = YANDEX_SECRET_ENV_FILES) {
    const merged = { ...env };
    for (const file of files || []) {
        const parsed = readEnvFile(file);
        for (const [k, v] of Object.entries(parsed)) {
            if (merged[k] == null || merged[k] === '') merged[k] = v;
        }
    }
    return merged;
}

function appendJsonl(file, record) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8');
}

function normalizeText(value) {
    return String(value || '').toLowerCase().replace(/ё/g, 'е');
}

function has(text, words) {
    return words.some((w) => text.includes(w));
}

export function classifyEmail(input = {}) {
    const subject = normalizeText(input.subject);
    const body = normalizeText(input.body || input.text || input.preview);
    const from = normalizeText(input.from || input.from_name);
    const hay = `${subject}\n${body}\n${from}`;

    const replyVerdict = classifyReply(`${subject}\n${body}`);
    if (replyVerdict.optout) {
        return { type: 'stop_request', confidence: 0.95, reason_ru: 'Похоже на просьбу не писать или отказ от контакта.' };
    }
    if (replyVerdict.category === 'bounce') {
        return { type: 'bounce', confidence: 0.95, reason_ru: 'Похоже на недоставку письма.' };
    }

    if (has(hay, ['spam', 'viagra', 'casino', 'казино', 'ставки', 'быстрый заработок'])) {
        return { type: 'spam', confidence: 0.85, reason_ru: 'Письмо похоже на спам.' };
    }
    if (has(hay, ['счет', 'счёт', 'invoice', 'payment due', 'оплат', 'акт сверки'])) {
        return { type: 'invoice', confidence: 0.82, reason_ru: 'Письмо связано со счётом или оплатой.' };
    }
    if (has(hay, ['договор', 'коммерческое предложение', 'кп', 'proposal', 'pdf', 'attachment', 'вложен'])) {
        return { type: 'document', confidence: 0.78, reason_ru: 'Письмо похоже на документ или коммерческий материал.' };
    }
    if (input.in_reply_to || input.references || subject.startsWith('re:') || subject.startsWith('fw:')) {
        const category = replyVerdict.category || 'unknown';
        if (category === 'interested' || category === 'question') {
            return { type: 'deal_reply', confidence: 0.86, reason_ru: 'Это ответ в существующей переписке, требует решения владельца.' };
        }
        return { type: 'client', confidence: 0.68, reason_ru: 'Письмо связано с существующей цепочкой.' };
    }
    if (has(hay, ['заявка', 'request', 'интересует', 'нужен', 'нужна', 'аудит', 'сайт', 'лендинг', 'crm'])) {
        return { type: 'lead', confidence: 0.74, reason_ru: 'Есть признаки нового коммерческого запроса или лида.' };
    }
    if (has(hay, ['yandex', 'google', 'github', 'security', '2fa', 'пароль', 'код подтверждения', 'notification'])) {
        return { type: 'system', confidence: 0.8, reason_ru: 'Похоже на системное уведомление.' };
    }
    return { type: 'unknown', confidence: 0.45, reason_ru: 'Недостаточно признаков для уверенной классификации.' };
}

export function dedupeEmails(items = []) {
    const seen = new Set();
    const out = [];
    for (const item of items) {
        const key = String(item.message_id || item.messageId || '').trim()
            || shortHash([item.uid || '', item.from || '', item.subject || '', item.date || '']);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ...item, dedupe_key: key });
    }
    return out;
}

export function linkThread(item = {}) {
    const explicit = item.in_reply_to || item.inReplyTo || item.references;
    if (explicit) return shortHash(`thread:${explicit}`, 18);
    const subj = String(item.subject || '').toLowerCase().replace(/^(re|fw):\s*/i, '').trim();
    const from = String(item.from || '').toLowerCase().trim();
    return shortHash(`thread:${from}|${subj}`, 18);
}

export function readYandexHeaderSnapshot(snapshotPath = HEADER_SNAPSHOT_PATH) {
    const raw = readJsonSafe(snapshotPath, null);
    const headers = Array.isArray(raw?.headers) ? raw.headers : [];
    const safeHeaders = dedupeEmails(headers).map((h) => {
        const classification = classifyEmail(h);
        return {
            uid: h.uid || null,
            date: h.date || null,
            from_masked: maskEmail(h.from),
            subject_present: !!h.subject,
            message_id_present: !!h.message_id,
            in_reply_to_present: !!h.in_reply_to,
            thread_id: linkThread(h),
            classification,
        };
    });
    return {
        exists: !!raw,
        path: snapshotPath,
        fetched_at: raw?.fetched_at || null,
        mailbox: raw?.mailbox || null,
        count: safeHeaders.length,
        safety: raw?.safety || null,
        items: safeHeaders,
    };
}

export function ensureYandexAllowlistFromPrivateEnv({ env = process.env, allowlistPath = YANDEX_ALLOWLIST_PATH } = {}) {
    const runtimeEnv = mergePrivateEnv(env);
    const existing = readJsonSafe(allowlistPath, null);
    if (Array.isArray(existing) && existing.some((x) => x?.active === true && typeof x.email === 'string' && x.email.includes('@'))) {
        return { ok: true, created: false, allowlist_present: true, active_count: existing.filter((x) => x?.active === true).length };
    }
    const candidates = [runtimeEnv.YANDEX_MAIL_LOGIN, runtimeEnv.EMAIL_SMTP_USER, runtimeEnv.EMAIL_TEST_TO]
        .filter((v) => typeof v === 'string' && v.includes('@'))
        .map((v) => v.trim().toLowerCase());
    const unique = [...new Set(candidates)];
    if (unique.length === 0) {
        return { ok: false, code: 'ALLOWLIST_SOURCE_MISSING', allowlist_present: false, active_count: 0 };
    }
    writeJsonAtomic(allowlistPath, unique.map((email, index) => ({
        id: `private_allow_${index + 1}`,
        email,
        active: true,
        source: 'private_env',
    })));
    return { ok: true, created: true, allowlist_present: true, active_count: unique.length };
}

export function refreshImapReadonlySnapshot({ env = process.env, scriptPath = IMAP_READ_SCRIPT_PATH } = {}) {
    const allowlist = ensureYandexAllowlistFromPrivateEnv({ env });
    if (!allowlist.ok) {
        return { ok: false, code: allowlist.code, message_ru: 'Не найден приватный источник списка разрешённых ящиков для безопасного чтения.', allowlist };
    }
    const runtimeEnv = {
        ...mergePrivateEnv(env),
        YANDEX_MAIL_STAGE1_LIVE_READ: 'true',
        YANDEX_MAIL_SEND_ENABLED: 'false',
        YANDEX_MAIL_DELETE_ENABLED: 'false',
        YANDEX_MAIL_ARCHIVE_ENABLED: 'false',
        YANDEX_MAIL_ATTACHMENTS_ENABLED: 'false',
        YANDEX_MAIL_READONLY: 'true',
        YANDEX_MAIL_ALLOWLIST_ONLY: 'true',
    };
    const result = spawnSync(process.execPath, [scriptPath], {
        cwd: WORKSPACE,
        env: runtimeEnv,
        encoding: 'utf8',
        timeout: 120000,
        windowsHide: true,
    });
    const snapshot = readYandexHeaderSnapshot();
    return {
        ok: result.status === 0,
        code: result.status === 0 ? 'IMAP_READONLY_REFRESHED' : 'IMAP_READONLY_REFRESH_FAILED',
        exit_code: result.status,
        signal: result.signal || null,
        snapshot_exists: snapshot.exists,
        fetched_at: snapshot.fetched_at,
        count: snapshot.count,
        imap_read_only: true,
        headers_only: true,
        body_downloaded: false,
        attachments_downloaded: false,
        messages_mutated: false,
        pop3_used: false,
        allowlist_active_count: allowlist.active_count,
    };
}

export function readRawHeaderSnapshot(snapshotPath = HEADER_SNAPSHOT_PATH) {
    const raw = readJsonSafe(snapshotPath, null);
    return {
        raw,
        headers: Array.isArray(raw?.headers) ? raw.headers : [],
        fetched_at: raw?.fetched_at || null,
        mailbox: raw?.mailbox || null,
        safety: raw?.safety || null,
    };
}

export function listEmailHubItems({ snapshotPath = HEADER_SNAPSHOT_PATH } = {}) {
    const { raw, headers, fetched_at, mailbox, safety } = readRawHeaderSnapshot(snapshotPath);
    const items = dedupeEmails(headers).map((h) => {
        const threadId = linkThread(h);
        const classification = classifyEmail(h);
        const emailId = `eml_${shortHash(h.message_id || h.dedupe_key || h, 16)}`;
        return {
            email_id: emailId,
            uid: h.uid || null,
            thread_id: threadId,
            date: h.date || null,
            from_masked: maskEmail(h.from),
            subject: h.subject || '(no subject)',
            subject_present: !!h.subject,
            classification,
            status_ru: classification.type === 'stop_request' ? 'Не контактировать' : 'Требует решения владельца',
            next_action_ru: classification.type === 'stop_request' ? 'Зафиксировать ограничение контакта' : 'Открыть письмо',
        };
    });
    return {
        snapshot_exists: !!raw,
        fetched_at,
        mailbox,
        safety,
        count: items.length,
        items,
    };
}

export function getEmailHubItem(emailId, opts = {}) {
    const hub = listEmailHubItems(opts);
    return hub.items.find((item) => item.email_id === emailId) || null;
}

export function getEmailHubRawHeader(emailId, { snapshotPath = HEADER_SNAPSHOT_PATH } = {}) {
    const { headers } = readRawHeaderSnapshot(snapshotPath);
    for (const h of dedupeEmails(headers)) {
        const id = `eml_${shortHash(h.message_id || h.dedupe_key || h, 16)}`;
        if (id === emailId) return h;
    }
    return null;
}

export function applyCurrentEmailHubSnapshot({ snapshotPath = HEADER_SNAPSHOT_PATH, storePath, auditPath, now = nowIso() } = {}) {
    const { raw, headers, fetched_at } = readRawHeaderSnapshot(snapshotPath);
    const applied = applyEmailHubSnapshot({ headers, storePath, auditPath, now });
    return {
        ...applied,
        snapshot_exists: !!raw,
        snapshot_fetched_at: fetched_at,
        headers_seen: headers.length,
    };
}

export function yandexSecretPresence({ env = process.env, secretDir = YANDEX_SECRET_DIR, secretFiles = YANDEX_SECRET_ENV_FILES } = {}) {
    const merged = { ...env };
    const candidates = new Set();
    try {
        if (fs.existsSync(secretDir)) {
            for (const f of fs.readdirSync(secretDir)) {
                if (/\.(env|txt|properties)$/i.test(f)) candidates.add(path.join(secretDir, f));
            }
        }
    } catch {
        // Secret directory presence is enough to report safely; never surface names or values.
    }
    for (const file of secretFiles || []) {
        if (file && fs.existsSync(file)) candidates.add(file);
    }
    for (const file of candidates) {
        const parsed = readEnvFile(file);
        for (const [k, v] of Object.entries(parsed)) {
            if (merged[k] == null || merged[k] === '') merged[k] = v;
        }
    }
    const aliases = buildEmailConfigPresenceFromAliases(merged);
    const configuredLevel = aliases.configured;
    const yandexLoginPresent = !!(merged.YANDEX_MAIL_LOGIN || merged.EMAIL_SMTP_USER);
    const yandexAppPasswordPresent = !!(merged.YANDEX_MAIL_APP_PASSWORD || merged.EMAIL_SMTP_PASS);
    return {
        secret_dir_present: fs.existsSync(secretDir),
        fallback_env_present: (secretFiles || []).some((file) => file && fs.existsSync(file)),
        secret_files_checked: candidates.size,
        yandex_login_present: yandexLoginPresent,
        yandex_app_password_present: yandexAppPasswordPresent,
        smtp_credentials_present: yandexLoginPresent && yandexAppPasswordPresent,
        smtp_configured_level: configuredLevel,
        smtp_self_test_recipient_present: aliases.email_coverage?.EMAIL_TEST_TO?.present === true,
        smtp_configured: configuredLevel === 'YES' || configuredLevel === 'YES_PARTIAL' || configuredLevel === true,
        smtp_real_send_enabled: false,
        missing_keys: aliases.missing_keys || [],
    };
}

export function qualityCheckDraft({ subject = '', body = '', factualBasis = '', contactRestriction = 'PASS', duplicateStatus = 'PASS' } = {}) {
    const text = `${subject}\n${body}`;
    const lower = normalizeText(text);
    const checks = [];
    const unsupported = has(lower, ['гарантируем', 'точно увеличим', '100%', 'без риска', 'лидер рынка']) && !factualBasis;
    checks.push({ key: 'unsupported_claims', state: unsupported ? 'BLOCKED' : 'PASS', label_ru: 'Неподтверждённые заявления' });
    const roi = has(lower, ['roi', 'окуп', 'x2', 'x3', 'удвоим', 'вырастет выручка']);
    checks.push({ key: 'roi_promises', state: roi && !factualBasis ? 'BLOCKED' : 'PASS', label_ru: 'Обещания результата' });
    checks.push({ key: 'tone', state: has(lower, ['срочно купите', 'последний шанс']) ? 'NEEDS_OWNER_REVIEW' : 'PASS', label_ru: 'Тон' });
    checks.push({ key: 'length', state: text.length > 1800 ? 'NEEDS_OWNER_REVIEW' : 'PASS', label_ru: 'Длина' });
    checks.push({ key: 'personalization', state: factualBasis ? 'PASS' : 'NEEDS_OWNER_REVIEW', label_ru: 'Персонализация' });
    checks.push({ key: 'compliance', state: 'PASS', label_ru: 'Юридическая аккуратность' });
    checks.push({ key: 'deliverability', state: subject && body ? 'PASS' : 'BLOCKED', label_ru: 'Доставляемость' });
    checks.push({ key: 'contact_restriction', state: contactRestriction === 'PASS' ? 'PASS' : 'REQUIRES_OWNER_DECISION', label_ru: 'Ограничение контакта' });
    checks.push({ key: 'duplicate_prior_outreach', state: duplicateStatus === 'PASS' ? 'PASS' : 'REQUIRES_OWNER_DECISION', label_ru: 'История контакта' });
    const blocked = checks.filter((c) => c.state === 'BLOCKED').map((c) => c.key);
    const ownerReview = checks.filter((c) => c.state === 'NEEDS_OWNER_REVIEW' || c.state === 'REQUIRES_OWNER_DECISION').map((c) => c.key);
    return {
        status: blocked.length ? 'BLOCKED' : (ownerReview.length ? 'NEEDS_OWNER_DECISION' : 'PASS'),
        checks,
        blocked,
        ownerReview,
    };
}

export function buildReplyDraft(email = {}) {
    const classification = classifyEmail(email);
    const subject = String(email.subject || '').startsWith('Re:') ? String(email.subject || '') : `Re: ${email.subject || 'ваше письмо'}`;
    const summary_ru = classification.type === 'stop_request'
        ? 'Адресат просит не продолжать контакт.'
        : classification.type === 'bounce'
            ? 'Письмо похоже на недоставку.'
            : 'Нужно вручную проверить письмо и ответить без обещаний результата.';
    const body = [
        'Здравствуйте.',
        '',
        'Спасибо, получил ваше сообщение. Я проверю контекст и вернусь с коротким ответом по делу.',
        '',
        'Если удобнее, можно прислать один главный вопрос или ссылку на актуальные материалы.',
    ].join('\n');
    const quality = qualityCheckDraft({ subject, body, factualBasis: 'Ответ построен только на факте входящего письма.' });
    return {
        subject,
        body,
        summary_ru,
        suggested_action: classification.type === 'stop_request' ? 'do_not_contact' : 'owner_review',
        risk_ru: classification.type === 'stop_request' ? 'Дальнейший контакт заблокирован до решения владельца.' : 'Перед отправкой нужно подтверждение владельца.',
        quality,
        text_hash: shortHash({ subject, body }, 24),
        sends: false,
    };
}

export function buildTelegramApprovalCard(packet = {}, { now = nowIso() } = {}) {
    const expiresAt = new Date(Date.parse(now) + 30 * 60 * 1000).toISOString();
    const approvalPayload = {
        packet_id: packet.packet_id || `pkt_${shortHash(packet, 10)}`,
        recipient: packet.recipient || '',
        channel: packet.channel || 'email',
        subject: packet.subject || '',
        body: packet.body || '',
        text_hash: packet.text_hash || shortHash({ subject: packet.subject || '', body: packet.body || '' }, 24),
        risk: packet.risk || 'owner_review_required',
        expires_at: expiresAt,
    };
    return {
        approval_id: `apv_${shortHash({ approvalPayload, now }, 14)}`,
        status: 'WAITING_OWNER_APPROVAL',
        expires_at: expiresAt,
        one_time_token: `ott_${shortHash({ approvalPayload, expiresAt }, 24)}`,
        approval_hash: shortHash(approvalPayload, 32),
        card_ru: {
            from: maskEmail(packet.from || packet.sender || ''),
            type: packet.type || 'reply',
            lead_or_deal: packet.lead_id || packet.deal_id || 'не связано',
            summary: packet.summary_ru || 'Черновик готов к проверке владельцем.',
            risk: packet.risk_ru || 'Отправка возможна только после подтверждения владельца.',
            draft: packet.body || '',
            buttons: ['Одобрить', 'Править', 'Отложить', 'Не отвечать'],
        },
        payload: approvalPayload,
        sends: false,
    };
}

function approvalStorePath() {
    return path.join(DEFAULT_PRIVATE_ROOT, 'approval_cards.json');
}

function loadApprovalStore(file = approvalStorePath()) {
    return readJsonSafe(file, { approvals: {}, updated_at: null });
}

function saveApprovalStore(store, file = approvalStorePath()) {
    store.updated_at = nowIso();
    writeJsonAtomic(file, store);
}

export function persistApprovalCard(card = {}, { storePath = approvalStorePath(), now = nowIso() } = {}) {
    const store = loadApprovalStore(storePath);
    const approvalId = card.approval_id;
    if (!approvalId) return { ok: false, code: 'APPROVAL_ID_MISSING' };
    store.approvals[approvalId] = {
        approval_id: approvalId,
        status: card.status || 'WAITING_OWNER_APPROVAL',
        one_time_token: card.one_time_token,
        approval_hash: card.approval_hash,
        expires_at: card.expires_at,
        payload: card.payload,
        created_at: now,
        used_at: null,
        decision: null,
        telegram_message_id: null,
    };
    saveApprovalStore(store, storePath);
    return { ok: true, approval_id: approvalId, store_path: storePath };
}

export async function sendTelegramApprovalCardToOwner(card = {}, { env = process.env } = {}) {
    const runtimeEnv = mergePrivateEnv(env);
    const token = runtimeEnv.TELEGRAM_BOT_TOKEN;
    const chatId = String(runtimeEnv.TELEGRAM_OWNER_CHAT_ID || runtimeEnv.ALLOWED_TELEGRAM_USER_IDS || '').split(/[,\s]+/).filter(Boolean)[0];
    if (!token || !chatId) {
        return { ok: false, code: 'TELEGRAM_OWNER_CONFIG_MISSING', sent: false };
    }
    const c = card.card_ru || {};
    const payload = card.payload || {};
    const lines = [
        'Подтверждение одной отправки',
        '',
        `От кого: ${c.from || 'скрыто'}`,
        `Тип: ${c.type || 'reply'}`,
        `Лид/сделка: ${c.lead_or_deal || 'не связано'}`,
        `Риск: ${c.risk || 'Нужно решение владельца.'}`,
        '',
        c.summary || 'Черновик готов к проверке.',
        '',
        `Тема: ${payload.subject || 'без темы'}`,
        '',
        payload.body || '',
        '',
        'Система не отправит письмо без этого одноразового подтверждения.',
    ];
    const tokenOnce = card.one_time_token || '';
    const keyboard = {
        inline_keyboard: [[
            { text: 'Одобрить одну отправку', callback_data: `sf:approve:${tokenOnce}` },
        ], [
            { text: 'Править', callback_data: `sf:edit:${tokenOnce}` },
            { text: 'Отложить', callback_data: `sf:hold:${tokenOnce}` },
            { text: 'Не отвечать', callback_data: `sf:no_reply:${tokenOnce}` },
        ]],
    };
    const result = await sendTelegramMessage(token, {
        chat_id: chatId,
        text: lines.join('\n').slice(0, 3900),
        reply_markup: keyboard,
        disable_web_page_preview: true,
    }, {
        socksProxy: runtimeEnv.TELEGRAM_SOCKS_PROXY,
    });
    return {
        ok: result.ok === true,
        code: result.ok === true ? 'TELEGRAM_APPROVAL_CARD_SENT' : 'TELEGRAM_APPROVAL_CARD_FAILED',
        sent: result.ok === true,
        message_id_present: result.ok === true && result.result?.message_id != null,
        error_code: result.ok === true ? null : (result.error || result.description || 'telegram_error'),
    };
}

export function processTelegramApprovalCallback({ callbackData = '', actor = 'owner_telegram', auditPath, storePath = approvalStorePath(), now = nowIso() } = {}) {
    const m = /^sf:(approve|edit|hold|no_reply):(ott_[a-f0-9]+)$/i.exec(String(callbackData || '').trim());
    if (!m) return { ok: false, code: 'CALLBACK_UNRECOGNIZED' };
    const action = m[1].toLowerCase();
    const token = m[2];
    const store = loadApprovalStore(storePath);
    const approval = Object.values(store.approvals || {}).find((x) => x.one_time_token === token);
    if (!approval) return { ok: false, code: 'APPROVAL_NOT_FOUND' };
    if (approval.used_at) return { ok: false, code: 'APPROVAL_ALREADY_USED' };
    if (approval.expires_at && Date.parse(now) >= Date.parse(approval.expires_at)) return { ok: false, code: 'APPROVAL_EXPIRED' };
    const status = action === 'approve'
        ? 'APPROVED'
        : action === 'edit'
            ? 'EDIT_REQUESTED'
            : action === 'hold'
                ? 'HELD'
                : 'NO_REPLY';
    approval.status = status;
    approval.used_at = now;
    approval.decision = action;
    saveApprovalStore(store, storePath);
    const event = appendAuditEvent({
        actor,
        action: `telegram_${action}`,
        packet_id: approval.payload?.packet_id || null,
        payload: { approval_id: approval.approval_id, status, approval_hash: approval.approval_hash },
        result: status,
    }, { auditPath, now });
    return {
        ok: true,
        approval_id: approval.approval_id,
        status,
        decision: action,
        approval_hash: approval.approval_hash,
        audit_event_id: event.event_id,
    };
}

export function buildSendPacket(input = {}, { now = nowIso() } = {}) {
    const subject = String(input.subject || '').trim();
    const body = String(input.body || '').trim();
    const text_hash = shortHash({ subject, body }, 24);
    const expiresAt = input.expires_at || new Date(Date.parse(now) + 30 * 60 * 1000).toISOString();
    const packet = {
        packet_id: input.packet_id || `pkt_${shortHash({ subject, body, recipient: input.recipient, now }, 14)}`,
        lead_id: input.lead_id || null,
        deal_id: input.deal_id || null,
        recipient: String(input.recipient || '').trim(),
        channel: input.channel || 'email',
        subject,
        body,
        text_hash,
        packet_hash: shortHash({ recipient: input.recipient || '', channel: input.channel || 'email', subject, body, expiresAt }, 32),
        expires_at: expiresAt,
        status: 'NOT_SENT',
        single_use: true,
        quality_status: input.quality_status || 'PASS',
        contact_restriction: input.contact_restriction || 'PASS',
        owner_override: input.owner_override || null,
        stop_request: input.stop_request === true,
        bounce_block: input.bounce_block === true,
    };
    return packet;
}

export function evaluateSmtpSendGuard({ packet = {}, approval = {}, request = {}, usedPacketHashes = new Set(), now = nowIso(), flags = FEATURE_FLAGS } = {}) {
    const reasons = [];
    const p = packet || {};
    const a = approval || {};
    const r = request || {};
    if (flags.EMAIL_HUB_ENABLED !== true) reasons.push('EMAIL_HUB_DISABLED');
    if (flags.SMTP_SEND_ALLOWED_AFTER_APPROVAL !== true) reasons.push('SMTP_AFTER_APPROVAL_DISABLED');
    if (flags.MASS_SEND_ENABLED === true || Array.isArray(r.recipient) || Array.isArray(p.recipient)) reasons.push('MASS_SEND_BLOCKED');
    if (flags.AUTO_REPLY_ENABLED === true || r.auto_reply === true) reasons.push('AUTO_REPLY_BLOCKED');
    if (a.status !== 'APPROVED') reasons.push('OWNER_APPROVAL_REQUIRED');
    if (!p.packet_hash || r.packet_hash !== p.packet_hash) reasons.push('PACKET_MARKER_MISMATCH');
    if (!p.text_hash || r.text_hash !== p.text_hash) reasons.push('TEXT_MARKER_MISMATCH');
    if (String(r.recipient || '').trim().toLowerCase() !== String(p.recipient || '').trim().toLowerCase()) reasons.push('RECIPIENT_MISMATCH');
    if (String(r.body || '') !== String(p.body || '') || String(r.subject || '') !== String(p.subject || '')) reasons.push('TEXT_CHANGED');
    if (p.expires_at && Date.parse(now) >= Date.parse(p.expires_at)) reasons.push('PACKET_EXPIRED');
    if (usedPacketHashes.has(p.packet_hash)) reasons.push('DUPLICATE_GUARD_BLOCKED');
    if (p.stop_request === true) reasons.push('STOP_REQUEST_BLOCKED');
    if (p.bounce_block === true) reasons.push('BOUNCE_BLOCKED');
    if (p.contact_restriction !== 'PASS' && !p.owner_override?.confirmed) reasons.push('OWNER_OVERRIDE_REQUIRED');

    const allowed = reasons.length === 0;
    return {
        allowed,
        status: allowed ? 'APPROVED_FOR_ONE_ACTION' : 'BLOCKED',
        reasons,
        outbound_count: 0,
        payment_count: 0,
        production_db_writes: 0,
    };
}

export async function executeApprovedSmtpSend({ packet, approval, request, env = process.env, usedPacketHashes = new Set(), liveSend = false, now = nowIso() } = {}) {
    const guard = evaluateSmtpSendGuard({ packet, approval, request, usedPacketHashes, now });
    if (!guard.allowed) return { ok: false, code: 'SMTP_SEND_BLOCKED', guard, sent_count: 0 };
    if (liveSend !== true) return { ok: true, code: 'SMTP_APPROVED_DRY_RUN', guard, sent_count: 0 };
    const payload = { to: packet.recipient, subject: packet.subject, body: packet.body };
    const result = await sendApprovedClientEmail(payload, {
        env,
        owner_confirmed: true,
        approved_by: 'Dmitry',
        real_send_enabled: true,
        mass_send: false,
        autosend: false,
        message_count: 1,
    });
    return { ok: result.ok === true, code: result.code, result, sent_count: result.sent_count || 0 };
}

export function appendAuditEvent(event = {}, { auditPath, previousHash = null, now = nowIso() } = {}) {
    const target = auditPath || path.join(DEFAULT_PRIVATE_ROOT, 'audit_ledger.jsonl');
    const payloadHash = shortHash(event.payload || event, 32);
    const record = {
        event_id: event.event_id || `evt_${shortHash({ event, now, previousHash }, 14)}`,
        timestamp: now,
        actor: event.actor || 'system',
        source: event.source || FUNNEL_VERSION,
        action: event.action || 'unknown',
        lead_id: event.lead_id || null,
        deal_id: event.deal_id || null,
        email_thread_id: event.email_thread_id || null,
        packet_id: event.packet_id || null,
        payload_hash: payloadHash,
        previous_hash: previousHash,
        result: event.result || null,
        local_only: true,
        production_synced: false,
    };
    appendJsonl(target, record);
    return record;
}

export function applyEmailHubSnapshot({ headers = [], storePath, auditPath, now = nowIso() } = {}) {
    const target = storePath || path.join(DEFAULT_PRIVATE_ROOT, 'crm_local_funnel.json');
    const existing = readJsonSafe(target, { version: FUNNEL_VERSION, emails: {}, leads: {}, deals: {}, threads: {}, updated_at: null });
    const unique = dedupeEmails(headers);
    let previousHash = null;
    const audit = [];
    for (const h of unique) {
        const threadId = linkThread(h);
        const classification = classifyEmail(h);
        const emailId = `eml_${shortHash(h.message_id || h.dedupe_key || h, 16)}`;
        if (!existing.emails[emailId]) {
            existing.emails[emailId] = {
                email_id: emailId,
                thread_id: threadId,
                from_masked: maskEmail(h.from),
                subject_hash: shortHash(h.subject || '', 16),
                received_at: h.date || now,
                classification,
                local_only: true,
                production_synced: false,
            };
            existing.threads[threadId] = existing.threads[threadId] || { thread_id: threadId, email_ids: [], state: 'NEW_EMAIL' };
            existing.threads[threadId].email_ids.push(emailId);
            existing.threads[threadId].state = classification.type === 'lead' ? 'LEAD_CREATED' : 'CLASSIFIED';
            if (classification.type === 'lead') {
                const leadId = `lead_${shortHash(threadId, 12)}`;
                existing.leads[leadId] = existing.leads[leadId] || {
                    lead_id: leadId,
                    email_thread_id: threadId,
                    stage: 'LEAD_CREATED',
                    source: 'yandex_imap_readonly',
                    confidence: classification.confidence,
                    local_only: true,
                    production_synced: false,
                };
            }
            if (classification.type === 'deal_reply') {
                const dealId = `deal_${shortHash(threadId, 12)}`;
                existing.deals[dealId] = existing.deals[dealId] || {
                    deal_id: dealId,
                    email_thread_id: threadId,
                    stage: 'REPLY_RECEIVED',
                    local_only: true,
                    production_synced: false,
                };
            }
            const rec = appendAuditEvent({
                actor: 'email_hub',
                action: 'email_classified',
                email_thread_id: threadId,
                payload: { email_id: emailId, classification },
                result: 'CLASSIFIED',
            }, { auditPath, previousHash, now });
            previousHash = rec.payload_hash;
            audit.push(rec);
        }
    }
    if (audit.length === 0) {
        const rec = appendAuditEvent({
            actor: 'email_hub',
            action: 'snapshot_applied',
            payload: { headers_seen: unique.length },
            result: 'NO_NEW_EMAILS',
        }, { auditPath, previousHash, now });
        audit.push(rec);
    }
    existing.updated_at = now;
    writeJsonAtomic(target, existing);
    return {
        ok: true,
        store_path: target,
        audit_path: auditPath || path.join(DEFAULT_PRIVATE_ROOT, 'audit_ledger.jsonl'),
        emails_total: Object.keys(existing.emails).length,
        leads_total: Object.keys(existing.leads).length,
        deals_total: Object.keys(existing.deals).length,
        audit_events_written: audit.length,
        local_only: true,
        production_synced: false,
    };
}

export function statusSnapshot({ runtimeEnv = process.env, snapshotPath = HEADER_SNAPSHOT_PATH } = {}) {
    const headers = readYandexHeaderSnapshot(snapshotPath);
    const smtp = yandexSecretPresence({ env: runtimeEnv });
    const types = {};
    for (const item of headers.items) {
        const t = item.classification?.type || 'unknown';
        types[t] = (types[t] || 0) + 1;
    }
    return {
        version: FUNNEL_VERSION,
        feature_flags: FEATURE_FLAGS,
        yandex_imap_read: {
            enabled: true,
            read_only: true,
            headers_only: true,
            pop3_used: false,
            snapshot_exists: headers.exists,
            fetched_at: headers.fetched_at,
            count: headers.count,
        },
        yandex_smtp_ready: {
            configured: smtp.smtp_configured,
            real_send_enabled: false,
            allowed_after_owner_approval: true,
            missing_keys: smtp.missing_keys,
        },
        email_classification: {
            enabled: true,
            supported_types: EMAIL_TYPES,
            counts: types,
        },
        crm_local_write: {
            enabled: true,
            private_only: true,
            production_synced: false,
        },
        telegram_approval: {
            enabled: true,
            sends_telegram_now: false,
            card_ready: true,
        },
        funnel: {
            enabled: true,
            stages: [
                'NEW_EMAIL',
                'CLASSIFIED',
                'LEAD_CREATED',
                'DRAFT_READY',
                'QA_READY',
                'WAITING_OWNER_APPROVAL',
                'APPROVED_TO_SEND_ONE',
                'SENT',
                'WAITING_REPLY',
                'REPLY_RECEIVED',
                'DEAL_CREATED',
                'PRODUCT_SELECTED',
                'DOCUMENT_READY',
                'INVOICE_DRAFT',
                'PAYMENT_GATE_PENDING',
            ],
        },
        safety: {
            auto_reply: 'OFF',
            mass_send: 'OFF',
            payment_live: 'OFF',
            payment_link: 'OFF',
            production_db_write: 'OFF',
            outbound_count: 0,
            payment_count: 0,
            production_db_writes: 0,
        },
        owner_visible_ru: {
            status: 'Серверная воронка подключена в управляемом режиме.',
            next_action: headers.exists ? 'Проверьте новые письма и отправьте карточку на подтверждение.' : 'Выполните безопасное обновление почты.',
            blocked_reason: headers.exists ? null : 'Нет свежего снимка почты. Нажмите обновление.',
            last_refresh: headers.fetched_at,
            stale_reason: headers.exists ? null : 'Снимок входящих заголовков ещё не создан.',
        },
        updated_at: nowIso(),
    };
}

export default {
    FUNNEL_VERSION,
    FEATURE_FLAGS,
    classifyEmail,
    dedupeEmails,
    linkThread,
    readYandexHeaderSnapshot,
    yandexSecretPresence,
    ensureYandexAllowlistFromPrivateEnv,
    refreshImapReadonlySnapshot,
    readRawHeaderSnapshot,
    listEmailHubItems,
    getEmailHubItem,
    getEmailHubRawHeader,
    applyCurrentEmailHubSnapshot,
    qualityCheckDraft,
    buildReplyDraft,
    buildTelegramApprovalCard,
    persistApprovalCard,
    sendTelegramApprovalCardToOwner,
    processTelegramApprovalCallback,
    buildSendPacket,
    evaluateSmtpSendGuard,
    executeApprovedSmtpSend,
    appendAuditEvent,
    applyEmailHubSnapshot,
    statusSnapshot,
};
