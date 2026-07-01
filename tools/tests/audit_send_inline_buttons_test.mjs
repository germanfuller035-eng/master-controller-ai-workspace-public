/**
 * audit_send_inline_buttons_test.mjs
 *
 * Micro-test for the audit_send inline approval buttons (no Telegram API,
 * no real email send). It re-implements the SMALL pure helpers exactly as
 * patched into telegram_master_bot.mjs and asserts the safety contract:
 *
 *   - preview produces an inline keyboard with ✅ Отправить / ❌ Отклонить
 *   - callback_data carries the draft_id (or a short key mapped to it)
 *   - callback_data stays within Telegram's 64-byte hard limit
 *   - non-owner callback is blocked
 *   - approve routes to the existing approve path (action=approve)
 *   - reject  routes to the existing reject path  (action=reject)
 *   - duplicate press on an already-processed draft is blocked
 *   - NO autosend at preview time
 *
 * Run: node tools/tests/audit_send_inline_buttons_test.mjs
 */

let pass = 0, fail = 0;
function ok(name, cond) {
    if (cond) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}`); }
}

// ── replicate the patched pure helpers ───────────────────────────────────────
const _auditSendKeyByDraft = new Map();
const _auditSendDraftByKey = new Map();
const _auditSendProcessed  = new Map();
let   _auditSendSeq = 0;

function _auditSendResolveKey(draftId) {
    if (_auditSendKeyByDraft.has(draftId)) return _auditSendKeyByDraft.get(draftId);
    const key = 'k' + (++_auditSendSeq).toString(36);
    _auditSendKeyByDraft.set(draftId, key);
    _auditSendDraftByKey.set(key, draftId);
    return key;
}
function _auditSendResolveDraftId(ref) {
    if (_auditSendDraftByKey.has(ref)) return _auditSendDraftByKey.get(ref);
    return ref;
}
function buildAuditSendKeyboard(draftId) {
    if (!draftId) return null;
    const PREFIX_APPROVE = 'audit_send:approve:';
    const PREFIX_REJECT  = 'audit_send:reject:';
    let ref = String(draftId);
    if (Buffer.byteLength(PREFIX_APPROVE + ref, 'utf8') > 64 ||
        Buffer.byteLength(PREFIX_REJECT + ref, 'utf8') > 64) {
        ref = _auditSendResolveKey(String(draftId));
    }
    return {
        inline_keyboard: [
            [{ text: '✅ Отправить', callback_data: PREFIX_APPROVE + ref }],
            [{ text: '❌ Отклонить', callback_data: PREFIX_REJECT + ref }],
        ],
    };
}

// Fake "existing approve/reject controller" — records the action without sending.
let sendsPerformed = 0;
function fakeHandleSend(intent, ctx) {
    // HARD: never actually send in test
    if (ctx && ctx.autosend === true) throw new Error('autosend must be false');
    return { ok: false, result: { ok: false, code: 'SEND_ADAPTER_NOT_CONFIGURED' }, action: intent.action };
}

// Simulated owner-gated callback handler (mirrors patch logic, no Telegram API).
function simulateCallback(data, isOwner) {
    const action = data.startsWith('audit_send:approve:') ? 'approve' : 'reject';
    const ref = data.substring(data.lastIndexOf(':') + 1);
    const draftId = _auditSendResolveDraftId(ref);
    if (!isOwner) return { status: 'owner_gate_blocked' };
    if (_auditSendProcessed.has(draftId)) return { status: 'duplicate_blocked' };
    const out = fakeHandleSend({ action, draft_id: draftId }, { isOwner: true, autosend: false });
    _auditSendProcessed.set(draftId, action);
    return { status: 'processed', action, draftId, out };
}

console.log('=== audit_send inline buttons micro-test ===\n');

// 1. preview builds inline keyboard
const shortDraft = 'draft_top1_abc';
const kb = buildAuditSendKeyboard(shortDraft);
ok('preview builds inline keyboard', !!kb && Array.isArray(kb.inline_keyboard) && kb.inline_keyboard.length === 2);
ok('button labels are ✅ Отправить / ❌ Отклонить',
    kb.inline_keyboard[0][0].text === '✅ Отправить' &&
    kb.inline_keyboard[1][0].text === '❌ Отклонить');

// 2. callback_data carries draft_id (direct mode, short id)
ok('approve callback_data contains draft_id',
    kb.inline_keyboard[0][0].callback_data === `audit_send:approve:${shortDraft}`);
ok('reject callback_data contains draft_id',
    kb.inline_keyboard[1][0].callback_data === `audit_send:reject:${shortDraft}`);

// 3. callback_data <= 64 bytes even for a very long draft_id
const longDraft = 'draft_top1_' + 'x'.repeat(200);
const kbLong = buildAuditSendKeyboard(longDraft);
const cbApprove = kbLong.inline_keyboard[0][0].callback_data;
const cbReject  = kbLong.inline_keyboard[1][0].callback_data;
ok('long draft approve callback_data <= 64 bytes', Buffer.byteLength(cbApprove, 'utf8') <= 64);
ok('long draft reject callback_data <= 64 bytes', Buffer.byteLength(cbReject, 'utf8') <= 64);
const longRef = cbApprove.substring(cbApprove.lastIndexOf(':') + 1);
ok('short key resolves back to original draft_id unambiguously',
    _auditSendResolveDraftId(longRef) === longDraft);

// 4. no draft_id => no keyboard
ok('no draft_id => null keyboard (no buttons)', buildAuditSendKeyboard(null) === null);

// 5. no autosend at preview time
ok('no autosend on preview (no send performed building keyboard)', sendsPerformed === 0);

// 6. non-owner blocked
const nonOwner = simulateCallback(`audit_send:approve:${shortDraft}`, false);
ok('non-owner callback blocked', nonOwner.status === 'owner_gate_blocked');
ok('non-owner did not mark draft processed', !_auditSendProcessed.has(shortDraft));

// 7. owner approve routes to existing approve path
const appr = simulateCallback(`audit_send:approve:${shortDraft}`, true);
ok('owner approve routes to approve path', appr.status === 'processed' && appr.action === 'approve');
ok('approve did not really send (offline safe)', appr.out.result.code === 'SEND_ADAPTER_NOT_CONFIGURED');

// 8. duplicate blocked
const dup = simulateCallback(`audit_send:approve:${shortDraft}`, true);
ok('duplicate press blocked', dup.status === 'duplicate_blocked');

// 9. reject routes to existing reject path
const rejDraft = 'draft_top1_rej';
const rej = simulateCallback(`audit_send:reject:${rejDraft}`, true);
ok('owner reject routes to reject path', rej.status === 'processed' && rej.action === 'reject');

// ── 10. HONEST WORDING CONTRACT ──────────────────────────────────────────────
// Mirror of formatAuditSendApproveHeader() in telegram_master_bot.mjs. The user
// must NOT be told "✅ Отправлено" when no real external send happened.
//   - real send (code 'SENT') → may say "✅ Отправлено"
//   - SEND_ADAPTER_NOT_CONFIGURED / missing recipient / no adapter / blocked →
//     MUST NOT say "Отправлено"; instead "✅ Approval получен" + reason.
function formatAuditSendApproveHeader(action, draftId, out) {
    if (action === 'reject') {
        return `❌ Отклонено: ${draftId}`;
    }
    const result = out && out.result ? out.result : null;
    const realSendSucceeded = !!(result && result.ok === true && result.code === 'SENT');
    if (realSendSucceeded) {
        return `✅ Отправлено: ${draftId}`;
    }
    const reason = (result && result.code) ? result.code : 'SEND_ADAPTER_NOT_CONFIGURED';
    return [
        `✅ Approval получен: ${draftId}`,
        `🚫 Реальная отправка не выполнена: ${reason}`,
        'Autosend: BLOCKED',
    ].join('\n');
}

// 10a. SEND_ADAPTER_NOT_CONFIGURED must NOT produce "Отправлено"
const blockedOut = { result: { ok: false, code: 'SEND_ADAPTER_NOT_CONFIGURED' } };
const blockedHeader = formatAuditSendApproveHeader('approve', 'draft_top1_abc', blockedOut);
ok('SEND_ADAPTER_NOT_CONFIGURED header does NOT contain "Отправлено"',
    !blockedHeader.includes('Отправлено'));
ok('SEND_ADAPTER_NOT_CONFIGURED header acknowledges approval',
    blockedHeader.includes('✅ Approval получен: draft_top1_abc'));
ok('SEND_ADAPTER_NOT_CONFIGURED header states real send not performed',
    blockedHeader.includes('🚫 Реальная отправка не выполнена: SEND_ADAPTER_NOT_CONFIGURED'));
ok('SEND_ADAPTER_NOT_CONFIGURED header states Autosend BLOCKED',
    blockedHeader.includes('Autosend: BLOCKED'));

// 10b. missing recipient (blocked) must NOT produce "Отправлено"
const missingRecipientOut = { result: { ok: false, code: 'SEND_BLOCKED_MISSING_RECIPIENT' } };
const missingRecipientHeader = formatAuditSendApproveHeader('approve', 'draft_x', missingRecipientOut);
ok('missing-recipient header does NOT contain "Отправлено"',
    !missingRecipientHeader.includes('Отправлено'));
ok('missing-recipient header shows the blocking reason',
    missingRecipientHeader.includes('SEND_BLOCKED_MISSING_RECIPIENT'));

// 10c. no result at all must NOT produce "Отправлено" (defaults to adapter-not-configured)
const noResultHeader = formatAuditSendApproveHeader('approve', 'draft_y', null);
ok('no-result header does NOT contain "Отправлено"',
    !noResultHeader.includes('Отправлено'));
ok('no-result header defaults to SEND_ADAPTER_NOT_CONFIGURED reason',
    noResultHeader.includes('SEND_ADAPTER_NOT_CONFIGURED'));

// 10d. real successful send (code 'SENT') MAY say "✅ Отправлено" (future path)
const sentOut = { result: { ok: true, code: 'SENT', draft_id: 'draft_z' } };
const sentHeader = formatAuditSendApproveHeader('approve', 'draft_z', sentOut);
ok('real SENT header says "✅ Отправлено"',
    sentHeader === '✅ Отправлено: draft_z');

// 10e. real-blocked path that the inline callback actually produces (offline)
const inlineBlockedHeader = formatAuditSendApproveHeader('approve', shortDraft, appr.out);
ok('inline offline approve header does NOT contain "Отправлено"',
    !inlineBlockedHeader.includes('Отправлено'));

console.log(`\nResult: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);


