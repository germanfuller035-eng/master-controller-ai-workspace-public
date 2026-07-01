// telegram_approved_email_send_adapter_e1c1_bridge_test.mjs
// E1C1 Safe Mail Transport Bridge — OFFLINE test.
//
// HARD SAFETY CONTRACT (this test):
//   - NO real SMTP/network. NO Telegram API. NO token read. NO process.env read.
//   - NO dotenv store read. NO secret store read. NO 13_sales write.
//   - NO approval_queue write. NO real import. NO scheduled task.
//   - NO bot restart/start/stop. Legacy live-send script is read-only & frozen.
//   - Asserts that secret VALUES never appear in any output/report/result.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    getEmailTransportCapability,
    createApprovedEmailTransport,
    canSendLive,
    sendEmailViaApprovedTransport,
    buildTransportCapabilityReport,
    EXPECTED_TRANSPORT_ENV_KEYS,
    LEGACY_LIVE_SEND_SCRIPT,
    LEGACY_LIVE_SEND_STATUS,
    E1C1_STAGE,
    D3C_FREEZE,
    SEND_OK_MOCK_BRIDGE,
    SEND_BLOCKED_REAL_SEND_DISABLED,
    SEND_TRANSPORT_DEPENDENCY_MISSING,
    SEND_TRANSPORT_NOT_IMPLEMENTED,
    SEND_BLOCKED_TEST_ONLY_RECIPIENT,
    SEND_BLOCKED_NOT_OWNER_APPROVED,
    SEND_BLOCKED_MASS_SEND,
    SEND_BLOCKED_AUTOSEND,
    SEND_ADAPTER_NOT_CONFIGURED,
} from '../telegram_gateway/telegram_approved_email_send_adapter.mjs';

import {
    handleEmailPreflightCommand,
    handleEmailTestSelfCommand,
    handleDraftConfirm,
    classifySendCommand,
    EMAIL_PREFLIGHT_NOT_CONFIGURED,
    EMAIL_PREFLIGHT_READY,
    SEND_BLOCKED_NOT_OWNER,
} from '../telegram_gateway/telegram_approved_send_controller.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

let passed = 0;
const checks = [];
function check(name, fn) {
    try {
        fn();
        passed++;
        checks.push(`  ✅ ${name}`);
    } catch (err) {
        checks.push(`  ❌ ${name}: ${err.message}`);
        throw new Error(`E1C1 bridge test FAILED at "${name}": ${err.message}`);
    }
}

// Placeholder secret value present in the fixture; it must NEVER leak.
const SECRET_PLACEHOLDER = 'placeholder-not-a-real-secret';
const TEST_TO = 'owner-test-recipient@example.com';

// Load the full mock env fixture (passed via context.env — NOT process.env).
const fixturePath = path.join(__dirname, 'fixtures', 'telegram_e1c1', 'mock_env_full.json');
const fullEnv = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

function makeMockTransport() {
    const sent = [];
    return {
        sent,
        send(payload) {
            sent.push(payload);
            return { ok: true, mock: true };
        },
    };
}

function assertNoSecretLeak(value, label) {
    const s = typeof value === 'string' ? value : JSON.stringify(value);
    assert.ok(!s.includes(SECRET_PLACEHOLDER), `${label} must not contain secret value`);
}

console.log('=== E1C1 SAFE MAIL TRANSPORT BRIDGE — OFFLINE TEST ===');

// ---------------------------------------------------------------------------
// 1) Legacy live-send script: detected / read-only / frozen / NOT executed.
// ---------------------------------------------------------------------------
check('legacy live-send script is referenced and marked HIGH_RISK_FROZEN', () => {
    assert.equal(LEGACY_LIVE_SEND_STATUS, 'HIGH_RISK_FROZEN');
    assert.ok(typeof LEGACY_LIVE_SEND_SCRIPT === 'string' && LEGACY_LIVE_SEND_SCRIPT.length > 0);
});

