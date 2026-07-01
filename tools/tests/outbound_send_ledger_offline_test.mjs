// outbound_send_ledger_offline_test.mjs
// ============================================================
// BLOCK G — Outbound Send Ledger offline test (READ-ONLY on real ledger)
// ------------------------------------------------------------
// Exercises the ledger module against a TEMP file in the OS temp dir, so the
// real 13_sales/outbound_send_ledger.jsonl is never written by this test.
//
// Asserts:
//   - buildLedgerEntry carries all required fields + duplicate_guard_id
//   - smtp_message_id is never fabricated (empty when not supplied)
//   - appendLedgerEntry + readLedger round-trip
//   - hasBeenSent / sentGuardIdSet detect a prior SENT (duplicate guard)
//   - recordSendOnce refuses a duplicate SENT for same lead+recipient
//   - lastEntries returns newest-first
//   - formatSalesHistory renders the kvs@zb23.ru row
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
    buildLedgerEntry,
    appendLedgerEntry,
    readLedger,
    hasBeenSent,
    sentGuardIdSet,
    recordSendOnce,
    lastEntries,
    formatSalesHistory,
    buildDuplicateGuardId,
    RESULT_SENT,
} from '../telegram_gateway/outbound_send_ledger.mjs';

let pass = 0, fail = 0;
function ok(name, cond) {
    if (cond) { pass++; console.log(`  PASS ${name}`); }
    else { fail++; console.log(`  FAIL ${name}`); }
}

const TMP = path.join(os.tmpdir(), `ledger_test_${Date.now()}.jsonl`);
function cleanup() { try { fs.existsSync(TMP) && fs.unlinkSync(TMP); } catch { /* ignore */ } }

console.log('== Block G: Outbound Send Ledger offline ==');
cleanup();

// ---------------------------------------------------------------------------
console.log('\n-- buildLedgerEntry contract --');
const e = buildLedgerEntry({
    lead_id: '002', company: 'ЖЕЛЕЗОБЕТОН', website: 'zb23.ru',
    recipient: 'kvs@zb23.ru', subject: 'Короткий разбор сайта zb23.ru',
    draft_id: 'd1', result: RESULT_SENT,
});
for (const f of ['timestamp', 'lead_id', 'company', 'website', 'recipient', 'subject',
    'draft_id', 'result', 'smtp_message_id', 'approved_by', 'contacted_marked',
    'duplicate_guard_id', 'backfilled']) {
    ok(`entry has field '${f}'`, Object.prototype.hasOwnProperty.call(e, f));
}
ok('smtp_message_id NOT fabricated (empty)', e.smtp_message_id === '');
ok('approved_by defaults to Dmitry', e.approved_by === 'Dmitry');
ok('duplicate_guard_id is stable', e.duplicate_guard_id === buildDuplicateGuardId('002', 'kvs@zb23.ru'));

// ---------------------------------------------------------------------------
console.log('\n-- append + read round-trip --');
appendLedgerEntry({
    lead_id: '002', company: 'ЖЕЛЕЗОБЕТОН', website: 'zb23.ru',
    recipient: 'kvs@zb23.ru', subject: 'Короткий разбор сайта zb23.ru',
    result: RESULT_SENT, backfilled: true,
}, TMP);
const all = readLedger(TMP);
ok('one entry written', all.length === 1);
ok('round-trip recipient', all[0].recipient === 'kvs@zb23.ru');
ok('round-trip backfilled true', all[0].backfilled === true);

// ---------------------------------------------------------------------------
console.log('\n-- duplicate guard --');
ok('hasBeenSent true for kvs', hasBeenSent({ lead_id: '002', recipient: 'kvs@zb23.ru' }, TMP) === true);
ok('hasBeenSent false for other', hasBeenSent({ lead_id: '003', recipient: 'x@y.ru' }, TMP) === false);
ok('sentGuardIdSet contains kvs guard', sentGuardIdSet(TMP).has(buildDuplicateGuardId('002', 'kvs@zb23.ru')));

const dup = recordSendOnce({ lead_id: '002', recipient: 'kvs@zb23.ru', result: RESULT_SENT }, TMP);
ok('recordSendOnce refuses duplicate', dup.written === false && dup.reason === 'DUPLICATE_GUARD');
ok('still one entry after refused dup', readLedger(TMP).length === 1);

const fresh = recordSendOnce({ lead_id: '003', company: 'Co3', recipient: 'a@co3.ru', result: RESULT_SENT }, TMP);
ok('recordSendOnce writes new lead', fresh.written === true);
ok('two entries now', readLedger(TMP).length === 2);

// ---------------------------------------------------------------------------
console.log('\n-- lastEntries newest-first --');
const last = lastEntries(10, TMP);
ok('newest first is Co3', last[0].company === 'Co3');

// ---------------------------------------------------------------------------
console.log('\n-- formatSalesHistory --');
const text = formatSalesHistory(10, TMP);
ok('history shows kvs@zb23.ru', text.includes('kvs@zb23.ru'));
ok('history shows backfill flag', text.includes('(backfill)'));
const empty = formatSalesHistory(10, path.join(os.tmpdir(), `empty_${Date.now()}.jsonl`));
ok('empty history message', empty.includes('пуст'));

cleanup();
console.log(`\n${fail === 0 ? 'ALL GREEN' : 'RED'}: outbound send ledger (${pass} pass / ${fail} fail).`);
if (fail !== 0) process.exit(1);
