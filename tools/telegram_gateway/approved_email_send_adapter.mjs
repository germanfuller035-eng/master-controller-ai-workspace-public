/**
 * approved_email_send_adapter.mjs — Approved Email Send Adapter (Phase C1, DRY-RUN)
 *
 * APPROVAL: APPROVE_APPROVED_EMAIL_SEND_ADAPTER_C1_DRY_RUN_2026-05-31
 *
 * Purpose:
 *   A DRY-RUN-ONLY adapter that prepares an "approved email send" job for Phase C.
 *   At this stage the module DOES NOT send email, DOES NOT read .env, DOES NOT
 *   connect to SMTP, DOES NOT touch Telegram/WhatsApp. It only:
 *     1. Validates that an approval is genuinely ready + safe to send.
 *     2. Builds a safe send_job descriptor.
 *     3. Persists the send_job + an append-only event (dry-run only).
 *
 * Storage (relative to <workspace>):
 *   13_sales/approval_queue/email_send_jobs.json     — array of send_jobs (state)
 *   13_sales/approval_queue/email_send_events.jsonl  — append-only event log
 *
 * Exports:
 *   - validateApprovedEmailSend(workspace, approvalId)
 *   - buildApprovedEmailSendJob(workspace, approvalId)
 *   - dryRunApprovedEmailSend(workspace, approvalId)
 *   - getEmailSendPaths(workspace)
 *
 * SAFETY CONTRACT (HARD MODE):
 *   - NEVER reads .env / AI_SECRETS. NEVER prints BOT_TOKEN / CHAT_ID / SMTP creds.
 *   - NEVER sends email / WhatsApp / Telegram. NEVER opens SMTP.
 *   - NEVER auto-sends. send_mode is always "dry_run".
 *   - NEVER marks approval as executed_later. NEVER sets client_send_executed=true.
 *   - WRITE-TO-LOCAL-FILES ONLY (email_send_jobs.json / email_send_events.jsonl).
 *   - Duplicate send is refused.
 */

import fs   from 'fs';
import path from 'path';

import {
    getApproval,
    getApprovalPaths,
    APPROVAL_STATUSES,
} from './approval_queue.mjs';

import { resolveLeadId } from './lead_resolver.mjs';
import { resolveLeadEmailFromContactRegistry } from './lead_contact_registry.mjs';


// ──────────────────────────────────────────────
// Allowed policy / channel / action constants
// ──────────────────────────────────────────────

const ALLOWED_SEND_POLICIES = Object.freeze([
    'manual_or_phase_c_only',
    'approved_only',
]);

const REQUIRED_CHANNEL     = 'email';
const REQUIRED_ACTION_TYPE = 'email_followup';
const REQUIRED_STATUS      = APPROVAL_STATUSES.APPROVED; // approved_ready_to_send

// Placeholder text written by approval_queue when no body was supplied.
const EMPTY_DRAFT_MARKERS = [
    '(текст черновика не задан)',
];

// ──────────────────────────────────────────────
// Safe helpers (never throw on read)
// ──────────────────────────────────────────────

function readJSON(p, fb = null) {
    try {
        if (!p || !fs.existsSync(p)) return fb;
        const raw = fs.readFileSync(p, 'utf-8').trim();
        return raw ? JSON.parse(raw) : fb;
    } catch (_) { return fb; }
}

function writeJSON(p, obj) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf-8');
}

function nowISO() { return new Date().toISOString(); }

function tsCompact(d = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return (
        `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
        `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
    );
}

function safeSlug(s, max = 40) {
    return String(s || '').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, max);
}

function previewOf(text, max = 240) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max) + '…' : s;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(s) {
    return typeof s === 'string' && EMAIL_RE.test(s.trim());
}

// ──────────────────────────────────────────────
// Paths
// ──────────────────────────────────────────────

export function getEmailSendPaths(workspace) {
    const root = path.join(workspace, '13_sales', 'approval_queue');
    return {
        root,
        jobsFile:   path.join(root, 'email_send_jobs.json'),
        eventsFile: path.join(root, 'email_send_events.jsonl'),
    };
}

function loadJobs(workspace) {
    const P = getEmailSendPaths(workspace);
    const raw = readJSON(P.jobsFile, null);
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.jobs)) return raw.jobs;
    return [];
}

function saveJobs(workspace, jobs) {
    const P = getEmailSendPaths(workspace);
    writeJSON(P.jobsFile, jobs);
}

