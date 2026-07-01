// telegram_outbound_draft_center.mjs
// V1 Outbound Draft Center — SAFE follow-up draft generation for TOP leads.
//
// SAFETY CONTRACT (offline build, no live restart):
//   - PURE module: NO Telegram API, NO PowerShell, NO token read, NO .env read.
//   - NEVER sends. Generates a preview object only.
//   - Does NOT persist drafts to 13_sales during V1 build (offline). Drafts are
//     in-memory / fixture-backed only.
//   - NO queue write, NO approval_queue write, NO autosend.
//   - The bot performs owner gate + reply send. This module classifies the
//     command and builds the preview text.

import crypto from 'node:crypto';
import { findTop1 } from './telegram_mini_audit_cockpit.mjs';
import {
    resolveContact,
    resolveRealContact,
    isRealEmail,
    REAL_CLIENT_RECIPIENT_REQUIRED,
} from './telegram_contact_resolver.mjs';
import { renderAuditEmail } from './audit_send_templates.mjs';

export const OWNER_REFUSAL =
    'Команда черновика доступна только владельцу. Доступ отклонён.';

export const SEND_BLOCKED_MISSING_RECIPIENT = 'SEND_BLOCKED_MISSING_RECIPIENT';
export const INVALID_RECIPIENT = 'INVALID_RECIPIENT';
export const NO_PREVIEW_FOUND = 'NO_PREVIEW_FOUND';

// ----------------------------------------------------------------------------
// In-memory draft state store (C1). Runtime-only / test-injectable. NEVER
// persisted to 13_sales during build/test. The bot may pass its own store via
// opts.store to keep state across messages within a single process.
// ----------------------------------------------------------------------------
export function createDraftStore() {
    return new Map();
}
const DEFAULT_STORE = createDraftStore();

function getStore(opts = {}) {
    return opts.store instanceof Map ? opts.store : DEFAULT_STORE;
}


// Canonical TOP-1 outbound copy is now produced by the shared production
// template system (audit_send_templates.mjs) so that the Telegram preview and
// the real client send render the EXACT SAME subject and body. TOP-1 leads for
// zb23.ru / construction default to the ЖБИ (jbi) niche template.
const TOP1_SITE = 'zb23.ru';
const TOP1_NICHE = 'jbi';

function renderTop1Email(opts = {}) {
    return renderAuditEmail({
        company: opts.company || '',
        site: opts.site || TOP1_SITE,
        niche: opts.niche || TOP1_NICHE,
        issues: opts.issues,
        offer_price: opts.offer_price,
        sender_name: opts.sender_name,
    });
}

// ----------------------------------------------------------------------------
// Command classification
// ----------------------------------------------------------------------------
export function classifyDraftCommand(rawText) {
    if (rawText == null) return null;
    const t = String(rawText).trim().toLowerCase();
    if (!t) return null;

    // /sales_next — the ONE canonical production sales command. It is a thin
    // alias of "/audit_draft top1": it builds the TOP-1 outbound draft using the
    // SAME canonical functions (contact resolver → audit draft builder →
    // template renderer) and returns the preview with the ✅/✏️ inline keyboard.
    // Pressing ✅ routes through the same approval controller → SMTP adapter.
    // NO autosend, NO mass send, NO parallel path.
    if (t === '/sales_next' || t === '/salesnext' || t === 'следующий клиент' || t === 'следующая продажа') {
        return { action: 'draft', target: 'top1' };
    }

    // Slash commands with target token
    if (t === '/audit_draft top1' || t === '/audit_draft top 1') {
        return { action: 'draft', target: 'top1' };
    }

    if (t === '/audit_preview top1' || t === '/audit_preview top 1') {
        return { action: 'preview', target: 'top1' };
    }

    // RU phrases
    const DRAFT_PHRASES = [
        'подготовь письмо топ 1',
        'подготовь письмо топ1',
        'черновик по топ лиду',
    ];
    if (DRAFT_PHRASES.includes(t)) return { action: 'draft', target: 'top1' };

    const PREVIEW_PHRASES = [
        'покажи черновик топ 1',
        'покажи черновик топ1',
        'preview топ 1',
        'preview топ1',
    ];
    if (PREVIEW_PHRASES.includes(t)) return { action: 'preview', target: 'top1' };

    return null;
}

