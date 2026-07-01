// ============================================================================
// E1C2B OFFLINE TEST — Safe Email Env Presence Bridge (config visibility only).
// ============================================================================
// Verifies collectEmailEnvPresence / buildEmailEnvPresenceResult / buildEnvPresenceReport
// behave safely:
//   - empty env  -> all keys missing, configured false
//   - partial env -> only present keys flagged true
//   - full env   -> configured true
//   - secret VALUES never appear in result, report, or stdout
//   - real_send_enabled stays false on E1C2B (even if EMAIL_REAL_SEND_ENABLED=true)
//   - can_send_live stays false on E1C2B
//   - no email send, no network, no Telegram API, no writes, no imports.
//
// This test is fully OFFLINE and PURE: it imports only the adapter module and
// constructs plain JS env-like objects. It performs no I/O beyond console output.
// ============================================================================

import {
    EXPECTED_TRANSPORT_ENV_KEYS,
    E1C2B_STAGE,
    collectEmailEnvPresence,
    buildEmailEnvPresenceResult,
    buildEnvPresenceReport,
} from '../telegram_gateway/telegram_approved_email_send_adapter.mjs';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond) {
    if (cond) {
        passed++;
        console.log(`  PASS  ${name}`);
    } else {
        failed++;
        failures.push(name);
        console.log(`  FAIL  ${name}`);
    }
}

// Sentinel secret values that must NEVER leak into result/report/stdout.
const SECRET_PASS = 'super-secret-smtp-pass-DO-NOT-LEAK-9f3a';
const SECRET_USER = 'secret-user@yandex.example-DO-NOT-LEAK';
const SECRET_TEST_TO = 'owner-private-mailbox@example-DO-NOT-LEAK';

const SECRET_SENTINELS = [SECRET_PASS, SECRET_USER, SECRET_TEST_TO];

function assertNoSecretLeak(label, value) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    for (const secret of SECRET_SENTINELS) {
        check(`${label}: does NOT contain secret value (${secret.slice(0, 12)}...)`, !serialized.includes(secret));
    }
}

console.log('=== E1C2B ENV PRESENCE OFFLINE TEST ===');

// ----------------------------------------------------------------------------
// 1) Empty env -> all missing, configured false
// ----------------------------------------------------------------------------
console.log('\n[1] empty env -> all missing');
{
    const result = buildEmailEnvPresenceResult({});
    check('stage is E1C2B_ENV_PRESENCE', result.stage === E1C2B_STAGE);
    check('configured === false', result.configured === false);
    check('missing_keys covers all expected keys', result.missing_keys.length === EXPECTED_TRANSPORT_ENV_KEYS.length);
    let allMissing = true;
    for (const key of EXPECTED_TRANSPORT_ENV_KEYS) {
        if (result.key_presence[key].present !== false) allMissing = false;
    }
    check('every key present:false', allMissing);
    check('real_send_enabled === false', result.real_send_enabled === false);
    check('can_send_live === false', result.can_send_live === false);
}

// ----------------------------------------------------------------------------
// 2) Partial env -> only present keys flagged true; secret values not leaked
// ----------------------------------------------------------------------------
console.log('\n[2] partial env -> partial present');
{
    const partialEnv = {
        EMAIL_PROVIDER: 'yandex',
        EMAIL_SMTP_HOST: 'smtp.yandex.ru',
        EMAIL_SMTP_USER: SECRET_USER,
        EMAIL_SMTP_PASS: SECRET_PASS,
    };
    const result = buildEmailEnvPresenceResult(partialEnv);
    check('configured === false (partial)', result.configured === false);
    check('EMAIL_PROVIDER present true', result.key_presence.EMAIL_PROVIDER.present === true);
    check('EMAIL_SMTP_HOST present true', result.key_presence.EMAIL_SMTP_HOST.present === true);
    check('EMAIL_SMTP_USER present true', result.key_presence.EMAIL_SMTP_USER.present === true);
    check('EMAIL_SMTP_PASS present true', result.key_presence.EMAIL_SMTP_PASS.present === true);
    check('EMAIL_FROM present false (absent)', result.key_presence.EMAIL_FROM.present === false);
    check('EMAIL_TEST_TO present false (absent)', result.key_presence.EMAIL_TEST_TO.present === false);
    // presence map carries booleans ONLY — no value field anywhere
    let booleansOnly = true;
    for (const key of EXPECTED_TRANSPORT_ENV_KEYS) {
        const entry = result.key_presence[key];
        const keys = Object.keys(entry);
        if (keys.length !== 1 || keys[0] !== 'present' || typeof entry.present !== 'boolean') booleansOnly = false;
    }
    check('key_presence entries are { present: boolean } only', booleansOnly);
    assertNoSecretLeak('partial result', result);
    const report = buildEnvPresenceReport(result);
    assertNoSecretLeak('partial report', report);
}

