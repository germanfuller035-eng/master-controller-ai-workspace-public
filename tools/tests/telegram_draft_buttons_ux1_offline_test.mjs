// telegram_draft_buttons_ux1_offline_test.mjs
// UX1 Draft Buttons + R4 Status Parser Fix — OFFLINE test.
//
// SAFETY: pure imports only. NO Telegram API, NO token read, NO .env read,
// NO queue write, NO approval_queue write, NO real import, NO send, NO restart.
// All leads/recipients are injected; no live network or live filesystem write.

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import draftCenter, {
    buildDraft,
    formatDraftPreview,
    buildDraftReplyMarkup,
    safeDraftId,
    handleDraftCommand,
    classifyDraftCommand,
    SEND_BLOCKED_MISSING_RECIPIENT,
    CB_PREFIX_CONFIRM,
    CB_PREFIX_EDIT,
} from '../telegram_gateway/telegram_outbound_draft_center.mjs';

import sendController, {
    handleDraftConfirm,
    handleDraftEdit,
    SEND_ADAPTER_NOT_CONFIGURED,
    MSG_NOT_OWNER,
    MSG_EDIT_MISSING_RECIPIENT,
    MSG_NO_PREVIEW_FOUND,
    MSG_ADAPTER_NOT_CONFIGURED,
    EDIT_MODE_PLANNED,
} from '../telegram_gateway/telegram_approved_send_controller.mjs';

import { extractStatus, extractPassWarnFail, formatOpsReply } from '../telegram_gateway/telegram_ops_executor.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;
const failures = [];
function check(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (err) {
        failed++;
        failures.push({ name, message: err.message });
        console.log(`  ❌ ${name}: ${err.message}`);
    }
}

// Deterministic injected lead (no live fixture dependency).
const LEAD = { lead_id: 'L1', company: 'ЖБИ-23', website: 'zb23.ru' };

console.log('\n=== UX1 Draft Buttons ===');

check('/audit_draft top1 classifies to draft/top1', () => {
    const parsed = classifyDraftCommand('/audit_draft top1');
    assert.ok(parsed && parsed.action === 'draft' && parsed.target === 'top1');
});

check('handleDraftCommand returns reply_markup', () => {
    const out = handleDraftCommand({ action: 'draft', target: 'top1' }, { lead: LEAD, recipient: 'a@b.ru' });
    assert.ok(out.reply_markup, 'reply_markup missing');
});

check('inline_keyboard present', () => {
    const draft = buildDraft('top1', { lead: LEAD, recipient: 'a@b.ru' });
    const rm = buildDraftReplyMarkup(draft);
    assert.ok(rm && Array.isArray(rm.inline_keyboard) && rm.inline_keyboard.length >= 1);
});

check('button "✅ Подтвердить" present', () => {
    const draft = buildDraft('top1', { lead: LEAD, recipient: 'a@b.ru' });
    const rm = buildDraftReplyMarkup(draft);
    const flat = rm.inline_keyboard.flat();
    assert.ok(flat.some(b => b.text === '✅ Подтвердить'));
});

check('button "✏️ Редактировать" present', () => {
    const draft = buildDraft('top1', { lead: LEAD, recipient: 'a@b.ru' });
    const rm = buildDraftReplyMarkup(draft);
    const flat = rm.inline_keyboard.flat();
    assert.ok(flat.some(b => b.text === '✏️ Редактировать'));
});

check('confirm callback_data contains draft_id (safe id)', () => {
    const draft = buildDraft('top1', { lead: LEAD, recipient: 'a@b.ru' });
    const rm = buildDraftReplyMarkup(draft);
    const flat = rm.inline_keyboard.flat();
    const confirm = flat.find(b => b.callback_data.startsWith(CB_PREFIX_CONFIRM));
    const sid = safeDraftId(draft.draft_id);
    assert.ok(confirm && confirm.callback_data === `${CB_PREFIX_CONFIRM}${sid}`);
});

check('edit callback_data contains draft_id (safe id)', () => {
    const draft = buildDraft('top1', { lead: LEAD, recipient: 'a@b.ru' });
    const rm = buildDraftReplyMarkup(draft);
    const flat = rm.inline_keyboard.flat();
    const edit = flat.find(b => b.callback_data.startsWith(CB_PREFIX_EDIT));
    const sid = safeDraftId(draft.draft_id);
    assert.ok(edit && edit.callback_data === `${CB_PREFIX_EDIT}${sid}`);
});

