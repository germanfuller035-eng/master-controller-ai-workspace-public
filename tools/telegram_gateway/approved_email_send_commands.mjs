/**
 * approved_email_send_commands.mjs — Approved Email Send Commands (Phase C2.1, STANDALONE)
 *
 * APPROVAL: APPROVE_APPROVED_EMAIL_SEND_COMMANDS_C21_STANDALONE_2026-05-31
 *
 * Purpose:
 *   Standalone command module that exposes the DRY-RUN approved-email-send
 *   adapter (Phase C1) as Telegram-friendly slash commands. This file is
 *   STANDALONE: it is NOT integrated into telegram_master_bot.mjs and does NOT
 *   modify russian_command_router.mjs. Nothing is ever sent to clients.
 *
 * Exported entry point:
 *   handleApprovedEmailSendCommand(text, context) → Promise<boolean>
 *     - returns false → the text is NOT an approved-email-send command (ignore)
 *     - returns true  → the command was handled (reply produced via context)
 *
 *   context:
 *     {
 *       workspace,     // absolute path to D:\AI_WORKSPACE
 *       chatId,        // telegram chat id (passed to sendTelegram, never printed)
 *       sendTelegram,  // async (chatId, text) => void  (owner-facing transport)
 *       botLog         // optional (msg) => void         (diagnostics)
 *     }
 *
 * Supported commands:
 *   /send_approved_dry_run <approval_id>   → dry-run send_job (NO email sent)
 *   /send_job_status <send_job_id>         → show one send_job status
 *   /send_jobs                             → list recent dry-run send_jobs
 *
 * SAFETY CONTRACT (HARD MODE):
 *   - Never sends email / WhatsApp / Telegram to clients. Reply only goes through
 *     context.sendTelegram (owner-facing transport). No auto-send is ever run.
 *   - Never reads .env / AI_SECRETS. Never opens SMTP. Never prints BOT_TOKEN /
 *     CHAT_ID / SMTP credentials / any secret.
 *   - Delegates all work to the DRY-RUN adapter (send_mode = "dry_run").
 *   - Never marks approval executed. Never sets client_send_executed=true.
 *   - Never touches VPS / dashboard production files / git.
 *   - Unknown approval_id / send_job_id / bad format → clear, friendly reply text.
 *   - Never throws to the caller; all errors become a reply string.
 */

import fs   from 'fs';

import {
    dryRunApprovedEmailSend,
    getEmailSendPaths,
} from './approved_email_send_adapter.mjs';

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

// Recognised commands (leading slash stripped before matching).
const SEND_COMMANDS = new Set([
    'send_approved_dry_run',
    'send_job_status',
    'send_jobs',
]);

// Extract an approval_id token (AP-...) from free text.
const APPROVAL_ID_RE = /\b(AP-[A-Za-z0-9-]+)\b/i;
// Extract a send_job_id token (SJ-...) from free text.
const SEND_JOB_ID_RE = /\b(SJ-[A-Za-z0-9-]+)\b/i;

// How many recent jobs to show in /send_jobs.
const RECENT_JOBS_LIMIT = 10;

// ──────────────────────────────────────────────
// Small helpers
// ──────────────────────────────────────────────

function safeLog(context, msg) {
    try {
        if (context && typeof context.botLog === 'function') context.botLog(msg);
    } catch (_) { /* never throw from logging */ }
}

async function reply(context, text) {
    // Owner-facing reply only. This is NOT a client send.
    if (context && typeof context.sendTelegram === 'function') {
        await context.sendTelegram(context.chatId, text);
    }
    return true;
}

function readJSON(p, fb = null) {
    try {
        if (!p || !fs.existsSync(p)) return fb;
        const raw = fs.readFileSync(p, 'utf-8').trim();
        return raw ? JSON.parse(raw) : fb;
    } catch (_) { return fb; }
}

function loadJobs(workspace) {
    const P = getEmailSendPaths(workspace);
    const raw = readJSON(P.jobsFile, null);
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.jobs)) return raw.jobs;
    return [];
}

function findJob(workspace, sendJobId) {
    const jobs = loadJobs(workspace);
    return jobs.find(j => j.send_job_id === sendJobId) || null;
}

// ──────────────────────────────────────────────
// Telegram-friendly rendering (no secrets, no tokens, no full body)
// ──────────────────────────────────────────────

function renderDryRunSummary(job) {
    return [
        '🧪 *APPROVED EMAIL SEND — DRY RUN (Phase C2.1)*',
        '',
        `approval_id: \`${job.approval_id}\``,
        `send_job_id: \`${job.send_job_id}\``,
        `lead_id: \`${job.lead_id}\``,
        `recipient: ${job.recipient}`,
        `subject: ${job.subject || '—'}`,
        '',
        '*body_preview:*',
        job.body_preview || '(пусто)',
        '',
        `safe_to_send: ${job.status === 'dry_run_ready' ? 'YES' : 'NO'}`,
        'email_sent: NO',
        '',
        'next_action: Phase C3 requires explicit approval for real SMTP send',
        '',
        '🚫 Email НЕ отправлен. SMTP не использован. Внешняя отправка ЗАБЛОКИРОВАНА.',
    ].join('\n');
}

