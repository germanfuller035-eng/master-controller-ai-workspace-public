// lead_import_readonly_live_control.mjs
// =============================================================================
// D3-2 — Read-only Telegram Live-Control for lead-import.
//
// PURPOSE
//   Pure / read-only helpers that back four owner-facing Telegram commands:
//     /lead_queue   — counts + top cards overview
//     /lead_status  — locate one import_id|lead_id across queue + contacts
//     /lead_review  — single import card safe review (no raw PII)
//     /lead_health  — system readability + safety envelope
//
// HARD SAFETY BOUNDARY (D3-2)
//   * READ-ONLY. This module performs ZERO mutation.
//   * No fs.writeFile / appendFile / rename / unlink / mkdir anywhere.
//   * No import-runner calls, no queue-writer calls, no commit-recorder calls.
//   * No client contact, no auto-send, no email/SMTP/WhatsApp/MAX.
//   * Never returns raw PII (emails/phones/whatsapp are masked or omitted).
//   * Unknown / malformed args fail safe (handled:false or safe "not found").
//   * Telegram-safe response length (truncated below TELEGRAM_SAFE_LEN).
//
// Russian-language owner-facing output is preferred.
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';

export const D3_2_READONLY_VERSION = 'd3-2-readonly-live-control-1.0.0';

const TELEGRAM_SAFE_LEN = 3500;

// Canonical production paths (overridable in tests).
export const DEFAULT_QUEUE_PATH = path.join('13_sales', 'approval_queue', 'lead_import_approvals.json');
export const DEFAULT_CONTACTS_PATH = path.join('13_sales', 'lead_contacts.json');

// ---------------------------------------------------------------------------
// Small safe utilities
// ---------------------------------------------------------------------------

function clampTelegram(text) {
    const s = String(text == null ? '' : text);
    if (s.length <= TELEGRAM_SAFE_LEN) return s;
    return s.slice(0, TELEGRAM_SAFE_LEN - 20) + '\n… (обрезано)';
}

function safeReadJson(filePath) {
    // READ-ONLY. Returns { readable, exists, data, error }.
    try {
        if (!fs.existsSync(filePath)) {
            return { readable: false, exists: false, data: null, error: 'not_found' };
        }
        const raw = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(raw);
        return { readable: true, exists: true, data, error: null };
    } catch (err) {
        return { readable: false, exists: fs.existsSync(filePath), data: null, error: (err && err.message) || 'read_error' };
    }
}

function normalizeCards(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.cards)) return data.cards;
    return [];
}

function normalizeContactsMap(data) {
    // lead_contacts.json is an object keyed by lead_id. Detect map shape.
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
    return {};
}

// PII masking — never reveal raw contact values.
function maskValue(v) {
    if (v == null) return null;
    const s = String(v);
    if (!s) return null;
    return '«скрыто»';
}

function piiPresence(contact) {
    if (!contact || typeof contact !== 'object') return {};
    const hasArr = (a) => Array.isArray(a) && a.length > 0;
    return {
        has_email: !!(contact.primary_email || hasArr(contact.emails)),
        has_phone: hasArr(contact.phones),
        has_whatsapp: !!contact.whatsapp,
    };
}

function statusCounts(cards) {
    const counts = { total: cards.length, pending: 0, approved: 0, committed: 0, cancelled: 0, failed: 0, other: 0 };
    for (const c of cards) {
        const st = String((c && c.status) || '').toUpperCase();
        switch (st) {
            case 'PENDING': counts.pending++; break;
            case 'APPROVED': counts.approved++; break;
            case 'COMMITTED': counts.committed++; break;
            case 'CANCELLED':
            case 'CANCELED':
            case 'REJECTED': counts.cancelled++; break;
            case 'FAILED': counts.failed++; break;
            default: counts.other++; break;
        }
    }
    return counts;
}

// ---------------------------------------------------------------------------
// Argument parsing (fail-safe)
// ---------------------------------------------------------------------------

const READONLY_COMMANDS = new Set(['/lead_queue', '/lead_status', '/lead_review', '/lead_health']);

export function isReadonlyLiveControlCommand(text) {
    if (typeof text !== 'string') return false;
    const cmd = text.trim().split(/\s+/)[0];
    if (!cmd) return false;
    // Strip optional @botname suffix.
    const base = cmd.split('@')[0].toLowerCase();
    return READONLY_COMMANDS.has(base);
}

