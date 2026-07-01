// queue_navigation.mjs
// ============================================================
// Mini Audit — Queue Navigation (inline-button lead conveyor)
// ------------------------------------------------------------
// Purpose:
//   Replace the old static "📋 Очередь" T1 stub (which only printed
//   "read-only in T1 / queue write blocked") with a LIVE, human-readable
//   one-lead-at-a-time screen driven entirely by inline buttons:
//
//     📋 Лид 1 / 12 — JBI Kuban
//     Контакт: sales@example.ru   Статус: ready
//     Аудит: готов ✅
//
//     [✅ Одобрить и отправить]
//     [👁 Превью]      [⏭ Следующий]
//     [⏮ Предыдущий]   [🏠 Меню]
//
// DESIGN:
//   - Navigation state lives INSIDE callback_data (q:next:<i>), so no disk
//     writes are needed just to page through leads. Pure + stateless paging.
//   - "✅ Одобрить и отправить" = approval + send in ONE tap. The tap itself
//     IS Dmitry's explicit approval (satisfies .clinerules "stop before
//     contacting a client": send is initiated by a deliberate human tap,
//     never by a background/bulk autosend).
//
// SAFETY CONTRACT:
//   - This module performs NO network I/O itself. Real sending is delegated to
//     an injected sendAdapter(lead) — in tests that adapter is a mock, in
//     production it is the audited email send path.
//   - next/prev/preview are pure reads (no side effects).
//   - No tokens / secrets / .env are ever read or printed.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { recordSendOnce, RESULT_SENT } from './outbound_send_ledger.mjs';

export const QUEUE_CB = Object.freeze({
    NEXT: 'q:next',
    PREV: 'q:prev',
    PREVIEW: 'q:preview',
    SEND: 'q:send',
    MENU: 'q:menu',
});

export const EMAIL_SEND_PROOF_GATE_ENABLED = true;
// Temporary proof-freeze is lifted: the approved send path may run, but
// EMAIL_SEND_PROOF_GATE_ENABLED still prevents waiting_reply without proven
// SMTP acceptance + outbound ledger recording.
export const EMAIL_SEND_FROZEN_UNTIL_PROOF_PATCH = false;
export const OUTBOUND_EMAIL_LEDGER_PATH = '13_sales/outbound_email_ledger.jsonl';

function canonicalLedgerInputFromQueueSend(lead = {}, result = {}, opts = {}) {
    const recipient = fullRecipient(lead, result);
    return {
        timestamp: opts.timestamp || result.sent_at || new Date().toISOString(),
        lead_id: lead.lead_id || lead.id || '',
        company: lead.company || lead.name || '',
        website: lead.website || lead.website_url || lead.site || '',
        recipient,
        subject: String(lead.subject || lead.email_subject || result.subject || '').trim(),
        draft_id: String(lead.draft_id || result.draft_id || '').trim(),
        result: RESULT_SENT,
        smtp_message_id: String(result.messageId || result.smtp_message_id || '').trim(),
        approved_by: opts.approved_by || 'Dmitry',
        contacted_marked: true,
        pipeline_stage: 'sent',
    };
}

// Parse "q:next:3" -> { action: 'q:next', index: 3 }. Returns null if not ours.
export function parseQueueCallback(data) {
    if (typeof data !== 'string') return null;
    if (!data.startsWith('q:')) return null;
    const parts = data.split(':');
    const action = `${parts[0]}:${parts[1] || ''}`;
    const index = Number.parseInt(parts[2], 10);
    return { action, index: Number.isFinite(index) ? index : 0 };
}

function clampIndex(index, len) {
    if (!len) return 0;
    if (index < 0) return 0;
    if (index >= len) return len - 1;
    return index;
}

function statusEmoji(status) {
    if (status === 'ready') return 'готов ✅';
    if (status === 'sent') return 'отправлен 📤';
    if (status === 'waiting_reply') return 'ждут ответа 📬';
    if (String(status || '').startsWith('blocked')) return `заблокирован (${status})`;
    return String(status || 'new');
}

function pickBody(value) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object' && typeof value.body === 'string' && value.body.trim()) {
        return value.body.trim();
    }
    return '';
}