// ----------------------------------------------------------------------------
// Recipient editor command classification (C1)
//   /audit_edit_recipient <draft_id> <email>
//   /audit_set_recipient top1 <email>
//   изменить получателя <draft_id> <email>
//   добавь получателя <draft_id> <email>
// Returns { action:'edit_recipient', draft_id } or
//         { action:'set_recipient', target } with { email } or null.
// ----------------------------------------------------------------------------
export function classifyRecipientCommand(rawText) {
    if (rawText == null) return null;
    const t = String(rawText).trim();
    if (!t) return null;

    let m = t.match(/^\/audit_edit_recipient\s+(\S+)\s+(\S+)$/i);
    if (m) return { action: 'edit_recipient', draft_id: m[1], email: m[2] };

    m = t.match(/^\/audit_set_recipient\s+(\S+)\s+(\S+)$/i);
    if (m) {
        const target = /^(топ|top)\s*1$/i.test(m[1]) ? 'top1' : m[1].toLowerCase();
        return { action: 'set_recipient', target, email: m[2] };
    }

    m = t.match(/^(?:изменить|добавь)\s+получателя\s+(\S+)\s+(\S+)$/i);
    if (m) {
        const tok = m[1];
        if (/^(топ|top)\s*1$/i.test(tok) || tok.toLowerCase() === 'top1') {
            return { action: 'set_recipient', target: 'top1', email: m[2] };
        }
        return { action: 'edit_recipient', draft_id: tok, email: m[2] };
    }

    return null;
}

// Basic email validation (no network). Requirements:
//   - has '@', has a '.' after '@', no spaces, length <= 254.
export function isValidRecipientEmail(email) {
    const e = String(email == null ? '' : email);
    if (e.length === 0 || e.length > 254) return false;
    if (/\s/.test(e)) return false;
    const at = e.indexOf('@');
    if (at <= 0) return false;
    if (e.indexOf('@', at + 1) !== -1) return false; // exactly one '@'
    const domain = e.slice(at + 1);
    const dot = domain.indexOf('.');
    if (dot <= 0) return false; // dot exists and not first char of domain
    if (dot === domain.length - 1) return false; // not trailing
    return true;
}


// ----------------------------------------------------------------------------
// Draft building — pure. Recipient resolution is optional/injected so the
// module never reads lead_contacts itself during offline build.
// ----------------------------------------------------------------------------
function shortHash(s) {
    return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 12);
}

export function buildDraft(target = 'top1', opts = {}) {
    if (target !== 'top1') {
        return { ok: false, code: 'UNKNOWN_TARGET', target };
    }

    const lead = opts.lead || findTop1(opts);
    if (!lead) {
        return { ok: false, code: 'NOT_FOUND', target };
    }

    // Recipient resolution order (PRODUCTION real-contact gate):
    //   1. explicit opts.recipient (test/override) — must still be a REAL email,
    //   2. real contact resolver over lead_contacts.json + local site files.
    // A fake/example/test email is NEVER accepted as a recipient. If no real
    // email is resolved, send is hard-blocked with REAL_CLIENT_RECIPIENT_REQUIRED
    // (preview still renders so the operator can inspect copy).
    let recipient = '';
    let recipient_source = '';
    let recipient_block = '';

    if (opts.recipient) {
        if (isRealEmail(opts.recipient)) {
            recipient = opts.recipient;
            recipient_source = 'override';
        } else {
            recipient_block = REAL_CLIENT_RECIPIENT_REQUIRED;
        }
    }

    if (!recipient && opts.resolve !== false) {
        const r = resolveRealContact({
            lead,
            query: target,
            registry: opts.registry,
            registryPath: opts.registryPath,
            contactFileDirs: opts.contactFileDirs,
        });
        if (r && r.ok && r.sendable && isRealEmail(r.email)) {
            recipient = r.email;
            recipient_source = r.source || 'contact_resolver';
        } else {
            recipient_block = REAL_CLIENT_RECIPIENT_REQUIRED;
        }
    }
    // Render outbound copy from the shared production template system so the
    // preview here and the real client send stay byte-identical. TOP-1 leads
    // default to the ЖБИ (jbi) niche; site comes from the lead when available.
    const rendered = renderTop1Email({
        company: lead.company,
        site: lead.website || opts.site || TOP1_SITE,
        niche: opts.niche || TOP1_NICHE,
        issues: opts.issues,
        offer_price: opts.offer_price,
        sender_name: opts.sender_name,
    });
    const subject = rendered.subject;
    const body = rendered.body;


    const draftId = `draft_top1_${shortHash(subject + '|' + body + '|' + (lead.lead_id || ''))}`;

    const draft = {
        ok: true,
        draft_id: draftId,
        lead_id: lead.lead_id,
        company: lead.company,
        website: lead.website || 'zb23.ru',
        recipient,
        subject,
        body,
        channel: 'email',
        risk: 'low',
        body_hash: shortHash(body),
        recipient_source,
        recipient_block,
        send_status: recipient
            ? 'PREVIEW_READY'
            : recipient_block || SEND_BLOCKED_MISSING_RECIPIENT,
        approval_command: `/audit_send_approve ${draftId}`,
        reject_command: `/audit_send_reject ${draftId}`,
    };
    return draft;
}

