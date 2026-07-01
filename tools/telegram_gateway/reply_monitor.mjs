// reply_monitor.mjs
// ============================================================
// BLOCK 8 — Reply Monitor (inbound reply triage + auto-stop bridge)
// ------------------------------------------------------------
// Turns each inbound reply into a triaged, human-decidable record and lets a
// negative reply STOP future follow-ups for that lead. Report-only: it reads
// and classifies, surfaces an inbox, and records the HUMAN's decision.
//
// Powers the Telegram commands (wired in a later, separately-tested step):
//   - /replies_inbox   → open (un-handled) replies, newest first
//   - /reply_next      → the single next reply to triage + suggested action
//   - /reply_log       → append one inbound reply (manual / future adapter)
//   - /reply_handled   → close one reply with a human decision
//
// SAFETY CONTRACT (identical spirit to followup_engine.mjs):
//   - This module NEVER sends email and NEVER calls Telegram/SMTP/IMAP/network.
//   - It only reads/appends a local append-only JSONL state file inside
//     D:\AI_WORKSPACE\13_sales\replies.
//   - NO autosend, NO auto-reply: it classifies + records, nothing leaves.
//   - AUTO-STOP is opt-in + human-gated: opt-out is applied to the follow-up
//     engine ONLY via applyOptOutFromReply(), called by the approved path
//     after a human marks the reply as "not interested".
//   - DUPLICATE guard: one record per (lead_id, received_at); a reply already
//     handled is never re-opened by a duplicate log line.
//   - The classifier is a PURE function (no IO) and conservative: when unsure
//     it returns UNKNOWN so a human triages it rather than guessing.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { markOptedOut, FOLLOWUP_STATE_FILE } from './followup_engine.mjs';

// Reply state location. Overridable via MC_REPLY_DIR for non-Windows hosts (VPS);
// Windows default unchanged when the env var is unset.
export const REPLY_DIR = process.env.MC_REPLY_DIR || 'D:/AI_WORKSPACE/13_sales/replies';
export const REPLY_STATE_FILE = (process.env.MC_REPLY_DIR
    ? process.env.MC_REPLY_DIR.replace(/\/+$/, '') + '/reply_state.jsonl'
    : 'D:/AI_WORKSPACE/13_sales/replies/reply_state.jsonl');

// Reply categories (precedence is applied in classifyReply, high → low).
export const CAT_BOUNCE = 'bounce';
export const CAT_AUTO_REPLY = 'auto_reply';
export const CAT_NOT_INTERESTED = 'not_interested';
export const CAT_INTERESTED = 'interested';
export const CAT_QUESTION = 'question';
export const CAT_UNKNOWN = 'unknown';

export const STATUS_NEW = 'new';
export const STATUS_HANDLED = 'handled';

// Human decisions recordable on a reply.
export const DECISION_OPTOUT = 'optout';     // stop all follow-ups for this lead
export const DECISION_REPLY = 'reply';       // a human will reply (handled manually)
export const DECISION_IGNORE = 'ignore';     // auto-reply/bounce noise, no action
export const VALID_DECISIONS = [DECISION_OPTOUT, DECISION_REPLY, DECISION_IGNORE];

// ---- signal dictionaries (Russian + English) ------------------------------

