// e2e_no_send.mjs — Master Controller no-send E2E gate verification.
// Verifies the CANONICAL send architecture with NO network and NO production ledger writes:
//   - client send path (sendApprovedMessage) correctly REJECTS the test mailbox (safety),
//   - self-test path (sendApprovedSelfTestEmail) with a mock TLS transport accepts the
//     test mailbox and performs exactly one message,
//   - all autosend/mass/owner/body/channel gates,
//   - ledger duplicate-guard against a TEMP file.
// Run: node 13_sales/e2e_test/e2e_no_send.mjs
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const GW = path.resolve(process.cwd(), 'tools', 'telegram_gateway');
const u = (n) => pathToFileURL(path.join(GW, n)).href;
const router = await import(u('outbound_channel_router.mjs'));
const ledger = await import(u('outbound_send_ledger.mjs'));
const adapter = await import(u('telegram_approved_email_send_adapter.mjs'));

let pass = 0, fail = 0; const fails = [];
const ok = (name, cond, extra='') => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; fails.push(name); console.log(`  FAIL  ${name} ${extra}`); } };

const TEST_TO = 'dima-smagin69@yandex.ru';
const lead = JSON.parse(fs.readFileSync(path.join(process.cwd(),'13_sales','e2e_test','TEST_KGBI23_E2E.lead.json'),'utf8'));
const preview = JSON.parse(fs.readFileSync(path.join(process.cwd(),'13_sales','e2e_test','TEST_KGBI23_E2E.email_preview.json'),'utf8'));
const env = { EMAIL_TEST_TO: TEST_TO, EMAIL_REAL_SEND_ENABLED: 'true', YANDEX_MAIL_LOGIN: 'x', YANDEX_MAIL_APP_PASSWORD: 'x', EMAIL_FROM: 'x@yandex.ru' };

console.log('[1. client send path — must REJECT the test mailbox]');
// The client path (sendApprovedMessage) must never deliver to the test inbox.
let r = await router.sendApprovedMessage(
  { to: TEST_TO, subject: preview.subject, body: preview.body, channel: 'email', lead },
  { owner_confirmed: true, approved_by: 'Dmitry', autosend: false, mass_send: false, channel: 'email', env });
ok('client path rejects test mailbox', r.ok === false && /INVALID_RECIPIENT/.test(r.code) && r.reason === 'email_test_to', JSON.stringify(r));

console.log('\n[2. self-test path — mock transport, exactly one, test mailbox required]');
const mockTransport = { send: () => ({ ok: true, smtp_response_code: 250, accepted: [TEST_TO], messageId: 'mock-selftest-1' }) };
// happy: all self-test gates satisfied + mock transport
r = await adapter.sendEmailViaApprovedTransport(
  { to: TEST_TO, subject: preview.subject, body: preview.body },
  { owner_confirmed: true, approved_by: 'Dmitry', test_only: true, real_send_enabled: true,
    live_send_allowed: true, autosend: false, mass_send: false, env, mockTransport });
ok('self-test mock send ok', r.ok === true, JSON.stringify(r));
ok('self-test mock exactly one', r.sent_count === 1);

// autosend blocked even in self-test (mock present: still blocked, checked before transport)
r = await adapter.sendEmailViaApprovedTransport({ to: TEST_TO, subject:'s', body:'b' },
  { owner_confirmed:true, approved_by:'Dmitry', test_only:true, real_send_enabled:true, live_send_allowed:true, autosend:true, env, mockTransport });
ok('self-test autosend -> BLOCKED', r.ok === false && /AUTOSEND/.test(r.code), r.code);

// mass send blocked
r = await adapter.sendEmailViaApprovedTransport({ to: [TEST_TO,TEST_TO], subject:'s', body:'b' },
  { owner_confirmed:true, approved_by:'Dmitry', test_only:true, real_send_enabled:true, live_send_allowed:true, mass_send:true, env, mockTransport });
ok('self-test mass_send -> BLOCKED', r.ok === false && /MASS_SEND/.test(r.code), r.code);

// The remaining gates (owner/recipient/real_send) are evaluated only on the REAL path
// (no mockTransport), which is exactly how the one controlled send will be invoked.
// owner not confirmed
r = await adapter.sendEmailViaApprovedTransport({ to: TEST_TO, subject:'s', body:'b' },
  { owner_confirmed:false, test_only:true, real_send_enabled:true, live_send_allowed:true, env });
ok('self-test no owner -> BLOCKED', r.ok === false && /NOT_OWNER_APPROVED/.test(r.code), r.code);

// wrong recipient (not test mailbox) in test_only
r = await adapter.sendEmailViaApprovedTransport({ to: 'someoneelse@example.org', subject:'s', body:'b' },
  { owner_confirmed:true, approved_by:'Dmitry', test_only:true, real_send_enabled:true, live_send_allowed:true, env });
ok('self-test wrong recipient -> BLOCKED', r.ok === false && /TEST_ONLY_RECIPIENT/.test(r.code), r.code);

// real_send disabled
r = await adapter.sendEmailViaApprovedTransport({ to: TEST_TO, subject:'s', body:'b' },
  { owner_confirmed:true, approved_by:'Dmitry', test_only:true, real_send_enabled:false, live_send_allowed:true, env });
ok('self-test real_send disabled -> BLOCKED', r.ok === false && /REAL_SEND_DISABLED/.test(r.code), r.code);

console.log('\n[3. canSendLive gate]');
ok('canSendLive true when all 8 hold', adapter.canSendLive({ to: TEST_TO },
  { live_send_allowed:true, real_send_enabled:true, test_only:true, owner_confirmed:true, approved_by:'Dmitry', mass_send:false, autosend:false, env }) === true);
ok('canSendLive false if autosend', adapter.canSendLive({ to: TEST_TO },
  { live_send_allowed:true, real_send_enabled:true, test_only:true, owner_confirmed:true, approved_by:'Dmitry', autosend:true, env }) === false);

console.log('\n[4. ledger duplicate-guard — TEMP file only]');
const tmp = path.join(os.tmpdir(), `e2e_ledger_${process.pid}.jsonl`);
const e = { lead_id: 'TEST_KGBI23_E2E', recipient: TEST_TO, result: ledger.RESULT_SENT, subject: preview.subject, smtp_message_id: 'mock-selftest-1' };
const w1 = ledger.recordSendOnce(e, tmp);
const w2 = ledger.recordSendOnce(e, tmp);
ok('ledger first write succeeds', w1.written === true, JSON.stringify(w1));
ok('ledger duplicate blocked', w2.written === false && w2.reason === 'DUPLICATE_GUARD', JSON.stringify(w2));
try { fs.unlinkSync(tmp); } catch {}

console.log('\n[5. SMTP proof + recipient-override safety]');
ok('hasEmailSmtpProof true for 250', router.hasEmailSmtpProof({ ok:true, channel:'email', accepted:[TEST_TO], smtp_response_code:250 }) === true);
ok('hasEmailSmtpProof false w/o proof', router.hasEmailSmtpProof({ ok:true, channel:'email' }) === false);
ok('subject carries TEST prefix', /^\[TEST\]\[Master Controller E2E\]/.test(preview.subject));
ok('recipient is controlled test inbox', preview.to === TEST_TO);
ok('real site email NOT recipient', preview.to !== 'kgbi2020@mail.ru');
ok('lead marked real_outreach_allowed=false', lead.real_outreach_allowed === false);

console.log(`\n==== NO-SEND E2E: ${pass} passed, ${fail} failed ====`);
if (fail) { console.log('FAILED:', fails.join(' | ')); process.exit(1); }
process.exit(0);