// ----------------------------------------------------------------------------
// Formatting
// ----------------------------------------------------------------------------
export function formatDraftPreview(draft) {
    if (!draft || !draft.ok) {
        if (draft && draft.code === 'NOT_FOUND') {
            return 'Draft: NOT_FOUND — нет TOP-1 лида в текущих данных.';
        }
        return 'Draft: ошибка генерации черновика.';
    }
    const lines = [];
    lines.push('📝 Outbound Draft — preview (НЕ отправлено)');
    lines.push('');
    lines.push(`draft_id: ${draft.draft_id}`);
    lines.push(`recipient/company: ${draft.recipient || '(не задан)'} / ${draft.company} (№${draft.lead_id})`);
    lines.push(`website: ${draft.website}`);
    lines.push(`subject: ${draft.subject}`);
    lines.push('body:');
    lines.push(draft.body);
    lines.push('');
    lines.push(`channel: ${draft.channel}`);
    lines.push(`risk: ${draft.risk}`);
    if (draft.send_status === REAL_CLIENT_RECIPIENT_REQUIRED) {
        lines.push('');
        lines.push(`🚫 ${REAL_CLIENT_RECIPIENT_REQUIRED}: нет реального контактного email клиента.`);
        lines.push('Фейковые/тестовые адреса (example/test) запрещены в проде.');
        lines.push('Следующий шаг: /contact_resolve top1 — найти реальный email клиента.');
    } else if (draft.send_status === SEND_BLOCKED_MISSING_RECIPIENT) {
        lines.push('');
        lines.push(`⚠ ${SEND_BLOCKED_MISSING_RECIPIENT}: получатель не задан, отправка заблокирована.`);
    }
    lines.push('');
    lines.push('Отправка только после approval:');
    lines.push(`  approve: ${draft.approval_command}`);
    lines.push(`  reject:  ${draft.reject_command}`);
    lines.push('Autosend: BLOCKED. Максимум 1 сообщение за 1 approval.');
    return lines.join('\n');
}

// ----------------------------------------------------------------------------
// Inline keyboard (UX1) — ✅ Подтвердить | ✏️ Редактировать
// ----------------------------------------------------------------------------
// Telegram limit: callback_data must be <= 64 bytes. draft_id must be safe:
// only latin/digits/_/-. If unsafe or too long, fall back to a short stable hash.
export const CB_PREFIX_CONFIRM = 'audit_draft_confirm:';
export const CB_PREFIX_EDIT = 'audit_draft_edit:';
const CB_MAX_LEN = 64;

export function safeDraftId(draftId) {
    const raw = String(draftId || '');
    const cleaned = raw.replace(/[^A-Za-z0-9_-]/g, '');
    // Longest prefix is CB_PREFIX_EDIT/CONFIRM (20 chars). Keep room under 64.
    const budget = CB_MAX_LEN - CB_PREFIX_CONFIRM.length;
    if (cleaned && cleaned.length <= budget && cleaned === raw) {
        return cleaned;
    }
    // Unsafe or too long → stable short hash id.
    return `d_${shortHash(raw)}`;
}