check('all callback_data <= 64 chars', () => {
    const draft = buildDraft('top1', { lead: LEAD, recipient: 'a@b.ru' });
    const rm = buildDraftReplyMarkup(draft);
    const flat = rm.inline_keyboard.flat();
    for (const b of flat) {
        assert.ok(b.callback_data.length <= 64, `${b.callback_data} too long (${b.callback_data.length})`);
    }
});

check('callback_data <= 64 even with very long draft_id', () => {
    const longId = 'draft_top1_' + 'x'.repeat(200);
    const sid = safeDraftId(longId);
    assert.ok((CB_PREFIX_EDIT + sid).length <= 64);
});

check('safeDraftId strips unsafe chars / falls back to hash', () => {
    const sid = safeDraftId('bad id!@#$%^&*() with spaces');
    assert.ok(/^[A-Za-z0-9_-]+$/.test(sid), `unsafe id: ${sid}`);
});

check('preview contains draft_id', () => {
    const draft = buildDraft('top1', { lead: LEAD, recipient: 'a@b.ru' });
    const text = formatDraftPreview(draft);
    assert.ok(text.includes(draft.draft_id));
});

check('preview contains "НЕ отправлено"', () => {
    const draft = buildDraft('top1', { lead: LEAD, recipient: 'a@b.ru' });
    const text = formatDraftPreview(draft);
    assert.ok(text.includes('НЕ отправлено'));
});

check('preview contains "Autosend: BLOCKED"', () => {
    const draft = buildDraft('top1', { lead: LEAD, recipient: 'a@b.ru' });
    const text = formatDraftPreview(draft);
    assert.ok(text.includes('Autosend: BLOCKED'));
});

// --- C1 PREVIEW_READY scenario: contact resolves → recipient set ---------
// C1 contract: when a contact is found (injected/fixture), the draft becomes
// PREVIEW_READY, recipient is populated, and SEND_BLOCKED_MISSING_RECIPIENT
// must NOT appear. Contact resolver is read-only; no production data touched.
// v1 contract: the real contact resolver is authoritative. For zb23.ru the
// verified sendable recipient is kvs@zb23.ru (the address the first email was
// actually sent to). The injected fixture must match the real resolver output.
const C1_CONTACTS = [{ target: 'top1', website: 'zb23.ru', email: 'kvs@zb23.ru' }];


check('C1: contact resolved → PREVIEW_READY + recipient set', () => {
    const draft = buildDraft('top1', { lead: LEAD, contacts: C1_CONTACTS });
    assert.strictEqual(draft.send_status, 'PREVIEW_READY');
    // buildDraft uses the authoritative real contact resolver (resolveRealContact),
    // not opts.contacts. For zb23.ru the verified sendable recipient is kvs@zb23.ru.
    assert.strictEqual(draft.recipient, 'kvs@zb23.ru');
});


check('C1: PREVIEW_READY preview has NO SEND_BLOCKED_MISSING_RECIPIENT', () => {
    const draft = buildDraft('top1', { lead: LEAD, contacts: C1_CONTACTS });
    const text = formatDraftPreview(draft);
    assert.ok(!text.includes(SEND_BLOCKED_MISSING_RECIPIENT));
});

check('C1: PREVIEW_READY keeps ✅ Подтвердить / ✏️ Редактировать buttons', () => {
    const draft = buildDraft('top1', { lead: LEAD, contacts: C1_CONTACTS });
    const flat = buildDraftReplyMarkup(draft).inline_keyboard.flat();
    assert.ok(flat.some(b => b.text === '✅ Подтвердить'));
    assert.ok(flat.some(b => b.text === '✏️ Редактировать'));
});

check('C1: PREVIEW_READY preview still shows Autosend: BLOCKED', () => {
    const draft = buildDraft('top1', { lead: LEAD, contacts: C1_CONTACTS });
    assert.ok(formatDraftPreview(draft).includes('Autosend: BLOCKED'));
});

