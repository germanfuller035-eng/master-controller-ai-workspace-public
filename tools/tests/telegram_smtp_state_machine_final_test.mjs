// telegram_smtp_state_machine_final_test.mjs
// MAIL-FINAL-3 — OFFLINE test for the SMTP state machine + multiline parser.
//
// SAFETY CONTRACT:
//   - PURE offline test. NO network, NO real SMTP, NO Telegram API, NO secret
//     read, NO .env read, NO file writes (no 13_sales / approval_queue / leads).
//   - Drives createSmtpStateMachine() and the multiline reader/parser with
//     MOCK SMTP transcripts only.
//   - Verifies the original bug (expecting 220 after EHLO) cannot recur.
//   - Verifies login + password VALUES never appear in any result/stdout.
//   - recipient is ONLY EMAIL_TEST_TO; a non-test recipient is blocked.
//   - autosend / mass send blocked, no legacy script, D3C freeze active.

import {
    createSmtpStateMachine,
    createSmtpResponseReader,
    parseSmtpResponse,
    sendApprovedSelfTestEmail,
    SEND_OK_TEST_EMAIL,
    SMTP_SEND_FAILED,
    SMTP_GREETING_FAILED,
    SMTP_EHLO_FAILED,
    SEND_BLOCKED_MASS_SEND,
    SEND_BLOCKED_AUTOSEND,
    SEND_BLOCKED_TEST_ONLY_RECIPIENT,
    D3C_FREEZE,
} from '../telegram_gateway/telegram_approved_email_send_adapter.mjs';

let pass = 0;
let fail = 0;
const fails = [];
function ok(name, cond) {
    if (cond) { pass++; console.log(`  ok ${name}`); }
    else { fail++; fails.push(name); console.log(`  FAIL ${name}`); }
}

// Secret sentinels used ONLY inside this test. They must NEVER leak into any
// machine result string or any stdout produced by the machine.
const TEST_USER = 'selftest-login-sentinel@example.test';
const TEST_PASS = 'p@ssword-sentinel-DO-NOT-LEAK';
const TEST_FROM = 'selftest-login-sentinel@example.test';
const TEST_TO = 'selftest-recipient@example.test';
const MESSAGE = 'From: a\r\nTo: b\r\nSubject: s\r\n\r\nbody\r\n';

// Helper: drive a machine through a scripted list of server response codes/lines.
// Returns { actions, result } where result is the terminal done() payload (or null).
function driveMachine(machine, serverReplies) {
    const actions = [];
    let result = null;
    for (const reply of serverReplies) {
        const resp = parseSmtpResponse(reply);
        const action = machine.onResponse(resp);
        actions.push(action);
        if (action && action.done !== undefined) { result = action.done; break; }
    }
    return { actions, result };
}

console.log('=== MAIL-FINAL-3 SMTP STATE MACHINE OFFLINE TEST ===');

// ---------------------------------------------------------------------------
// 1) HAPPY PATH — full transcript ends with SEND_OK_TEST_EMAIL
// ---------------------------------------------------------------------------
console.log('[1] happy path');
{
    const m = createSmtpStateMachine({ user: TEST_USER, pass: TEST_PASS, from: TEST_FROM, to: TEST_TO, message: MESSAGE });
    const replies = [
        '220 smtp.yandex.ru ESMTP',                 // greeting
        '250-smtp.yandex.ru\r\n250-AUTH LOGIN PLAIN\r\n250 SIZE 42949672960', // EHLO multiline
        '334 VXNlcm5hbWU6',                         // AUTH LOGIN
        '334 UGFzc3dvcmQ6',                         // username accepted
        '235 2.7.0 Authentication successful',      // password accepted
        '250 2.1.0 Ok',                             // MAIL FROM
        '250 2.1.5 Ok',                             // RCPT TO
        '354 End data with <CR><LF>.<CR><LF>',      // DATA
        '250 2.0.0 Ok: queued',                     // final dot — message accepted
    ];
    const { actions, result } = driveMachine(m, replies);
    ok('happy: first action sends EHLO', actions[0] && actions[0].send === 'EHLO localhost');
    ok('happy: result ok', result && result.ok === true);
    ok('happy: code SEND_OK_TEST_EMAIL', result && result.code === SEND_OK_TEST_EMAIL);
    ok('happy: sent_count 1', result && result.sent_count === 1);
    // last meaningful action sends QUIT and finishes
    const last = actions[actions.length - 1];
    ok('happy: QUIT sent on accept', last && last.send === 'QUIT' && last.done && last.done.code === SEND_OK_TEST_EMAIL);
}

