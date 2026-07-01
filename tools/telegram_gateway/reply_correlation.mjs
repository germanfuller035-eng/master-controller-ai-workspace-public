// reply_correlation.mjs
// ============================================================
// Reply ↔ Lead correlation (PURE, no network, no send).
// ------------------------------------------------------------
// Bridges the existing read-only IMAP header reader
// (tools/communication_monitor/yandex_mail_imap_read.mjs) to the existing reply
// state/classifier (tools/telegram_gateway/reply_monitor.mjs), WITHOUT creating a
// new store or a new send path.
//
// Correlation strategy (high → low confidence):
//   1. THREAD:    inbound In-Reply-To / References contains one of OUR sent
//                 Message-IDs (from the send/email ledgers) → that ledger row's lead_id.
//   2. RECIPIENT: inbound From address equals the recipient we sent to → lead_id.
//   3. UNMATCHED: neither → returned as UNMATCHED; the caller MUST NOT mutate any
//                 lead state for these (Phase 5 rule).
//
// This module only READS the canonical ledgers and RETURNS correlation results.
// Persisting a matched reply is done by the caller via reply_monitor.logReply()
// (append-only, dedup-guarded). Nothing here sends, deletes, or mutates leads.
// ============================================================

import fs from 'node:fs';
import { SEND_LEDGER_PATH, EMAIL_LEDGER_PATH } from '../mater_controller_api/src/shared/config.mjs';

function readJsonl(file) {
    if (!file || !fs.existsSync(file)) return [];
    const out = [];
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        try { out.push(JSON.parse(t)); } catch { /* skip malformed */ }
    }
    return out;
}

function normId(v) {
    // Normalize a Message-ID for comparison: lowercase, strip <>, trim.
    return String(v || '').toLowerCase().replace(/[<>]/g, '').trim();
}
function normEmail(v) {
    return String(v || '').toLowerCase().trim();
}

// Build lookup indexes from the canonical ledgers. We never write here.
// Returns { byMessageId: Map<normId, lead_id>, byRecipient: Map<email, lead_id> }.
export function buildLedgerIndex({ sendLedgerPath = SEND_LEDGER_PATH, emailLedgerPath = EMAIL_LEDGER_PATH } = {}) {
    const byMessageId = new Map();
    const byRecipient = new Map();
    const bySubject = new Map(); // normalized subject → lead_id (low-confidence fallback; ambiguous dropped)
    const subjectSeen = new Map();
    const add = (rows, idField, recipField) => {
        for (const r of rows) {
            const lead = String(r.lead_id || '').trim();
            if (!lead) continue;
            const mid = normId(r[idField]);
            if (mid && !byMessageId.has(mid)) byMessageId.set(mid, lead);
            const rcpt = normEmail(r[recipField]);
            // recipient_masked is masked in email ledger; only use full recipient from send ledger
            if (rcpt && rcpt.includes('@') && !rcpt.includes('*') && !byRecipient.has(rcpt)) {
                byRecipient.set(rcpt, lead);
            }
            const subj = normSubject(r.subject);
            if (subj) {
                const prev = subjectSeen.get(subj);
                if (prev && prev !== lead) bySubject.set(subj, '__AMBIGUOUS__'); // two leads same subject → ambiguous
                else { subjectSeen.set(subj, lead); if (!bySubject.has(subj)) bySubject.set(subj, lead); }
            }
        }
    };
    add(readJsonl(sendLedgerPath), 'smtp_message_id', 'recipient');
    add(readJsonl(emailLedgerPath), 'messageId', 'recipient'); // email ledger recipient is masked → usually skipped
    return { byMessageId, byRecipient, bySubject };
}

// Normalize a subject for fallback matching: strip Re:/Fwd: prefixes, collapse whitespace, lowercase.
function normSubject(v) {
    return String(v || '').toLowerCase().replace(/^(\s*(re|fwd|fw|ответ)\s*:\s*)+/i, '').replace(/\s+/g, ' ').trim();
}

// Extract candidate referenced message-ids from an inbound header object.
function referencedIds(header) {
    const ids = [];
    const push = (v) => { if (v) for (const part of String(v).split(/\s+/)) { const n = normId(part); if (n) ids.push(n); } };
    push(header.in_reply_to);
    push(header.references);
    return ids;
}

// Correlate ONE inbound header to a lead. Returns:
//   { matched, lead_id, method: 'thread'|'recipient'|null, confidence: 'high'|'medium'|null }
export function correlateHeader(header, index) {
    const refs = referencedIds(header);
    for (const rid of refs) {
        if (index.byMessageId.has(rid)) {
            return { matched: true, lead_id: index.byMessageId.get(rid), method: 'thread', confidence: 'high' };
        }
    }
    const from = normEmail(header.from);
    if (from && index.byRecipient.has(from)) {
        return { matched: true, lead_id: index.byRecipient.get(from), method: 'recipient', confidence: 'medium' };
    }
    // Subject fallback (low confidence). Only when sender is not a known recipient and the subject maps
    // to exactly ONE lead. An ambiguous subject (two leads) is QUARANTINED (matched:false, quarantined).
    if (index.bySubject) {
        const subj = normSubject(header.subject);
        const hit = subj && index.bySubject.get(subj);
        if (hit === '__AMBIGUOUS__') return { matched: false, lead_id: null, method: null, confidence: null, quarantined: true, reason: 'ambiguous_subject' };
        if (hit) return { matched: true, lead_id: hit, method: 'subject', confidence: 'low' };
    }
    return { matched: false, lead_id: null, method: null, confidence: null };
}

// Correlate a batch of inbound headers. Returns { matched: [...], unmatched: [...] }.
// matched items carry the original header plus correlation fields; unmatched carry
// the header only (caller must surface them as UNMATCHED, never mutate lead state).
export function correlateHeaders(headers = [], index) {
    const matched = [];
    const unmatched = [];
    for (const h of headers) {
        const c = correlateHeader(h, index);
        if (c.matched) matched.push({ ...h, lead_id: c.lead_id, match_method: c.method, match_confidence: c.confidence });
        else unmatched.push({ ...h, lead_id: null, match_method: null, match_confidence: null });
    }
    return { matched, unmatched };
}

export default { buildLedgerIndex, correlateHeader, correlateHeaders };
