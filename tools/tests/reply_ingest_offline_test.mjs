// reply_ingest_offline_test.mjs — PURE offline, no network, no send.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ingestHeaders } from '../telegram_gateway/reply_ingest.mjs';
import * as rm from '../telegram_gateway/reply_monitor.mjs';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest_'));
const sendL = path.join(dir, 'send.jsonl');
const emailL = path.join(dir, 'email.jsonl');
const stateFile = path.join(dir, 'reply_state.jsonl');

fs.writeFileSync(sendL, JSON.stringify({ lead_id: 'KGBI23_RU', recipient: 'info@kgbi23.ru', smtp_message_id: '<sent-kgbi@yandex.com>', result: 'SEND_OK' }) + '\n');
fs.writeFileSync(emailL, '');

const headers = [
  // thread match (In-Reply-To → our sent id), interested subject
  { from: 'boss@kgbi23.ru', subject: 'Re: аудит — интересно, сколько стоит', date: '2026-06-12T08:00:00Z', message_id: '<r1@kgbi23.ru>', in_reply_to: '<sent-kgbi@yandex.com>' },
  // recipient match
  { from: 'info@kgbi23.ru', subject: 'Re: вопрос', date: '2026-06-12T09:00:00Z', message_id: '<r2@kgbi23.ru>' },
  // unmatched stranger
  { from: 'spam@nowhere.io', subject: 'Buy now', date: '2026-06-12T10:00:00Z', message_id: '<r3@nowhere.io>' },
];

const res = ingestHeaders(headers, { replyStateFile: stateFile, ledger: { sendLedgerPath: sendL, emailLedgerPath: emailL } });
ok('2 matched', res.matchedCount === 2);
ok('1 unmatched', res.unmatchedCount === 1);
ok('2 recorded', res.recorded === 2);
ok('1 unmatched recorded as observation', res.unmatchedRecorded === 1);

const all = rm.reduceState(stateFile).replies;
const matched1 = [...all.values()].find(r => r.lead_id === 'KGBI23_RU' && r.category === 'interested');
ok('thread-matched reply classified interested', !!matched1);
const unmatched = [...all.values()].find(r => String(r.lead_id).startsWith('UNMATCHED:'));
ok('unmatched recorded with pseudo id (no real lead touched)', !!unmatched);

// idempotency: re-ingest same headers → no new records
const res2 = ingestHeaders(headers, { replyStateFile: stateFile, ledger: { sendLedgerPath: sendL, emailLedgerPath: emailL } });
ok('re-ingest is idempotent (0 new recorded)', res2.recorded === 0 && res2.unmatchedRecorded === 0);

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n==== reply_ingest: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