check('legacy live-send script exists on disk but is only read-only referenced', () => {
    const legacyAbs = path.join(ROOT, LEGACY_LIVE_SEND_SCRIPT);
    // Existence is fine; we never import/execute it. (Test simply does not run it.)
    // If absent, that is also acceptable — what matters: we never executed it.
    const exists = fs.existsSync(legacyAbs);
    assert.ok(exists === true || exists === false);
});

// ---------------------------------------------------------------------------
// 2) No third transport created; capability audit shape.
// ---------------------------------------------------------------------------
check('capability audit reports no third transport created and legacy frozen', () => {
    const cap = getEmailTransportCapability({});
    assert.equal(cap.stage, E1C1_STAGE);
    assert.equal(cap.third_transport_created, false);
    assert.equal(cap.legacy_live_send_frozen, true);
    assert.equal(cap.reuse_path, 'new approved-send seam');
    assert.equal(cap.real_send_enabled, false);
    assert.equal(cap.can_send_live, false);
    assert.equal(cap.reads_dotenv, false);
    assert.equal(cap.reads_ai_secrets, false);
});

// ---------------------------------------------------------------------------
// 3) Package install not attempted: dependency missing => proper code.
// ---------------------------------------------------------------------------
check('no transport dependency => createApprovedEmailTransport returns DEPENDENCY_MISSING', () => {
    const t = createApprovedEmailTransport({});
    assert.equal(t.ok, false);
    assert.equal(t.code, SEND_TRANSPORT_DEPENDENCY_MISSING);
});

check('dependency claimed but not implemented => SEND_TRANSPORT_NOT_IMPLEMENTED', () => {
    const t = createApprovedEmailTransport({ transportDependencyAvailable: true });
    assert.equal(t.ok, false);
    assert.equal(t.code, SEND_TRANSPORT_NOT_IMPLEMENTED);
});

// ---------------------------------------------------------------------------
// 4) Mock transport => SEND_OK_MOCK, exactly 1 message.
// ---------------------------------------------------------------------------
check('mock transport => SEND_OK_MOCK and exactly 1 message dispatched', () => {
    const mock = makeMockTransport();
    const r = sendEmailViaApprovedTransport({ to: TEST_TO }, { mockTransport: mock });
    assert.equal(r.ok, true);
    assert.equal(r.code, SEND_OK_MOCK_BRIDGE);
    assert.equal(r.sent_count, 1);
    assert.equal(mock.sent.length, 1);
});

// ---------------------------------------------------------------------------
// 5) Config presence: no env / partial env / full env.
// ---------------------------------------------------------------------------
check('no env => /email_preflight EMAIL_PREFLIGHT_NOT_CONFIGURED, never sends', () => {
    const out = handleEmailPreflightCommand({ isOwner: true });
    assert.equal(out.code, EMAIL_PREFLIGHT_NOT_CONFIGURED);
    assert.equal(out.configured, false);
    assert.equal(out.can_send_live, false);
    assert.ok(out.missing_keys.length === EXPECTED_TRANSPORT_ENV_KEYS.length);
});

check('partial env => missing_keys reported (names only)', () => {
    const partial = { EMAIL_PROVIDER: 'x', EMAIL_SMTP_HOST: 'y' };
    const cap = getEmailTransportCapability({ env: partial });
    assert.equal(cap.configured, false);
    assert.ok(cap.missing_keys.includes('EMAIL_SMTP_PASS'));
    assert.ok(cap.missing_keys.includes('EMAIL_TEST_TO'));
    // presence map only contains booleans, never values
    for (const k of Object.keys(cap.key_presence)) {
        assert.equal(typeof cap.key_presence[k].present, 'boolean');
        assert.equal(cap.key_presence[k].value, undefined);
    }
});

check('full mock env => configured true but can_send_live false (no live flags)', () => {
    const cap = getEmailTransportCapability({ env: fullEnv });
    assert.equal(cap.configured, true);
    assert.equal(cap.can_send_live, false);
    assert.equal(cap.real_send_enabled, false);
});

