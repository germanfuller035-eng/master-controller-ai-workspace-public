/**
 * approved_email_send_adapter_c1_dry_run_test.mjs
 * Phase C1 DRY-RUN tests for approved_email_send_adapter.mjs
 *
 * APPROVAL: APPROVE_APPROVED_EMAIL_SEND_ADAPTER_C1_DRY_RUN_2026-05-31
 *
 * HARD MODE:
 *   - Uses an isolated SANDBOX workspace under tmp/ — never touches the real
 *     13_sales/approval_queue/.
 *   - No real Telegram API, no external send, no .env, no secrets, no SMTP.
 *   - Dry-run must only write local files (email_send_jobs.json / .jsonl).
 *   - Dry-run must NEVER send email, NEVER read .env, NEVER mark approval executed.
 *
 * Run:
 *   node tools/tests/approved_email_send_adapter_c1_dry_run_test.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
    createApproval,
    approveApproval,
    getApproval,
    getApprovalPaths,
    APPROVAL_STATUSES,
} from '../telegram_gateway/approval_queue.mjs';

import {
    validateApprovedEmailSend,
    buildApprovedEmailSendJob,
    dryRunApprovedEmailSend,
    getEmailSendPaths,
} from '../telegram_gateway/approved_email_send_adapter.mjs';

// ─── paths ───────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const REAL_WORKSPACE = path.resolve(path.join(__dirname, '..', '..'));

const SANDBOX = path.join(REAL_WORKSPACE, 'tmp', 'approved_email_send_adapter_c1_test_workspace');

// ─── result helpers ──────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

function ok(name) { passed++; results.push(`  ✅ PASS  ${name}`); }
function bad(name, reason) { failed++; results.push(`  ❌ FAIL  ${name}  →  ${reason}`); }
function check(name, cond, reason = 'condition false') { if (cond) ok(name); else bad(name, reason); }

// ─── sandbox cleanup (ONLY this tmp path) ────────────────────────────────────
function rmrf(target) {
    const norm = path.resolve(target);
    const tmpRoot = path.resolve(path.join(REAL_WORKSPACE, 'tmp'));
    if (!norm.startsWith(tmpRoot + path.sep)) {
        throw new Error(`refusing to delete non-sandbox path: ${norm}`);
    }
    if (fs.existsSync(norm)) fs.rmSync(norm, { recursive: true, force: true });
}

rmrf(SANDBOX);
fs.mkdirSync(SANDBOX, { recursive: true });

// ─── helpers to patch the approval queue (the queue itself has no recipient) ──
function patchApproval(approvalId, patch) {
    const P = getApprovalPaths(SANDBOX);
    const raw = JSON.parse(fs.readFileSync(P.queueFile, 'utf-8'));
    const arr = Array.isArray(raw) ? raw : raw.approvals;
    const a = arr.find(x => x.approval_id === approvalId);
    Object.assign(a, patch);
    fs.writeFileSync(P.queueFile, JSON.stringify(arr, null, 2) + '\n', 'utf-8');
}

// Create + approve + add recipient → a fully "ready to send" approval.
function makeReadyApproval(leadId, recipient = 'client@example.com', overrides = {}) {
    const c = createApproval(SANDBOX, {
        lead_id: leadId,
        action_type: 'email_followup',
        channel: 'email',
        subject: `Followup ${leadId}`,
        body: `Тело письма для ${leadId}. Здравствуйте, предлагаем аудит сайта.`,
    });
    const id = c.approval.approval_id;
    approveApproval(SANDBOX, id, 'owner');
    const patch = { ...overrides };
    if (recipient !== undefined && recipient !== null) patch.recipient = recipient;
    patchApproval(id, patch);
    return id;
}


// ═══════════════════════════════════════════════════════════════════════════
// T1 — approved_ready_to_send approval → dry_run_ready job created
// ═══════════════════════════════════════════════════════════════════════════
const id1 = makeReadyApproval('GSK');
const r1 = dryRunApprovedEmailSend(SANDBOX, id1);
check('T01: approved_ready_to_send → dry_run_ready job created',
    r1.ok && r1.safe_to_send === true && r1.send_job && r1.send_job.status === 'dry_run_ready',
    `ok=${r1.ok} status=${r1.send_job && r1.send_job.status} reason=${r1.reason}`);

// ═══════════════════════════════════════════════════════════════════════════
// T2 — pending approval → reject
// ═══════════════════════════════════════════════════════════════════════════
{
    const c = createApproval(SANDBOX, {
        lead_id: 'PEND',
        action_type: 'email_followup',
        channel: 'email',
        subject: 'Pending test',
        body: 'Тело письма pending.',
    });
    patchApproval(c.approval.approval_id, { recipient: 'pend@example.com' });
    const r = dryRunApprovedEmailSend(SANDBOX, c.approval.approval_id);
    check('T02: pending approval → reject',
        r.ok === false && r.safe_to_send === false && /status/i.test(r.reason),
        `ok=${r.ok} reason=${r.reason}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// T3 — rejected approval → reject
// ═══════════════════════════════════════════════════════════════════════════
{
    const c = createApproval(SANDBOX, {
        lead_id: 'REJ',
        action_type: 'email_followup',
        channel: 'email',
        subject: 'Rejected test',
        body: 'Тело письма rejected.',
    });
    const id = c.approval.approval_id;
    // Force rejected status directly.
    patchApproval(id, { status: APPROVAL_STATUSES.REJECTED, recipient: 'rej@example.com' });
    const r = dryRunApprovedEmailSend(SANDBOX, id);
    check('T03: rejected approval → reject',
        r.ok === false && r.safe_to_send === false,
        `ok=${r.ok} reason=${r.reason}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// T4 — non-email channel → reject
// ═══════════════════════════════════════════════════════════════════════════
{
    const id = makeReadyApproval('CHAN', 'chan@example.com', { channel: 'whatsapp' });
    const r = dryRunApprovedEmailSend(SANDBOX, id);
    check('T04: non-email channel → reject',
        r.ok === false && /channel/i.test(r.reason),
        `ok=${r.ok} reason=${r.reason}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// T5 — missing draft_path → reject
// ═══════════════════════════════════════════════════════════════════════════
{
    const id = makeReadyApproval('NODRAFT', 'nd@example.com', { draft_path: null });
    const r = dryRunApprovedEmailSend(SANDBOX, id);
    check('T05: missing draft_path → reject',
        r.ok === false && /draft_path/i.test(r.reason),
        `ok=${r.ok} reason=${r.reason}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// T6 — empty body → reject
// ═══════════════════════════════════════════════════════════════════════════
{
    // Create approval with no body so the draft contains only the placeholder.
    const c = createApproval(SANDBOX, {
        lead_id: 'EMPTYB',
        action_type: 'email_followup',
        channel: 'email',
        subject: 'Empty body',
        // no body → draft placeholder "(текст черновика не задан)"
    });
    const id = c.approval.approval_id;
    approveApproval(SANDBOX, id, 'owner');
    // Clear body + body_preview so only the empty draft remains.
    patchApproval(id, { recipient: 'eb@example.com', body: '', body_preview: '' });
    const r = dryRunApprovedEmailSend(SANDBOX, id);
    check('T06: empty body → reject',
        r.ok === false && /body/i.test(r.reason),
        `ok=${r.ok} reason=${r.reason}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// T7 — missing recipient → reject with clear error
// ═══════════════════════════════════════════════════════════════════════════
{
    const id = makeReadyApproval('NOREC', null); // no recipient set (null skips default)

    const r = dryRunApprovedEmailSend(SANDBOX, id);
    check('T07: missing recipient → reject with clear error',
        r.ok === false && /recipient/i.test(r.reason),
        `ok=${r.ok} reason=${r.reason}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// T8 — client_send_executed=true → reject duplicate
// ═══════════════════════════════════════════════════════════════════════════
{
    const id = makeReadyApproval('EXEC', 'exec@example.com', { client_send_executed: true });
    const r = dryRunApprovedEmailSend(SANDBOX, id);
    check('T08: client_send_executed=true → reject duplicate',
        r.ok === false && /client_send_executed|duplicate/i.test(r.reason),
        `ok=${r.ok} reason=${r.reason}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// T9 — dry-run does NOT send email (no smtp, external_send=false)
// ═══════════════════════════════════════════════════════════════════════════
check('T09: dry-run does NOT send email (smtp_used=false, external_send=false)',
    r1.ok && r1.send_job.safety.smtp_used === false &&
    r1.send_job.safety.external_send === false &&
    r1.send_job.send_mode === 'dry_run',
    `safety=${JSON.stringify(r1.send_job && r1.send_job.safety)}`);

// ═══════════════════════════════════════════════════════════════════════════
// T10 — dry-run does NOT read .env
//   Assert no .env / AI_SECRETS path appears in the adapter source, and that the
//   adapter doesn't import dotenv. (Static guard — the module never reads creds.)
// ═══════════════════════════════════════════════════════════════════════════
{
    const rawSrc = fs.readFileSync(
        path.join(REAL_WORKSPACE, 'tools', 'telegram_gateway', 'approved_email_send_adapter.mjs'),
        'utf-8',
    );
    // Strip comments (block + line) so the safety-contract documentation, which
    // intentionally mentions .env / AI_SECRETS, does not trigger a false positive.
    const adapterSrc = rawSrc
        .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
        .replace(/(^|[^:])\/\/.*$/gm, '$1'); // line comments (keep URLs like http://)
    const readsEnv = /process\.env|dotenv|readFileSync\([^)]*\.env|AI_SECRETS/i.test(adapterSrc);
    check('T10: dry-run does NOT read .env / AI_SECRETS',
        readsEnv === false,
        `readsEnv=${readsEnv}`);

}

// ═══════════════════════════════════════════════════════════════════════════
// T11 — dry-run does NOT mark approval executed
// ═══════════════════════════════════════════════════════════════════════════
{
    const after = getApproval(SANDBOX, id1);
    check('T11: dry-run does NOT mark approval executed',
        after.status === APPROVAL_STATUSES.APPROVED &&
        after.status !== APPROVAL_STATUSES.EXECUTED &&
        after.client_send_executed === false,
        `status=${after.status} client_send_executed=${after.client_send_executed}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// T12 — email_send_events.jsonl written
// ═══════════════════════════════════════════════════════════════════════════
{
    const P = getEmailSendPaths(SANDBOX);
    let eventsOk = false;
    let jobsOk = false;
    try {
        const raw = fs.readFileSync(P.eventsFile, 'utf-8').trim();
        const lines = raw ? raw.split('\n') : [];
        const events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        eventsOk = events.some(e => e.event === 'email_send_dry_run' && e.approval_id === id1);
        const jobs = JSON.parse(fs.readFileSync(P.jobsFile, 'utf-8'));
        jobsOk = Array.isArray(jobs) && jobs.some(j => j.approval_id === id1 && j.status === 'dry_run_ready');
    } catch (_) { /* leave false */ }
    check('T12: email_send_events.jsonl + email_send_jobs.json written',
        eventsOk && jobsOk,
        `eventsOk=${eventsOk} jobsOk=${jobsOk}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTRA SAFE — duplicate dry-run for same approval refused
// ═══════════════════════════════════════════════════════════════════════════
{
    const dup = dryRunApprovedEmailSend(SANDBOX, id1);
    check('SAFE: second dry-run for same approval refused (duplicate)',
        dup.ok === false && /duplicate/i.test(dup.reason),
        `ok=${dup.ok} reason=${dup.reason}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTRA SAFE — sandbox path separate from real approval queue
// ═══════════════════════════════════════════════════════════════════════════
{
    const P = getEmailSendPaths(SANDBOX);
    const realRoot = getApprovalPaths(REAL_WORKSPACE).root;
    const separate = !path.resolve(P.jobsFile).startsWith(path.resolve(realRoot) + path.sep);
    check('SAFE: sandbox email_send path is separate from real 13_sales/approval_queue',
        separate,
        `sandboxJobs=${P.jobsFile}`);
}

// ─── summary ─────────────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  APPROVED EMAIL SEND ADAPTER C1 DRY-RUN TEST — 2026-05-31    ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');
console.log(`  Sandbox workspace: ${SANDBOX}\n`);
results.forEach(r => console.log(r));
console.log('');
console.log(`  Total: ${passed + failed}  |  PASSED: ${passed}  |  FAILED: ${failed}`);
console.log('');

if (failed === 0) {
    console.log('  🟢 ALL TESTS PASSED — dry-run only, no email sent, no .env read.\n');
    process.exit(0);
} else {
    console.log(`  🔴 ${failed} TEST(S) FAILED — Review above.\n`);
    process.exit(1);
}