export function resolvePreviewSource(lead = {}) {
    const candidates = [
        { value: lead.audit_preview, source: lead.audit_preview && typeof lead.audit_preview === 'object' ? 'lead.audit_preview.body' : 'lead.audit_preview' },
        { value: lead.preview, source: lead.preview && typeof lead.preview === 'object' ? 'lead.preview.body' : 'lead.preview' },
        { value: lead.audit_draft_preview, source: lead.audit_draft_preview && typeof lead.audit_draft_preview === 'object' ? 'lead.audit_draft_preview.body' : 'lead.audit_draft_preview' },
        { value: lead.audit_draft_body, source: 'lead.audit_draft_body' },
        { value: lead.body, source: 'lead.body' },
        { value: lead.email_preview && lead.email_preview.body, source: 'lead.email_preview.body' },
    ];
    for (const candidate of candidates) {
        const body = pickBody(candidate.value);
        if (body) return { status: 'ready', body, source: candidate.source };
    }
    return {
        status: 'missing',
        body: '(превью аудита ещё не сгенерировано)',
        source: 'not_generated',
    };
}

// ----------------------------------------------------------------------------
// CANONICAL EMAIL CHECK (no test/example/placeholder).
// ----------------------------------------------------------------------------
const _EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function leadEmail(lead = {}) {
    return String(lead.email || lead.recipient || lead.contact_email || lead.to || '').trim();
}
function hasValidEmail(lead = {}) {
    const e = leadEmail(lead);
    if (!e || !_EMAIL_RE.test(e)) return false;
    // reject obvious placeholder/test domains
    if (/(example\.(test|com|org)|\.test$|placeholder|none|n\/a|tbd)/i.test(e)) return false;
    return true;
}
function isLegacyOverlayOnly(lead = {}) {
    return lead.legacy_overlay_only === true || lead.source_provider === 'dashboard_legacy_overlay';
}

// ----------------------------------------------------------------------------
// computeLeadEligibility(lead) — the SINGLE source of truth for whether a lead
// may show "✅ Отправить" in the conveyor. Used by buildQueueScreen AND re-checked
// at q:send time so a stale button on an old message can never bypass it.
//   Returns { sendable: boolean, reasons: string[], category: string,
//             auditAvailable, emailAvailable, subject, body }
// ----------------------------------------------------------------------------
export function computeLeadEligibility(lead = {}) {
    const reasons = [];
    const preview = resolvePreviewSource(lead);
    const auditAvailable = preview.status === 'ready';
    const emailAvailable = hasValidEmail(lead);
    const subject = String(lead.subject || lead.email_subject || lead.audit_draft_subject || '').trim() || null;
    const body = auditAvailable ? preview.body : null;
    const status = String(lead.status || '').trim();

    if (isLegacyOverlayOnly(lead)) reasons.push('LEGACY_ONLY');
    if (!emailAvailable) reasons.push('MISSING_EMAIL');
    if (!auditAvailable) reasons.push('MISSING_PREVIEW');
    if (status === 'waiting_reply') reasons.push('ALREADY_WAITING_REPLY');
    if (status === 'send_uncertain' || lead.send_proof_status === 'missing' || lead.last_send_status === 'uncertain_no_smtp_proof') reasons.push('SEND_UNCERTAIN');

    let category;
    if (status === 'send_uncertain' || reasons.includes('SEND_UNCERTAIN')) category = 'send_uncertain';
    else if (status === 'waiting_reply') category = 'waiting_reply';
    else if (isLegacyOverlayOnly(lead)) category = 'blocked';
    else if (!emailAvailable) category = 'needs_email';
    else if (!auditAvailable) category = 'needs_audit';
    else category = 'ready_send';

    const sendable = reasons.length === 0 && category === 'ready_send';
    return { sendable, reasons, category, auditAvailable, emailAvailable, subject, body, previewSource: preview.source };
}

function previewStatusLabel(lead = {}) {
    const preview = resolvePreviewSource(lead);
    if (preview.status === 'ready') return '✅ Ready';
    if (lead.audit_ready === true) return '❌ Missing — READY_LEAD_BUG';
    return '❌ Missing';
}

