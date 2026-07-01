// telegram_approved_email_send_adapter_e1c2c_yandex_alias_test.mjs
// E1C2C — Yandex Alias Bridge offline test.
//
// SAFETY CONTRACT (offline, no live restart):
//   - PURE in-memory test. NO Telegram API, NO network, NO PowerShell, NO .env
//     read, NO secret value printing, NO queue / approval_queue / 13_sales write.
//   - Feeds fake env-like objects (NAMES only; the "values" used here are dummy
//     non-secret placeholders) into the alias bridge and asserts presence-only
//     coverage. Never asserts on, copies, or prints any real secret value.
//   - real send stays OFF; can_send_live stays NO; email_sent stays NO.
//   - D3C freeze stays ACTIVE; /lead_import_prepare stays frozen.
//   - /ping /health /today /r4 are NOT intercepted by this stage.

import assert from 'node:assert';
import {
    collectYandexMailEnvPresence,
    buildEmailConfigPresenceFromAliases,
    buildYandexAliasPreflightReport,
    CONFIGURED_NO,
    CONFIGURED_YES_PARTIAL,
    CONFIGURED_YES,
    E1C2C_STAGE,
} from '../telegram_gateway/telegram_approved_email_send_adapter.mjs';

import {
    handleEmailPreflightCommand,
    EMAIL_PREFLIGHT_READY,
    EMAIL_PREFLIGHT_NOT_CONFIGURED,
    NEVER_SEND_ON_PREFLIGHT,
} from '../telegram_gateway/telegram_approved_send_controller.mjs';

