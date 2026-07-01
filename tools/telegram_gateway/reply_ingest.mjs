// reply_ingest.mjs
// ============================================================
// Reply ingestion adapter (PURE orchestration, no network, no send).
// ------------------------------------------------------------
// Ties together the existing, separately-tested pieces:
//   1. inbound header records (from the read-only IMAP reader output, or a test
//      fixture) — headers only: from, subject, message_id, in_reply_to, references.
//   2. reply_correlation.correlateHeaders → matched (lead_id) vs unmatched.
//   3. reply_monitor.logReply → append-only, dedup-guarded canonical reply state.
//
// SAFETY:
//   - No IMAP/SMTP/network here. Caller passes already-fetched headers.
//   - UNMATCHED replies are recorded as observations only (lead_id stays null) and
//     NEVER mutate any lead's state (Phase 5 rule).
//   - Classification runs on the subject line when no body is available (the
//     read-only reader is headers-only by contract); reply_monitor.classifyReply
//     is conservative and returns UNKNOWN when unsure → human triage.
//   - Idempotent: logReply refuses duplicates by (lead_id, received_at).
// ============================================================

import { buildLedgerIndex, correlateHeaders } from './reply_correlation.mjs';
import * as rm from './reply_monitor.mjs';

// Ingest a batch of inbound header records. Returns a summary; does not send.
//   headers: [{ from, subject, date, message_id, in_reply_to, references }]
//   opts.replyStateFile: override reply state path (tests)
//   opts.ledger: { sendLedgerPath, emailLedgerPath } override (tests)
export function ingestHeaders(headers = [], opts = {}) {
    const index = buildLedgerIndex(opts.ledger || {});
    const { matched, unmatched } = correlateHeaders(headers, index);

    const stateFile = opts.replyStateFile || rm.REPLY_STATE_FILE;
    const result = { matchedCount: matched.length, unmatchedCount: unmatched.length, recorded: 0, duplicates: 0, unmatchedRecorded: 0 };

    for (const h of matched) {
        // Headers-only: classify on subject (best available signal without body).
        const out = rm.logReply({
            lead_id: h.lead_id,
            company: h.company || '',
            from: h.from,
            subject: h.subject,
            text: h.subject || '', // subject as the classifiable text (no body fetched)
            received_at: h.date,
        }, stateFile);
        if (out.written) result.recorded++;
        else if (out.reason === 'DUPLICATE') result.duplicates++;
    }

    // UNMATCHED: record as observation with a synthetic non-lead id so the owner can
    // see them in an "unmatched" view, WITHOUT touching any real lead. We use a
    // reserved pseudo lead id prefix that no real lead uses.
    for (const h of unmatched) {
        const pseudo = 'UNMATCHED:' + (h.from || h.message_id || 'unknown');
        const out = rm.logReply({
            lead_id: pseudo,
            company: '',
            from: h.from,
            subject: h.subject,
            text: h.subject || '',
            received_at: h.date,
        }, stateFile);
        if (out.written) result.unmatchedRecorded++;
    }

    return result;
}

export default { ingestHeaders };