function safeDiagnosticMessage(value) {
    const text = String(value || 'неизвестная причина');
    return text
        .replace(/([A-Z0-9_]*(TOKEN|SECRET|PASSWORD|PASS|KEY)[A-Z0-9_]*\s*[=:]\s*)[^\s,;]+/giu, '$1[REDACTED]')
        .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/giu, '$1[REDACTED]')
        .slice(0, 500);
}

function acceptedRecipientCount(result = {}) {
    const accepted = result.accepted_recipients ?? result.accepted ?? result.acceptedRecipientCount ?? result.accepted_recipient_count;
    if (Array.isArray(accepted)) return accepted.length;
    const n = Number(accepted);
    return Number.isFinite(n) ? n : 0;
}

export function hasProvenSmtpSuccess(result = {}) {
    const r = (result && typeof result === 'object') ? result : {};
    const messageId = typeof r.messageId === 'string' && r.messageId.trim() !== '';
    return r.ok === true
        && (r.channel || 'email') === 'email'
        && acceptedRecipientCount(r) > 0
        && (r.smtp_accepted === true || Number(r.smtp_response_code) === 250 || messageId);
}

function maskRecipient(value = '') {
    const text = String(value || '').trim();
    const at = text.indexOf('@');
    if (at <= 0) return text ? '[masked]' : '';
    const local = text.slice(0, at);
    return `${local.slice(0, 2)}***${text.slice(at)}`;
}

function fullRecipient(lead = {}, result = {}) {
    const accepted = result && (result.accepted_recipients ?? result.accepted);
    if (Array.isArray(accepted) && accepted.length > 0) return String(accepted[0] || '').trim();
    return String(lead.email || lead.to || lead.contact || result.recipient || result.to || '').trim();
}

function sentCount(result = {}, proven = false) {
    const explicit = Number(result && result.sent_count);
    if (Number.isFinite(explicit)) return explicit;
    if (!proven) return 0;
    return acceptedRecipientCount(result);
}

function outboundLedgerNewStatus(result = {}, proven = false) {
    if (proven) return 'waiting_reply';
    if (isUnresolvableRecipientDomain(result)) return 'blocked_fake_email';
    return 'send_uncertain';
}

function sanitizeLedgerValue(value) {
    if (value == null) return value;
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.map(sanitizeLedgerValue);
    if (typeof value === 'object') {
        const out = {};
        for (const [key, val] of Object.entries(value)) {
            if (/(token|secret|password|pass|key|login|user)/iu.test(key)) {
                out[key] = '[REDACTED]';
            } else {
                out[key] = sanitizeLedgerValue(val);
            }
        }
        return out;
    }
    return String(value).replace(/(token|secret|password|pass|key|login|user)\s*[=:]\s*[^\s,;]+/giu, '$1=[REDACTED]');
}

export function buildOutboundEmailLedgerEntry(lead = {}, result = {}, opts = {}) {
    const proven = hasProvenSmtpSuccess(result);
    const failed = result && result.ok === false && result.status !== 'send_uncertain';
    const recipient = fullRecipient(lead, result);
    return sanitizeLedgerValue({
        timestamp: opts.timestamp || new Date().toISOString(),
        lead_id: lead.lead_id || '',
        company: lead.company || '',
        recipient,
        full_recipient: recipient,
        recipient_masked: maskRecipient(recipient),
        subject: String(lead.subject || lead.email_subject || result.subject || '').trim(),
        channel: 'email',
        result: proven ? 'success' : (failed ? 'failed' : 'uncertain'),
        previous_status: lead.status || '',
        new_status: outboundLedgerNewStatus(result, proven),
        sent_count: sentCount(result, proven),
        smtp_response_code: result && result.smtp_response_code,
        smtp_status: result && result.smtp_status,
        messageId: result && result.messageId,
        local_eml_path: result && result.local_eml_path,
        sent_copy_status: result && result.sent_copy_status,
        sent_folder: result && result.sent_folder,
        imap_append_error: result && result.imap_append_error,
        sender_domain: result && result.sender_domain,
        autosend: false,
        external_send_by_bot: result && result.external_send_by_bot !== undefined ? result.external_send_by_bot : (proven ? true : 'unknown'),
    });
}

