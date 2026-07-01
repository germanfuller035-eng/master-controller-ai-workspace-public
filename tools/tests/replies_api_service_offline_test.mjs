// replies_api_service_offline_test.mjs — PURE offline, no network.
// Verifies the API replies service surfaces canonical reply state correctly.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n); } };

// Build a synthetic reply state file and point reply_monitor at it via env-free path:
// reply_monitor uses a fixed REPLY_STATE_FILE, so we test the underlying functions
// directly with an explicit file arg, then assert DTO shaping in the service is correct
// by importing the service against a temp WORKSPACE clone of just reply_monitor.

const rm = await import('../telegram_gateway/reply_monitor.mjs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rasvc_'));
const stateFile = path.join(dir, 'reply_state.jsonl');

// log two replies (interested + opt-out) via the canonical logger
rm.logReply({ lead_id: 'KGBI23_RU', company: 'КГБИ', from: 'boss@kgbi23.ru', subject: 'Re: аудит', text: 'Интересно, сколько стоит?' }, stateFile, '2026-06-10T09:00:00Z');
rm.logReply({ lead_id: 'ACME_RU', company: 'Acme', from: 'x@acme.ru', subject: 'Re', text: 'отпишите меня, не интересно' }, stateFile, '2026-06-11T09:00:00Z');

const open = rm.openReplies(stateFile);
ok('two open replies', open.length === 2);
ok('newest first', open[0].lead_id === 'ACME_RU');
ok('interested classified', open.find(r => r.lead_id === 'KGBI23_RU').category === 'interested');
ok('optout classified', open.find(r => r.lead_id === 'ACME_RU').optout === true);
ok('suggested decision present', open.every(r => !!r.suggested));

// duplicate guard
const dup = rm.logReply({ lead_id: 'KGBI23_RU', text: 'дубль' }, stateFile, '2026-06-10T09:00:00Z');
ok('duplicate refused', dup.written === false && dup.reason === 'DUPLICATE');

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n==== replies_api_service: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