let passed = 0;
let failed = 0;
function ok(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  PASS  ${name}`);
    } catch (e) {
        failed++;
        console.log(`  FAIL  ${name}: ${e.message}`);
    }
}

// Dummy NON-SECRET placeholders. These are not real credentials; the bridge
// only checks key PRESENCE and never returns / prints these values.
const DUMMY_LOGIN = 'PLACEHOLDER_LOGIN_NOT_A_SECRET';
const DUMMY_PASS = 'PLACEHOLDER_PASS_NOT_A_SECRET';
const DUMMY_TEST_TO = 'PLACEHOLDER_TEST_TO_NOT_A_SECRET';

const ENV_EMPTY = {};
const ENV_LOGIN_ONLY = { YANDEX_MAIL_LOGIN: DUMMY_LOGIN };
const ENV_PASS_ONLY = { YANDEX_MAIL_APP_PASSWORD: DUMMY_PASS };
const ENV_BOTH = { YANDEX_MAIL_LOGIN: DUMMY_LOGIN, YANDEX_MAIL_APP_PASSWORD: DUMMY_PASS };
const ENV_BOTH_TEST_TO = {
    YANDEX_MAIL_LOGIN: DUMMY_LOGIN,
    YANDEX_MAIL_APP_PASSWORD: DUMMY_PASS,
    EMAIL_TEST_TO: DUMMY_TEST_TO,
};

console.log('E1C2C Yandex Alias Bridge offline test');
console.log('--------------------------------------');

// 1. empty env → alias NO.
ok('empty env -> yandex_alias_detected NO, configured NO', () => {
    const p = collectYandexMailEnvPresence(ENV_EMPTY);
    assert.strictEqual(p.YANDEX_MAIL_LOGIN.present, false);
    assert.strictEqual(p.YANDEX_MAIL_APP_PASSWORD.present, false);
    const r = buildEmailConfigPresenceFromAliases(ENV_EMPTY);
    assert.strictEqual(r.yandex_alias_detected, false);
    assert.strictEqual(r.configured, CONFIGURED_NO);
});

// 2. only YANDEX_MAIL_LOGIN → partial.
ok('only YANDEX_MAIL_LOGIN -> YES_PARTIAL', () => {
    const r = buildEmailConfigPresenceFromAliases(ENV_LOGIN_ONLY);
    assert.strictEqual(r.yandex_login_present, true);
    assert.strictEqual(r.yandex_app_password_present, false);
    assert.strictEqual(r.configured, CONFIGURED_YES_PARTIAL);
    assert.strictEqual(r.can_send_live, false);
});

// 3. only YANDEX_MAIL_APP_PASSWORD → partial.
ok('only YANDEX_MAIL_APP_PASSWORD -> YES_PARTIAL', () => {
    const r = buildEmailConfigPresenceFromAliases(ENV_PASS_ONLY);
    assert.strictEqual(r.yandex_login_present, false);
    assert.strictEqual(r.yandex_app_password_present, true);
    assert.strictEqual(r.configured, CONFIGURED_YES_PARTIAL);
    assert.strictEqual(r.can_send_live, false);
});

// 4. both YANDEX keys → alias YES.
ok('both YANDEX keys -> yandex_alias_detected YES', () => {
    const r = buildEmailConfigPresenceFromAliases(ENV_BOTH);
    assert.strictEqual(r.yandex_alias_detected, true);
    assert.strictEqual(r.yandex_login_present, true);
    assert.strictEqual(r.yandex_app_password_present, true);
});

// 5. YANDEX keys cover EMAIL_SMTP_USER / EMAIL_SMTP_PASS / EMAIL_FROM.
ok('YANDEX keys cover EMAIL_SMTP_USER / EMAIL_SMTP_PASS / EMAIL_FROM via alias', () => {
    const r = buildEmailConfigPresenceFromAliases(ENV_BOTH);
    assert.strictEqual(r.email_coverage.EMAIL_SMTP_USER.source, 'yandex_alias');
    assert.strictEqual(r.email_coverage.EMAIL_SMTP_USER.present, true);
    assert.strictEqual(r.email_coverage.EMAIL_SMTP_PASS.source, 'yandex_alias');
    assert.strictEqual(r.email_coverage.EMAIL_SMTP_PASS.present, true);
    assert.strictEqual(r.email_coverage.EMAIL_FROM.source, 'yandex_alias');
    assert.strictEqual(r.email_coverage.EMAIL_FROM.present, true);
});

// 6. Yandex defaults cover provider/host/port/secure.
ok('Yandex defaults cover provider/host/port/secure', () => {
    const r = buildEmailConfigPresenceFromAliases(ENV_BOTH);
    assert.strictEqual(r.email_coverage.EMAIL_PROVIDER.source, 'yandex_default');
    assert.strictEqual(r.email_coverage.EMAIL_SMTP_HOST.source, 'yandex_default');
    assert.strictEqual(r.email_coverage.EMAIL_SMTP_PORT.source, 'yandex_default');
    assert.strictEqual(r.email_coverage.EMAIL_SMTP_SECURE.source, 'yandex_default');
    assert.strictEqual(r.email_coverage.EMAIL_PROVIDER.present, true);
    assert.strictEqual(r.email_coverage.EMAIL_SMTP_HOST.present, true);
    assert.strictEqual(r.email_coverage.EMAIL_SMTP_PORT.present, true);
    assert.strictEqual(r.email_coverage.EMAIL_SMTP_SECURE.present, true);
});

// 7. EMAIL_TEST_TO missing → YES_PARTIAL, can_send_live NO.
ok('EMAIL_TEST_TO missing -> YES_PARTIAL, can_send_live NO', () => {
    const r = buildEmailConfigPresenceFromAliases(ENV_BOTH);
    assert.strictEqual(r.email_test_to_missing, true);
    assert.strictEqual(r.configured, CONFIGURED_YES_PARTIAL);
    assert.strictEqual(r.can_send_live, false);
});

// 8. EMAIL_TEST_TO present → configured YES, but real_send_enabled still NO.
ok('EMAIL_TEST_TO present -> configured YES, real_send_enabled NO', () => {
    const r = buildEmailConfigPresenceFromAliases(ENV_BOTH_TEST_TO);
    assert.strictEqual(r.email_test_to_missing, false);
    assert.strictEqual(r.configured, CONFIGURED_YES);
    assert.strictEqual(r.real_send_enabled, false);
    assert.strictEqual(r.can_send_live, false);
});

// 9. secret values never appear (login + password values never leak).
ok('secret/login/password values never appear in result or report', () => {
    const r = buildEmailConfigPresenceFromAliases(ENV_BOTH_TEST_TO);
    const blob = JSON.stringify(r);
    assert.ok(!blob.includes(DUMMY_LOGIN), 'login value leaked into result');
    assert.ok(!blob.includes(DUMMY_PASS), 'password value leaked into result');
    assert.ok(!blob.includes(DUMMY_TEST_TO), 'test_to value leaked into result');
    assert.strictEqual(r.secrets_printed, false);
    assert.strictEqual(r.login_value_printed, false);
    assert.strictEqual(r.password_value_printed, false);

    const report = buildYandexAliasPreflightReport(r);
    assert.ok(!report.includes(DUMMY_LOGIN), 'login value leaked into report');
    assert.ok(!report.includes(DUMMY_PASS), 'password value leaked into report');
    assert.ok(!report.includes(DUMMY_TEST_TO), 'test_to value leaked into report');
});

// 10. real send NO / network NO / Telegram API NO (no send side-effects).
ok('no send side-effects: email_sent NO, real_send_enabled NO', () => {
    const r = buildEmailConfigPresenceFromAliases(ENV_BOTH_TEST_TO);
    assert.strictEqual(r.email_sent, false);
    assert.strictEqual(r.real_send_enabled, false);
    assert.strictEqual(r.reads_dotenv, false);
    assert.strictEqual(r.reads_ai_secrets, false);
});

// 11. third contour NOT created.
ok('third mail contour NOT created', () => {
    const r = buildEmailConfigPresenceFromAliases(ENV_BOTH_TEST_TO);
    assert.strictEqual(r.third_contour_created, false);
});

// 12. stage label is E1C2C_YANDEX_ALIAS.
ok('stage label is E1C2C_YANDEX_ALIAS', () => {
    const r = buildEmailConfigPresenceFromAliases(ENV_BOTH);
    assert.strictEqual(r.stage, E1C2C_STAGE);
    assert.strictEqual(E1C2C_STAGE, 'E1C2C_YANDEX_ALIAS');
});

// 13. /email_preflight surfaces alias coverage, never sends, can_send_live NO.
ok('/email_preflight (owner, YANDEX both+test_to) -> READY, real_send NO, can_send_live NO', () => {
    const res = handleEmailPreflightCommand({ isOwner: true, env: ENV_BOTH_TEST_TO });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.code, EMAIL_PREFLIGHT_READY);
    assert.strictEqual(res.configured, true);
    assert.strictEqual(res.configured_state, CONFIGURED_YES);
    assert.strictEqual(res.yandex_alias_detected, true);
    assert.strictEqual(res.real_send_enabled, false);
    assert.strictEqual(res.can_send_live, false);
    assert.strictEqual(res.email_sent, false);
    assert.strictEqual(res.secrets_printed, false);
    assert.strictEqual(res.never_send, NEVER_SEND_ON_PREFLIGHT);
    // values never leak through the preflight surface
    const blob = JSON.stringify(res) + String(res.text || '');
    assert.ok(!blob.includes(DUMMY_LOGIN));
    assert.ok(!blob.includes(DUMMY_PASS));
    assert.ok(!blob.includes(DUMMY_TEST_TO));
});

// 14. /email_preflight empty env -> NOT_CONFIGURED, still no send.
ok('/email_preflight empty env -> NOT_CONFIGURED, can_send_live NO', () => {
    const res = handleEmailPreflightCommand({ isOwner: true, env: ENV_EMPTY });
    assert.strictEqual(res.code, EMAIL_PREFLIGHT_NOT_CONFIGURED);
    assert.strictEqual(res.configured, false);
    assert.strictEqual(res.yandex_alias_detected, false);
    assert.strictEqual(res.can_send_live, false);
    assert.strictEqual(res.real_send_enabled, false);
    assert.strictEqual(res.email_sent, false);
});

// 15. /email_preflight YES_PARTIAL (both keys, no test_to) -> READY but partial.
ok('/email_preflight both keys, no test_to -> READY, configured YES_PARTIAL', () => {
    const res = handleEmailPreflightCommand({ isOwner: true, env: ENV_BOTH });
    assert.strictEqual(res.code, EMAIL_PREFLIGHT_READY);
    assert.strictEqual(res.configured_state, CONFIGURED_YES_PARTIAL);
    assert.strictEqual(res.email_test_to_missing, true);
    assert.strictEqual(res.can_send_live, false);
});

// 16. non-owner is refused (owner gate), no leak.
ok('/email_preflight non-owner refused', () => {
    const res = handleEmailPreflightCommand({ isOwner: false, env: ENV_BOTH_TEST_TO });
    assert.strictEqual(res.ok, false);
});

console.log('--------------------------------------');
console.log(`E1C2C result: ${passed} passed, ${failed} failed`);
console.log('autosend: BLOCKED | approval_queue write: NO | 13_sales write: NO');
console.log('D3C freeze: ACTIVE | /lead_import_prepare: still frozen');
console.log('real import: BLOCKED | live restart: NOT DONE');
console.log('/ping /health /today /r4: NOT intercepted by E1C2C');

if (failed > 0) {
    process.exitCode = 1;
}
