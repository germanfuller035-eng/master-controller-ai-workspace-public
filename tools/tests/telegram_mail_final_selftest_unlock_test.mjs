// telegram_mail_final_selftest_unlock_test.mjs
// MAIL-FINAL-2 — offline unlock test for owner-only /email_test_self.
//
// HARD SAFETY CONTRACT (offline test):
//   - NO real network send. The only "send" path exercised uses a wired
//     mockTransport that NEVER touches the network.
//   - NO process.env / dotenv / AI secret read. All env is a fake object below
//     with placeholder NON-SECRET values.
//   - NO 13_sales write, NO approval_queue write, NO legacy script execution.
//   - Asserts client send stays BLOCKED, autosend BLOCKED, mass_send BLOCKED.
//   - Asserts D3C freeze remains ACTIVE.
//
// Verifies:
//   - preflight real_send_enabled YES when EMAIL_REAL_SEND_ENABLED=true
//   - preflight can_send_live YES for self-test when test_only + EMAIL_TEST_TO present
//   - /email_test_self no longer returns offline "safe block" when env ready
//   - /email_test_self builds exactly one SMTP message (single recipient)
//   - recipient must equal EMAIL_TEST_TO; mismatch blocked
//   - EMAIL_REAL_SEND_ENABLED=false blocked
//   - EMAIL_TEST_ONLY=false blocked
//   - non-owner blocked
//   - draft/client send still blocked
//   - autosend blocked / mass_send blocked
//   - no secret leakage in any returned text

import {
    handleEmailPreflightCommand,
    handleEmailTestSelfCommand,
    handleDraftConfirm,
    SEND_BLOCKED_NOT_OWNER,
} from '../telegram_gateway/telegram_approved_send_controller.mjs';

import {
    canSendLive,
    sendEmailViaApprovedTransport,
    sendApprovedEmail,
    D3C_FREEZE,
    SEND_OK_MOCK_BRIDGE,
    SEND_BLOCKED_REAL_SEND_DISABLED,
    SEND_BLOCKED_TEST_ONLY_RECIPIENT,
    SEND_BLOCKED_MASS_SEND,
    SEND_BLOCKED_AUTOSEND,
    SEND_OK_TEST_EMAIL,
} from '../telegram_gateway/telegram_approved_email_send_adapter.mjs';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond) {
    if (cond) { pass += 1; console.log(`  ok   - ${name}`); }
    else { fail += 1; failures.push(name); console.log(`  FAIL - ${name}`); }
}

// ---------------------------------------------------------------------------
// Fake env. NON-SECRET placeholders only. EMAIL_TEST_TO is Dmitry-owned slot.
// ---------------------------------------------------------------------------
const TEST_TO = 'owner-self-test@example.com';
const envReady = {
    YANDEX_MAIL_LOGIN: 'placeholder-login',          // placeholder, not a real secret
    YANDEX_MAIL_APP_PASSWORD: 'placeholder-password', // placeholder, not a real secret
    EMAIL_TEST_TO: TEST_TO,
    EMAIL_REAL_SEND_ENABLED: 'true',
    EMAIL_TEST_ONLY: 'true',
    EMAIL_FROM: 'placeholder-login',
    EMAIL_FROM_LABEL: 'Дмитрий Смагин',
};

// Mock transport: counts sends, NEVER touches the network.
function makeMockTransport() {
    const state = { count: 0, recipients: [] };
    return {
        state,
        send(payload) {
            state.count += 1;
            state.recipients.push(payload && payload.to);
            return { delivered: true, to: payload && payload.to };
        },
    };
}

// Guard: no secret value should appear in returned text.
function noSecretLeak(obj) {
    const s = JSON.stringify(obj || {});
    return !s.includes('placeholder-password');
}

console.log('=== MAIL-FINAL-2 self-test unlock test (offline, no network) ===');

// ---------------------------------------------------------------------------
// 1) PREFLIGHT: real_send_enabled YES, can_send_live YES (self-test).
// ---------------------------------------------------------------------------
{
    const r = handleEmailPreflightCommand({ isOwner: true, env: envReady });
    check('preflight real_send_enabled YES when EMAIL_REAL_SEND_ENABLED=true', r.real_send_enabled === true);
    check('preflight test_only YES', r.test_only === true);
    check('preflight test recipient present', r.test_recipient_present === true);
    check('preflight can_send_live YES for self-test', r.can_send_live === true);
    check('preflight client_send_enabled stays false', r.client_send_enabled === false);
    check('preflight email_sent false', r.email_sent === false);
    check('preflight no secret leak', noSecretLeak(r));
}

// PREFLIGHT real_send_enabled false when flag off.
{
    const r = handleEmailPreflightCommand({ isOwner: true, env: { ...envReady, EMAIL_REAL_SEND_ENABLED: 'false' } });
    check('preflight real_send_enabled NO when flag false', r.real_send_enabled === false);
    check('preflight can_send_live NO when real send off', r.can_send_live === false);
}

// ---------------------------------------------------------------------------
// 2) /email_test_self with mockTransport (offline) — exactly ONE message,
//    recipient === EMAIL_TEST_TO, no offline safe block.
// ---------------------------------------------------------------------------
{
    const mock = makeMockTransport();
    const r = await handleEmailTestSelfCommand({ isOwner: true, env: envReady, mockTransport: mock, test_only: true });
    check('/email_test_self mock returns SEND_OK_MOCK (not offline safe block)', r.code === SEND_OK_MOCK_BRIDGE);
    check('/email_test_self builds exactly one message', mock.state.count === 1);
    check('/email_test_self recipient equals EMAIL_TEST_TO', mock.state.recipients[0] === TEST_TO);
    check('/email_test_self text not old offline safe block', !/safe block \(offline\)/i.test(r.text || ''));
    check('/email_test_self no secret leak', noSecretLeak(r));
}