export function parseReadonlyCommand(text) {
    if (typeof text !== 'string') return { ok: false, command: null, arg: null, error: 'not_a_string' };
    const trimmed = text.trim();
    if (!trimmed) return { ok: false, command: null, arg: null, error: 'empty' };
    const parts = trimmed.split(/\s+/);
    const command = parts[0].split('@')[0].toLowerCase();
    if (!READONLY_COMMANDS.has(command)) {
        return { ok: false, command: null, arg: null, error: 'unknown_command' };
    }
    const arg = parts.length > 1 ? parts[1].trim() : null;
    return { ok: true, command, arg: arg || null, error: null };
}

// A conservative id sanity check: allow IMP-/DLF- style ids and similar tokens.
function looksLikeId(arg) {
    if (typeof arg !== 'string') return false;
    return /^[A-Za-z0-9_\-]{3,64}$/.test(arg);
}

// ---------------------------------------------------------------------------
// /lead_queue
// ---------------------------------------------------------------------------

export function buildLeadQueue(opts = {}) {
    const queuePath = opts.queuePath || DEFAULT_QUEUE_PATH;
    const q = safeReadJson(queuePath);
    if (!q.readable) {
        return {
            ok: false,
            readable: false,
            error: q.error,
            text: clampTelegram(
                '📋 *Очередь импорта лидов*\n\n' +
                '⚠️ Очередь недоступна для чтения.\n' +
                `Причина: ${q.error}\n\n` +
                'client_contact: BLOCKED\nauto_send: BLOCKED',
            ),
        };
    }
    const cards = normalizeCards(q.data);
    const counts = statusCounts(cards);
    const top = cards.slice(0, 5).map((c) => ({
        import_id: (c && c.import_id) || '(нет id)',
        status: (c && c.status) || '(нет статуса)',
        source: (c && (c.source || (c.safety && c.safety.token))) || '(нет источника)',
        snapshot_id: (c && c.snapshot_id) || null,
    }));

    let lines = [];
    lines.push('📋 *Очередь импорта лидов*');
    lines.push('');
    lines.push(`Всего карточек: ${counts.total}`);
    lines.push(`• pending: ${counts.pending}`);
    lines.push(`• approved: ${counts.approved}`);
    lines.push(`• committed: ${counts.committed}`);
    lines.push(`• cancelled: ${counts.cancelled}`);
    lines.push(`• failed: ${counts.failed}`);
    if (counts.other) lines.push(`• другое: ${counts.other}`);
    lines.push('');
    lines.push('Топ-5 карточек:');
    if (top.length === 0) {
        lines.push('— (пусто)');
    } else {
        top.forEach((t, i) => {
            lines.push(`${i + 1}. ${t.import_id} — ${t.status}`);
            lines.push(`   источник: ${t.source}`);
            lines.push(`   snapshot: ${t.snapshot_id || '—'}`);
        });
    }
    lines.push('');
    lines.push('client_contact: BLOCKED');
    lines.push('auto_send: BLOCKED');

    return { ok: true, readable: true, counts, top, text: clampTelegram(lines.join('\n')) };
}

// ---------------------------------------------------------------------------
// /lead_status <import_id|lead_id>
// ---------------------------------------------------------------------------

