// audit_send_canonical_path_regression_test.mjs
// REGRESSION GUARD for the Telegram audit_send canonical production path.
//
// PURPOSE (root-cause protection — see SOP "after any bug" rule):
//   Lock the single source of truth so the live /audit_draft path can NEVER
//   silently diverge from /audit_send_preview_to_me again.
//
// SAFETY: PURE test. NO Telegram API, NO SMTP, NO network, NO .env read,
//         NO real send. Imports only pure modules and asserts string/contract
//         invariants.
//
// FAILS IF:
//   1. /audit_draft top1 first-touch contains "Ранее писал"
//   2. /audit_draft top1 does NOT contain "Стоимость: 10000 ₽"
//   3. preview-to-me and /audit_draft render from DIFFERENT template sources
//   4. approve path reports SEND_ADAPTER_NOT_CONFIGURED while SMTP env exists
//   5. SEND_ADAPTER_NOT_CONFIGURED appears when adapter/config exists
//   6. old hardcoded first-touch body is reachable from buildDraft
//   7. preview-only header appears in the LIVE client draft body
//   8. live client draft uses EMAIL_TEST_TO as recipient

import assert from 'node:assert';
import { buildDraft } from '../telegram_gateway/telegram_outbound_draft_center.mjs';
import { renderAuditEmail } from '../telegram_gateway/audit_send_templates.mjs';
import {
    sendEmailViaApprovedTransport,
    SEND_ADAPTER_NOT_CONFIGURED,
} from '../telegram_gateway/telegram_approved_email_send_adapter.mjs';

let passed = 0;
let failed = 0;
function check(name, fn) {
    try {
        fn();
        passed += 1;
        console.log(`  ok  - ${name}`);
    } catch (e) {
        failed += 1;
        console.log(`  FAIL- ${name}: ${e && e.message ? e.message : e}`);
    }
}

const PREVIEW_ONLY_MARKERS = ['PREVIEW ONLY', 'PREVIEW-ONLY', 'ТОЛЬКО ПРЕВЬЮ'];
const EMAIL_TEST_TO = 'self-test@example.com'; // fixture stand-in for env value

// A live TOP-1 draft with a real (non-test) client recipient.
const liveDraft = buildDraft('top1', {
    lead: { lead_id: 'L1', company: 'ЖБИ-Завод', website: 'zb23.ru' },
    recipient: 'client@zb23.ru',
});

console.log('audit_send canonical path regression');

// 1. First-touch must NOT contain follow-up wording "Ранее писал".
check('1: /audit_draft top1 first-touch has NO "Ранее писал"', () => {
    assert.ok(liveDraft.ok, 'draft should build');
    assert.ok(!liveDraft.body.includes('Ранее писал'),
        'live first-touch body must not contain follow-up phrase "Ранее писал"');
});

// 2. First-touch must contain the canonical price.
check('2: /audit_draft top1 contains "Стоимость: 10000 ₽"', () => {
    assert.ok(liveDraft.body.includes('Стоимость: 10000 ₽'),
        'live first-touch body must contain "Стоимость: 10000 ₽"');
});

// 3. preview-to-me and /audit_draft must render from the SAME template source.
//    We prove this by rendering the canonical template directly with the same
//    inputs buildDraft uses for TOP-1 (site=zb23.ru, niche=jbi) and asserting
//    byte-identical subject + body.
check('3: preview-to-me and /audit_draft share ONE template source', () => {
    const canonical = renderAuditEmail({
        company: 'ЖБИ-Завод',
        site: 'zb23.ru',
        niche: 'jbi',
    });
    assert.strictEqual(liveDraft.subject, canonical.subject,
        'subject must match the canonical renderAuditEmail output');
    assert.strictEqual(liveDraft.body, canonical.body,
        'body must match the canonical renderAuditEmail output (single source of truth)');
});

// 4 & 5. With SMTP env present + adapter configured, sendEmailViaApprovedTransport
//    must NOT return SEND_ADAPTER_NOT_CONFIGURED. (It may legitimately return a
//    different safety block such as REAL_SEND_DISABLED, but never "not configured"
//    when config exists.)
const fullEnv = {
    EMAIL_PROVIDER: 'yandex',
    EMAIL_SMTP_HOST: 'smtp.example.com',
    EMAIL_SMTP_PORT: '465',
    EMAIL_SMTP_SECURE: 'true',
    EMAIL_SMTP_USER: 'sender@example.com',
    EMAIL_SMTP_PASS: 'app-password-placeholder',
    EMAIL_FROM: 'sender@example.com',
    EMAIL_FROM_LABEL: 'Дмитрий',
    EMAIL_TEST_TO,
    EMAIL_REAL_SEND_ENABLED: 'true',
    EMAIL_TEST_ONLY: 'true',
};

check('4/5: approve path does NOT report SEND_ADAPTER_NOT_CONFIGURED when env exists', () => {
    const res = sendEmailViaApprovedTransport(
        { to: 'client@zb23.ru', subject: liveDraft.subject, body: liveDraft.body },
        { env: fullEnv, owner_confirmed: true, approved_by: 'Dmitry' },
    );
    assert.notStrictEqual(res.code, SEND_ADAPTER_NOT_CONFIGURED,
        `must not be SEND_ADAPTER_NOT_CONFIGURED when SMTP config present (got ${res.code})`);
});

// 5b. Confirm the inverse: with NO config at all, it SHOULD report not configured.
check('5b: empty config correctly yields SEND_ADAPTER_NOT_CONFIGURED', () => {
    const res = sendEmailViaApprovedTransport(
        { to: 'client@zb23.ru' },
        { env: {}, owner_confirmed: true, approved_by: 'Dmitry' },
    );
    assert.strictEqual(res.code, SEND_ADAPTER_NOT_CONFIGURED,
        `empty env must yield SEND_ADAPTER_NOT_CONFIGURED (got ${res.code})`);
});

// 6. Old hardcoded first-touch body must be unreachable: the canonical body has
//    the fixed structure markers from audit_send_templates.mjs. If a stale
//    hardcoded body returned instead, these canonical markers would be absent.
check('6: old hardcoded first-touch body is NOT reachable from buildDraft', () => {
    assert.ok(liveDraft.body.startsWith('Добрый день.'),
        'canonical body must start with "Добрый день."');
    assert.ok(liveDraft.body.includes('Могу подготовить'),
        'canonical body must contain the canonical offer line');
    assert.ok(liveDraft.subject.startsWith('Короткий разбор сайта'),
        'canonical subject prefix must be present');
});

// 7. The LIVE client draft must NOT contain a PREVIEW ONLY header.
check('7: live client draft has NO PREVIEW ONLY header', () => {
    for (const m of PREVIEW_ONLY_MARKERS) {
        assert.ok(!liveDraft.body.includes(m),
            `live client draft must not contain preview marker "${m}"`);
        assert.ok(!String(liveDraft.subject).includes(m),
            `live client subject must not contain preview marker "${m}"`);
    }
});

// 8. The LIVE client draft must NOT use EMAIL_TEST_TO as recipient.
check('8: live client draft recipient is NOT EMAIL_TEST_TO', () => {
    assert.notStrictEqual(liveDraft.recipient, EMAIL_TEST_TO,
        'live client draft recipient must not be the self-test mailbox');
    assert.strictEqual(liveDraft.recipient, 'client@zb23.ru',
        'live client draft must keep the real client recipient');
});

console.log(`\nResult: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