function appendEvent(workspace, event) {
    const P = getEmailSendPaths(workspace);
    fs.mkdirSync(P.root, { recursive: true });
    const rec = { ts: nowISO(), ...event };
    fs.appendFileSync(P.eventsFile, JSON.stringify(rec) + '\n', 'utf-8');
    return rec;
}

// ──────────────────────────────────────────────
// Recipient resolution (NO .env, NO SMTP, NO secrets)
//   Resolution order (C2.5):
//     1. approval.recipient_email
//     2. legacy approval.recipient (+ approval.to / email / to_email)
//     3. lead_contact_registry by approval.lead_id (13_sales/lead_contacts.json)
//     4. lead record looked up by approval.lead_id (READ-ONLY via lead_resolver)
//   Returns:
//     { ok:true, recipient, source } | { ok:false, reason, safe_to_send:false }
//
//   Lead-record candidate fields:
//     email, primary_email, recipient_email, contacts.email, contact.email,
//     emails[0], channels.email
//
//   On a fully unresolved recipient, the dry-run is blocked with the message:
//     "recipient email not found. Add email to lead contact registry."
// ──────────────────────────────────────────────


function firstNonEmptyString(...vals) {
    for (const v of vals) {
        if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
}

function pickLeadEmail(record) {
    if (!record || typeof record !== 'object') return null;

    const direct = firstNonEmptyString(
        record.email,
        record.primary_email,
        record.recipient_email,
    );
    if (direct) return direct;

    const nested = firstNonEmptyString(
        record.contacts && record.contacts.email,
        record.contact && record.contact.email,
        record.channels && record.channels.email,
    );
    if (nested) return nested;

    if (Array.isArray(record.emails)) {
        const fromArr = firstNonEmptyString(...record.emails);
        if (fromArr) return fromArr;
    }
    return null;
}

export function resolveRecipientEmail(workspace, approval) {
    if (!approval || typeof approval !== 'object') {
        return {
            ok: false,
            reason: 'recipient_email not found in approval or lead record',
            safe_to_send: false,
        };
    }

    // 1. approval.recipient_email
    const fromRecipientEmail = firstNonEmptyString(approval.recipient_email);
    if (fromRecipientEmail) {
        if (!isValidEmail(fromRecipientEmail)) {
            return { ok: false, reason: `invalid recipient email: "${fromRecipientEmail}"`, safe_to_send: false };
        }
        return { ok: true, recipient: fromRecipientEmail, source: 'approval.recipient_email' };
    }

    // 2. legacy approval.recipient (+ other legacy aliases)
    const fromLegacy = firstNonEmptyString(
        approval.recipient,
        approval.to,
        approval.email,
        approval.to_email,
    );
    if (fromLegacy) {
        if (!isValidEmail(fromLegacy)) {
            return { ok: false, reason: `invalid recipient email: "${fromLegacy}"`, safe_to_send: false };
        }
        return { ok: true, recipient: fromLegacy, source: 'approval.recipient' };
    }

    // 3. lead_contact_registry lookup by approval.lead_id (13_sales/lead_contacts.json)
    if (approval.lead_id) {
        let r = null;
        try {
            r = resolveLeadEmailFromContactRegistry(workspace, String(approval.lead_id));
        } catch (_) { r = null; }

        if (r && r.ok && r.email) {
            if (!isValidEmail(r.email)) {
                return { ok: false, reason: `invalid recipient email: "${r.email}"`, safe_to_send: false };
            }
            // r.source is already 'lead_contact_registry.primary_email' (or .emails[0])
            return { ok: true, recipient: r.email, source: r.source };
        }
    }

    // 4. lead record lookup by approval.lead_id (READ-ONLY)
    if (approval.lead_id) {
        let record = null;
        try {
            const res = resolveLeadId(String(approval.lead_id), workspace);
            if (res && res.found) record = res.record;
        } catch (_) { record = null; }

        const leadEmail = pickLeadEmail(record);
        if (leadEmail) {
            if (!isValidEmail(leadEmail)) {
                return { ok: false, reason: `invalid recipient email: "${leadEmail}"`, safe_to_send: false };
            }
            return { ok: true, recipient: leadEmail, source: 'lead.email' };
        }
    }

    return {
        ok: false,
        reason: 'recipient email not found. Add email to lead contact registry.',
        safe_to_send: false,
    };
}



// ──────────────────────────────────────────────
// Body resolution
//   Prefer explicit approval.body, else extract from the saved draft file,
//   else fall back to body_preview. Placeholder text counts as empty.
// ──────────────────────────────────────────────

function isEmptyBody(text) {
    const s = String(text || '').trim();
    if (!s) return true;
    return EMPTY_DRAFT_MARKERS.some(m => s === m);
}

function extractBodyFromDraft(workspace, draftPath) {
    try {
        if (!draftPath) return '';
        const full = path.isAbsolute(draftPath)
            ? draftPath
            : path.join(workspace, draftPath);
        if (!fs.existsSync(full)) return '';
        const raw = fs.readFileSync(full, 'utf-8');
        // The approval_queue draft format puts body between
        // "## Текст черновика" and the trailing "---" separator.
        const marker = '## Текст черновика';
        const idx = raw.indexOf(marker);
        if (idx >= 0) {
            let tail = raw.slice(idx + marker.length);
            const sep = tail.indexOf('\n---');
            if (sep >= 0) tail = tail.slice(0, sep);
            return tail.trim();
        }
        return raw.trim();
    } catch (_) {
        return '';
    }
}

function resolveBody(workspace, approval) {
    if (approval.body != null && !isEmptyBody(approval.body)) {
        return String(approval.body);
    }
    const fromDraft = extractBodyFromDraft(workspace, approval.draft_path);
    if (!isEmptyBody(fromDraft)) return fromDraft;
    if (approval.body_preview && !isEmptyBody(approval.body_preview)) {
        return String(approval.body_preview);
    }
    return '';
}

// ──────────────────────────────────────────────
// Duplicate detection
//   A send is a duplicate if a non-rejected send_job already exists for this
//   approval_id, OR if the approval already recorded a client send.
// ──────────────────────────────────────────────

function findExistingJob(workspace, approvalId) {
    const jobs = loadJobs(workspace);
    return jobs.find(j => j.approval_id === approvalId) || null;
}

// ──────────────────────────────────────────────
// Public: validateApprovedEmailSend(workspace, approvalId)
// ──────────────────────────────────────────────

function fail(reason) {
    return { ok: false, reason, safe_to_send: false };
}

export function validateApprovedEmailSend(workspace, approvalId) {
    try {
        if (!approvalId) {
            return fail('approval_id не указан.');
        }

        // 1. approval существует
        const approval = getApproval(workspace, approvalId);
        if (!approval) {
            return fail(`approval не найден: ${approvalId}.`);
        }

        // 2. status = approved_ready_to_send
        if (approval.status !== REQUIRED_STATUS) {
            return fail(
                `status должен быть "${REQUIRED_STATUS}", текущий: "${approval.status}".`,
            );
        }

        // 3. channel = email
        if (approval.channel !== REQUIRED_CHANNEL) {
            return fail(`channel должен быть "${REQUIRED_CHANNEL}", текущий: "${approval.channel}".`);
        }

        // 4. action_type = email_followup
        if (approval.action_type !== REQUIRED_ACTION_TYPE) {
            return fail(`action_type должен быть "${REQUIRED_ACTION_TYPE}", текущий: "${approval.action_type}".`);
        }

        // 5. client_send_executed = false
        if (approval.client_send_executed === true) {
            return fail('client_send_executed=true — отправка уже выполнена ранее (duplicate запрещён).');
        }

        // 6. subject не пустой
        if (!approval.subject || !String(approval.subject).trim()) {
            return fail('subject пустой.');
        }

        // 7. draft_path существует
        if (!approval.draft_path) {
            return fail('draft_path отсутствует в approval.');
        }
        {
            const full = path.isAbsolute(approval.draft_path)
                ? approval.draft_path
                : path.join(workspace, approval.draft_path);
            if (!fs.existsSync(full)) {
                return fail(`draft_path не существует на диске: ${approval.draft_path}.`);
            }
        }

        // 8. body не пустой
        const body = resolveBody(workspace, approval);
        if (isEmptyBody(body)) {
            return fail('body пустой (черновик не содержит текста).');
        }

        // 9. recipient email resolved via approval/legacy/lead record (C2.4)
        const rr = resolveRecipientEmail(workspace, approval);
        if (!rr.ok) {
            return fail(rr.reason);
        }
        const recipient = rr.recipient;
        const recipientSource = rr.source;
        if (!isValidEmail(recipient)) {
            return fail(`recipient email некорректен: "${recipient}".`);
        }


        // 11. send_policy = manual_or_phase_c_only или approved_only
        if (!ALLOWED_SEND_POLICIES.includes(approval.send_policy)) {
            return fail(
                `send_policy должен быть одним из [${ALLOWED_SEND_POLICIES.join(', ')}], ` +
                `текущий: "${approval.send_policy}".`,
            );
        }

        // 10. duplicate send запрещён
        const existing = findExistingJob(workspace, approvalId);
        if (existing) {
            return fail(
                `duplicate: send_job уже существует для approval ${approvalId} ` +
                `(send_job_id=${existing.send_job_id}, status=${existing.status}).`,
            );
        }

        return {
            ok: true,
            safe_to_send: true,
            approval_id: approval.approval_id,
            lead_id: approval.lead_id,
            recipient,
            recipient_source: recipientSource,
            subject: approval.subject,
            body_preview: previewOf(body),

        };
    } catch (e) {
        return fail(`Ошибка валидации: ${e.message}`);
    }
}

// ──────────────────────────────────────────────
// Public: buildApprovedEmailSendJob(workspace, approvalId)
//   Builds (but does NOT persist) a safe dry-run send_job. Returns
//   { ok, job } or a validation failure object.
// ──────────────────────────────────────────────

export function buildApprovedEmailSendJob(workspace, approvalId) {
    const v = validateApprovedEmailSend(workspace, approvalId);
    if (!v.ok) return v;

    const approval = getApproval(workspace, approvalId);
    const lead = safeSlug((approval.lead_id || 'UNKNOWN'), 20).toUpperCase();
    const sendJobId = `SJ-${tsCompact()}-${lead}-EMAIL`;

    const job = {
        send_job_id: sendJobId,
        approval_id: approval.approval_id,
        lead_id: approval.lead_id,
        channel: 'email',
        recipient: v.recipient,
        recipient_source: v.recipient_source,
        subject: approval.subject,

        body_path: approval.draft_path,
        status: 'dry_run_ready',
        client_send_executed: false,
        created_at: nowISO(),
        send_mode: 'dry_run',
        safety: {
            approved_only: true,
            duplicate_checked: true,
            smtp_used: false,
            external_send: false,
        },
        body_preview: v.body_preview,
    };

    return { ok: true, job };
}

// ──────────────────────────────────────────────
// Public: dryRunApprovedEmailSend(workspace, approvalId)
//   - validates + builds send_job
//   - persists send_job into email_send_jobs.json
//   - appends event into email_send_events.jsonl
//   - does NOT change approval status (no executed_later)
//   - does NOT set client_send_executed=true
//   - returns a Telegram-friendly summary
// ──────────────────────────────────────────────

export function dryRunApprovedEmailSend(workspace, approvalId) {
    const built = buildApprovedEmailSendJob(workspace, approvalId);
    if (!built.ok) {
        return {
            ok: false,
            reason: built.reason,
            safe_to_send: false,
            telegram: renderFailureForTelegram(approvalId, built.reason),
        };
    }

    const job = built.job;

    // Persist job (local file only).
    const jobs = loadJobs(workspace);
    jobs.push(job);
    saveJobs(workspace, jobs);

    // Append dry-run event (local file only).
    appendEvent(workspace, {
        event: 'email_send_dry_run',
        send_job_id: job.send_job_id,
        approval_id: job.approval_id,
        lead_id: job.lead_id,
        status: job.status,
        send_mode: 'dry_run',
        smtp_used: false,
        external_send: false,
        client_send_executed: false,
    });

    return {
        ok: true,
        safe_to_send: true,
        send_job: job,
        telegram: renderJobForTelegram(job),
    };
}

// ──────────────────────────────────────────────
// Telegram-friendly rendering (no secrets, no tokens)
// ──────────────────────────────────────────────

function renderJobForTelegram(job) {
    return [
        '🧪 *EMAIL SEND — DRY RUN (Phase C1)*',
        '',
        `send_job_id: \`${job.send_job_id}\``,
        `approval_id: \`${job.approval_id}\``,
        `lead_id: \`${job.lead_id}\``,
        `recipient: ${job.recipient}`,
        `subject: ${job.subject || '—'}`,
        '',
        '*Превью:*',
        job.body_preview || '(пусто)',
        '',
        `status: ${job.status}`,
        'send_mode: dry_run',
        '🚫 Email НЕ отправлен. SMTP не использован. Внешняя отправка ЗАБЛОКИРОВАНА.',
        '🚫 approval НЕ помечен executed. client_send_executed=false.',
    ].join('\n');
}

function renderFailureForTelegram(approvalId, reason) {
    return [
        '❌ *EMAIL SEND DRY-RUN ОТКЛОНЁН*',
        '',
        `approval_id: \`${approvalId || '—'}\``,
        `Причина: ${reason}`,
        '',
        '🚫 Ничего не отправлено. safe_to_send=false.',
    ].join('\n');
}

export default {
    getEmailSendPaths,
    validateApprovedEmailSend,
    buildApprovedEmailSendJob,
    dryRunApprovedEmailSend,
};