export function buildLeadStatus(arg, opts = {}) {
    if (!looksLikeId(arg)) {
        return {
            ok: false,
            error: 'bad_arg',
            text: clampTelegram(
                'ℹ️ Использование: `/lead_status <import_id|lead_id>`\n' +
                'Аргумент не распознан как идентификатор.',
            ),
        };
    }
    const queuePath = opts.queuePath || DEFAULT_QUEUE_PATH;
    const contactsPath = opts.contactsPath || DEFAULT_CONTACTS_PATH;

    const q = safeReadJson(queuePath);
    const c = safeReadJson(contactsPath);
    const cards = q.readable ? normalizeCards(q.data) : [];
    const contacts = c.readable ? normalizeContactsMap(c.data) : {};

    const card = cards.find((x) => x && (x.import_id === arg)) || null;
    // contact may be keyed by lead_id OR have matching snapshot/import linkage
    let contact = contacts[arg] || null;
    let contactKey = contact ? arg : null;
    if (!contact) {
        for (const [k, v] of Object.entries(contacts)) {
            if (v && (v.lead_id === arg)) { contact = v; contactKey = k; break; }
        }
    }

    if (!card && !contact) {
        return {
            ok: true,
            found: false,
            text: clampTelegram(
                `🔎 *Статус: ${arg}*\n\n` +
                'Не найдено ни в очереди одобрения, ни в lead_contacts.\n' +
                '(безопасный ответ: not found)',
            ),
        };
    }

    let lines = [];
    lines.push(`🔎 *Статус: ${arg}*`);
    lines.push('');
    lines.push(`В очереди одобрения: ${card ? 'ДА' : 'нет'}`);
    lines.push(`В lead_contacts: ${contact ? 'ДА' : 'нет'}`);
    if (card) {
        lines.push('');
        lines.push('— Карточка очереди —');
        lines.push(`status: ${card.status || '—'}`);
        lines.push(`snapshot_id: ${card.snapshot_id || '—'}`);
        if (card.approved_by) lines.push(`approved_by: ${card.approved_by}`);
        if (card.commit_result && card.commit_result.committed_by) {
            lines.push(`committed_by: ${card.commit_result.committed_by}`);
        } else if (card.committed_by) {
            lines.push(`committed_by: ${card.committed_by}`);
        }
    }
    if (contact) {
        const pres = piiPresence(contact);
        lines.push('');
        lines.push('— lead_contacts —');
        lines.push(`lead_id: ${contact.lead_id || contactKey}`);
        lines.push(`snapshot_id: ${contact.snapshot_id || '—'}`);
        lines.push(`source: ${contact.source || '—'}`);
        lines.push(`PII: email=${pres.has_email ? '✓' : '—'} phone=${pres.has_phone ? '✓' : '—'} whatsapp=${pres.has_whatsapp ? '✓' : '—'} (значения скрыты)`);
    }

    return { ok: true, found: true, has_card: !!card, has_contact: !!contact, text: clampTelegram(lines.join('\n')) };
}

// ---------------------------------------------------------------------------
// /lead_review <import_id>
// ---------------------------------------------------------------------------

function nextAllowedActions(status) {
    const st = String(status || '').toUpperCase();
    // D3-2 is read-only; report what WOULD be allowed at the write-gated stage.
    switch (st) {
        case 'PENDING': return 'просмотр (read-only). На D3-3: approve/reject (write-gated).';
        case 'APPROVED': return 'просмотр (read-only). На D3-3: commit (write-gated).';
        case 'COMMITTED': return 'просмотр (read-only). Действий не требуется — импорт завершён.';
        case 'CANCELLED':
        case 'REJECTED': return 'просмотр (read-only). Карточка отклонена.';
        case 'FAILED': return 'просмотр (read-only). На D3-3: повтор/расследование (write-gated).';
        default: return 'просмотр (read-only).';
    }
}

export function buildLeadReview(arg, opts = {}) {
    if (!looksLikeId(arg)) {
        return {
            ok: false,
            error: 'bad_arg',
            text: clampTelegram(
                'ℹ️ Использование: `/lead_review <import_id>`\n' +
                'Аргумент не распознан как идентификатор.',
            ),
        };
    }
    const queuePath = opts.queuePath || DEFAULT_QUEUE_PATH;
    const q = safeReadJson(queuePath);
    if (!q.readable) {
        return {
            ok: false,
            readable: false,
            error: q.error,
            text: clampTelegram(`⚠️ Очередь недоступна для чтения (${q.error}).`),
        };
    }
    const cards = normalizeCards(q.data);
    const card = cards.find((x) => x && x.import_id === arg) || null;
    if (!card) {
        return {
            ok: true,
            found: false,
            text: clampTelegram(
                `🗂 *Review: ${arg}*\n\nКарточка не найдена в очереди одобрения.\n(безопасный ответ: not found)`,
            ),
        };
    }

    const safety = card.safety || {};
    const committedBy = (card.commit_result && card.commit_result.committed_by) || card.committed_by || null;

    let lines = [];
    lines.push(`🗂 *Review: ${card.import_id}*`);
    lines.push('');
    lines.push(`status: ${card.status || '—'}`);
    lines.push(`source/token: ${card.source || (safety && safety.token) || '—'}`);
    lines.push(`qa_status: ${card.qa_status || '—'}`);
    lines.push(`approved_by: ${card.approved_by || '—'}`);
    lines.push(`committed_by: ${committedBy || '—'}`);
    lines.push(`snapshot_id: ${card.snapshot_id || '—'}`);
    lines.push(`needs_review_count: ${card.needs_review_count != null ? card.needs_review_count : '—'}`);
    lines.push('');
    lines.push('— Safety envelope —');
    lines.push(`client_contact: ${safety.client_contact != null ? safety.client_contact : 'BLOCKED'}`);
    lines.push(`auto_send: ${safety.auto_send != null ? safety.auto_send : 'BLOCKED'}`);
    if (safety.dry_run != null) lines.push(`dry_run: ${safety.dry_run}`);
    if (safety.token) lines.push(`token: ${safety.token}`);
    lines.push('');
    lines.push(`Следующие действия: ${nextAllowedActions(card.status)}`);
    lines.push('');
    lines.push('(raw PII не отображается)');

    return { ok: true, found: true, card_status: card.status, text: clampTelegram(lines.join('\n')) };
}