export function appendOutboundEmailLedger(lead, result, opts = {}) {
    const entry = buildOutboundEmailLedgerEntry(lead, result, opts);
    if (hasProvenSmtpSuccess(result)) {
        const record = (typeof opts.recordCanonicalSend === 'function')
            ? opts.recordCanonicalSend
            : (input) => recordSendOnce(input, opts.canonicalLedgerPath);
        const canonical = record(canonicalLedgerInputFromQueueSend(lead, result, opts));
        entry.canonical_ledger = '13_sales/outbound_send_ledger.jsonl';
        entry.canonical_recorded = canonical && canonical.written === true;
        entry.canonical_reason = canonical && canonical.reason ? canonical.reason : '';
        entry.duplicate_guard_id = canonical && canonical.entry ? canonical.entry.duplicate_guard_id : '';
    }
    if (typeof opts.appendLedger === 'function') opts.appendLedger(entry);
    if (opts.disableLedgerFile !== true) {
        const ledgerPath = opts.ledgerPath || OUTBOUND_EMAIL_LEDGER_PATH;
        const abs = path.resolve(process.cwd(), ledgerPath);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.appendFileSync(abs, JSON.stringify(entry) + '\n', 'utf8');
    }
    return entry;
}

function isUnresolvableRecipientDomain(result) {
    const haystack = [
        result && result.code,
        result && result.reason,
        result && result.error,
        result && result.message,
    ].filter(Boolean).join(' ');
    return /P1_BLOCKED_UNRESOLVABLE_DOMAIN|UNRESOLVABLE_DOMAIN|нет\s+MX\/A/iu.test(haystack);
}

function markLeadInvalidEmailDomain(lead) {
    if (!lead || typeof lead !== 'object') return;
    lead.status = 'blocked_fake_email';
    lead.blocked_reason = 'invalid_email_domain';
    lead.invalid_reason = 'invalid_email_domain';
    lead.updated_at = new Date().toISOString();
}

export function persistEmailSendResultToLead(lead, result, opts = {}) {
    if (!lead || typeof lead !== 'object') return { ok: false, status: 'invalid_lead' };
    const now = opts.now || new Date().toISOString();
    if (!hasProvenSmtpSuccess(result)) {
        lead.previous_status = lead.status;
        lead.status = 'send_uncertain';
        lead.contact_channel = 'send_uncertain_email_review';
        lead.audit_ready = true;
        lead.last_send_status = 'uncertain_no_smtp_proof';
        lead.send_proof_status = 'missing';
        lead.readiness_reason = 'local sent status existed but SMTP acceptance/messageId was not stored; manual review required';
        lead.external_send_by_bot = 'unknown';
        lead.last_send_attempted_at = now;
        return { ok: false, status: 'send_uncertain', reason: 'missing_smtp_proof' };
    }
    lead.status = 'waiting_reply';
    lead.last_sent_at = result.sent_at || now;
    lead.last_send_status = 'success';
    lead.send_proof_status = 'proven';
    lead.smtp_response_code = result.smtp_response_code;
    lead.smtp_message_id = result.messageId;
    lead.local_eml_path = result.local_eml_path;
    lead.sender_domain = result.sender_domain;
    lead.outbound_result_code = result.code;
    lead.external_send_by_bot = true;
    lead.last_contacted_at = result.last_contacted_at || lead.last_sent_at;
    if (lead.is_test === true || result.is_test === true) {
        lead.is_test = true;
        lead.excluded_from_client_metrics = true;
    }
    return { ok: true, status: 'waiting_reply', reason: 'smtp_proof_verified' };
}

