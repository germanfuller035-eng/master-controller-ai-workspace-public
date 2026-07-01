/**
 * approved_email_send_commands_c21_standalone_test.mjs
 * Phase C2.1 STANDALONE tests for approved_email_send_commands.mjs
 *
 * APPROVAL: APPROVE_APPROVED_EMAIL_SEND_COMMANDS_C21_STANDALONE_2026-05-31
 *
 * HARD MODE:
 *   - Uses an isolated SANDBOX workspace under tmp/ — never touches the real
 *     13_sales/approval_queue/.
 *   - No real Telegram API, no external send, no .env, no secrets, no SMTP.
 *   - Commands only run dry-run; never send email, never read .env, never mark
 *     approval executed.
 *
 * Run:
 *   node tools/tests/approved_email_send_commands_c21_standalone_test.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
    createApproval,
    approveApproval,
    getApprovalPaths,
    APPROVAL_STATUSES,
} from '../telegram_gateway/approval_queue.mjs';

import { getEmailSendPaths } from '../telegram_gateway/approved_email_send_adapter.mjs';
import { handleApprovedEmailSendCommand } from '../telegram_gateway/approved_email_send_commands.mjs';

// ─── paths ───────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const REAL_WORKSPACE = path.resolve(path.join(__dirname, '..', '..'));

const SANDBOX = path.join(REAL_WORKSPACE, 'tmp', 'approved_email_send_commands_c21_test_workspace');

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

// ─── mock context (captures replies; NEVER sends to a real client) ───────────
function makeContext() {
    const replies = [];
    return {
        workspace: SANDBOX,
        chatId: 'TEST_CHAT',          // fake; never printed by the module
        sendTelegram: async (_chatId, text) => { replies.push(text); },
        botLog: () => {},
        replies,
        last() { return this.replies[this.replies.length - 1] || ''; },
    };
}

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

// Extract a send_job_id (SJ-...) from a reply string.
function extractSendJobId(text) {
    const m = String(text || '').match(/\b(SJ-[A-Za-z0-9-]+)\b/);
    return m ? m[1] : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// T1 — /send_approved_dry_run <approved_id> creates dry_run_ready send_job
// ═══════════════════════════════════════════════════════════════════════════
let firstSendJobId = null;
{
    const id = makeReadyApproval('GSK');
    const ctx = makeContext();
    const handled = await handleApprovedEmailSendCommand(`/send_approved_dry_run ${id}`, ctx);
    const reply = ctx.last();
    firstSendJobId = extractSendJobId(reply);

    const P = getEmailSendPaths(SANDBOX);
    const jobs = JSON.parse(fs.readFileSync(P.jobsFile, 'utf-8'));
    const job = jobs.find(j => j.approval_id === id);

    check('T01: /send_approved_dry_run creates dry_run_ready send_job',
        handled === true &&
        !!firstSendJobId &&
        job && job.status === 'dry_run_ready' &&
        /email_sent: NO/i.test(reply) &&
        /safe_to_send: YES/i.test(reply),
        `handled=${handled} sendJobId=${firstSendJobId} jobStatus=${job && job.status}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// T2 — /send_approved_dry_run pending approval → reject
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
    const ctx = makeContext();
    const handled = await handleApprovedEmailSendCommand(
        `/send_approved_dry_run ${c.approval.approval_id}`, ctx);
    const reply = ctx.last();
    check('T02: pending approval → reject',
        handled === true && /ОТКЛОНЁН/i.test(reply) && /status/i.test(reply),
        `handled=${handled} reply=${reply}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// T3 — /send_approved_dry_run rejected approval → reject
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
    patchApproval(id, { status: APPROVAL_STATUSES.REJECTED, recipient: 'rej@example.com' });
    const ctx = makeContext();
    const handled = await handleApprovedEmailSendCommand(`/send_approved_dry_run ${id}`, ctx);
    const reply = ctx.last();
    check('T03: rejected approval → reject',
        handled === true && /ОТКЛОНЁН/i.test(reply),
        `handled=${handled} reply=${reply}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// T4 — /send_approved_dry_run missing recipient → reject
// ═══════════════════════════════════════════════════════════════════════════
{
    const id = makeReadyApproval('NOREC', null); // no recipient set
    const ctx = makeContext();
    const handled = await handleApprovedEmailSendCommand(`/send_approved_dry_run ${id}`, ctx);
    const reply = ctx.last();
    check('T04: missing recipient → reject',
        handled === true && /ОТКЛОНЁН/i.test(reply) && /recipient/i.test(reply),
        `handled=${handled} reply=${reply}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// T5 — /send_approved_dry_run duplicate → reject
// ═══════════════════════════════════════════════════════════════════════════
{
    const id = makeReadyApproval('DUP', 'dup@example.com');
    const ctx1 = makeContext();
    await handleApprovedEmailSendCommand(`/send_approved_dry_run ${id}`, ctx1);
    const ctx2 = makeContext();
    const handled = await handleApprovedEmailSendCommand(`/send_approved_dry_run ${id}`, ctx2);
    const reply = ctx2.last();
    check('T05: duplicate dry-run → reject',
        handled === true && /ОТКЛОНЁН/i.test(reply) && /duplicate/i.test(reply),
        `handled=${handled} reply=${reply}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// T6 — /send_job_status <send_job_id> returns status
// ═══════════════════════════════════════════════════════════════════════════
{
    const ctx = makeContext();
    const handled = await handleApprovedEmailSendCommand(
        `/send_job_status ${firstSendJobId}`, ctx);
    const reply = ctx.last();
    check('T06: /send_job_status returns status',
        handled === true &&
        reply.includes(firstSendJobId) &&
        /status: dry_run_ready/i.test(reply) &&
        /email_sent: NO/i.test(reply),
        `handled=${handled} reply=${reply}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// T7 — /send_job_status unknown → clear error
// ═══════════════════════════════════════════════════════════════════════════
{
    const ctx = makeContext();
    const handled = await handleApprovedEmailSendCommand(
        '/send_job_status SJ-00000000-000000-UNKNOWN-EMAIL', ctx);
    const reply = ctx.last();
    check('T07: unknown send_job_id → clear error',
        handled === true && /Неизвестный send_job_id/i.test(reply),
        `handled=${handled} reply=${reply}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// T8 — /send_jobs returns list
// ═══════════════════════════════════════════════════════════════════════════
{
    const ctx = makeContext();
    const handled = await handleApprovedEmailSendCommand('/send_jobs', ctx);
    const reply = ctx.last();
    check('T08: /send_jobs returns list',
        handled === true &&
        /send_jobs/i.test(reply) &&
        reply.includes(firstSendJobId),
        `handled=${handled} reply=${reply}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// T9 — non-command returns false
// ═══════════════════════════════════════════════════════════════════════════
{
    const ctx = makeContext();
    const handled = await handleApprovedEmailSendCommand('привет, как дела?', ctx);
    check('T09: non-command returns false',
        handled === false && ctx.replies.length === 0,
        `handled=${handled} replies=${ctx.replies.length}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// T10 — bad format returns usage example
// ═══════════════════════════════════════════════════════════════════════════
{
    const ctx = makeContext();
    const handled = await handleApprovedEmailSendCommand('/send_approved_dry_run', ctx);
    const reply = ctx.last();
    check('T10: bad format returns usage example',
        handled === true &&
        /Не указан approval_id/i.test(reply) &&
        /Пример:/i.test(reply),
        `handled=${handled} reply=${reply}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// T11 — no email sent (no smtp, external_send=false, send_mode dry_run)
// ═══════════════════════════════════════════════════════════════════════════
{
    const P = getEmailSendPaths(SANDBOX);
    const jobs = JSON.parse(fs.readFileSync(P.jobsFile, 'utf-8'));
    const allDryRun = jobs.every(j =>
        j.send_mode === 'dry_run' &&
        j.client_send_executed === false &&
        j.safety && j.safety.smtp_used === false && j.safety.external_send === false);
    check('T11: no email sent (all jobs dry_run, smtp_used=false, external_send=false)',
        jobs.length > 0 && allDryRun,
        `jobs=${jobs.length} allDryRun=${allDryRun}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// T12 — no .env usage in the commands module source
// ═══════════════════════════════════════════════════════════════════════════
{
    const rawSrc = fs.readFileSync(
        path.join(REAL_WORKSPACE, 'tools', 'telegram_gateway', 'approved_email_send_commands.mjs'),
        'utf-8',
    );
    const src = rawSrc
        .replace(/\/\*[\s\S]*?\*\//g, '')     // strip block comments
        .replace(/(^|[^:])\/\/.*$/gm, '$1');  // strip line comments (keep URLs)
    const readsEnv = /process\.env|dotenv|readFileSync\([^)]*\.env|AI_SECRETS/i.test(src);
    check('T12: no .env / AI_SECRETS usage in commands module',
        readsEnv === false,
        `readsEnv=${readsEnv}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// T13 — no DANGEROUS SMTP usage in the commands module source
// ═══════════════════════════════════════════════════════════════════════════
// NOTE: This check must NOT trip on safe textual mentions of "SMTP" inside
// owner-facing reply strings (e.g. "SMTP не использован" / "SMTP not used").
// Those are documentation/safety messages, NOT real SMTP usage. We therefore
// scan ONLY for patterns that imply an actual SMTP connection, mail transport,
// secret/.env access, or raw socket — never the bare word "SMTP".
{
    const rawSrc = fs.readFileSync(
        path.join(REAL_WORKSPACE, 'tools', 'telegram_gateway', 'approved_email_send_commands.mjs'),
        'utf-8',
    );
    const src = rawSrc
        .replace(/\/\*[\s\S]*?\*\//g, '')     // strip block comments
        .replace(/(^|[^:])\/\/.*$/gm, '$1');  // strip line comments

    // Dangerous patterns = evidence of REAL email/SMTP/secret/socket usage.
    const DANGEROUS_SMTP_PATTERNS = [
        /process\.env/i,
        /dotenv/i,
        /\.env\b/i,
        /AI_SECRETS/i,
        /nodemailer/i,
        /createTransport/i,
        /SMTP_HOST|SMTP_USER|SMTP_PASS/i,
        /smtp:\/\//i,
        /sendMail/i,
        /transporter/i,
        /net\.connect/i,
        /tls\.connect/i,
    ];

    const matched = DANGEROUS_SMTP_PATTERNS
        .filter((re) => re.test(src))
        .map((re) => re.source);
    const usesSmtp = matched.length > 0;

    check('T13: no dangerous SMTP usage in commands module',
        usesSmtp === false,
        `dangerousPatterns=[${matched.join(', ')}]`);
}

// ─── summary ─────────────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  APPROVED EMAIL SEND COMMANDS C2.1 STANDALONE TEST — 2026-05-31 ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');
console.log(`  Sandbox workspace: ${SANDBOX}\n`);
results.forEach(r => console.log(r));
console.log('');
console.log(`  Total: ${passed + failed}  |  PASSED: ${passed}  |  FAILED: ${failed}`);
console.log('');

if (failed === 0) {
    console.log('  🟢 ALL TESTS PASSED — dry-run only, no email sent, no .env read, no SMTP.\n');
    process.exit(0);
} else {
    console.log(`  🔴 ${failed} TEST(S) FAILED — Review above.\n`);
    process.exit(1);
}