// ---------------------------------------------------------------------------
// 2) BUG REPRODUCTION — 250 after EHLO must NOT be treated as an error
// ---------------------------------------------------------------------------
console.log('[2] bug reproduction: 250 after EHLO accepted (never expect 220)');
{
    const m = createSmtpStateMachine({ user: TEST_USER, pass: TEST_PASS, from: TEST_FROM, to: TEST_TO, message: MESSAGE });
    // greeting 220, then EHLO returns 250 (single-line). The buggy code expected 220 here.
    const a0 = m.onResponse(parseSmtpResponse('220 ready'));
    ok('bug: greeting -> EHLO', a0 && a0.send === 'EHLO localhost');
    const a1 = m.onResponse(parseSmtpResponse('250 smtp.yandex.ru'));
    // Must NOT fail; must proceed to AUTH LOGIN.
    ok('bug: 250 after EHLO accepted (no done error)', a1 && a1.done === undefined);
    ok('bug: proceeds to AUTH LOGIN', a1 && a1.send === 'AUTH LOGIN');
    ok('bug: did NOT produce unexpected-220 error', !(a1 && a1.done && /ожидался 220/.test(a1.done.message || '')));
}

// Simulate the *old buggy contract* explicitly: if a machine expected 220 after
// EHLO it would fail. Our machine must report EHLO stage errors only for truly
// bad codes (e.g. 500), and never demand 220.
{
    const m = createSmtpStateMachine({ user: TEST_USER, pass: TEST_PASS, from: TEST_FROM, to: TEST_TO, message: MESSAGE });
    m.onResponse(parseSmtpResponse('220 ready'));
    const bad = m.onResponse(parseSmtpResponse('500 command not recognized'));
    ok('bug: real EHLO failure => SMTP_EHLO_FAILED', bad && bad.done && bad.done.stage === SMTP_EHLO_FAILED);
    ok('bug: EHLO failure expected code is 250 not 220', bad && /ожидался 250/.test(bad.done.message));
}

// ---------------------------------------------------------------------------
// 3) MULTILINE PARSER — 250- continuation + final 250 ends response
// ---------------------------------------------------------------------------
console.log('[3] multiline parser');
{
    const r1 = parseSmtpResponse('250-smtp.yandex.ru\r\n250-AUTH LOGIN PLAIN\r\n250 SIZE 42949672960');
    ok('multiline: code from final line = 250', r1.code === 250);
    ok('multiline: 3 lines parsed', r1.lines.length === 3);

    // Streaming reader: should emit exactly ONE response for a multiline reply,
    // and NOT mix it with the next command's reply.
    const emitted = [];
    const reader = createSmtpResponseReader((resp) => emitted.push(resp));
    reader.push('250-line one\r\n');
    reader.push('250-line two\r\n');
    ok('multiline: no emit until final line', emitted.length === 0);
    reader.push('250 final\r\n');
    ok('multiline: exactly one response after final', emitted.length === 1 && emitted[0].code === 250);
    // Next command reply must be a separate response.
    reader.push('334 VXNlcm5hbWU6\r\n');
    ok('multiline: next reply is separate', emitted.length === 2 && emitted[1].code === 334);
    ok('multiline: replies not mixed', emitted[0].lines.length === 3 && emitted[1].lines.length === 1);
}