// Build the one-lead screen text + inline keyboard for a given index.
export function buildQueueScreen(leads, index = 0) {
    const list = Array.isArray(leads) ? leads : [];
    if (!list.length) {
        return {
            text: [
                '📋 *Очередь отправки пуста*',
                '',
                'Нет лидов, готовых к отправке (canonical status = ready, с email и превью).',
                'Лиды без email/превью и неподтверждённые отправки сюда не попадают.',
                '',
                'Открой 💰 Mini Audit → ⚠️ Требуют проверки, чтобы увидеть заблокированные лиды и причины.',
                'Autosend: BLOCKED.',
            ].join('\n'),
            reply_markup: { inline_keyboard: [[{ text: '🏠 Меню', callback_data: QUEUE_CB.MENU }]] },
        };
    }

    const i = clampIndex(index, list.length);
    const lead = list[i];
    const company = lead.company || lead.lead_id || '(без названия)';
    const elig = computeLeadEligibility(lead);
    const contact = elig.emailAvailable ? (lead.email || lead.recipient) : '(контакт не указан)';
    const auditReady = elig.auditAvailable ? 'готов ✅' : 'не готов ⏳';
    const previewStatus = elig.auditAvailable ? '✅ Ready' : '❌ Missing';

    const navRow = [
        { text: '⏭ Следующий', callback_data: `${QUEUE_CB.NEXT}:${i}` },
        { text: '⬅ Назад', callback_data: `${QUEUE_CB.PREV}:${i}` },
    ];
    const menuRow = [{ text: '🏠 Меню', callback_data: QUEUE_CB.MENU }];

    let text;
    let rows;
    if (elig.sendable) {
        text = [
            `📋 *Лид ${i + 1} / ${list.length}*`,
            '',
            `Компания: ${company}`,
            `Email: ${contact}`,
            `Статус: ${statusEmoji(lead.status)}`,
            `Аудит: ${auditReady}`,
            `Preview: ${previewStatus}`,
        ].join('\n');
        rows = [
            [{ text: '👁 Превью', callback_data: `${QUEUE_CB.PREVIEW}:${i}` }],
            [{ text: '✅ Отправить', callback_data: `${QUEUE_CB.SEND}:${i}` }],
            navRow,
            menuRow,
        ];
    } else {
        // Build a blocked card. NO send button. Reason + only safe next actions.
        let reasonLine = 'Отправка заблокирована';
        const actionRows = [];
        if (elig.category === 'send_uncertain') {
            reasonLine = 'Повторная отправка заблокирована\nПричина: предыдущая попытка не подтверждена';
            actionRows.push([{ text: '🔍 Проверить proof', callback_data: `${QUEUE_CB.PREVIEW}:${i}` }]);
        } else if (elig.category === 'waiting_reply') {
            reasonLine = 'Отправка заблокирована\nПричина: лид уже ожидает ответа';
        } else if (elig.category === 'needs_email' && !elig.auditAvailable) {
            reasonLine = 'Отправка заблокирована\nПричина: нет email и аудит/письмо не готовы';
            actionRows.push([{ text: '🔍 Проверить контакт', callback_data: `${QUEUE_CB.PREVIEW}:${i}` }]);
            actionRows.push([{ text: '🛠 Подготовить аудит', callback_data: `${QUEUE_CB.PREVIEW}:${i}` }]);
        } else if (elig.category === 'needs_email') {
            reasonLine = 'Отправка заблокирована\nПричина: отсутствует подтверждённый email';
            actionRows.push([{ text: '🔍 Проверить контакт', callback_data: `${QUEUE_CB.PREVIEW}:${i}` }]);
        } else if (elig.category === 'needs_audit') {
            reasonLine = 'Отправка заблокирована\nПричина: аудит или письмо ещё не подготовлены';
            actionRows.push([{ text: '🛠 Подготовить аудит', callback_data: `${QUEUE_CB.PREVIEW}:${i}` }]);
            actionRows.push([{ text: '📝 Подготовить письмо', callback_data: `${QUEUE_CB.PREVIEW}:${i}` }]);
        } else {
            reasonLine = 'Отправка заблокирована\nПричина: лид недоступен для отправки (legacy/blocked)';
        }
        text = [
            `📋 *Лид ${i + 1} / ${list.length}*`,
            '',
            `Компания: ${company}`,
            `Email: ${contact}`,
            `Статус: ${statusEmoji(lead.status)}`,
            `Аудит: ${auditReady}`,
            `Preview: ${previewStatus}`,
            '',
            `⛔ ${reasonLine}`,
            '',
            `Reasons: ${elig.reasons.join(', ') || elig.category}`,
            'Autosend: BLOCKED',
        ].join('\n');
        rows = [];
        if (elig.auditAvailable) rows.push([{ text: '👁 Превью', callback_data: `${QUEUE_CB.PREVIEW}:${i}` }]);
        rows.push(...actionRows);
        rows.push(navRow);
        rows.push(menuRow);
    }

    return { text, reply_markup: { inline_keyboard: rows }, index: i, lead, eligibility: elig };
}