// ---------------------------------------------------------------------------
// /lead_health
// ---------------------------------------------------------------------------

export function buildLeadHealth(opts = {}) {
    const queuePath = opts.queuePath || DEFAULT_QUEUE_PATH;
    const contactsPath = opts.contactsPath || DEFAULT_CONTACTS_PATH;

    const q = safeReadJson(queuePath);
    const c = safeReadJson(contactsPath);

    const queueReadable = q.readable;
    const contactsReadable = c.readable;
    const cards = queueReadable ? normalizeCards(q.data) : [];
    const counts = statusCounts(cards);
    const contactsMap = contactsReadable ? normalizeContactsMap(c.data) : {};
    const mapShapeDetected = contactsReadable && contactsMap && typeof contactsMap === 'object' && !Array.isArray(c.data);
    const contactsCount = Object.keys(contactsMap).length;

    let lines = [];
    lines.push('🩺 *Lead-import health (read-only)*');
    lines.push('');
    lines.push(`approval queue readable: ${queueReadable ? 'YES' : 'NO'}`);
    lines.push(`lead_contacts readable: ${contactsReadable ? 'YES' : 'NO'}`);
    lines.push(`карточек в очереди: ${counts.total}`);
    lines.push(`  pending=${counts.pending} approved=${counts.approved} committed=${counts.committed} cancelled=${counts.cancelled} failed=${counts.failed}`);
    lines.push(`лидов в lead_contacts: ${contactsCount}`);
    lines.push(`map-shape detected: ${mapShapeDetected ? 'YES' : 'NO'}`);
    lines.push('');
    lines.push('D2 status: CLOSED');
    lines.push('D3-2 status: ACTIVE (read-only live-control)');
    lines.push('');
    lines.push('client_contact: BLOCKED');
    lines.push('auto_send: BLOCKED');
    lines.push('write commands: BLOCKED');

    return {
        ok: true,
        queue_readable: queueReadable,
        contacts_readable: contactsReadable,
        counts,
        contacts_count: contactsCount,
        map_shape_detected: mapShapeDetected,
        text: clampTelegram(lines.join('\n')),
    };
}

// ---------------------------------------------------------------------------
// Unified dispatcher (still pure / read-only). Returns { handled, text, ... }.
// ---------------------------------------------------------------------------

export function handleReadonlyLiveControl(text, opts = {}) {
    const parsed = parseReadonlyCommand(text);
    if (!parsed.ok) {
        return { handled: false, command: null, error: parsed.error, text: null };
    }
    switch (parsed.command) {
        case '/lead_queue': {
            const r = buildLeadQueue(opts);
            return { handled: true, command: parsed.command, ...r };
        }
        case '/lead_status': {
            const r = buildLeadStatus(parsed.arg, opts);
            return { handled: true, command: parsed.command, arg: parsed.arg, ...r };
        }
        case '/lead_review': {
            const r = buildLeadReview(parsed.arg, opts);
            return { handled: true, command: parsed.command, arg: parsed.arg, ...r };
        }
        case '/lead_health': {
            const r = buildLeadHealth(opts);
            return { handled: true, command: parsed.command, ...r };
        }
        default:
            return { handled: false, command: parsed.command, error: 'unrouted', text: null };
    }
}