function renderJobStatus(job) {
    return [
        '📋 *SEND JOB STATUS*',
        '',
        `send_job_id: \`${job.send_job_id}\``,
        `approval_id: \`${job.approval_id}\``,
        `lead_id: \`${job.lead_id}\``,
        `recipient: ${job.recipient || '—'}`,
        `subject: ${job.subject || '—'}`,
        `status: ${job.status}`,
        `send_mode: ${job.send_mode || 'dry_run'}`,
        `client_send_executed: ${job.client_send_executed === true ? 'YES' : 'NO'}`,
        `created_at: ${job.created_at || '—'}`,
        '',
        'email_sent: NO',
        '🚫 SMTP не использован. Внешняя отправка ЗАБЛОКИРОВАНА.',
    ].join('\n');
}

function renderJobsList(jobs) {
    const recent = jobs.slice(-RECENT_JOBS_LIMIT).reverse();
    const lines = recent.map((j, i) => [
        `${i + 1}. \`${j.send_job_id}\``,
        `   approval_id: \`${j.approval_id}\``,
        `   lead_id: \`${j.lead_id}\`  status: ${j.status}`,
        `   recipient: ${j.recipient || '—'}  send_mode: ${j.send_mode || 'dry_run'}`,
    ].join('\n'));
    return [
        `🗂 *Последние dry-run send_jobs: ${recent.length} из ${jobs.length}*`,
        '',
        lines.join('\n\n'),
        '',
        '🚫 Полное тело письма не показывается. Email НЕ отправлялся. SMTP не использован.',
    ].join('\n');
}

// ──────────────────────────────────────────────
// Command handlers (each returns a reply string)
// ──────────────────────────────────────────────

/** /send_approved_dry_run <approval_id> */
function cmdSendApprovedDryRun(rawText, workspace) {
    const m = rawText.match(APPROVAL_ID_RE);
    if (!m) {
        return [
            '❌ Не указан approval_id.',
            'Пример: `/send_approved_dry_run AP-20260531-120000-ZB23-EMAIL`',
        ].join('\n');
    }
    const approvalId = m[1];

    const res = dryRunApprovedEmailSend(workspace, approvalId);
    if (!res.ok) {
        return [
            '❌ *DRY-RUN ОТКЛОНЁН*',
            '',
            `approval_id: \`${approvalId}\``,
            `Причина: ${res.reason || 'неизвестная ошибка'}`,
            '',
            '🚫 Ничего не отправлено. safe_to_send=false. SMTP не использован.',
        ].join('\n');
    }

    return renderDryRunSummary(res.send_job);
}

/** /send_job_status <send_job_id> */
function cmdSendJobStatus(rawText, workspace) {
    const m = rawText.match(SEND_JOB_ID_RE);
    if (!m) {
        return [
            '❌ Не указан send_job_id.',
            'Пример: `/send_job_status SJ-20260531-120000-ZB23-EMAIL`',
        ].join('\n');
    }
    const sendJobId = m[1];
    const job = findJob(workspace, sendJobId);
    if (!job) {
        return `❌ Неизвестный send_job_id: \`${sendJobId}\`. Проверьте /send_jobs.`;
    }
    return renderJobStatus(job);
}

/** /send_jobs */
function cmdSendJobs(workspace) {
    const jobs = loadJobs(workspace);
    if (!jobs.length) {
        return '✅ Пока нет dry-run send_jobs (список пуст).';
    }
    return renderJobsList(jobs);
}

// ──────────────────────────────────────────────
// Public: handleApprovedEmailSendCommand(text, context)
// ──────────────────────────────────────────────

export async function handleApprovedEmailSendCommand(text, context = {}) {
    const rawText = String(text || '').trim();
    if (!rawText) return false;

    // Must start with a slash command to be considered.
    if (!rawText.startsWith('/')) return false;

    // First token after the slash, lowercased, without arguments.
    const firstToken = rawText.slice(1).split(/\s+/)[0].toLowerCase();
    if (!SEND_COMMANDS.has(firstToken)) {
        return false; // not an approved-email-send command → ignore
    }

    const workspace = context && context.workspace;
    if (!workspace) {
        await reply(context, '❌ Внутренняя ошибка: workspace не задан в context.');
        return true;
    }

    let replyText;
    try {
        switch (firstToken) {
            case 'send_approved_dry_run':
                replyText = cmdSendApprovedDryRun(rawText, workspace);
                break;
            case 'send_job_status':
                replyText = cmdSendJobStatus(rawText, workspace);
                break;
            case 'send_jobs':
                replyText = cmdSendJobs(workspace);
                break;
            default:
                return false;
        }
    } catch (e) {
        safeLog(context, `approved_email_send_commands error: ${e.message}`);
        replyText = `❌ Внутренняя ошибка обработки команды: ${e.message}`;
    }

    safeLog(context, `approved_email_send_commands handled: /${firstToken}`);
    await reply(context, replyText);
    return true;
}

export default { handleApprovedEmailSendCommand };