const BOUNCE_SIGNALS = [
    'mailer-daemon', 'mail delivery', 'delivery failed', 'delivery status',
    'undeliverable', 'undelivered', 'returned to sender', 'не доставлено',
    'failure notice', '550', '554', 'address not found', 'recipient not found',
];
const AUTO_REPLY_SIGNALS = [
    'out of office', 'autoreply', 'auto-reply', 'automatic reply', 'on vacation',
    'автоответ', 'автоматический ответ', 'в отпуске', 'нахожусь в отпуске',
    'отсутствую', 'вернусь', 'буду на месте',
];
const NOT_INTERESTED_SIGNALS = [
    'не интересно', 'неинтересно', 'не актуально', 'неактуально', 'не нужно',
    'не пишите', 'не писать', 'отпишите', 'отписаться', 'отписка', 'удалите меня',
    'удалите из рассылки', 'спам', 'прекратите', 'не беспокойте', 'нет спасибо',
    'unsubscribe', 'remove me', 'not interested', 'do not contact', 'stop emailing',
];
const INTERESTED_SIGNALS = [
    'интересно', 'давайте', 'расскажите', 'подробнее', 'сколько стоит', 'стоимость',
    'цена', 'прайс', 'готовы', 'обсудим', 'обсудить', 'созвон', 'созвониться',
    'встреча', 'встретиться', 'когда можем', 'да, ', 'хотим', 'нужно', 'нам нужно',
    'interested', 'tell me more', 'how much', 'pricing', 'let\'s talk', 'sounds good',
];
const QUESTION_SIGNALS = ['?', 'вопрос', 'а как', 'а что', 'уточните', 'подскажите'];

function hasAny(text, signals) {
    const found = [];
    for (const s of signals) {
        if (text.includes(s)) found.push(s);
    }
    return found;
}

// ---- pure classifier (no IO) ----------------------------------------------

// Classify reply text into a category. Conservative precedence:
//   bounce > auto_reply > not_interested > interested > question > unknown.
// Returns { category, optout, signals }. optout=true means follow-ups MUST
// stop for this lead (subject to human confirmation via /reply_handled).
export function classifyReply(rawText = '') {
    const text = String(rawText || '').toLowerCase().replace(/ё/g, 'е');
    if (!text.trim()) return { category: CAT_UNKNOWN, optout: false, signals: [] };

    const bounce = hasAny(text, BOUNCE_SIGNALS);
    if (bounce.length) return { category: CAT_BOUNCE, optout: false, signals: bounce };

    const auto = hasAny(text, AUTO_REPLY_SIGNALS);
    if (auto.length) return { category: CAT_AUTO_REPLY, optout: false, signals: auto };

    const no = hasAny(text, NOT_INTERESTED_SIGNALS);
    if (no.length) return { category: CAT_NOT_INTERESTED, optout: true, signals: no };

    const yes = hasAny(text, INTERESTED_SIGNALS);
    if (yes.length) return { category: CAT_INTERESTED, optout: false, signals: yes };

    const q = hasAny(text, QUESTION_SIGNALS);
    if (q.length) return { category: CAT_QUESTION, optout: false, signals: q };

    return { category: CAT_UNKNOWN, optout: false, signals: [] };
}

// Default human decision suggested for a category (UI hint only — never auto).
export function suggestedDecision(category) {
    switch (category) {
        case CAT_NOT_INTERESTED: return DECISION_OPTOUT;
        case CAT_BOUNCE: return DECISION_OPTOUT;
        case CAT_AUTO_REPLY: return DECISION_IGNORE;
        case CAT_INTERESTED: return DECISION_REPLY;
        case CAT_QUESTION: return DECISION_REPLY;
        default: return DECISION_REPLY;
    }
}

// ---- ids -------------------------------------------------------------------