// ---------------------------------------------------------------------------
// 3) /email_test_self blocked when EMAIL_REAL_SEND_ENABLED=false (no mock).
// ---------------------------------------------------------------------------
{
    const r = await handleEmailTestSelfCommand({ isOwner: true, env: { ...envReady, EMAIL_REAL_SEND_ENABLED: 'false' } });
    check('/email_test_self blocked when real send disabled', r.code === SEND_BLOCKED_REAL_SEND_DISABLED && r.ok === false);
}

// ---------------------------------------------------------------------------
// 4) non-owner blocked.
// ---------------------------------------------------------------------------
{
    const r = await handleEmailTestSelfCommand({ isOwner: false, env: envReady });
    check('/email_test_self non-owner blocked', r.code === SEND_BLOCKED_NOT_OWNER && r.ok === false);
}

// ---------------------------------------------------------------------------
// 5) canSendLive guard — only true when ALL conditions hold.
// ---------------------------------------------------------------------------
{
    const okCtx = {
        env: envReady, live_send_allowed: true, real_send_enabled: true,
        test_only: true, owner_confirmed: true, approved_by: 'Dmitry',
    };
    check('canSendLive true when all conditions hold', canSendLive({ to: TEST_TO }, okCtx) === true);

    // recipient mismatch
    check('canSendLive false on recipient mismatch', canSendLive({ to: 'other@example.com' }, okCtx) === false);
    // real_send_enabled false
    check('canSendLive false when real_send_enabled false', canSendLive({ to: TEST_TO }, { ...okCtx, real_send_enabled: false }) === false);
    // test_only false
    check('canSendLive false when test_only false', canSendLive({ to: TEST_TO }, { ...okCtx, test_only: false }) === false);
    // autosend true
    check('canSendLive false when autosend true', canSendLive({ to: TEST_TO }, { ...okCtx, autosend: true }) === false);
    // mass_send true
    check('canSendLive false when mass_send true', canSendLive({ to: TEST_TO }, { ...okCtx, mass_send: true }) === false);
    // owner not confirmed
    check('canSendLive false when owner not confirmed', canSendLive({ to: TEST_TO }, { ...okCtx, owner_confirmed: false }) === false);
}

// ---------------------------------------------------------------------------
// 6) sendEmailViaApprovedTransport seam — recipient guard + autosend/mass.
// ---------------------------------------------------------------------------
{
    // test-only recipient mismatch blocked
    const r1 = sendEmailViaApprovedTransport({ to: 'other@example.com' }, {
        env: envReady, test_only: true, owner_confirmed: true, approved_by: 'Dmitry',
        real_send_enabled: true,
    });
    check('seam blocks recipient != EMAIL_TEST_TO', r1.code === SEND_BLOCKED_TEST_ONLY_RECIPIENT);

    // autosend blocked
    const r2 = sendEmailViaApprovedTransport({ to: TEST_TO }, { env: envReady, autosend: true });
    check('seam blocks autosend', r2.code === SEND_BLOCKED_AUTOSEND);

    // mass_send blocked
    const r3 = sendEmailViaApprovedTransport({ to: TEST_TO }, { env: envReady, mass_send: true });
    check('seam blocks mass_send', r3.code === SEND_BLOCKED_MASS_SEND);

    // array recipient (mass) blocked
    const r4 = sendEmailViaApprovedTransport({ to: [TEST_TO, 'b@example.com'] }, { env: envReady });
    check('seam blocks array recipient (mass send)', r4.code === SEND_BLOCKED_MASS_SEND);
}

// ---------------------------------------------------------------------------
// 7) Client draft confirm still BLOCKED (no client send).
// ---------------------------------------------------------------------------
{
    const r = handleDraftConfirm('draft-xyz', { isOwner: true });
    // Must NOT be a successful client send. Either blocked code or ok=false.
    const blocked = r.ok !== true || (r.code && /BLOCK|P1|REQUIRED|NOT/i.test(r.code));
    check('client draft confirm still blocked / not auto client send', blocked);
    check('client draft confirm no secret leak', noSecretLeak(r));
}

// ---------------------------------------------------------------------------
// 8) Legacy mock adapter sendApprovedEmail: autosend + mass blocked.
// ---------------------------------------------------------------------------
{
    const r1 = sendApprovedEmail({ to: TEST_TO }, { autosend: true });
    check('legacy adapter blocks autosend', r1.code === SEND_BLOCKED_AUTOSEND);
    const r2 = sendApprovedEmail({ to: [TEST_TO] }, {});
    check('legacy adapter blocks mass send', r2.code === SEND_BLOCKED_MASS_SEND);
}

// ---------------------------------------------------------------------------
// 9) D3C freeze remains ACTIVE.
// ---------------------------------------------------------------------------
check('D3C freeze ACTIVE', D3C_FREEZE === 'ACTIVE');

// ---------------------------------------------------------------------------
// 10) SEND_OK_TEST_EMAIL code exists (live path constant present, not invoked).
// ---------------------------------------------------------------------------
check('live SMTP success code constant present', SEND_OK_TEST_EMAIL === 'SEND_OK_TEST_EMAIL');

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
if (fail > 0) {
    console.log('Failures:\n' + failures.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
}
console.log('ALL GREEN — MAIL-FINAL-2 self-test unlock verified (offline, no network, no secret leak).');
process.exit(0);
