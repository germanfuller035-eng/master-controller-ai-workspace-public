// outbound_send_ledger.mjs
// ============================================================
// BLOCK G — Outbound Send Ledger (single source of truth for SENT emails)
// ------------------------------------------------------------
// Append-only JSONL ledger at 13_sales/outbound_send_ledger.jsonl.
// One line per APPROVED send. Used by:
//   - the approved send path (write SENT entry after a real send),
//   - /sales_history (show last 10 sends),
//   - /sales_next + lead pipeline (skip already-contacted leads via duplicate guard).
//
// SAFETY CONTRACT:
//   - This module NEVER sends email and NEVER calls Telegram/SMTP/network.
//   - It only reads/appends a local JSONL file inside D:\AI_WORKSPACE\13_sales.
//   - It NEVER fabricates an smtp_message_id. A backfilled historical entry
//     leaves smtp_message_id empty and sets backfilled:true.
//   - Each entry carries a duplicate_guard_id derived from lead_id+recipient so
//     a second approval of the same lead can be detected and refused upstream.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const LEDGER_DIR = 'D:/AI_WORKSPACE/13_sales';
export const LEDGER_FILE = 'D:/AI_WORKSPACE/13_sales/outbound_send_ledger.jsonl';

export const RESULT_SENT = 'SENT';
export const RESULT_FAILED = 'FAILED';

// duplicate_guard_id is stable for a (lead_id, recipient) pair.
export function buildDuplicateGuardId(leadId, recipient) {
    const key = `${String(leadId || '').trim().toLowerCase()}|${String(recipient || '').trim().toLowerCase()}`;
    return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

// Build a canonical ledger entry. Pure — no IO.
export function buildLedgerEntry(input = {}) {
    const recipient = String(input.recipient || '').trim();
    const lead_id = String(input.lead_id || '').trim();
    return {
        timestamp: input.timestamp || new Date().toISOString(),
        lead_id,
        company: String(input.company || '').trim(),
        website: String(input.website || '').trim(),
        recipient,
        subject: String(input.subject || '').trim(),
        draft_id: String(input.draft_id || '').trim(),
        result: input.result || RESULT_SENT,
        // NEVER fabricated. Empty unless a real transport returned one.
        smtp_message_id: String(input.smtp_message_id || '').trim(),
        approved_by: input.approved_by || 'Dmitry',
        contacted_marked: input.contacted_marked === true,
        duplicate_guard_id: buildDuplicateGuardId(lead_id, recipient),
        backfilled: input.backfilled === true,
    };
}

function ensureDir(file) {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Read all entries (tolerant of blank / malformed lines).
export function readLedger(file = LEDGER_FILE) {
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

// Has this lead+recipient already been sent? (duplicate guard for /sales_next.)
export function hasBeenSent({ lead_id, recipient } = {}, file = LEDGER_FILE) {
    const guard = buildDuplicateGuardId(lead_id, recipient);
    return readLedger(file).some(
        (e) => e && e.result === RESULT_SENT && e.duplicate_guard_id === guard,
    );
}

// Set of duplicate_guard_ids that have been SENT (for bulk skip in pipeline).
export function sentGuardIdSet(file = LEDGER_FILE) {
    const s = new Set();
    for (const e of readLedger(file)) {
        if (e && e.result === RESULT_SENT && e.duplicate_guard_id) s.add(e.duplicate_guard_id);
    }
    return s;
}

// Append one entry (creates file/dir if needed). Returns the written entry.
export function appendLedgerEntry(input = {}, file = LEDGER_FILE) {
    const entry = buildLedgerEntry(input);
    ensureDir(file);
    fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8');
    return entry;
}

// Append a SENT entry only if not already present (duplicate-safe). Returns
// { written:boolean, entry, reason }.
export function recordSendOnce(input = {}, file = LEDGER_FILE) {
    if (input.result === RESULT_SENT && hasBeenSent(input, file)) {
        return { written: false, reason: 'DUPLICATE_GUARD', entry: null };
    }
    const entry = appendLedgerEntry(input, file);
    return { written: true, reason: 'OK', entry };
}

// Last N entries, newest first.
export function lastEntries(n = 10, file = LEDGER_FILE) {
    const all = readLedger(file);
    return all.slice(Math.max(0, all.length - n)).reverse();
}

// /sales_history formatter — last 10 sends, newest first.
export function formatSalesHistory(n = 10, file = LEDGER_FILE) {
    const rows = lastEntries(n, file);
    if (rows.length === 0) {
        return '📭 Журнал отправок пуст. Ещё не было ни одной подтверждённой отправки.';
    }
    const lines = [`📒 История отправок (последние ${rows.length}):`, ''];
    for (const e of rows) {
        const when = String(e.timestamp || '').replace('T', ' ').slice(0, 16);
        const flag = e.backfilled ? ' (backfill)' : '';
        lines.push(`• ${when} — ${e.company || e.lead_id || '—'} <${e.recipient}>`);
        lines.push(`  ${e.result}${flag} | ${e.subject || ''}`);
    }
    return lines.join('\n');
}

export default {
    LEDGER_DIR,
    LEDGER_FILE,
    RESULT_SENT,
    RESULT_FAILED,
    buildDuplicateGuardId,
    buildLedgerEntry,
    readLedger,
    hasBeenSent,
    sentGuardIdSet,
    appendLedgerEntry,
    recordSendOnce,
    lastEntries,
    formatSalesHistory,
};