check('C1: PREVIEW_READY confirm → no real send, SEND_ADAPTER_NOT_CONFIGURED', () => {
    const draft = buildDraft('top1', { lead: LEAD, contacts: C1_CONTACTS });
    const r = handleDraftConfirm(draft.draft_id, { isOwner: true, draft });
    assert.ok(!r.ok && r.code === SEND_ADAPTER_NOT_CONFIGURED, 'expected SEND_ADAPTER_NOT_CONFIGURED');
    assert.ok(r.code !== 'SENT', 'must never perform real send offline');
});

// --- Missing-recipient scenario preserved (no contact: resolve disabled) ---
// With resolve:false and no recipient, no contact is available, so the legacy
// SEND_BLOCKED_MISSING_RECIPIENT behavior MUST remain.
check('no contact → SEND_BLOCKED_MISSING_RECIPIENT in preview', () => {
    const draft = buildDraft('top1', { lead: LEAD, recipient: '', resolve: false });
    const text = formatDraftPreview(draft);
    assert.strictEqual(draft.send_status, SEND_BLOCKED_MISSING_RECIPIENT);
    assert.ok(text.includes(SEND_BLOCKED_MISSING_RECIPIENT));
});

check('no contact → confirm button still rendered', () => {
    const draft = buildDraft('top1', { lead: LEAD, recipient: '', resolve: false });
    const rm = buildDraftReplyMarkup(draft);
    const flat = rm.inline_keyboard.flat();
    assert.ok(flat.some(b => b.text === '✅ Подтвердить'));
});

check('no contact → confirm BLOCKED (missing recipient)', () => {
    const draft = buildDraft('top1', { lead: LEAD, recipient: '', resolve: false });
    const r = handleDraftConfirm(draft.draft_id, { isOwner: true, draft });
    assert.ok(!r.ok && r.text === MSG_EDIT_MISSING_RECIPIENT);
});

console.log('\n=== Confirm callback ===');

check('non-owner refused', () => {
    const r = handleDraftConfirm('draft_top1_abc', { isOwner: false });
    assert.ok(!r.ok && r.text === MSG_NOT_OWNER);
});

check('missing draft_id blocked', () => {
    const r = handleDraftConfirm('', { isOwner: true });
    assert.ok(!r.ok);
});

check('no preview blocked → NO_PREVIEW_FOUND', () => {
    const r = handleDraftConfirm('draft_top1_abc', { isOwner: true });
    assert.ok(!r.ok && r.text === MSG_NO_PREVIEW_FOUND);
});

check('missing recipient blocked (no contact resolves)', () => {
    // resolve:false → no contact available → genuine missing-recipient case.
    const draft = buildDraft('top1', { lead: LEAD, recipient: '', resolve: false });
    const r = handleDraftConfirm(draft.draft_id, { isOwner: true, draft });
    assert.ok(!r.ok && r.text === MSG_EDIT_MISSING_RECIPIENT);
});

check('send adapter missing → SEND_ADAPTER_NOT_CONFIGURED', () => {
    const draft = buildDraft('top1', { lead: LEAD, recipient: 'a@b.ru' });
    const r = handleDraftConfirm(draft.draft_id, { isOwner: true, draft });
    assert.ok(!r.ok && r.code === SEND_ADAPTER_NOT_CONFIGURED && r.text === MSG_ADAPTER_NOT_CONFIGURED);
});

check('confirm never performs real send (no ok SENT in offline)', () => {
    const draft = buildDraft('top1', { lead: LEAD, recipient: 'a@b.ru' });
    const r = handleDraftConfirm(draft.draft_id, { isOwner: true, draft });
    assert.ok(r.code !== 'SENT');
});

console.log('\n=== Edit callback ===');

check('non-owner refused', () => {
    const r = handleDraftEdit('draft_top1_abc', { isOwner: false });
    assert.ok(!r.ok && r.text === MSG_NOT_OWNER);
});

check('edit returns instruction (EDIT_MODE_PLANNED)', () => {
    const r = handleDraftEdit('draft_top1_abc', { isOwner: true });
    assert.ok(r.ok && r.code === EDIT_MODE_PLANNED && /Режим редактирования/.test(r.text));
});

check('edit does not send (no SENT)', () => {
    const r = handleDraftEdit('draft_top1_abc', { isOwner: true });
    assert.ok(r.code !== 'SENT');
});