// Build a preview block for a lead (read-only). Uses lead.audit_preview if set.
export function buildPreview(lead, index, total) {
    const company = lead.company || lead.lead_id || '(без названия)';
    const preview = resolvePreviewSource(lead);
    return [
        `👁 *Превью — ${company}* (лид ${index + 1} / ${total})`,
        '',
        preview.body,
        '',
        'Назад в очередь — кнопкой ниже.',
    ].join('\n');
}

// Route an inline callback. Pure for next/prev/preview; for send it awaits the
// injected sendAdapter(lead) and then advances to the next lead.
//
//   opts.sendAdapter: async (lead) => ({ ok, channel, message, status? }) | required for send
//   opts.onSent: optional (lead, result) => void  (e.g. persist waiting_reply in store)
//
// Returns: { kind, text, reply_markup, index }
//   kind: 'screen' | 'preview' | 'sent' | 'menu' | 'ignored'
export async function handleQueueCallback(data, leads, opts = {}) {
    const parsed = parseQueueCallback(data);
    if (!parsed) return { kind: 'ignored' };
    const list = Array.isArray(leads) ? leads : [];
    const { action } = parsed;
    let index = clampIndex(parsed.index, list.length);

    if (action === QUEUE_CB.MENU) {
        return { kind: 'menu' };
    }

    if (!list.length) {
        return { kind: 'screen', ...buildQueueScreen(list, 0) };
    }

    if (action === QUEUE_CB.NEXT) {
        index = clampIndex(index + 1, list.length);
        return { kind: 'screen', ...buildQueueScreen(list, index) };
    }

    if (action === QUEUE_CB.PREV) {
        index = clampIndex(index - 1, list.length);
        return { kind: 'screen', ...buildQueueScreen(list, index) };
    }

    if (action === QUEUE_CB.PREVIEW) {
        const lead = list[index];
        const screen = buildQueueScreen(list, index);
        const preview = resolvePreviewSource(lead);
        return {
            kind: 'preview',
            text: [
                `👁 *Превью — ${lead.company || lead.lead_id || '(без названия)'}* (лид ${index + 1} / ${list.length})`,
                '',
                lead.audit_ready === true && preview.status === 'missing'
                    ? 'PREVIEW_MISSING_FOR_READY_LEAD'
                    : preview.body,
                '',
                'Назад в очередь — кнопкой ниже.',
            ].join('\n'),
            reply_markup: screen.reply_markup,
            index,
            debug: {
                handler: 'handleQueueCallback:q:preview',
                raw_callback_data: data,
                parsed_action: action,
                parsed_index: parsed.index,
                resolved_index: index,
                lead_id: lead && (lead.lead_id || lead.id || ''),
                lead_company: lead && (lead.company || lead.name || ''),
                preview_source: preview.source,
                preview_length: String(preview.body || '').length,
            },
        };
    }

    if (action === QUEUE_CB.SEND) {
        const lead = list[index];
        // HARD RE-CHECK: a stale ✅ button on an old message must never bypass the
        // eligibility gate. Re-compute server-side before touching any send path.
        const elig = computeLeadEligibility(lead || {});
        if (!elig.sendable) {
            const codeMap = {
                MISSING_EMAIL: 'SEND_BLOCKED: MISSING_EMAIL',
                MISSING_PREVIEW: 'SEND_BLOCKED: MISSING_PREVIEW',
                SEND_UNCERTAIN: 'SEND_BLOCKED: SEND_UNCERTAIN',
                ALREADY_WAITING_REPLY: 'SEND_BLOCKED: ALREADY_SENT',
                LEGACY_ONLY: 'SEND_BLOCKED: NOT_VERIFIED',
            };
            const code = codeMap[elig.reasons[0]] || `SEND_BLOCKED: ${elig.reasons[0] || 'NOT_ELIGIBLE'}`;
            // Re-render the (now blocked) card so the user sees the corrected screen.
            const blocked = buildQueueScreen(list, index);
            return {
                kind: 'screen',
                text: [`⛔ ${code}`, '', 'Отправка не выполнена. SMTP не вызывался.', 'Autosend: BLOCKED', '', blocked.text].join('\n'),
                reply_markup: blocked.reply_markup,
                index,
            };
        }
        if (EMAIL_SEND_PROOF_GATE_ENABLED && EMAIL_SEND_FROZEN_UNTIL_PROOF_PATCH) {
            return {
                kind: 'screen',
                text: '⛔ Отправка заморожена: нет SMTP-подтверждения. SendAdapter не вызван.',
                reply_markup: buildQueueScreen(list, index).reply_markup,
                index,
            };
        }
        if (typeof opts.sendAdapter !== 'function') {
            return {
                kind: 'screen',
                text: '⚠️ Канал отправки не подключён. Отправка недоступна.',
                reply_markup: buildQueueScreen(list, index).reply_markup,
                index,
            };
        }
        let result;
        try {
            result = await opts.sendAdapter(lead);
        } catch (err) {
            return {
                kind: 'screen',
                text: `❌ Ошибка отправки: ${safeDiagnosticMessage(err && err.message ? err.message : String(err))}`,
                reply_markup: buildQueueScreen(list, index).reply_markup,
                index,
            };
        }
        appendOutboundEmailLedger(lead, result || { ok: false, status: 'send_uncertain' }, opts);
        if (!hasProvenSmtpSuccess(result)) {
            if (isUnresolvableRecipientDomain(result)) {
                markLeadInvalidEmailDomain(lead);
                const nextIdx = clampIndex(index + 1, list.length);
                return {
                    kind: 'screen',
                    text: '⚠️ Не отправлено: домен получателя не принимает почту. Лид помечен как невалидный. Нажми “Следующий”.',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '⏭ Следующий валидный', callback_data: `${QUEUE_CB.NEXT}:${nextIdx}` }],
                            [{ text: '🏠 Меню', callback_data: QUEUE_CB.MENU }],
                        ],
                    },
                    index,
                };
            }
            persistEmailSendResultToLead(lead, result || {});
            return {
                kind: 'screen',
                text: '⚠️ Не подтверждено: нет SMTP proof',
                reply_markup: buildQueueScreen(list, index).reply_markup,
                index,
            };
        }
        persistEmailSendResultToLead(lead, result);
        if (typeof opts.onSent === 'function') {
            try { opts.onSent(lead, result); } catch { /* non-fatal */ }
        }
        const recipient = lead.email || lead.to || lead.contact || lead.company || lead.lead_id || '(получатель не указан)';
        // Advance to the next not-yet-sent lead if possible, else stay.
        const nextIdx = clampIndex(index + 1, list.length);
        return {
            kind: 'sent',
            text: [
                '✅ Email отправлен',
                '',
                `Компания: ${lead.company || lead.lead_id || '—'}`,
                `Email: ${recipient}`,
                '',
                'Перемещён в:',
                '⏳ Waiting Reply',
            ].join('\n'),
            reply_markup: {
                inline_keyboard: [
                    [{ text: '⏭ Следующий Email', callback_data: `q:next:${nextIdx}` }],
                    [{ text: '📬 Ready Email', callback_data: 'ma:ready' }],
                    [{ text: '🏠 Меню', callback_data: QUEUE_CB.MENU }],
                ],
            },
            index: nextIdx,
        };
    }

    return { kind: 'ignored' };
}

export default {
    QUEUE_CB,
    EMAIL_SEND_PROOF_GATE_ENABLED,
    EMAIL_SEND_FROZEN_UNTIL_PROOF_PATCH,
    OUTBOUND_EMAIL_LEDGER_PATH,
    isUnresolvableRecipientDomain,
    parseQueueCallback,
    buildQueueScreen,
    buildPreview,
    resolvePreviewSource,
    handleQueueCallback,
    hasProvenSmtpSuccess,
    persistEmailSendResultToLead,
    buildOutboundEmailLedgerEntry,
    appendOutboundEmailLedger,
};
