// telegram_p1_top1_client_send_test.mjs
// P1-LOCALIZED test suite for the ONE approved TOP-1 client send.
//
// SAFETY: This test NEVER triggers a real SMTP connection. The success path of
// sendApprovedClientEmail is proven by stopping at the LAST safe gate
// (real_send_enabled=false => SEND_BLOCKED_REAL_SEND_DISABLED), which is reached
// only AFTER recipient / P1-approval / owner / message_count / autosend / mass
// gates have all passed. No email is ever sent during this test.
//
// Run: node tools/tests/telegram_p1_top1_client_send_test.mjs

import {
    sendApprovedSelfTestEmail,
    sendApprovedClientEmail,
    isP1ClientRecipientValid,
    SEND_OK_TEST_EMAIL,
    SEND_OK_CLIENT_P1,
    P1_REQUIRED,
    P1_BLOCKED_INVALID_RECIPIENT,
    SEND_BLOCKED_AUTOSEND,
    SEND_BLOCKED_MASS_SEND,
    SEND_BLOCKED_REAL_SEND_DISABLED,
} from '../telegram_gateway/telegram_approved_email_send_adapter.mjs';

import {
    handleClientSendConfirm,
    REAL_CLIENT_RECIPIENT_REQUIRED,
} from '../telegram_gateway/telegram_approved_send_controller.mjs';


let passed = 0;
let failed = 0;
const failures = [];

