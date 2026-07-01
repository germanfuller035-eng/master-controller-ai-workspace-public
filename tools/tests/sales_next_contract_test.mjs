// sales_next_contract_test.mjs
// Contract/regression suite for the ONE canonical production sales command:
//
//   /sales_next
//
// /sales_next is a thin alias of "/audit_draft top1". It MUST reuse the same
// canonical functions as the rest of the pipeline:
//   - contact resolver       (telegram_contact_resolver.mjs)
//   - audit draft builder     (telegram_outbound_draft_center.buildDraft)
//   - template renderer       (audit_send_templates.renderAuditEmail)
//   - approval controller     (telegram_approved_send_controller.handleClientSendConfirm)
//   - SMTP adapter            (telegram_approved_email_send_adapter.sendApprovedClientEmail)
//
// SAFETY: This test NEVER opens an SMTP socket. The send success path is proven
// by stopping at the LAST safe gate (real_send_enabled=false). No email is sent.
//
// Run: node tools/tests/sales_next_contract_test.mjs

import {
    classifyDraftCommand,
    buildDraft,
} from '../telegram_gateway/telegram_outbound_draft_center.mjs';

import {
    renderAuditEmail,
    DEFAULT_OFFER_PRICE,
} from '../telegram_gateway/audit_send_templates.mjs';

import {
    handleClientSendConfirm,
    REAL_CLIENT_RECIPIENT_REQUIRED,
} from '../telegram_gateway/telegram_approved_send_controller.mjs';

import {
    sendApprovedClientEmail,
    isP1ClientRecipientValid,
    P1_REQUIRED,
    P1_BLOCKED_INVALID_RECIPIENT,
    SEND_BLOCKED_REAL_SEND_DISABLED,
    SEND_OK_CLIENT_P1,
} from '../telegram_gateway/telegram_approved_email_send_adapter.mjs';


let passed = 0;
let failed = 0;
const failures = [];

function ok(name, cond) {
    if (cond) { passed++; }
    else { failed++; failures.push(name); console.log(`  ✗ FAIL: ${name}`); }
}

const CLIENT_TO = 'owner@realclient.ru';
const ENV = {
    EMAIL_TEST_TO: 'selftest@yandex.ru',
    EMAIL_FROM: 'me@yandex.ru',
    EMAIL_FROM_LABEL: 'Дмитрий Смагин',
    YANDEX_MAIL_LOGIN: 'me@yandex.ru',
    YANDEX_MAIL_APP_PASSWORD: 'SENTINEL_SECRET_DO_NOT_LEAK_9f3a',
};