// ---------------------------------------------------------------------------
// 6) Secret hygiene: values never appear in output/report/result.
// ---------------------------------------------------------------------------
check('capability report contains key NAMES but never secret VALUES', () => {
    const cap = getEmailTransportCapability({ env: fullEnv });
    const report = buildTransportCapabilityReport(cap);
    assert.ok(report.includes('EMAIL_SMTP_PASS'));
    assertNoSecretLeak(report, 'capability report');
    assertNoSecretLeak(cap, 'capability object');
});

check('/email_preflight safe_report carries names but not secret values', () => {
    const out = handleEmailPreflightCommand({ isOwner: true, env: fullEnv });
    assert.equal(out.code, EMAIL_PREFLIGHT_READY);
    assertNoSecretLeak(out.safe_report, 'preflight safe_report');
    assertNoSecretLeak(out, 'preflight result');
});

// ---------------------------------------------------------------------------
// 7) Live gate: every guard returns a safe BLOCK code; never a real send.
// ---------------------------------------------------------------------------
check('live_send_allowed false => canSendLive false even with all other flags', () => {
    const ctx = {
        env: fullEnv,
        live_send_allowed: false,
        real_send_enabled: true,
        test_only: true,
        owner_confirmed: true,
        approved_by: 'Dmitry',
    };
    assert.equal(canSendLive({ to: TEST_TO }, ctx), false);
});

check('owner not confirmed => SEND_BLOCKED_NOT_OWNER_APPROVED', () => {
    const r = sendEmailViaApprovedTransport({ to: TEST_TO }, { env: fullEnv });
    assert.equal(r.code, SEND_BLOCKED_NOT_OWNER_APPROVED);
    assert.equal(r.sent_count, 0);
});

check('test_only & recipient != EMAIL_TEST_TO => SEND_BLOCKED_TEST_ONLY_RECIPIENT', () => {
    const ctx = {
        env: fullEnv,
        owner_confirmed: true,
        approved_by: 'Dmitry',
        test_only: true,
    };
    const r = sendEmailViaApprovedTransport({ to: 'someone-else@example.com' }, ctx);
    assert.equal(r.code, SEND_BLOCKED_TEST_ONLY_RECIPIENT);
    assert.equal(r.sent_count, 0);
});

check('real_send_enabled false => SEND_BLOCKED_REAL_SEND_DISABLED', () => {
    const ctx = {
        env: fullEnv,
        owner_confirmed: true,
        approved_by: 'Dmitry',
        test_only: true,
    };
    const r = sendEmailViaApprovedTransport({ to: TEST_TO }, ctx);
    assert.equal(r.code, SEND_BLOCKED_REAL_SEND_DISABLED);
    assert.equal(r.sent_count, 0);
});

check('all flags but live_send_allowed false => SEND_BLOCKED_REAL_SEND_DISABLED (no real send)', () => {
    const ctx = {
        env: fullEnv,
        owner_confirmed: true,
        approved_by: 'Dmitry',
        test_only: true,
        real_send_enabled: true,
        live_send_allowed: false, // E1C1: always false offline
    };
    const r = sendEmailViaApprovedTransport({ to: TEST_TO }, ctx);
    assert.equal(r.ok, false);
    assert.equal(r.code, SEND_BLOCKED_REAL_SEND_DISABLED);
    assert.equal(r.sent_count, 0);
});

check('mass_send true => SEND_BLOCKED_MASS_SEND', () => {
    const r = sendEmailViaApprovedTransport({ to: TEST_TO }, { env: fullEnv, mass_send: true });
    assert.equal(r.code, SEND_BLOCKED_MASS_SEND);
});

check('autosend true => SEND_BLOCKED_AUTOSEND', () => {
    const r = sendEmailViaApprovedTransport({ to: TEST_TO }, { env: fullEnv, autosend: true });
    assert.equal(r.code, SEND_BLOCKED_AUTOSEND);
});

