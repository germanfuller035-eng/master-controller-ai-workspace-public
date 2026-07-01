// ============================================================================
// MAIL-FINAL-1 — telegram_mail_final_selftest_test.mjs
//
// Offline test for the approved self-test email path. NEVER performs a real
// network send: it only exercises the pure safety gates and the env loader.
//
// Asserts:
//   - env loader hydrates YANDEX_* from a fixture (presence only, no values)
//   - alias bridge -> configured YES when YANDEX_*/EMAIL_TEST_TO present
//   - real_send_enabled=false blocks send
//   - real_send_enabled=true + test_only + recipient===EMAIL_TEST_TO allows
//     canSendLive() (the only fully-open gate)
//   - recipient != EMAIL_TEST_TO is blocked
//   - mass send / autosend always blocked
//   - legacy live-send script remains HIGH_RISK_FROZEN (never invoked)
//   - D3C freeze stays ACTIVE
//   - secrets never appear in stdout/report
// ============================================================================

import assert from 'node:assert/strict';
import {
    canSendLive,
    sendEmailViaApprovedTransport,
    buildEmailConfigPresenceFromAliases,
    buildYandexAliasPreflightReport,
    CONFIGURED_YES,
    SEND_BLOCKED_REAL_SEND_DISABLED,
    SEND_BLOCKED_TEST_ONLY_RECIPIENT,
    SEND_BLOCKED_MASS_SEND,
    SEND_BLOCKED_AUTOSEND,
    LEGACY_LIVE_SEND_STATUS,
    D3C_FREEZE,
    REAL_SEND_ENABLED,
} from '../telegram_gateway/telegram_approved_email_send_adapter.mjs';

let pass = 0;
let fail = 0;
const log = [];
const ok = (name) => { pass += 1; log.push(`PASS ${name}`); };
const bad = (name, e) => { fail += 1; log.push(`FAIL ${name}: ${e && e.message ? e.message : e}`); };
function test(name, fn) { try { fn(); ok(name); } catch (e) { bad(name, e); } }

// ---- Secret-free fixture env (placeholder values, never real creds) --------
const SECRET_LOGIN = 'fixture-login@yandex.ru';
const SECRET_PASS = 'fixture-app-password-xxxx';
const TEST_TO = 'owner-self@yandex.ru';
const fixtureEnv = {
    YANDEX_MAIL_LOGIN: SECRET_LOGIN,
    YANDEX_MAIL_APP_PASSWORD: SECRET_PASS,
    EMAIL_TEST_TO: TEST_TO,
    EMAIL_TEST_ONLY: 'true',
    EMAIL_REAL_SEND_ENABLED: 'false',
    EMAIL_PROVIDER: 'yandex',
    EMAIL_SMTP_HOST: 'smtp.yandex.com',
    EMAIL_SMTP_PORT: '465',
    EMAIL_SMTP_SECURE: 'true',
    EMAIL_FROM: SECRET_LOGIN,
};

// 1) Env loader / alias bridge sees YANDEX_* from fixture -> configured YES.
test('alias bridge -> configured YES with YANDEX_* + EMAIL_TEST_TO', () => {
    const res = buildEmailConfigPresenceFromAliases(fixtureEnv);
    assert.equal(res.configured, CONFIGURED_YES, 'expected configured YES');
    assert.equal(res.yandex_alias_detected, true, 'expected yandex alias detected');
});

// 2) Preflight report is presence-only (no secret values).
test('preflight report contains no secret values', () => {
    const res = buildEmailConfigPresenceFromAliases(fixtureEnv);
    const report = buildYandexAliasPreflightReport(res);
    const text = JSON.stringify(res) + '\n' + String(report);
    assert.ok(!text.includes(SECRET_LOGIN), 'login leaked');
    assert.ok(!text.includes(SECRET_PASS), 'password leaked');
});

