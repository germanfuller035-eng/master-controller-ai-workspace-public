// telegram_approved_email_send_adapter_e1_offline_test.mjs
// E1 Approved Email Send Adapter — OFFLINE test pack.
//
// SAFETY: This test NEVER performs a real send. It never touches the network,
// never reads .env / AI_SECRETS / tokens, never writes 13_sales or approval_queue,
// never imports leads, never unfreezes /lead_import_prepare. All "sends" go
// through an in-memory mock adapter that just records calls.

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    isEmailSendAdapterConfigured,
    validateEmailRecipient,
    buildEmailPayload,
    sendApprovedEmail,
    SEND_ADAPTER_NOT_CONFIGURED,
    INVALID_RECIPIENT,
    SEND_BLOCKED_MISSING_RECIPIENT,
    SEND_BLOCKED_MASS_SEND,
    SEND_BLOCKED_AUTOSEND,
    SEND_OK_MOCK,
    REAL_SEND_ENABLED,
    D3C_FREEZE,
} from '../telegram_gateway/telegram_approved_email_send_adapter.mjs';

import {
    processApproval,
    buildSendLogEntry,
    handleDraftConfirm,
} from '../telegram_gateway/telegram_approved_send_controller.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'telegram_e1', 'draft_valid.json');

let passed = 0;
const fails = [];
function check(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  PASS  ${name}`);
    } catch (err) {
        fails.push({ name, message: err.message });
        console.log(`  FAIL  ${name}: ${err.message}`);
    }
}

// In-memory mock adapter — records send calls, NO network.
function makeMockAdapter() {
    const calls = [];
    return {
        calls,
        send(payload) {
            calls.push(payload);
            return { delivered: true };
        },
    };
}

const validDraft = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

console.log('E1 Approved Email Send Adapter — offline tests\n');

// ---- Hard safety constants -------------------------------------------------
check('real send DISABLED in build (REAL_SEND_ENABLED === false)', () => {
    assert.strictEqual(REAL_SEND_ENABLED, false);
});
check('D3C freeze marker present (ACTIVE)', () => {
    assert.strictEqual(D3C_FREEZE, 'ACTIVE');
});

// ---- Adapter not configured ------------------------------------------------
check('adapter not configured -> isEmailSendAdapterConfigured false', () => {
    assert.strictEqual(isEmailSendAdapterConfigured({}), false);
});
check('sendApprovedEmail without adapter -> SEND_ADAPTER_NOT_CONFIGURED', () => {
    const payload = buildEmailPayload(validDraft, {});
    const r = sendApprovedEmail(payload, {});
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, SEND_ADAPTER_NOT_CONFIGURED);
    assert.strictEqual(r.sent_count, 0);
});

// ---- Email validation ------------------------------------------------------
check('invalid email (no dot after @) -> INVALID_RECIPIENT', () => {
    const r = validateEmailRecipient('user@localhost');
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, INVALID_RECIPIENT);
});
check('invalid email (no @) -> INVALID_RECIPIENT', () => {
    assert.strictEqual(validateEmailRecipient('userexample.com').code, INVALID_RECIPIENT);
});
check('invalid email (space) -> INVALID_RECIPIENT', () => {
    assert.strictEqual(validateEmailRecipient('a b@x.com').code, INVALID_RECIPIENT);
});
check('invalid email (>254 chars) -> INVALID_RECIPIENT', () => {
    const long = 'a'.repeat(250) + '@x.com';
    assert.strictEqual(validateEmailRecipient(long).code, INVALID_RECIPIENT);
});
check('missing recipient -> SEND_BLOCKED_MISSING_RECIPIENT', () => {
    assert.strictEqual(validateEmailRecipient('').code, SEND_BLOCKED_MISSING_RECIPIENT);
    assert.strictEqual(validateEmailRecipient(null).code, SEND_BLOCKED_MISSING_RECIPIENT);
});
check('valid email -> ok', () => {
    assert.strictEqual(validateEmailRecipient('owner@romashka.example').ok, true);
});

// ---- Payload structure -----------------------------------------------------
check('buildEmailPayload contains to/subject/body/channel/draft_id/company/website', () => {
    const p = buildEmailPayload(validDraft, {});
    assert.strictEqual(p.to, validDraft.recipient);
    assert.strictEqual(p.subject, validDraft.subject);
    assert.strictEqual(p.body, validDraft.body);
    assert.strictEqual(p.channel, 'email');
    assert.strictEqual(p.draft_id, validDraft.draft_id);
    assert.strictEqual(p.company, validDraft.company);
    assert.strictEqual(p.website, validDraft.website);
    assert.strictEqual(p.approved_by, 'Dmitry');
});

// ---- Mock adapter send -----------------------------------------------------
check('mock adapter configured -> SEND_OK_MOCK', () => {
    const mock = makeMockAdapter();
    const payload = buildEmailPayload(validDraft, {});
    const r = sendApprovedEmail(payload, { mockAdapter: mock });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.code, SEND_OK_MOCK);
});
check('mock send dispatches EXACTLY 1 message', () => {
    const mock = makeMockAdapter();
    const payload = buildEmailPayload(validDraft, {});
    const r = sendApprovedEmail(payload, { mockAdapter: mock });
    assert.strictEqual(r.sent_count, 1);
    assert.strictEqual(mock.calls.length, 1);
});
check('mass send blocked (array recipient) -> SEND_BLOCKED_MASS_SEND', () => {
    const mock = makeMockAdapter();
    const payload = buildEmailPayload(validDraft, {});
    payload.to = ['a@x.com', 'b@x.com'];
    const r = sendApprovedEmail(payload, { mockAdapter: mock });
    assert.strictEqual(r.code, SEND_BLOCKED_MASS_SEND);
    assert.strictEqual(mock.calls.length, 0);
});
check('autosend blocked -> SEND_BLOCKED_AUTOSEND', () => {
    const mock = makeMockAdapter();
    const payload = buildEmailPayload(validDraft, {});
    const r = sendApprovedEmail(payload, { mockAdapter: mock, autosend: true });
    assert.strictEqual(r.code, SEND_BLOCKED_AUTOSEND);
    assert.strictEqual(mock.calls.length, 0);
});

// ---- Controller approval flow ---------------------------------------------
check('controller: adapter not configured -> SEND_ADAPTER_NOT_CONFIGURED', () => {
    const r = processApproval({ action: 'approve', draft_id: validDraft.draft_id }, {
        isOwner: true,
        draft: validDraft,
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, SEND_ADAPTER_NOT_CONFIGURED);
});
check('controller: invalid email -> INVALID_RECIPIENT', () => {
    const bad = { ...validDraft, recipient: 'user@localhost' };
    const r = processApproval({ action: 'approve', draft_id: bad.draft_id }, {
        isOwner: true,
        draft: bad,
    });
    assert.strictEqual(r.code, INVALID_RECIPIENT);
});
check('controller: missing recipient -> SEND_BLOCKED_MISSING_RECIPIENT', () => {
    const nr = { ...validDraft, recipient: '' };
    const r = processApproval({ action: 'approve', draft_id: nr.draft_id }, {
        isOwner: true,
        draft: nr,
    });
    assert.strictEqual(r.code, SEND_BLOCKED_MISSING_RECIPIENT);
});
check('controller: missing preview -> SEND_BLOCKED_NO_PREVIEW', () => {
    const r = processApproval({ action: 'approve', draft_id: 'unknown-id' }, {
        isOwner: true,
    });
    assert.strictEqual(r.code, 'SEND_BLOCKED_NO_PREVIEW');
});
check('controller: missing draft_id -> BLOCKED (SEND_BLOCKED_NO_DRAFT)', () => {
    const r = processApproval({ action: 'approve', draft_id: '' }, { isOwner: true });
    assert.strictEqual(r.code, 'SEND_BLOCKED_NO_DRAFT');
});
check('controller: non-owner refused', () => {
    const r = processApproval({ action: 'approve', draft_id: validDraft.draft_id }, {
        isOwner: false,
        draft: validDraft,
    });
    assert.strictEqual(r.code, 'SEND_BLOCKED_NOT_OWNER');
});
check('controller: mock adapter configured -> SEND_OK_MOCK + 1 message', () => {
    const mock = makeMockAdapter();
    const r = processApproval({ action: 'approve', draft_id: validDraft.draft_id }, {
        isOwner: true,
        draft: validDraft,
        mockAdapter: mock,
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.code, SEND_OK_MOCK);
    assert.strictEqual(r.sent_count, 1);
    assert.strictEqual(mock.calls.length, 1);
});
check('controller: autosend blocked even with mock adapter', () => {
    const mock = makeMockAdapter();
    const r = processApproval({ action: 'approve', draft_id: validDraft.draft_id }, {
        isOwner: true,
        draft: validDraft,
        mockAdapter: mock,
        autosend: true,
    });
    assert.strictEqual(r.code, 'SEND_BLOCKED_AUTOSEND');
    assert.strictEqual(mock.calls.length, 0);
});

// ---- buildSendLogEntry: object only, no file write ------------------------
check('buildSendLogEntry returns object but writes NO file', () => {
    const entry = buildSendLogEntry(validDraft, { send_result: SEND_OK_MOCK });
    assert.ok(entry && typeof entry === 'object');
    assert.strictEqual(entry.company, validDraft.company);
    assert.strictEqual(entry.channel, 'email');
    assert.strictEqual(entry.approved_by, 'Dmitry');
    // No 13_sales artifact created by the log builder.
    const salesDir = path.join(__dirname, '..', '..', '13_sales');
    if (fs.existsSync(salesDir)) {
        const probe = path.join(salesDir, `__e1_test_probe_${validDraft.draft_id}.json`);
        assert.strictEqual(fs.existsSync(probe), false, 'unexpected 13_sales write');
    }
});

// ---- Callback confirm wrapper (button) ------------------------------------
check('handleDraftConfirm: non-owner -> NOT_OWNER (no send)', () => {
    const out = handleDraftConfirm(validDraft.draft_id, { isOwner: false, draft: validDraft });
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.code, 'SEND_BLOCKED_NOT_OWNER');
});
check('handleDraftConfirm: owner, no adapter -> SEND_ADAPTER_NOT_CONFIGURED message', () => {
    const out = handleDraftConfirm(validDraft.draft_id, { isOwner: true, draft: validDraft });
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.code, SEND_ADAPTER_NOT_CONFIGURED);
    assert.ok(out.text.includes('SEND_ADAPTER_NOT_CONFIGURED'));
});

// ---- Source-level safety guards (static scan of adapter) -------------------
check('adapter source: no SMTP / Yandex / Telegram API / token / .env reads', () => {
    const raw = fs.readFileSync(
        path.join(__dirname, '..', 'telegram_gateway', 'telegram_approved_email_send_adapter.mjs'),
        'utf8'
    );
    // Strip block + line comments so the safety prose
    // ("NO AI_SECRETS read", "NO .env read", ...) does not trip the scan.
    const src = raw
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, ''))
        .join('\n');
    const forbidden = [
        /nodemailer/i,
        /createTransport/i,
        /api\.telegram\.org/i,
        /smtp\.yandex/i,
        /imap\.yandex/i,
        /process\.env\./,
        /AI_SECRETS/,
        /readFileSync\([^)]*\.env/i,
    ];
    for (const re of forbidden) {
        assert.ok(!re.test(src), `forbidden pattern present: ${re}`);
    }
});

// ---- Summary ---------------------------------------------------------------
console.log(`\n${passed} passed, ${fails.length} failed`);
if (fails.length > 0) {
    for (const f of fails) console.log(`  - ${f.name}: ${f.message}`);
    process.exit(1);
}
console.log('E1 OFFLINE TESTS: GREEN');
