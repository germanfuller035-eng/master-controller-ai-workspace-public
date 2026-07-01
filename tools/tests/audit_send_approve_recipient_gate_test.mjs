/**
 * audit_send_approve_recipient_gate_test.mjs
 *
 * Regression guard for the live approved client-send path (inline ✅ →
 * approval controller → real Yandex SMTP adapter). Verifies that the
 * controller's handleClientSendConfirm — the SAME handler the inline
 * audit_send:approve button now routes through — is HONEST:
 *
 *   1) approve path with a real recipient + configured SMTP adapter must
 *      NOT return SEND_ADAPTER_NOT_CONFIGURED (it must reach the real send
 *      or an honest P1/SMTP code, never the offline "adapter not configured"
 *      masquerade).
 *   2) fake / example / test recipient must be blocked BEFORE send with
 *      REAL_CLIENT_RECIPIENT_REQUIRED.
 *   3) a live draft pointing at EMAIL_TEST_TO must NOT be treated as a real
 *      client send (→ REAL_CLIENT_RECIPIENT_REQUIRED).
 *   4) a live draft using an example.com address must NOT be treated as a
 *      real client (→ REAL_CLIENT_RECIPIENT_REQUIRED).
 *
 * SAFETY: no real network/SMTP is exercised here. P1 arming is left OFF, so
 * even the "real recipient" case stops at an honest pre-send block code and
 * NEVER sends. This is an offline regression test.
 */

import {
    handleClientSendConfirm,
    REAL_CLIENT_RECIPIENT_REQUIRED,
    SEND_ADAPTER_NOT_CONFIGURED,
} from '../telegram_gateway/telegram_approved_send_controller.mjs';

// Not re-exported by the controller; compared as a literal here.
const SEND_OK_CLIENT_P1 = 'SEND_OK_CLIENT_P1';

let passed = 0;
let failed = 0;
const fails = [];

function check(name, cond) {
    if (cond) { passed++; console.log(`  ✅ ${name}`); }
    else { failed++; fails.push(name); console.log(`  ❌ ${name}`); }
}

function makeDraft(recipient) {
    return {
        ok: true,
        draft_id: 'top1',
        recipient,
        recipient_email: recipient,
        subject: 'Аудит сайта',
        body: 'Здравствуйте! Подготовили мини-аудит вашего сайта...',
    };
}

// Common context: owner present, autosend/mass_send forced off (as the bot does).
function ctx(extra = {}) {
    return {
        isOwner: true,
        autosend: false,
        mass_send: false,
        env: { ...process.env },
        ...extra,
    };
}

console.log('=== audit_send approve recipient-gate regression ===\n');

// --- Test 2 + 4: fake / example.com recipient blocked BEFORE send ---
{
    const out = await handleClientSendConfirm('top1', ctx({
        draft: makeDraft('test-zb23@example.com'),
        p1_client_send_approved: true,
        owner_confirmed: true,
    }));
    check('example.com recipient → REAL_CLIENT_RECIPIENT_REQUIRED',
        out && out.code === REAL_CLIENT_RECIPIENT_REQUIRED);
    check('example.com recipient → not sent (sent_count 0)',
        out && (out.sent_count === 0 || out.sent_count == null));
    check('example.com recipient → NOT SEND_ADAPTER_NOT_CONFIGURED',
        out && out.code !== SEND_ADAPTER_NOT_CONFIGURED);
}

// --- Test 3: EMAIL_TEST_TO must not be treated as a real client send ---
{
    const testTo = 'self-test-mailbox@yandex.ru';
    const out = await handleClientSendConfirm('top1', ctx({
        draft: makeDraft(testTo),
        env: { ...process.env, EMAIL_TEST_TO: testTo },
        p1_client_send_approved: true,
        owner_confirmed: true,
    }));
    check('EMAIL_TEST_TO recipient → REAL_CLIENT_RECIPIENT_REQUIRED',
        out && out.code === REAL_CLIENT_RECIPIENT_REQUIRED);
    check('EMAIL_TEST_TO recipient → NOT a client send (not SEND_OK_CLIENT_P1)',
        out && out.code !== SEND_OK_CLIENT_P1);
}

// --- Test: plain test/fake address blocked ---
{
    const out = await handleClientSendConfirm('top1', ctx({
        draft: makeDraft('test@test.com'),
        p1_client_send_approved: true,
        owner_confirmed: true,
    }));
    check('test@test.com recipient → REAL_CLIENT_RECIPIENT_REQUIRED',
        out && out.code === REAL_CLIENT_RECIPIENT_REQUIRED);
}

// --- Test: empty recipient blocked ---
{
    const out = await handleClientSendConfirm('top1', ctx({
        draft: makeDraft(''),
        p1_client_send_approved: true,
        owner_confirmed: true,
    }));
    check('empty recipient → REAL_CLIENT_RECIPIENT_REQUIRED',
        out && out.code === REAL_CLIENT_RECIPIENT_REQUIRED);
}

// --- Test 1: real recipient must NOT yield SEND_ADAPTER_NOT_CONFIGURED ---
// With a real client address the recipient gate passes; because P1 is NOT armed
// here, the controller stops at an honest pre-send code (e.g. P1_REQUIRED) and
// NEVER at SEND_ADAPTER_NOT_CONFIGURED. This proves the approve path uses the
// real client-send handler, not the offline adapter-not-configured branch.
{
    const out = await handleClientSendConfirm('top1', ctx({
        draft: makeDraft('director@realfactory-omsk.ru'),
        // P1 intentionally NOT armed → no real send happens in this test.
        p1_client_send_approved: false,
        owner_confirmed: false,
    }));
    check('real recipient → NOT REAL_CLIENT_RECIPIENT_REQUIRED (gate passes)',
        out && out.code !== REAL_CLIENT_RECIPIENT_REQUIRED);
    check('real recipient → NOT SEND_ADAPTER_NOT_CONFIGURED (uses client handler)',
        out && out.code !== SEND_ADAPTER_NOT_CONFIGURED);
    check('real recipient (P1 not armed) → no send (sent_count 0)',
        out && (out.sent_count === 0 || out.sent_count == null));
}

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed > 0) {
    console.log('FAILED:', fails.join(', '));
    process.exit(1);
}
console.log('ALL GREEN');
process.exit(0);