// Stable reply id for a (lead_id, received_at) pair → duplicate protection.
export function buildReplyId(leadId, receivedAt) {
    const key = `${String(leadId || '').trim().toLowerCase()}|${String(receivedAt || '').trim()}`;
    return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

// ---- storage (append-only JSONL of events) --------------------------------

function ensureDir(file) {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function readEvents(file = REPLY_STATE_FILE) {
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, 'utf8');
    const out = [];
    for (const line of raw.split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        try { out.push(JSON.parse(t)); } catch { /* skip malformed */ }
    }
    return out;
}

function appendEvent(event, file = REPLY_STATE_FILE) {
    ensureDir(file);
    fs.appendFileSync(file, JSON.stringify(event) + '\n', 'utf8');
    return event;
}

// Reduce the event log into current state: replies by id.
export function reduceState(file = REPLY_STATE_FILE) {
    const events = readEvents(file);
    const replies = new Map();
    for (const e of events) {
        if (!e || !e.kind) continue;
        if (e.kind === 'reply' && e.reply_id) {
            if (!replies.has(e.reply_id)) {
                replies.set(e.reply_id, { ...e, status: STATUS_NEW });
            }
        } else if (e.kind === 'handled' && replies.has(e.reply_id)) {
            const r = replies.get(e.reply_id);
            r.status = STATUS_HANDLED;
            r.decision = e.decision || '';
            r.handled_note = e.note || '';
            r.handled_at = e.timestamp;
        }
    }
    return { replies };
}

// ---- logging an inbound reply (manual / future adapter feed) ---------------

// Append one inbound reply. Pure-ish: classifies text, builds a stable id,
// refuses duplicates and empty lead_id. Returns { written, reply, reason }.
export function logReply(input = {}, file = REPLY_STATE_FILE, createdAt = new Date().toISOString()) {
    const lead_id = String(input.lead_id || '').trim();
    if (!lead_id) return { written: false, reply: null, reason: 'NO_LEAD_ID' };

    const received_at = String(input.received_at || createdAt).trim();
    const text = String(input.text || '').trim();
    const reply_id = buildReplyId(lead_id, received_at);

    const { replies } = reduceState(file);
    if (replies.has(reply_id)) {
        return { written: false, reply: replies.get(reply_id), reason: 'DUPLICATE' };
    }

    const verdict = classifyReply(text);
    const reply = {
        kind: 'reply',
        reply_id,
        lead_id,
        company: String(input.company || '').trim(),
        from: String(input.from || input.sender || '').trim(),
        subject: String(input.subject || '').trim(),
        text,
        category: verdict.category,
        optout: verdict.optout,
        signals: verdict.signals,
        suggested: suggestedDecision(verdict.category),
        received_at,
        created_at: createdAt,
    };
    appendEvent(reply, file);
    return { written: true, reply, reason: 'OK' };
}

// ---- queue (read) ----------------------------------------------------------

// Open (un-handled) replies, newest received first.
export function openReplies(file = REPLY_STATE_FILE) {
    const { replies } = reduceState(file);
    const out = [];
    for (const r of replies.values()) {
        if (r.status !== STATUS_NEW) continue;
        out.push(r);
    }
    out.sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)));
    return out;
}

export function nextReply(file = REPLY_STATE_FILE) {
    return openReplies(file)[0] || null;
}

export function getReply(replyId, file = REPLY_STATE_FILE) {
    return reduceState(file).replies.get(String(replyId || '').trim()) || null;
}

// ---- state transitions -----------------------------------------------------

// Close one reply with a human decision. Records the decision only — applying
// the opt-out to the follow-up engine is a separate, explicit step
// (applyOptOutFromReply) so this module stays decoupled and side-effect free.
// Returns { written, reason, reply }.
export function markReplyHandled(replyId, opts = {}, file = REPLY_STATE_FILE) {
    const now = opts.now || new Date().toISOString();
    const decision = String(opts.decision || '').trim();
    const r = reduceState(file).replies.get(String(replyId || '').trim());
    if (!r) return { written: false, reason: 'NOT_FOUND', reply: null };
    if (r.status !== STATUS_NEW) return { written: false, reason: 'ALREADY_HANDLED', reply: r };
    if (decision && !VALID_DECISIONS.includes(decision)) {
        return { written: false, reason: 'BAD_DECISION', reply: r };
    }
    appendEvent({
        kind: 'handled',
        reply_id: r.reply_id,
        lead_id: r.lead_id,
        decision: decision || r.suggested,
        note: String(opts.note || ''),
        timestamp: now,
    }, file);
    return { written: true, reason: 'OK', reply: r };
}

// ---- auto-stop bridge to the follow-up engine ------------------------------

