#!/usr/bin/env node
// reply_inbox_sync_cli.mjs
// ============================================================
// Read-only inbox sync: fetch inbound headers via the EXISTING read-only IMAP
// connector output, correlate them to leads, and append to the canonical reply
// state. NO send, NO delete, NO flag changes, NO body download.
//
// This entrypoint does NOT itself open IMAP. It consumes the headers snapshot the
// existing connector writes (data/yandex_mail_stage1_headers.json) so the live
// network path stays solely in the audited, read-only connector
// (tools/communication_monitor/yandex_mail_imap_read.mjs).
//
// Flow:
//   1. (separately) run: YANDEX_MAIL_STAGE1_LIVE_READ=true node
//      tools/communication_monitor/yandex_mail_imap_read.mjs   → writes headers JSON
//   2. node tools/telegram_gateway/reply_inbox_sync_cli.mjs    → correlate + ingest
//
// Dry by default: if the headers snapshot is missing, it reports and exits 0.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestHeaders } from './reply_ingest.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(__dirname, '..', '..');
const HEADERS_SNAPSHOT = path.join(WORKSPACE, 'data', 'yandex_mail_stage1_headers.json');

function loadHeaders() {
    if (!fs.existsSync(HEADERS_SNAPSHOT)) return null;
    try {
        const snap = JSON.parse(fs.readFileSync(HEADERS_SNAPSHOT, 'utf8'));
        // connector stores { fetched_at, mailbox, headers: [{from, subject, date, message_id, in_reply_to}] }
        return Array.isArray(snap.headers) ? snap.headers : [];
    } catch { return null; }
}

const headers = loadHeaders();
console.log('=== Reply Inbox Sync (read-only, no send) ===');
if (headers === null) {
    console.log('No IMAP headers snapshot found at', HEADERS_SNAPSHOT);
    console.log('Run the read-only connector first (YANDEX_MAIL_STAGE1_LIVE_READ=true) to produce it.');
    console.log('RESULT:', JSON.stringify({ mode: 'dry', recorded: 0, reason: 'NO_SNAPSHOT' }));
    process.exit(0);
}

// Map connector header field names to what reply_correlation expects.
const mapped = headers.map((h) => ({
    from: h.from,
    subject: h.subject,
    date: h.date,
    message_id: h.message_id,
    in_reply_to: h.in_reply_to,
    references: h.references || null,
}));

const result = ingestHeaders(mapped);
console.log('RESULT:', JSON.stringify({ mode: 'ingest', ...result }));
console.log('Replies are recorded read-only; classification + correlation done. Nothing was sent.');
process.exit(0);
