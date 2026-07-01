#!/usr/bin/env node
// tools/commercial_core/tests/reply_correlation.test.mjs
// Reply ↔ lead correlation readiness (9 cases). Pure: builds the index from synthetic JSONL ledger
// files in a temp dir. No IMAP, no network, no flag mutation, no send.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { buildLedgerIndex, correlateHeader, correlateHeaders } from '../../telegram_gateway/reply_correlation.mjs';

let pass = 0, fail = 0; const fails = [];
const ok = (n, c) => { if (c) { pass++; } else { fail++; fails.push(n); console.log('FAIL', n); } };

const dir = mkdtempSync(path.join(os.tmpdir(), 'reply-'));
const sendLedger = path.join(dir, 'send.jsonl');
const emailLedger = path.join(dir, 'email.jsonl');
// Two leads. L1 has Message-ID + recipient + subject; L2 shares the SAME subject as L3 (ambiguous).
const rows = [
    { lead_id: 'L1', smtp_message_id: '<mid-l1@mc>', recipient: 'l1@client.ru', subject: 'Мини-аудит сайта' },
    { lead_id: 'L2', smtp_message_id: '<mid-l2@mc>', recipient: 'l2@client.ru', subject: 'Общая тема' },
    { lead_id: 'L3', smtp_message_id: '<mid-l3@mc>', recipient: 'l3@client.ru', subject: 'Общая тема' },
];
writeFileSync(sendLedger, rows.map((r) => JSON.stringify(r)).join('\n'));
writeFileSync(emailLedger, '');
const index = buildLedgerIndex({ sendLedgerPath: sendLedger, emailLedgerPath: emailLedger });

// 1. exact Message-ID correlation (In-Reply-To)
ok('1 In-Reply-To exact', correlateHeader({ in_reply_to: '<mid-l1@mc>', from: 'someoneelse@x.ru' }, index).lead_id === 'L1');
// 2. In-Reply-To correlation method=thread/high
ok('2 thread high confidence', (() => { const c = correlateHeader({ in_reply_to: '<mid-l1@mc>' }, index); return c.method === 'thread' && c.confidence === 'high'; })());
// 3. References correlation
ok('3 References correlation', correlateHeader({ references: '<other@x> <mid-l2@mc>', from: 'z@z.ru' }, index).lead_id === 'L2');
// 4. subject fallback (unique subject) → low confidence
ok('4 subject fallback unique', (() => { const c = correlateHeader({ subject: 'Re: Мини-аудит сайта', from: 'unknown@x.ru' }, index); return c.lead_id === 'L1' && c.method === 'subject' && c.confidence === 'low'; })());
// 5. wrong sender rejected (no thread, unknown from, no subject hit)
ok('5 wrong sender unmatched', correlateHeader({ from: 'stranger@nowhere.ru', subject: 'нет такой темы' }, index).matched === false);
// 6. ambiguous subject quarantined (two leads same subject)
ok('6 ambiguous subject quarantined', (() => { const c = correlateHeader({ subject: 'Re: Общая тема', from: 'x@y.ru' }, index); return c.matched === false && c.quarantined === true; })());
// 7. recipient correlation (From == known recipient) → medium
ok('7 recipient medium', (() => { const c = correlateHeader({ from: 'L1@client.ru' }, index); return c.lead_id === 'L1' && c.method === 'recipient' && c.confidence === 'medium'; })());
// 8. duplicate inbound header idempotent (correlateHeaders stable, same result twice)
ok('8 duplicate header idempotent', (() => {
    const h = { in_reply_to: '<mid-l1@mc>', from: 'l1@client.ru' };
    const a = correlateHeaders([h, h], index);
    return a.matched.length === 2 && a.matched[0].lead_id === 'L1' && a.matched[1].lead_id === 'L1';
})());
// 9. correlation never mutates / no outbound: result objects only, no send field set true
ok('9 no send/mutation side effects', (() => {
    const c = correlateHeader({ in_reply_to: '<mid-l1@mc>' }, index);
    return !('sent' in c) && !('flagsChanged' in c) && c.matched === true;
})());

console.log(`\n==== reply_correlation: ${pass} passed, ${fail} failed ====`);
if (fail > 0) { console.log('FAILURES:', fails.join('; ')); process.exit(1); }