export function buildDraftReplyMarkup(draft) {
    if (!draft || !draft.ok) return undefined;
    const sid = safeDraftId(draft.draft_id);
    const confirmData = `${CB_PREFIX_CONFIRM}${sid}`;
    const editData = `${CB_PREFIX_EDIT}${sid}`;
    // Hard guard: never emit overlong callback_data.
    if (confirmData.length > CB_MAX_LEN || editData.length > CB_MAX_LEN) {
        return undefined;
    }
    return {
        inline_keyboard: [
            [
                { text: '✅ Подтвердить', callback_data: confirmData },
                { text: '✏️ Редактировать', callback_data: editData },
            ],
        ],
    };
}

export function handleDraftCommand(parsed, opts = {}) {
    if (!parsed) return null;
    const draft = buildDraft(parsed.target, opts);
    // Persist into runtime-only store so later recipient edits / confirm can
    // find the draft by id and target. NEVER persisted to 13_sales.
    if (draft && draft.ok) {
        const store = getStore(opts);
        store.set(draft.draft_id, draft);
        store.set(`target:${parsed.target}`, draft.draft_id);
    }
    const reply_markup = buildDraftReplyMarkup(draft);
    return { draft, text: formatDraftPreview(draft), reply_markup };
}

// ----------------------------------------------------------------------------
// Recipient editing (C1) — updates draft object in runtime memory only.
// Resolves the draft from the store by id or target, applies a validated
// recipient, and returns the updated preview + buttons. NO 13_sales write.
// ----------------------------------------------------------------------------
export function applyRecipientUpdate(parsed, opts = {}) {
    if (!parsed) return null;
    const store = getStore(opts);
    const email = parsed.email;

    if (!isValidRecipientEmail(email)) {
        return {
            ok: false,
            code: INVALID_RECIPIENT,
            text: `🚫 ${INVALID_RECIPIENT}: некорректный email. Нужен формат name@domain.tld (без пробелов, длина ≤254).`,
        };
    }

    // Locate target draft.
    let draft = null;
    if (parsed.action === 'edit_recipient') {
        draft = store.get(parsed.draft_id) || null;
    } else if (parsed.action === 'set_recipient') {
        const id = store.get(`target:${parsed.target}`);
        if (id) draft = store.get(id) || null;
        // Build the draft on demand if not yet generated.
        if (!draft && parsed.target === 'top1') {
            const r = handleDraftCommand({ action: 'draft', target: 'top1' }, opts);
            draft = r && r.draft && r.draft.ok ? r.draft : null;
        }
    }

    if (!draft || !draft.ok) {
        return {
            ok: false,
            code: NO_PREVIEW_FOUND,
            text: `🚫 ${NO_PREVIEW_FOUND}: черновик не найден. Сначала выполните /audit_draft top1.`,
        };
    }

    // Apply recipient in memory only.
    draft.recipient = email;
    draft.recipient_source = 'telegram_command';
    draft.send_status = 'PREVIEW_READY';
    store.set(draft.draft_id, draft);

    const reply_markup = buildDraftReplyMarkup(draft);
    return {
        ok: true,
        draft,
        text: formatDraftPreview(draft),
        reply_markup,
    };
}

export function handleRecipientCommand(parsed, opts = {}) {
    return applyRecipientUpdate(parsed, opts);
}

export default {
    OWNER_REFUSAL,
    SEND_BLOCKED_MISSING_RECIPIENT,
    INVALID_RECIPIENT,
    NO_PREVIEW_FOUND,
    CB_PREFIX_CONFIRM,
    CB_PREFIX_EDIT,
    createDraftStore,
    classifyDraftCommand,
    classifyRecipientCommand,
    isValidRecipientEmail,
    buildDraft,
    formatDraftPreview,
    safeDraftId,
    buildDraftReplyMarkup,
    handleDraftCommand,
    applyRecipientUpdate,
    handleRecipientCommand,
};