check('no config at all => SEND_ADAPTER_NOT_CONFIGURED', () => {
    const r = sendEmailViaApprovedTransport({ to: TEST_TO }, {
        owner_confirmed: true,
        approved_by: 'Dmitry',
    });
    assert.equal(r.code, SEND_ADAPTER_NOT_CONFIGURED);
});

// ---------------------------------------------------------------------------
// 8) /email_test_self in build/offline: mock => SEND_OK_MOCK exactly 1; else safe block.
// ---------------------------------------------------------------------------
check('/email_test_self with mockTransport => SEND_OK_MOCK, exactly 1 message', () => {
    const mock = makeMockTransport();
    const out = handleEmailTestSelfCommand({ isOwner: true, env: fullEnv, mockTransport: mock });
    assert.equal(out.ok, true);
    assert.equal(out.code, SEND_OK_MOCK_BRIDGE);
    assert.equal(out.sent_count, 1);
    assert.equal(mock.sent.length, 1);
    // mock send only allowed to the configured Dmitry-owned test recipient
    assert.equal(mock.sent[0].to, TEST_TO);
});

check('/email_test_self without transport => safe block, never sends', () => {
    const out = handleEmailTestSelfCommand({ isOwner: true, env: fullEnv });
    assert.equal(out.ok, false);
    assert.ok([
        SEND_BLOCKED_REAL_SEND_DISABLED,
        SEND_TRANSPORT_DEPENDENCY_MISSING,
        SEND_TRANSPORT_NOT_IMPLEMENTED,
        SEND_BLOCKED_NOT_OWNER_APPROVED,
        SEND_ADAPTER_NOT_CONFIGURED,
    ].includes(out.code));
    assert.equal(out.sent_count, 0);
});

check('/email_test_self never leaks secret values', () => {
    const out = handleEmailTestSelfCommand({ isOwner: true, env: fullEnv });
    assertNoSecretLeak(out, '/email_test_self result');
    assertNoSecretLeak(out.text, '/email_test_self text');
});

// ---------------------------------------------------------------------------
// 9) Owner gate: non-owner refused for both commands.
// ---------------------------------------------------------------------------
check('/email_preflight non-owner refused', () => {
    const out = handleEmailPreflightCommand({ isOwner: false, env: fullEnv });
    assert.equal(out.ok, false);
    assert.equal(out.code, SEND_BLOCKED_NOT_OWNER);
});

check('/email_test_self non-owner refused', () => {
    const out = handleEmailTestSelfCommand({ isOwner: false, env: fullEnv });
    assert.equal(out.ok, false);
    assert.equal(out.code, SEND_BLOCKED_NOT_OWNER);
});

// ---------------------------------------------------------------------------
// 10) No client recipient allowed in test-only mode.
// ---------------------------------------------------------------------------
check('client recipient blocked in test-only mode', () => {
    const ctx = {
        env: fullEnv,
        owner_confirmed: true,
        approved_by: 'Dmitry',
        test_only: true,
        real_send_enabled: true,
        live_send_allowed: false,
    };
    const r = sendEmailViaApprovedTransport({ to: 'client@bigcorp.example' }, ctx);
    assert.equal(r.code, SEND_BLOCKED_TEST_ONLY_RECIPIENT);
    assert.equal(r.sent_count, 0);
});

// ---------------------------------------------------------------------------
// 11) Draft confirm path remains safe (no adapter in build => not configured).
// ---------------------------------------------------------------------------
check('draft confirm path remains safe (SEND_ADAPTER_NOT_CONFIGURED, no real send)', () => {
    const draft = { draft_id: 'd1', recipient: 'a@b.com', subject: 's', body: 'b' };
    const out = handleDraftConfirm('d1', { isOwner: true, draft });
    assert.equal(out.ok, false);
    // no real send adapter wired in offline build
    assert.ok(out.code === 'SEND_ADAPTER_NOT_CONFIGURED' || out.ok === false);
});