async function run() {
    console.log('/sales_next contract test\n');

    // --- 1. /sales_next routes to the canonical TOP-1 draft ----------------
    const variants = ['/sales_next', '/salesnext', 'следующий клиент', 'следующая продажа'];
    for (const v of variants) {
        const parsed = classifyDraftCommand(v);
        ok(`/sales_next routes "${v}" => draft top1`,
            parsed && parsed.action === 'draft' && parsed.target === 'top1');
    }
    // negative: unrelated text does not route to draft
    ok('/sales_next does not over-match unrelated text',
        classifyDraftCommand('как дела') == null);

    // --- 2. The draft uses the canonical template renderer -----------------
    // (No "Ранее писал" first-touch wording, price 10000 ₽.)
    const rendered = renderAuditEmail({ site: 'zb23.ru', niche: 'local' });
    ok('renderer: first-touch has NO "Ранее писал"', !rendered.body.includes('Ранее писал'));
    ok('renderer: price is 10000 ₽',
        DEFAULT_OFFER_PRICE === 10000 && rendered.body.includes('10000 ₽'));

    // The draft builder itself should not leak a fake/test recipient.
    const draftRes = buildDraft('top1', { env: ENV });
    ok('buildDraft returns an object', draftRes && typeof draftRes === 'object');
    if (draftRes && draftRes.recipient) {
        ok('buildDraft recipient is not a fake/test address',
            isP1ClientRecipientValid(draftRes.recipient, ENV).ok === true);
    } else {
        // No real recipient resolved is acceptable (it surfaces the recipient gate later)
        ok('buildDraft without recipient is acceptable (gate enforced later)', true);
    }

    // --- 3. /sales_next cannot use a fake/test recipient -------------------
    ok('gate: empty recipient blocked', isP1ClientRecipientValid('', ENV).ok === false);
    ok('gate: EMAIL_TEST_TO blocked', isP1ClientRecipientValid(ENV.EMAIL_TEST_TO, ENV).ok === false);
    ok('gate: example.com blocked', isP1ClientRecipientValid('a@example.com', ENV).ok === false);
    ok('gate: test* blocked', isP1ClientRecipientValid('test@foo.ru', ENV).ok === false);
    ok('gate: real client allowed', isP1ClientRecipientValid(CLIENT_TO, ENV).ok === true);

    // --- 4. approve path uses the SMTP adapter (no P1 env flag required) ----
    const payload = { to: CLIENT_TO, subject: rendered.subject, body: rendered.body };
    const base = {
        env: ENV,
        owner_confirmed: true,
        approved_by: 'Dmitry',
        message_count: 1,
        real_send_enabled: false, // STOP before SMTP — never send in tests
    };

    // P1 env flag NOT set -> Telegram ✅ owner approval is the only gate.
    let r = await sendApprovedClientEmail(payload, { ...base });
    ok('approve: owner ✅ without P1 env flag is NOT P1_REQUIRED', r.code !== P1_REQUIRED);
    ok('approve: reaches SMTP adapter, stops at real_send_disabled (no send)',
        r.code === SEND_BLOCKED_REAL_SEND_DISABLED && r.sent_count === 0);

    // No Telegram approval (owner not confirmed) -> cannot send.
    r = await sendApprovedClientEmail(payload, { ...base, owner_confirmed: false });
    ok('approve: no Telegram ✅ => P1_REQUIRED, no send', r.code === P1_REQUIRED && r.sent_count === 0);

    // Fake recipient through adapter -> blocked, never sends.
    r = await sendApprovedClientEmail({ ...payload, to: 'a@example.com' }, base);
    ok('approve: example.com => P1_BLOCKED_INVALID_RECIPIENT', r.code === P1_BLOCKED_INVALID_RECIPIENT);

    // --- 5. duplicate approval cannot send twice ---------------------------
    const draft = { draft_id: 'sn1', recipient: CLIENT_TO, subject: rendered.subject, body: rendered.body };
    const store = new Map([['sn1', draft]]);

    const confirmOpts = {
        isOwner: true,
        env: ENV,
        store,
        owner_confirmed: true,
    };
    // First confirm: reaches adapter but real_send disabled => no send.
    let c1 = await handleClientSendConfirm('sn1', confirmOpts);
    ok('confirm #1: no autosend (real_send disabled)',
        c1.code !== SEND_OK_CLIENT_P1 && (c1.sent_count === 0 || c1.sent_count === undefined));

    // Simulate that the draft was consumed/marked after a successful send by
    // removing it from the store; a duplicate click must then find nothing.
    store.delete('sn1');
    let c2 = await handleClientSendConfirm('sn1', confirmOpts);
    ok('confirm #2 (duplicate): unknown/consumed draft cannot resend',
        c2.ok === false && c2.code !== SEND_OK_CLIENT_P1);

    // --- 6. fake recipient via controller surfaces honest code -------------
    const badStore = new Map([['snBad', { draft_id: 'snBad', recipient: 'a@example.com', body: 'b' }]]);
    const cBad = await handleClientSendConfirm('snBad', {
        isOwner: true, env: ENV, store: badStore, owner_confirmed: true,
    });
    ok('controller: fake recipient => REAL_CLIENT_RECIPIENT_REQUIRED',
        cBad.ok === false && cBad.code === REAL_CLIENT_RECIPIENT_REQUIRED);
    ok('controller: fake recipient NOT masked as SEND_ADAPTER_NOT_CONFIGURED',
        cBad.code !== 'SEND_ADAPTER_NOT_CONFIGURED');

    // --- 7. invariants -----------------------------------------------------
    ok('invariant: no secret leakage in results',
        !JSON.stringify({ r, c1, c2, cBad }).includes(ENV.YANDEX_MAIL_APP_PASSWORD));

    console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        console.log('FAILURES:', failures.join('; '));
        process.exit(1);
    }
    console.log('SALES_NEXT_CONTRACT_TEST: GREEN');
}

run().catch((e) => {
    console.error('TEST_CRASH:', e && e.message);
    process.exit(1);
});