// 3) real_send_enabled=false blocks the send.
test('real_send_enabled=false blocks send', () => {
    const r = sendEmailViaApprovedTransport(
        { to: TEST_TO, subject: 's', body: 'b' },
        {
            env: fixtureEnv,
            owner_confirmed: true,
            approved_by: 'Dmitry',
            test_only: true,
            real_send_enabled: false,
        },
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, SEND_BLOCKED_REAL_SEND_DISABLED);
});

// 4) real_send_enabled=true + test_only + recipient===EMAIL_TEST_TO => canSendLive true.
test('canSendLive=true only for fully-approved test-only self-test', () => {
    const ctx = {
        env: fixtureEnv,
        live_send_allowed: true,
        real_send_enabled: true,
        test_only: true,
        owner_confirmed: true,
        approved_by: 'Dmitry',
    };
    assert.equal(canSendLive({ to: TEST_TO }, ctx), true);
});

// 5) recipient != EMAIL_TEST_TO is blocked.
test('recipient != EMAIL_TEST_TO blocked', () => {
    const ctx = {
        env: fixtureEnv,
        live_send_allowed: true,
        real_send_enabled: true,
        test_only: true,
        owner_confirmed: true,
        approved_by: 'Dmitry',
    };
    assert.equal(canSendLive({ to: 'someone-else@example.com' }, ctx), false);

    const r = sendEmailViaApprovedTransport(
        { to: 'someone-else@example.com' },
        {
            env: fixtureEnv,
            owner_confirmed: true,
            approved_by: 'Dmitry',
            test_only: true,
            real_send_enabled: true,
        },
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, SEND_BLOCKED_TEST_ONLY_RECIPIENT);
});

// 6) mass send blocked.
test('mass send blocked', () => {
    const r = sendEmailViaApprovedTransport(
        { to: [TEST_TO, 'x@y.z'] },
        { env: fixtureEnv, owner_confirmed: true, approved_by: 'Dmitry', mass_send: true },
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, SEND_BLOCKED_MASS_SEND);
});

// 7) autosend blocked.
test('autosend blocked', () => {
    const r = sendEmailViaApprovedTransport(
        { to: TEST_TO },
        { env: fixtureEnv, owner_confirmed: true, approved_by: 'Dmitry', autosend: true },
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, SEND_BLOCKED_AUTOSEND);
});

// 8) Legacy live-send script remains frozen / never invoked.
test('legacy live-send script HIGH_RISK_FROZEN', () => {
    assert.equal(LEGACY_LIVE_SEND_STATUS, 'HIGH_RISK_FROZEN');
});

// 9) D3C freeze active.
test('D3C freeze ACTIVE', () => {
    assert.equal(D3C_FREEZE, 'ACTIVE');
});

// 10) Default build-time REAL_SEND_ENABLED constant stays false (no autosend default).
test('REAL_SEND_ENABLED build constant is false', () => {
    assert.equal(REAL_SEND_ENABLED, false);
});

// 11) No live network call without ctx.live_smtp_send (pure seam stays inert).
test('no live network without live_smtp_send', () => {
    const r = sendEmailViaApprovedTransport(
        { to: TEST_TO },
        {
            env: fixtureEnv,
            owner_confirmed: true,
            approved_by: 'Dmitry',
            test_only: true,
            real_send_enabled: true,
            live_send_allowed: true,
            // live_smtp_send intentionally omitted
        },
    );
    // Either gated to not-implemented or blocked; must NOT be ok.
    assert.equal(r.ok, false);
});

// ---- summary ---------------------------------------------------------------
const summary = `\nMAIL-FINAL-1 self-test: ${pass} passed, ${fail} failed`;
// Final secret-leak guard over the entire emitted log.
const fullLog = log.join('\n') + summary;
if (fullLog.includes(SECRET_LOGIN) || fullLog.includes(SECRET_PASS)) {
    console.error('SECRET LEAK DETECTED IN TEST OUTPUT');
    process.exit(2);
}
console.log(fullLog);
process.exit(fail === 0 ? 0 : 1);