// Apply an opt-out to the follow-up engine for the lead behind a reply. This
// is the ONLY place Block 8 touches the follow-up state, and it is invoked by
// the approved path after a human confirms "not interested". It NEVER sends.
// Returns { applied, reason }.
export function applyOptOutFromReply(replyId, file = REPLY_STATE_FILE, followupFile = FOLLOWUP_STATE_FILE, opts = {}) {
    const r = getReply(replyId, file);
    if (!r) return { applied: false, reason: 'NOT_FOUND' };
    const out = markOptedOut(r.lead_id, `reply:${r.category}`, { now: opts.now }, followupFile);
    if (out.written) return { applied: true, reason: 'OK' };
    if (out.reason === 'ALREADY_OPTED_OUT') return { applied: false, reason: 'ALREADY_OPTED_OUT' };
    return { applied: false, reason: out.reason || 'FAILED' };
}

// ---- Telegram formatters (text only — no sending) --------------------------

const CAT_LABEL = {
    [CAT_BOUNCE]: '📭 bounce',
    [CAT_AUTO_REPLY]: '🤖 автоответ',
    [CAT_NOT_INTERESTED]: '🛑 не интересно',
    [CAT_INTERESTED]: '🔥 интерес',
    [CAT_QUESTION]: '❓ вопрос',
    [CAT_UNKNOWN]: '❔ не ясно',
};

function shortWhen(iso) {
    return String(iso || '').replace('T', ' ').slice(0, 16);
}

// /replies_inbox
export function formatRepliesInbox(file = REPLY_STATE_FILE) {
    const rows = openReplies(file);
    if (rows.length === 0) {
        return '📭 Новых ответов на разбор сейчас нет.';
    }
    const lines = [`📥 Ответы на разбор (${rows.length}):`, ''];
    for (const r of rows) {
        lines.push(`• ${CAT_LABEL[r.category] || r.category} — ${r.company || r.lead_id}`);
        lines.push(`  ${shortWhen(r.received_at)} | id: ${r.reply_id}`);
    }
    lines.push('', 'Дальше: /reply_next — разобрать следующий ответ.');
    return lines.join('\n');
}

// /reply_next
export function formatReplyNext(file = REPLY_STATE_FILE) {
    const r = nextReply(file);
    if (!r) {
        return '📭 Ответов на разбор нет.';
    }
    const preview = (r.text || '').slice(0, 280);
    const lines = [
        `📨 Ответ на разбор: ${CAT_LABEL[r.category] || r.category}`,
        '',
        `Компания: ${r.company || r.lead_id}`,
        `От: ${r.from || '—'}`,
        `Тема: ${r.subject || '—'}`,
        `Получено: ${shortWhen(r.received_at)}`,
        `Сигналы: ${r.signals && r.signals.length ? r.signals.join(', ') : '—'}`,
        `reply_id: ${r.reply_id}`,
        '',
        `Текст: ${preview || '—'}`,
        '',
        `Рекомендация: ${r.suggested}`,
    ];
    if (r.optout) {
        lines.push('⚠️ Похоже на отказ — подтверди /reply_handled (optout), чтобы остановить follow-up.');
    } else {
        lines.push('Действие фиксируется только тобой через /reply_handled. Ничего не отправляется.');
    }
    return lines.join('\n');
}

export default {
    REPLY_DIR,
    REPLY_STATE_FILE,
    CAT_BOUNCE,
    CAT_AUTO_REPLY,
    CAT_NOT_INTERESTED,
    CAT_INTERESTED,
    CAT_QUESTION,
    CAT_UNKNOWN,
    STATUS_NEW,
    STATUS_HANDLED,
    DECISION_OPTOUT,
    DECISION_REPLY,
    DECISION_IGNORE,
    VALID_DECISIONS,
    classifyReply,
    suggestedDecision,
    buildReplyId,
    readEvents,
    reduceState,
    logReply,
    openReplies,
    nextReply,
    getReply,
    markReplyHandled,
    applyOptOutFromReply,
    formatRepliesInbox,
    formatReplyNext,
};