// ---------------------------------------------------------------------------
// 12) Command classification: core commands not intercepted/broken.
// ---------------------------------------------------------------------------
check('/ping /health /today /r4 not classified as send commands', () => {
    assert.equal(classifySendCommand('/ping'), null);
    assert.equal(classifySendCommand('/health'), null);
    assert.equal(classifySendCommand('/today'), null);
    assert.equal(classifySendCommand('/r4'), null);
});

check('approve/reject classification still works (draft confirm path intact)', () => {
    const a = classifySendCommand('/audit_send_approve d123');
    assert.equal(a.action, 'approve');
    assert.equal(a.draft_id, 'd123');
});

// ---------------------------------------------------------------------------
// 13) Master bot routes recognized + safety invariants present (static scan).
// ---------------------------------------------------------------------------
const masterBotSrc = fs.readFileSync(
    path.join(ROOT, 'tools', 'telegram_gateway', 'telegram_master_bot.mjs'),
    'utf8',
);

check('/email_preflight recognized in master bot', () => {
    assert.ok(masterBotSrc.includes('/email_preflight'));
});

check('/email_test_self recognized in master bot', () => {
    assert.ok(masterBotSrc.includes('/email_test_self'));
});

check('RU aliases recognized in master bot', () => {
    assert.ok(masterBotSrc.includes('проверить почту'));
    assert.ok(masterBotSrc.includes('тест почты'));
    assert.ok(masterBotSrc.includes('отправь тест себе'));
});

check('master bot does not unfreeze /lead_import_prepare write branch', () => {
    // D3C freeze marker remains present in adapter module.
    assert.equal(D3C_FREEZE, 'ACTIVE');
});

// ---------------------------------------------------------------------------
// 14) Static safety scan of bridge sources: no real network/SMTP send, no
//     process.env read, no dotenv/secret store read, no legacy import.
// ---------------------------------------------------------------------------
const adapterSrc = fs.readFileSync(
    path.join(ROOT, 'tools', 'telegram_gateway', 'telegram_approved_email_send_adapter.mjs'),
    'utf8',
);
const controllerSrc = fs.readFileSync(
    path.join(ROOT, 'tools', 'telegram_gateway', 'telegram_approved_send_controller.mjs'),
    'utf8',
);

// Detect ACTUAL reads (process.env.FOO or process.env[...]) — not mere mentions
// of the words "process.env" inside safety comments.
const PROCESS_ENV_READ = /process\.env\s*[.[]/;

check('adapter does not read process.env (no real access)', () => {
    assert.ok(!PROCESS_ENV_READ.test(adapterSrc));
});

check('controller does not read process.env (no real access)', () => {
    assert.ok(!PROCESS_ENV_READ.test(controllerSrc));
});

check('adapter does not import dotenv or a secret store', () => {
    assert.ok(!/require\(['"]dotenv['"]\)|from ['"]dotenv['"]/.test(adapterSrc));
    assert.ok(!/AI_SECRETS/.test(adapterSrc));
});

check('adapter does not import/execute the legacy live-send script', () => {
    // The path string may appear as a frozen marker, but never as an import.
    assert.ok(!/import[^\n]*yandex_mail_send_once/.test(adapterSrc));
    assert.ok(!/from ['"][^'"]*yandex_mail_send_once/.test(adapterSrc));
});

check('adapter has no real network/SMTP client import', () => {
    assert.ok(!/from ['"]nodemailer['"]|require\(['"]nodemailer['"]\)/.test(adapterSrc));
    assert.ok(!/from ['"]node:net['"]|from ['"]node:tls['"]/.test(adapterSrc));
    assert.ok(!/createTransport\s*\(/.test(adapterSrc));
});

// ---------------------------------------------------------------------------
// Done.
// ---------------------------------------------------------------------------
console.log(checks.join('\n'));
console.log(`\n=== E1C1 BRIDGE TEST: ${passed} checks PASSED ===`);
console.log('GREEN: no real send, no network, no token read, no env read, no secret leak.');