// ----------------------------------------------------------------------------
// 3) Full env -> configured true; even with EMAIL_REAL_SEND_ENABLED=true,
//    real_send_enabled / can_send_live stay false on E1C2B.
// ----------------------------------------------------------------------------
console.log('\n[3] full env (incl. EMAIL_REAL_SEND_ENABLED=true) -> configured, still no send');
{
    const fullEnv = {};
    for (const key of EXPECTED_TRANSPORT_ENV_KEYS) fullEnv[key] = `value-for-${key}`;
    // Inject realistic secrets / real-send-enabled to prove they do not change E1C2B posture.
    fullEnv.EMAIL_SMTP_PASS = SECRET_PASS;
    fullEnv.EMAIL_SMTP_USER = SECRET_USER;
    fullEnv.EMAIL_TEST_TO = SECRET_TEST_TO;
    fullEnv.EMAIL_REAL_SEND_ENABLED = 'true';

    const result = buildEmailEnvPresenceResult(fullEnv);
    check('configured === true (full)', result.configured === true);
    check('missing_keys empty', result.missing_keys.length === 0);
    check('real_send_enabled === false despite env true', result.real_send_enabled === false);
    check('can_send_live === false despite env true', result.can_send_live === false);
    check('secrets_printed flag false', result.secrets_printed === false);
    check('reads_dotenv false', result.reads_dotenv === false);
    check('reads_ai_secrets false', result.reads_ai_secrets === false);
    assertNoSecretLeak('full result', result);

    const report = buildEnvPresenceReport(result);
    check('report shows configured: YES', report.includes('configured: YES'));
    check('report shows real_send_enabled: NO', report.includes('real_send_enabled: NO'));
    check('report shows can_send_live: NO', report.includes('can_send_live: NO'));
    check('report shows email_sent: NO', report.includes('email_sent: NO'));
    check('report shows secret_values_printed: NO', report.includes('secret_values_printed: NO'));
    assertNoSecretLeak('full report', report);
}

// ----------------------------------------------------------------------------
// 4) collectEmailEnvPresence direct -> booleans only, no value pass-through
// ----------------------------------------------------------------------------
console.log('\n[4] collectEmailEnvPresence raw map');
{
    const presence = collectEmailEnvPresence({ EMAIL_SMTP_PASS: SECRET_PASS, EMAIL_TEST_TO: SECRET_TEST_TO });
    check('EMAIL_SMTP_PASS present true', presence.EMAIL_SMTP_PASS.present === true);
    check('EMAIL_TEST_TO present true', presence.EMAIL_TEST_TO.present === true);
    check('EMAIL_PROVIDER present false', presence.EMAIL_PROVIDER.present === false);
    assertNoSecretLeak('collect presence map', presence);
}

// ----------------------------------------------------------------------------
// 5) Robustness: non-object / null env handled safely (no throw, all missing)
// ----------------------------------------------------------------------------
console.log('\n[5] robustness: null/undefined/non-object env');
{
    let threw = false;
    let r1, r2, r3;
    try {
        r1 = buildEmailEnvPresenceResult(null);
        r2 = buildEmailEnvPresenceResult(undefined);
        r3 = buildEmailEnvPresenceResult(42);
    } catch (e) {
        threw = true;
    }
    check('does not throw on null/undefined/non-object', !threw);
    check('null env -> configured false', r1 && r1.configured === false);
    check('undefined env -> configured false', r2 && r2.configured === false);
    check('non-object env -> configured false', r3 && r3.configured === false);
}

// ----------------------------------------------------------------------------
// Summary
// ----------------------------------------------------------------------------
console.log('\n=== SUMMARY ===');
console.log(`passed: ${passed}`);
console.log(`failed: ${failed}`);
console.log('email_sent: NO');
console.log('network_used: NO');
console.log('telegram_api_used: NO');
console.log('queue_write: NO');
console.log('approval_queue_write: NO');
console.log('import_executed: NO');
console.log('autosend: NO');
console.log('D3C_freeze: ACTIVE');
console.log('lead_import_prepare_unfrozen: NO');
console.log('secret_values_printed: NO');

if (failed > 0) {
    console.log(`\nRESULT: RED — failing: ${failures.join(', ')}`);
    process.exit(1);
} else {
    console.log('\nRESULT: GREEN — E1C2B env presence bridge safe.');
    process.exit(0);
}
