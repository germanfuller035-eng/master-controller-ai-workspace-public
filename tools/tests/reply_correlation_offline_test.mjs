// reply_correlation_offline_test.mjs — PURE offline test, no network.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildLedgerIndex, correlateHeader, correlateHeaders } from '../telegram_gateway/reply_correlation.mjs';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

// synthetic ledgers in a temp dir
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc_'));
const sendL = path.join(dir, 'send.jsonl');
const emailL = path.join(dir, 'email.jsonl');
fs.writeFileSync(sendL, [
  JSON.stringify({ timestamp: '2026-06-01T10:00:00Z', lead_id: 'KGBI23_RU', recipient: 'info@kgbi23.ru', smtp_message_id: '<abc123@yandex.com>', result: 'SEND_OK' }),
  JSON.stringify({ timestamp: '2026-06-02T10:00:00Z', lead_id: 'ACME_RU', recipient: 'sales@acme.ru', smtp_message_id: '<def456@yandex.com>', result: 'SEND_OK' }),
].join('\n') + '\n');
fs.writeFileSync(emailL, [
  JSON.stringify({ timestamp: '2026-06-01T10:00:01Z', lead_id: 'KGBI23_RU', recipient_masked: 'i***@kgbi23.ru', messageId: '<abc123@yandex.com>', result: 'SEND_OK' }),
].join('\n') + '\n');

const index = buildLedgerIndex({ sendLedgerPath: sendL, emailLedgerPath: emailL });

ok('index built message-ids', index.byMessageId.size >= 2);
ok('index built recipients (unmasked only)', index.byRecipient.get('info@kgbi23.ru') === 'KGBI23_RU');
ok('masked recipient skipped', !index.byRecipient.has('i***@kgbi23.ru'));

// thread match via In-Reply-To
ok('thread match In-Reply-To', correlateHeader({ from: 'someone@kgbi23.ru', in_reply_to: '<abc123@yandex.com>' }, index).lead_id === 'KGBI23_RU');
// thread match via References (multiple)
ok('thread match References', correlateHeader({ from: 'x@y.ru', references: '<zzz@a> <def456@yandex.com>' }, index).method === 'thread');
// thread match is case/bracket tolerant
ok('thread normalize brackets/case', correlateHeader({ in_reply_to: 'ABC123@YANDEX.COM' }, index).lead_id === 'KGBI23_RU');
// recipient match (medium)
ok('recipient match', correlateHeader({ from: 'Sales@Acme.ru' }, index).method === 'recipient');
// unmatched stays unmatched (no lead state mutation downstream)
ok('unmatched safe', correlateHeader({ from: 'stranger@nowhere.io', subject: 'hi' }, index).matched === false);

const batch = correlateHeaders([
  { from: 'a@kgbi23.ru', in_reply_to: '<abc123@yandex.com>' },
  { from: 'stranger@nowhere.io' },
], index);
ok('batch splits matched/unmatched', batch.matched.length === 1 && batch.unmatched.length === 1);
ok('matched carries lead_id + method', batch.matched[0].lead_id === 'KGBI23_RU' && batch.matched[0].match_method === 'thread');

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n==== reply_correlation: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
