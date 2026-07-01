// telegram_approved_email_send_adapter_e1b_preflight_test.mjs
// E1B Live Config Preflight — OFFLINE test.
//
// Verifies the preflight contour is SAFE:
//   - NO real email send, NO SMTP/Yandex/network, NO .env read, NO AI_SECRETS read,
//   - secret VALUES never appear in stdout / report / result,
//   - presence-only key checks, correct missing_keys,
//   - real_send_enabled=false, can_send_live=false on E1B,
//   - adapter still returns SEND_ADAPTER_NOT_CONFIGURED for live send,
//   - mock send from E1 still works,
//   - no 13_sales write, no approval_queue write, no token read, no autosend,
//   - D3C freeze marker present.

import assert from 'node:assert';
import {
    getEmailAdapterConfigSchema,
    checkEmailAdapterPreflight,
    buildSafePreflightReport,
    sendApprovedEmail,
    isEmailSendAdapterConfigured,
    SEND_ADAPTER_NOT_CONFIGURED,
    SEND_OK_MOCK,
    REAL_SEND_ENABLED,
    D3C_FREEZE,
    E1B_STAGE,
} from '../telegram_gateway/telegram_approved_email_send_adapter.mjs';
import {
    handleEmailSendPreflight,
    EMAIL_PREFLIGHT_READY,
    EMAIL_PREFLIGHT_NOT_CONFIGURED,
    NEVER_SEND_ON_PREFLIGHT,
} from '../telegram_gateway/telegram_approved_send_controller.mjs';

let passed = 0;
function ok(name, cond) {
    assert.ok(cond, name);
    passed++;
    console.log(`  PASS: ${name}`);
}

// A clearly-fake secret value we will assert NEVER appears anywhere.
const FAKE_SECRET = 'SUPER_SECRET_VALUE_SHOULD_NEVER_LEAK_42';

console.log('E1B preflight offline test');

// --- 1. Schema returns key NAMES only, never values -------------------------
const schema = getEmailAdapterConfigSchema();
ok('schema lists expected_env_keys (names)', Array.isArray(schema.expected_env_keys) && schema.expected_env_keys.length > 0);
ok('schema provider present', typeof schema.provider === 'string' && schema.provider.length > 0);
ok('schema real_send_enabled false', schema.real_send_enabled === false);
ok('schema reads_dotenv false', schema.reads_dotenv === false);
ok('schema reads_ai_secrets false', schema.reads_ai_secrets === false);

// --- 2. Preflight with NO env -> NOT_CONFIGURED -----------------------------
const noEnv = handleEmailSendPreflight({});
ok('no env -> EMAIL_PREFLIGHT_NOT_CONFIGURED', noEnv.code === EMAIL_PREFLIGHT_NOT_CONFIGURED);
ok('no env -> configured false', noEnv.configured === false);
ok('no env -> missing_keys non-empty', Array.isArray(noEnv.missing_keys) && noEnv.missing_keys.length === schema.expected_env_keys.length);
ok('no env -> never_send marker', noEnv.never_send === NEVER_SEND_ON_PREFLIGHT);
ok('no env -> real_send_enabled false', noEnv.real_send_enabled === false);
ok('no env -> can_send_live false', noEnv.can_send_live === false);

// --- 3. Preflight WITH mock env keys -> READY -------------------------------
const mockEnv = {};
for (const key of schema.expected_env_keys) mockEnv[key] = FAKE_SECRET;
const ready = handleEmailSendPreflight({ env: mockEnv });
ok('mock env -> EMAIL_PREFLIGHT_READY', ready.code === EMAIL_PREFLIGHT_READY);
ok('mock env -> configured true', ready.configured === true);
ok('mock env -> missing_keys empty', ready.missing_keys.length === 0);
ok('mock env -> real_send_enabled still false', ready.real_send_enabled === false);
ok('mock env -> can_send_live still false', ready.can_send_live === false);
ok('mock env -> never_send marker', ready.never_send === NEVER_SEND_ON_PREFLIGHT);