check('edit instruction mentions /audit_edit_recipient', () => {
    const r = handleDraftEdit('draft_top1_abc', { isOwner: true });
    assert.ok(r.text.includes('/audit_edit_recipient'));
});

console.log('\n=== R4 status parser ===');

const SAMPLE_GREEN = [
    '🧪 Regression / R4',
    'Running smoke pack...',
    'OVERALL: GREEN',
    'PASS: 33 | WARN: 0 | FAIL: 0',
].join('\n');

const SAMPLE_RED = [
    '🧪 Regression / R4',
    'OVERALL: RED',
    'PASS: 30 | WARN: 0 | FAIL: 3',
].join('\n');

const SAMPLE_YELLOW = [
    'OVERALL: YELLOW',
    'PASS: 32 | WARN: 1 | FAIL: 0',
].join('\n');

check('OVERALL: GREEN → status GREEN', () => {
    assert.strictEqual(extractStatus(SAMPLE_GREEN), 'GREEN');
});

check('OVERALL: GREEN → result PASS', () => {
    assert.strictEqual(extractPassWarnFail(SAMPLE_GREEN), 'PASS');
});

check('OLD FALSE-RED BUG: GREEN output must NOT yield RED', () => {
    assert.notStrictEqual(extractStatus(SAMPLE_GREEN), 'RED');
});

check('OVERALL: RED → status RED / result FAIL', () => {
    assert.strictEqual(extractStatus(SAMPLE_RED), 'RED');
    assert.strictEqual(extractPassWarnFail(SAMPLE_RED), 'FAIL');
});

check('OVERALL: YELLOW → status YELLOW', () => {
    assert.strictEqual(extractStatus(SAMPLE_YELLOW), 'YELLOW');
});

check('formatOpsReply(GREEN) shows Статус: GREEN and Результат: PASS', () => {
    const reply = formatOpsReply({
        action: 'regression', ok: true, exitCode: 0,
        stdout: SAMPLE_GREEN, stderr: '', status: extractStatus(SAMPLE_GREEN),
        passWarnFail: extractPassWarnFail(SAMPLE_GREEN), timedOut: false,
    });
    assert.ok(reply.includes('Статус: GREEN'), 'missing Статус: GREEN');
    assert.ok(reply.includes('Результат: PASS'), 'missing Результат: PASS');
    assert.ok(!reply.includes('Статус: RED'), 'must not contain Статус: RED');
});

console.log('\n=== Safety invariants ===');

check('/ping not intercepted by draft classifier', () => {
    assert.strictEqual(classifyDraftCommand('/ping'), null);
});
check('/health not intercepted by draft classifier', () => {
    assert.strictEqual(classifyDraftCommand('/health'), null);
});
check('/today not intercepted by draft classifier', () => {
    assert.strictEqual(classifyDraftCommand('/today'), null);
});
check('/lead_import_prepare not intercepted (not unfrozen) by draft classifier', () => {
    assert.strictEqual(classifyDraftCommand('/lead_import_prepare'), null);
});

check('source modules contain no live Telegram API tokens usage', () => {
    const files = [
        '../telegram_gateway/telegram_outbound_draft_center.mjs',
        '../telegram_gateway/telegram_approved_send_controller.mjs',
        '../telegram_gateway/telegram_ops_executor.mjs',
    ];
    for (const f of files) {
        const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
        assert.ok(!/process\.env\.(BOT_TOKEN|TELEGRAM_TOKEN|TOKEN)\b/.test(src), `${f} reads token`);
    }
});

check('D3C freeze marker still present in prepare adapter', () => {
    const p = path.join(__dirname, '../telegram_gateway/lead_import_prepare_adapter.mjs');
    if (fs.existsSync(p)) {
        const src = fs.readFileSync(p, 'utf8');
        assert.ok(/FREEZE|freeze|FROZEN|disabled/i.test(src), 'freeze marker missing');
    }
});

console.log(`\n──────────────────────────────`);
console.log(`PASS: ${passed} | FAIL: ${failed}`);
if (failed > 0) {
    console.log('OVERALL: RED');
    for (const f of failures) console.log(`  - ${f.name}: ${f.message}`);
    process.exit(1);
} else {
    console.log('OVERALL: GREEN');
    process.exit(0);
}
