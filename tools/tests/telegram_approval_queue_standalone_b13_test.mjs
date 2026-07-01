/**
 * telegram_approval_queue_standalone_b13_test.mjs
 * Standalone B1.3 tests for approval_queue.mjs + approval_commands.mjs
 *
 * HARD MODE:
 *   - Uses an isolated SANDBOX workspace under tmp/ — never touches real
 *     13_sales/approval_queue/.
 *   - sendTelegram + botLog are MOCKS only. No real Telegram API, no external
 *     send, no .env, no secrets.
 *   - approve/reject must only change local status — never send anything.
 *
 * Run:
 *   node tools/tests/telegram_approval_queue_standalone_b13_test.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
    createApproval,
    listPendingApprovals,
    getApproval,
    approveApproval,
    rejectApproval,
    getApprovalPaths,
    APPROVAL_STATUSES,
} from '../telegram_gateway/approval_queue.mjs';

import { handleApprovalCommand } from '../telegram_gateway/approval_commands.mjs';

// ─── paths ───────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const REAL_WORKSPACE = path.resolve(path.join(__dirname, '..', '..'));

// SANDBOX workspace — isolated, never the real one.
const SANDBOX = path.join(REAL_WORKSPACE, 'tmp', 'approval_queue_b13_test_workspace');

// ─── result helpers ──────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

function ok(name) {
    passed++;
    results.push(`  ✅ PASS  ${name}`);
}
function bad(name, reason) {
    failed++;
    results.push(`  ❌ FAIL  ${name}  →  ${reason}`);
}
function check(name, cond, reason = 'condition false') {
    if (cond) ok(name); else bad(name, reason);
}

// ─── sandbox cleanup (ONLY this tmp path) ────────────────────────────────────
function rmrf(target) {
    // Hard safety: refuse to delete anything that is not under the tmp sandbox.
    const norm = path.resolve(target);
    const tmpRoot = path.resolve(path.join(REAL_WORKSPACE, 'tmp'));
    if (!norm.startsWith(tmpRoot + path.sep)) {
        throw new Error(`refusing to delete non-sandbox path: ${norm}`);
    }
    if (fs.existsSync(norm)) {
        fs.rmSync(norm, { recursive: true, force: true });
    }
}

rmrf(SANDBOX);
fs.mkdirSync(SANDBOX, { recursive: true });

// ─── mock transport / logging (no real Telegram, no secrets) ─────────────────
function makeContext() {
    const sent = [];   // captured sendTelegram payloads (owner-facing replies)
    const logs = [];   // captured botLog lines
    const ctx = {
        workspace: SANDBOX,
        chatId: 'MOCK_CHAT',
        sendTelegram: async (_chatId, text) => { sent.push(text); },
        botLog: (msg) => { logs.push(msg); },
    };
    return { ctx, sent, logs };
}

// ═══════════════════════════════════════════════════════════════════════════
// PART A — approval_queue.mjs
// ═══════════════════════════════════════════════════════════════════════════

// A1 — createApproval creates a pending approval
// NOTE: use GSK here (not ZB23) so the B-block /prepare_send ZB23 stays unique.
// approval_id is timestamp(second)+lead+channel, so reusing ZB23 within the same
// second would collide and createApproval would reject the duplicate.
const c1 = createApproval(SANDBOX, {
    lead_id: 'GSK',
    action_type: 'email_followup',
    channel: 'email',
    subject: 'Test subject',
    body: 'Тело тестового черновика для GSK.',
});
check('A01: createApproval creates pending approval',
    c1.ok && c1.approval && c1.approval.status === APPROVAL_STATUSES.PENDING,
    `ok=${c1.ok} status=${c1.approval && c1.approval.status}`);

const APPROVAL_ID = c1.approval ? c1.approval.approval_id : null;

// A2 — listPendingApprovals returns it
const pendingA = listPendingApprovals(SANDBOX);
check('A02: listPendingApprovals returns the created approval',
    pendingA.some(a => a.approval_id === APPROVAL_ID),
    `pending count=${pendingA.length}`);

// A3 — getApproval returns it
const got = getApproval(SANDBOX, APPROVAL_ID);
check('A03: getApproval returns the approval',
    got && got.approval_id === APPROVAL_ID,
    `got=${got && got.approval_id}`);

// A10 — draft file created in drafts/ (check before approve mutates)
const P = getApprovalPaths(SANDBOX);
const draftExists = got && got.draft_path &&
    fs.existsSync(path.join(SANDBOX, got.draft_path));
check('A10: draft file is created in drafts/',
    !!draftExists,
    `draft_path=${got && got.draft_path}`);

// A4 — approveApproval changes status to approved_ready_to_send
const ap = approveApproval(SANDBOX, APPROVAL_ID, 'owner');
check('A04: approveApproval → approved_ready_to_send',
    ap.ok && ap.approval.status === APPROVAL_STATUSES.APPROVED,
    `ok=${ap.ok} status=${ap.approval && ap.approval.status}`);

// A5 — approve does NOT send anything (client_send_executed stays false)
check('A05: approve does NOT send anything (client_send_executed=false)',
    ap.ok && ap.approval.client_send_executed === false,
    `client_send_executed=${ap.approval && ap.approval.client_send_executed}`);

// A7 (part 1) — duplicate approve returns safe error
const apDup = approveApproval(SANDBOX, APPROVAL_ID, 'owner');
const apDupSafe = apDup.ok === false && typeof apDup.error === 'string' && apDup.error.length > 0;

// A6 — rejectApproval changes status to rejected (use a fresh approval)
const c2 = createApproval(SANDBOX, {
    lead_id: 'EDERA',
    action_type: 'email_followup',
    channel: 'email',
    subject: 'Reject test',
    body: 'Черновик для отклонения.',
});
const REJECT_ID = c2.approval ? c2.approval.approval_id : null;
const rj = rejectApproval(SANDBOX, REJECT_ID, 'не актуально');
check('A06: rejectApproval → rejected',
    rj.ok && rj.approval.status === APPROVAL_STATUSES.REJECTED,
    `ok=${rj.ok} status=${rj.approval && rj.approval.status}`);

// A7 (part 2) — duplicate reject returns safe error
const rjDup = rejectApproval(SANDBOX, REJECT_ID, 'опять');
const rjDupSafe = rjDup.ok === false && typeof rjDup.error === 'string' && rjDup.error.length > 0;

check('A07: duplicate approve/reject returns safe error (no throw)',
    apDupSafe && rjDupSafe,
    `approveDupSafe=${apDupSafe} rejectDupSafe=${rjDupSafe}`);

// A8 — unknown approval_id returns clear error
const unk = approveApproval(SANDBOX, 'AP-DOES-NOT-EXIST', 'owner');
const unkGet = getApproval(SANDBOX, 'AP-DOES-NOT-EXIST');
check('A08: unknown approval_id returns clear error',
    unk.ok === false && typeof unk.error === 'string' && unk.error.length > 0 && unkGet === null,
    `ok=${unk.ok} error=${unk.error} getNull=${unkGet === null}`);

// A9 — events written to approval_events.jsonl
let eventsOk = false;
try {
    const raw = fs.readFileSync(P.eventsFile, 'utf-8').trim();
    const lines = raw ? raw.split('\n') : [];
    const events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const hasCreated  = events.some(e => e.event === 'approval_created');
    const hasApproved = events.some(e => e.event === 'approval_approved');
    const hasRejected = events.some(e => e.event === 'approval_rejected');
    eventsOk = hasCreated && hasApproved && hasRejected;
    check('A09: events written to approval_events.jsonl',
        eventsOk,
        `created=${hasCreated} approved=${hasApproved} rejected=${hasRejected}`);
} catch (e) {
    bad('A09: events written to approval_events.jsonl', e.message);
}

// ═══════════════════════════════════════════════════════════════════════════
// PART B — approval_commands.mjs (sandbox workspace, mock transport)
// ═══════════════════════════════════════════════════════════════════════════

// B11 — /prepare_send ZB23 email followup creates approval
{
    const { ctx, sent } = makeContext();
    const handled = await handleApprovalCommand('/prepare_send ZB23 email followup', ctx);
    const pending = listPendingApprovals(SANDBOX).filter(a => a.lead_id === 'ZB23');
    // The first ZB23 (A-block) was approved, so a NEW pending ZB23 should now exist.
    const newPending = pending.length >= 1;
    const replyMentionsApproval = sent.length === 1 && /approval_id/i.test(sent[0]);
    const noSendClaim = sent.length === 1 && /НЕ отправлен|ЗАБЛОКИРОВАНА/i.test(sent[0]);
    check('B11: /prepare_send ZB23 email followup creates approval',
        handled === true && newPending && replyMentionsApproval && noSendClaim,
        `handled=${handled} newPending=${newPending} replyOk=${replyMentionsApproval} noSend=${noSendClaim}`);
}

// Grab a pending ZB23 approval id for status/approve flows.
const pendingZB = listPendingApprovals(SANDBOX).find(a => a.lead_id === 'ZB23');
const CMD_APPROVAL_ID = pendingZB ? pendingZB.approval_id : null;

// B12 — /pending_approvals returns pending approvals
{
    const { ctx, sent } = makeContext();
    const handled = await handleApprovalCommand('/pending_approvals', ctx);
    const mentions = sent.length === 1 && CMD_APPROVAL_ID && sent[0].includes(CMD_APPROVAL_ID);
    check('B12: /pending_approvals returns pending approvals',
        handled === true && !!mentions,
        `handled=${handled} mentions=${mentions}`);
}

// B13 — /approval_status <id> returns status
{
    const { ctx, sent } = makeContext();
    const handled = await handleApprovalCommand(`/approval_status ${CMD_APPROVAL_ID}`, ctx);
    const showsStatus = sent.length === 1 && sent[0].includes(CMD_APPROVAL_ID) && /pending|APPROVAL/i.test(sent[0]);
    check('B13: /approval_status <id> returns status',
        handled === true && !!showsStatus,
        `handled=${handled} showsStatus=${showsStatus}`);
}

// B14 — /approve <id> changes status only (no send)
{
    const { ctx, sent } = makeContext();
    const handled = await handleApprovalCommand(`/approve ${CMD_APPROVAL_ID}`, ctx);
    const after = getApproval(SANDBOX, CMD_APPROVAL_ID);
    const statusOk = after && after.status === APPROVAL_STATUSES.APPROVED;
    const noSend = after && after.client_send_executed === false;
    const replyNoSend = sent.length === 1 && /НЕ отправлен|ЗАБЛОКИРОВАНА/i.test(sent[0]);
    check('B14: /approve <id> changes status only (no send)',
        handled === true && statusOk && noSend && replyNoSend,
        `handled=${handled} status=${after && after.status} noSend=${noSend} replyNoSend=${replyNoSend}`);
}

// B15 — /reject <id> reason changes status only
{
    // create a fresh approval to reject via command
    const fresh = createApproval(SANDBOX, {
        lead_id: 'ATOM',
        action_type: 'email_followup',
        channel: 'email',
        subject: 'Reject via command',
        body: 'Черновик ATOM.',
    });
    const id = fresh.approval.approval_id;
    const { ctx, sent } = makeContext();
    const handled = await handleApprovalCommand(`/reject ${id} клиент отказался`, ctx);
    const after = getApproval(SANDBOX, id);
    const statusOk = after && after.status === APPROVAL_STATUSES.REJECTED;
    const reasonOk = after && /отказался/.test(after.reject_reason || '');
    const noSend = after && after.client_send_executed === false;
    check('B15: /reject <id> reason changes status only',
        handled === true && statusOk && reasonOk && noSend,
        `handled=${handled} status=${after && after.status} reason=${after && after.reject_reason} noSend=${noSend}`);
}

// B16 — non-approval command returns false
{
    const { ctx, sent } = makeContext();
    const handled = await handleApprovalCommand('/sales_today', ctx);
    check('B16: non-approval command returns false',
        handled === false && sent.length === 0,
        `handled=${handled} sentLen=${sent.length}`);
}

// B17 — bad format returns usage example
{
    const { ctx, sent } = makeContext();
    const handled = await handleApprovalCommand('/prepare_send', ctx);
    const showsUsage = sent.length === 1 && /Пример/.test(sent[0]) && /prepare_send/.test(sent[0]);
    check('B17: bad format returns usage example',
        handled === true && showsUsage,
        `handled=${handled} showsUsage=${showsUsage}`);
}

// B18 — unknown lead returns clear error
{
    const { ctx, sent } = makeContext();
    const handled = await handleApprovalCommand('/prepare_send NOSUCHLEAD email followup', ctx);
    const clearError = sent.length === 1 && /не распознан|не найден/i.test(sent[0]);
    check('B18: unknown lead returns clear error',
        handled === true && clearError,
        `handled=${handled} clearError=${clearError}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// HARD-MODE SAFETY ASSERTIONS
// ═══════════════════════════════════════════════════════════════════════════

// Real approval queue must be untouched: no files written under the real workspace.
const REAL_QUEUE = getApprovalPaths(REAL_WORKSPACE).queueFile;
// We did not write to the real queue in this run; if it pre-existed we cannot
// assert its absence, but we CAN assert sandbox is separate from real path.
const sandboxIsSeparate = !path.resolve(P.queueFile).startsWith(path.resolve(getApprovalPaths(REAL_WORKSPACE).root) + path.sep)
    && path.resolve(P.queueFile) !== path.resolve(REAL_QUEUE);
check('SAFE: sandbox approval path is separate from real 13_sales/approval_queue',
    sandboxIsSeparate,
    `sandboxQueue=${P.queueFile}`);

// ─── summary ─────────────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  TELEGRAM APPROVAL QUEUE STANDALONE B1.3 TEST — 2026-05-31  ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');
console.log(`  Sandbox workspace: ${SANDBOX}\n`);
results.forEach(r => console.log(r));
console.log('');
console.log(`  Total: ${passed + failed}  |  PASSED: ${passed}  |  FAILED: ${failed}`);
console.log('');

if (failed === 0) {
    console.log('  🟢 ALL TESTS PASSED — approve/reject change status only, nothing sent.\n');
    process.exit(0);
} else {
    console.log(`  🔴 ${failed} TEST(S) FAILED — Review above.\n`);
    process.exit(1);
}