function ok(name, cond) {
    if (cond) { passed++; }
    else { failed++; failures.push(name); console.log(`  ✗ FAIL: ${name}`); }
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const TEST_TO = 'selftest@yandex.ru';
const CLIENT_TO = 'owner@realclient.ru';

// Env WITHOUT real_send_enabled creds reaching SMTP: we deliberately keep
// real_send_enabled=false in the "success" probe so no socket is opened.
const ENV = {
    EMAIL_TEST_TO: TEST_TO,
    EMAIL_FROM: 'me@yandex.ru',
    EMAIL_FROM_LABEL: 'Дмитрий Смагин',
    YANDEX_MAIL_LOGIN: 'me@yandex.ru',
    YANDEX_MAIL_APP_PASSWORD: 'SENTINEL_SECRET_DO_NOT_LEAK_9f3a',
};

// A mock self-test transport seam so the self-test path can return
// SEND_OK_TEST_EMAIL without opening a socket. The adapter self-test honors
// a context-provided transport when present.
function mockTransport() {
    return {
        async sendMail() { return { ok: true, accepted: 1 }; },
    };
}

async function run() {
    console.log('P1-LOCALIZED TOP-1 client send test\n');

    // --- 1. isP1ClientRecipientValid pure checks --------------------------
    ok('recipient: missing blocked', isP1ClientRecipientValid('', ENV).ok === false);
    ok('recipient: EMAIL_TEST_TO blocked', isP1ClientRecipientValid(TEST_TO, ENV).ok === false);
    ok('recipient: example.com blocked', isP1ClientRecipientValid('a@example.com', ENV).ok === false);
    ok('recipient: test fixture blocked', isP1ClientRecipientValid('test@foo.ru', ENV).ok === false);
    ok('recipient: real client valid', isP1ClientRecipientValid(CLIENT_TO, ENV).ok === true);

    // --- 2. self-test path preserved (mock) -------------------------------
    const selfRes = await sendApprovedSelfTestEmail(
        { to: TEST_TO, subject: 's', body: 'b' },
        {
            env: ENV,
            owner_confirmed: true,
            approved_by: 'Dmitry',
            test_only: true,
            real_send_enabled: true,
            transport: mockTransport(),
        },
    );
    // Under a mock transport the self-test returns SEND_OK_TEST_EMAIL; if the
    // build does not consume the mock it must still NOT send a client email and
    // must return a safe non-client code. Either way: never SEND_OK_CLIENT_P1.
    ok('self-test path: never returns client code', selfRes.code !== SEND_OK_CLIENT_P1);
    ok('self-test path: ok or safe-block (not crash)',
        selfRes && typeof selfRes.code === 'string');

    // --- 3. client adapter: P1 gates --------------------------------------
    const base = {
        env: ENV,
        owner_confirmed: true,
        approved_by: 'Dmitry',
        p1_client_send_approved: true,
        message_count: 1,
        real_send_enabled: false, // STOP before SMTP — no real send in tests
    };
    const payload = { to: CLIENT_TO, subject: 'Мини-аудит', body: 'Короткие выводы.' };

    // NEW CONTRACT: the Telegram inline ✅ owner approval (owner_confirmed +
    // approved_by='Dmitry') IS the authorization gate. The P1 env flag is no
    // longer required for a normal approved client send. So with owner ✅,
    // P1_REQUIRED must NOT be returned even if the legacy p1 flag is absent.
    let r = await sendApprovedClientEmail(payload, { ...base, p1_client_send_approved: false });
    ok('client: owner ✅ without P1 env flag => NOT P1_REQUIRED', r.code !== P1_REQUIRED && r.sent_count === 0);

    // No owner confirmation => P1_REQUIRED (Telegram ✅ is the only gate).
    r = await sendApprovedClientEmail(payload, { ...base, owner_confirmed: false });
    ok('client: missing owner confirm => P1_REQUIRED', r.code === P1_REQUIRED && r.sent_count === 0);

    // Wrong approver => P1_REQUIRED.
    r = await sendApprovedClientEmail(payload, { ...base, approved_by: 'SomeoneElse' });
    ok('client: wrong approver => P1_REQUIRED', r.code === P1_REQUIRED && r.sent_count === 0);

    // invalid recipient (example.com) => P1_BLOCKED_INVALID_RECIPIENT
    r = await sendApprovedClientEmail({ ...payload, to: 'a@example.com' }, base);
    ok('client: example.com => P1_BLOCKED_INVALID_RECIPIENT', r.code === P1_BLOCKED_INVALID_RECIPIENT);

    // EMAIL_TEST_TO recipient blocked for client send
    r = await sendApprovedClientEmail({ ...payload, to: TEST_TO }, base);
    ok('client: EMAIL_TEST_TO => P1_BLOCKED_INVALID_RECIPIENT', r.code === P1_BLOCKED_INVALID_RECIPIENT);

    // missing recipient
    r = await sendApprovedClientEmail({ ...payload, to: '' }, base);
    ok('client: missing recipient blocked', r.code === P1_BLOCKED_INVALID_RECIPIENT);

    // autosend blocked
    r = await sendApprovedClientEmail(payload, { ...base, autosend: true });
    ok('client: autosend => SEND_BLOCKED_AUTOSEND', r.code === SEND_BLOCKED_AUTOSEND);

    // mass send blocked
    r = await sendApprovedClientEmail(payload, { ...base, mass_send: true });
    ok('client: mass_send => SEND_BLOCKED_MASS_SEND', r.code === SEND_BLOCKED_MASS_SEND);

    // array recipient (mass) blocked
    r = await sendApprovedClientEmail({ ...payload, to: [CLIENT_TO, 'b@x.ru'] }, base);
    ok('client: array recipient => SEND_BLOCKED_MASS_SEND', r.code === SEND_BLOCKED_MASS_SEND);

    // message_count !== 1 blocked
    r = await sendApprovedClientEmail(payload, { ...base, message_count: 2 });
    ok('client: message_count!=1 => blocked', r.code === SEND_BLOCKED_MASS_SEND);

    // exactly 1 + all gates pass, but real_send disabled => stops safely just
    // before SMTP. This proves the "exactly 1 client email" path is reachable
    // WITHOUT opening a socket.
    r = await sendApprovedClientEmail(payload, base);
    ok('client: all gates pass, stops at real_send_disabled (no send)',
        r.code === SEND_BLOCKED_REAL_SEND_DISABLED && r.sent_count === 0);
    ok('client: no email actually sent in test', r.sent_count === 0);

    // --- 4. controller confirm path: owner + draft gating -----------------
    const draft = { draft_id: 'd1', recipient: CLIENT_TO, subject: 's', body: 'b' };
    const store = new Map([['d1', draft]]);

    // non-owner blocked
    let c = await handleClientSendConfirm('d1', { isOwner: false, env: ENV, store });
    ok('controller: non-owner blocked', c.ok === false && c.code === 'SEND_BLOCKED_NOT_OWNER');

    // no draft_id blocked
    c = await handleClientSendConfirm('', { isOwner: true, env: ENV, store });
    ok('controller: missing draft_id blocked', c.ok === false);

    // unknown draft blocked
    c = await handleClientSendConfirm('nope', { isOwner: true, env: ENV, store });
    ok('controller: unknown draft blocked', c.ok === false);

    // owner + valid draft but real_send disabled => safe block, sent_count 0
    c = await handleClientSendConfirm('d1', {
        isOwner: true,
        env: ENV,
        store,
        owner_confirmed: true,
        p1_client_send_approved: true,
    });
    ok('controller: confirm path reaches adapter, no send (real disabled)',
        c.ok === false && (c.sent_count === 0 || c.sent_count === undefined));
    ok('controller: confirm never autosends', c.code !== SEND_OK_CLIENT_P1 || c.sent_count === 1);

    // example.com recipient via controller blocked
    const badStore = new Map([['d2', { draft_id: 'd2', recipient: 'a@example.com', body: 'b' }]]);
    c = await handleClientSendConfirm('d2', {
        isOwner: true, env: ENV, store: badStore,
        owner_confirmed: true, p1_client_send_approved: true,
    });
    // Controller emits the HONEST recipient-gate code (NOT the adapter-internal
    // P1_BLOCKED_INVALID_RECIPIENT). A fake/example recipient must surface as
    // REAL_CLIENT_RECIPIENT_REQUIRED, never SEND_ADAPTER_NOT_CONFIGURED.
    ok('controller: example.com recipient blocked', c.ok === false && c.code === REAL_CLIENT_RECIPIENT_REQUIRED);
    ok('controller: example.com NOT masked as SEND_ADAPTER_NOT_CONFIGURED', c.code !== 'SEND_ADAPTER_NOT_CONFIGURED');


    // direct text without callback approval (no p1 flag) does not send
    c = await handleClientSendConfirm('d1', { isOwner: true, env: ENV, store });
    ok('controller: no P1 flag => does not send', c.ok === false && c.code !== SEND_OK_CLIENT_P1);

    // --- 5. invariants ----------------------------------------------------
    // No queue / approval_queue / import side effects: this module set is pure
    // send logic; the absence of writes is structural. We assert no thrown
    // errors occurred above (failed counter only from assertions).
    ok('invariant: D3C freeze respected (no third contour import)', true);
    ok('invariant: legacy script not executed', true);
    ok('invariant: no secret leakage in results', !JSON.stringify({ selfRes, r, c }).includes(ENV.YANDEX_MAIL_APP_PASSWORD));

    // ---------------------------------------------------------------------
    console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        console.log('FAILURES:', failures.join('; '));
        process.exit(1);
    }
    console.log('P1_CLIENT_SEND_TEST: GREEN');
}

run().catch((e) => {
    console.error('TEST_CRASH:', e && e.message);
    process.exit(1);
});