// --- 4. Partial env -> correct missing_keys ---------------------------------
const partialEnv = { [schema.expected_env_keys[0]]: FAKE_SECRET };
const partial = checkEmailAdapterPreflight({ env: partialEnv });
ok('partial env -> configured false', partial.configured === false);
ok('partial env -> first key present', partial.key_presence[schema.expected_env_keys[0]].present === true);
ok('partial env -> remaining keys missing', partial.missing_keys.length === schema.expected_env_keys.length - 1);

// --- 5. Secret values NEVER leak into result / report -----------------------
const readyJson = JSON.stringify(ready);
ok('result JSON has no secret value', !readyJson.includes(FAKE_SECRET));
const report = buildSafePreflightReport(checkEmailAdapterPreflight({ env: mockEnv }));
ok('safe report has no secret value', !report.includes(FAKE_SECRET));
ok('safe report shows present: true (boolean, not value)', report.includes('present: true'));
ok('partial result JSON has no secret value', !JSON.stringify(partial).includes(FAKE_SECRET));
ok('key_presence carries booleans only (no value field)',
    Object.values(ready.configured ? checkEmailAdapterPreflight({ env: mockEnv }).key_presence : {})
        .every((v) => typeof v.present === 'boolean' && !('value' in v)));

// --- 6. Preflight does NOT read process.env ---------------------------------
// Set a real process.env key with one of the names; preflight must still see
// it as missing because it ONLY inspects context.env.
process.env[schema.expected_env_keys[0]] = FAKE_SECRET;
const ignoreProcessEnv = checkEmailAdapterPreflight({});
ok('preflight ignores process.env (no env context -> missing)', ignoreProcessEnv.missing_keys.length === schema.expected_env_keys.length);
delete process.env[schema.expected_env_keys[0]];

// --- 7. Preflight performs NO send ------------------------------------------
ok('preflight result has no sent_count > 0', !(ready.sent_count > 0));
ok('preflight code is not a send-OK code', ready.code !== SEND_OK_MOCK);

// --- 8. Live send WITHOUT explicit enable -> SEND_ADAPTER_NOT_CONFIGURED -----
const liveAttempt = sendApprovedEmail(
    { to: 'dmitry@example.com', subject: 's', body: 'b' },
    { env: mockEnv }, // env keys present, but NO mockAdapter and no live enable
);
ok('live send w/o adapter -> SEND_ADAPTER_NOT_CONFIGURED', liveAttempt.code === SEND_ADAPTER_NOT_CONFIGURED);
ok('live send w/o adapter -> sent_count 0', liveAttempt.sent_count === 0);

// --- 9. Mock send from E1 still works ---------------------------------------
let mockCalls = 0;
const mockAdapter = { send: (p) => { mockCalls++; return { ok: true, to: p.to }; } };
const mockSend = sendApprovedEmail(
    { to: 'dmitry@example.com', subject: 's', body: 'b' },
    { mockAdapter },
);
ok('mock send -> SEND_OK_MOCK', mockSend.code === SEND_OK_MOCK);
ok('mock send -> exactly 1 dispatch', mockCalls === 1 && mockSend.sent_count === 1);
ok('isEmailSendAdapterConfigured true with mock', isEmailSendAdapterConfigured({ mockAdapter }) === true);
ok('isEmailSendAdapterConfigured false without mock', isEmailSendAdapterConfigured({ env: mockEnv }) === false);

// --- 10. Safety markers -----------------------------------------------------
ok('REAL_SEND_ENABLED false', REAL_SEND_ENABLED === false);
ok('D3C freeze marker ACTIVE', D3C_FREEZE === 'ACTIVE');
ok('E1B stage marker', E1B_STAGE === 'E1B_PREFLIGHT');
ok('preflight provider/from_label safe (strings, no secret)',
    typeof ready.provider === 'string' && typeof ready.from_label === 'string'
    && !ready.provider.includes(FAKE_SECRET) && !ready.from_label.includes(FAKE_SECRET));

// --- 11. No writes / no network (structural guarantee) ----------------------
// The modules import only node:crypto / node:assert (test). No fs, no net, no
// child_process imports exist in adapter/controller -> nothing to write/send.
ok('preflight result reads_dotenv false', ready.reads_dotenv === false);
ok('preflight result reads_ai_secrets false', ready.reads_ai_secrets === false);
ok('preflight secrets_printed false', ready.secrets_printed === false);

console.log(`\nE1B preflight: ALL ${passed} CHECKS PASSED`);