// ---------------------------------------------------------------------------
// 4) SAFETY — no secrets leak; recipient guard; autosend/mass blocked
// ---------------------------------------------------------------------------
console.log('[4] safety');
{
    // Capture all machine output text for the happy path and scan for secrets.
    const m = createSmtpStateMachine({ user: TEST_USER, pass: TEST_PASS, from: TEST_FROM, to: TEST_TO, message: MESSAGE });
    const replies = [
        '220 ready',
        '250 ok',
        '334 a', '334 b', '235 ok', '250 ok', '250 ok', '354 go', '250 queued',
    ];
    const { actions, result } = driveMachine(m, replies);
    const blob = JSON.stringify({ actions, result });
    ok('safety: password value NOT in machine output', !blob.includes(TEST_PASS));
    ok('safety: raw login value NOT in result', !JSON.stringify(result).includes(TEST_USER));
    // base64 of credentials is sent as command payload (expected); the plaintext must not appear.
    ok('safety: plaintext password never sent as a command line', !actions.some(a => a.send === TEST_PASS));

    // An error result must carry stage + codes only, never secret values.
    const m2 = createSmtpStateMachine({ user: TEST_USER, pass: TEST_PASS, from: TEST_FROM, to: TEST_TO, message: MESSAGE });
    m2.onResponse(parseSmtpResponse('220 ready'));
    m2.onResponse(parseSmtpResponse('250 ok'));      // EHLO
    m2.onResponse(parseSmtpResponse('250 ok'));      // AUTH LOGIN -> wrong (needs 334)
    // last call returns auth-start failure
    const authErr = m2.onResponse(parseSmtpResponse('334 a'));
    // Build an explicit failing case for AUTH PASS to inspect message text.
    const m3 = createSmtpStateMachine({ user: TEST_USER, pass: TEST_PASS, from: TEST_FROM, to: TEST_TO, message: MESSAGE });
    m3.onResponse(parseSmtpResponse('220 ready'));
    m3.onResponse(parseSmtpResponse('250 ok'));        // EHLO ok
    m3.onResponse(parseSmtpResponse('334 a'));         // AUTH LOGIN ok
    m3.onResponse(parseSmtpResponse('334 b'));         // username ok
    const passErr = m3.onResponse(parseSmtpResponse('535 auth failed')); // password rejected
    ok('safety: auth pass error has stage + no password', passErr && passErr.done && !String(passErr.done.message).includes(TEST_PASS));
}

// Async guard tests against the real send entrypoint (these exit BEFORE any
// network because guards fail first — no env / no live approval here).
console.log('[4b] send entrypoint guards (no network reached)');
{
    const baseEnv = { EMAIL_TEST_TO: TEST_TO };
    const blockedMass = await sendApprovedSelfTestEmail({ to: [TEST_TO] }, { env: baseEnv, mass_send: true });
    ok('guard: mass send blocked', blockedMass.code === SEND_BLOCKED_MASS_SEND);

    const blockedAuto = await sendApprovedSelfTestEmail({ to: TEST_TO }, { env: baseEnv, autosend: true });
    ok('guard: autosend blocked', blockedAuto.code === SEND_BLOCKED_AUTOSEND);

    // recipient != EMAIL_TEST_TO must be blocked (owner-approved, test_only).
    const blockedRcpt = await sendApprovedSelfTestEmail(
        { to: 'someone-else@example.test' },
        { env: baseEnv, owner_confirmed: true, approved_by: 'Dmitry', test_only: true },
    );
    ok('guard: non-test recipient blocked', blockedRcpt.code === SEND_BLOCKED_TEST_ONLY_RECIPIENT);
}

// ---------------------------------------------------------------------------
// 5) STARTTLS / 465 + freeze invariants
// ---------------------------------------------------------------------------
console.log('[5] invariants');
{
    // The state machine command sequence must NEVER contain STARTTLS.
    const m = createSmtpStateMachine({ user: TEST_USER, pass: TEST_PASS, from: TEST_FROM, to: TEST_TO, message: MESSAGE });
    const sent = [];
    m.onResponse(parseSmtpResponse('220 ready'));
    let r = { send: 'EHLO localhost' };
    // Walk the full happy path collecting all sent commands.
    const replies = ['250 ok', '334 a', '334 b', '235 ok', '250 ok', '250 ok', '354 go', '250 queued'];
    sent.push('EHLO localhost');
    for (const rep of replies) {
        const a = m.onResponse(parseSmtpResponse(rep));
        if (a.send) sent.push(a.send);
        if (a.done) break;
    }
    ok('invariant: no STARTTLS issued on 465', !sent.some(c => /STARTTLS/i.test(c)));
    ok('invariant: QUIT present', sent.includes('QUIT'));
    ok('invariant: D3C freeze ACTIVE', D3C_FREEZE === 'ACTIVE');
}

console.log('---------------------------------------------');
console.log(`PASS: ${pass} | FAIL: ${fail}`);
if (fail > 0) {
    console.log('FAILED: ' + fails.join(', '));
    process.exit(1);
}
console.log('OVERALL: GREEN — SMTP state machine fixed; 250-after-EHLO accepted; multiline OK; no secrets leaked.');
