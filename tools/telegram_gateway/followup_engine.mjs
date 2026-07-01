// followup_engine.mjs
// ============================================================
// BLOCK 7 — Follow-up Engine (cadence + queue + guards)
// ------------------------------------------------------------
// Turns every approved SENT into a follow-up plan and surfaces it as a
// human-approved queue. Cadence: D0 / D2 / D5 / D10 from the first SENT.
//   - D0  = the original first email (already sent — NOT a task here).
//   - D2/D5/D10 = follow-up touches, each created as a `pending` task.
//
// Powers the Telegram commands (wired in a later, separately-tested step):
//   - /followups_due   → tasks whose due_at <= now, not closed/declined
//   - /followup_next   → the single next due task + preview
//   - /followup_send   → records a follow-up touch AFTER Telegram ✅ approval
//   - /followup_skip   → close one task with a reason
//
// SAFETY CONTRACT (identical spirit to outbound_send_ledger.mjs):
//   - This module NEVER sends email and NEVER calls Telegram/SMTP/network.
//   - It only reads/appends a local append-only JSONL state file inside
//     D:\AI_WORKSPACE\13_sales and (on send) appends to the outbound ledger.
//   - NO autosend: planFollowups() only PLANS; a send is recorded ONLY when
//     recordFollowupSent() is called by the approved path after a human ✅.
//   - NO mass send: the queue is consumed one task at a time.
//   - OPT-OUT is permanent: a declined lead is excluded from all future tasks.
//   - SCHEDULE guard: a task can never be sent before its due_at.
//   - DUPLICATE guard: one task per (lead_id, step); a task already sent or
//     skipped is never re-sent.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
    LEDGER_FILE,
    RESULT_SENT,
    appendLedgerEntry,
} from './outbound_send_ledger.mjs';

export const FOLLOWUP_DIR = 'D:/AI_WORKSPACE/13_sales/followups';
export const FOLLOWUP_STATE_FILE = 'D:/AI_WORKSPACE/13_sales/followups/followup_state.jsonl';

// Cadence in days from the first SENT. D0 is the original email (not a task).
export const CADENCE_DAYS = [2, 5, 10];
export const STEP_LABELS = { 2: 'D2', 5: 'D5', 10: 'D10' };

export const STATUS_PENDING = 'pending';
export const STATUS_SENT = 'sent';
export const STATUS_SKIPPED = 'skipped';

const DAY_MS = 24 * 60 * 60 * 1000;

// ---- pure helpers ----------------------------------------------------------

// Stable task id for a (lead_id, step) pair so a step is never duplicated.
export function buildTaskId(leadId, stepDays) {
    const key = `${String(leadId || '').trim().toLowerCase()}|d${Number(stepDays)}`;
    return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

// Add N days to an ISO timestamp → ISO string. Empty/invalid → ''.
export function addDaysIso(iso, days) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Date(d.getTime() + Number(days) * DAY_MS).toISOString();
}

// Build the (D2/D5/D10) task objects for one SENT. Pure — no IO.
export function buildFollowupTasks(input = {}, createdAt = new Date().toISOString()) {
    const lead_id = String(input.lead_id || '').trim();
    const sent_at = String(input.sent_at || createdAt).trim();
    if (!lead_id) return [];
    return CADENCE_DAYS.map((days) => ({
        kind: 'task',
        task_id: buildTaskId(lead_id, days),
        lead_id,
        company: String(input.company || '').trim(),
        website: String(input.website || '').trim(),
        recipient: String(input.recipient || '').trim(),
        step: STEP_LABELS[days] || `D${days}`,
        step_days: days,
        sent_at,
        due_at: addDaysIso(sent_at, days),
        created_at: createdAt,
    }));
}

// ---- storage (append-only JSONL of events) --------------------------------

function ensureDir(file) {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function ensureFollowupStateFile(file = FOLLOWUP_STATE_FILE) {
    ensureDir(file);
    if (!fs.existsSync(file)) fs.writeFileSync(file, '', 'utf8');
    return file;
}

export function readEvents(file = FOLLOWUP_STATE_FILE) {
    ensureFollowupStateFile(file);
    const raw = fs.readFileSync(file, 'utf8');
    const out = [];
    for (const line of raw.split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        try { out.push(JSON.parse(t)); } catch { /* skip malformed */ }
    }
    return out;
}

function appendEvent(event, file = FOLLOWUP_STATE_FILE) {
    ensureDir(file);
    fs.appendFileSync(file, JSON.stringify(event) + '\n', 'utf8');
    return event;
}

// Reduce the event log into current state: tasks (by id) + opt-out lead set.
export function reduceState(file = FOLLOWUP_STATE_FILE) {
    const events = readEvents(file);
    const tasks = new Map();
    const optedOut = new Set();
    for (const e of events) {
        if (!e || !e.kind) continue;
        if (e.kind === 'task' && e.task_id) {
            if (!tasks.has(e.task_id)) {
                tasks.set(e.task_id, { ...e, status: STATUS_PENDING });
            }
        } else if (e.kind === 'sent' && tasks.has(e.task_id)) {
            tasks.get(e.task_id).status = STATUS_SENT;
            tasks.get(e.task_id).sent_touch_at = e.timestamp;
        } else if (e.kind === 'skip' && tasks.has(e.task_id)) {
            tasks.get(e.task_id).status = STATUS_SKIPPED;
            tasks.get(e.task_id).skip_reason = e.reason || '';
        } else if (e.kind === 'optout' && e.lead_id) {
            optedOut.add(String(e.lead_id).trim().toLowerCase());
        }
    }
    return { tasks, optedOut };
}

export function isOptedOut(leadId, file = FOLLOWUP_STATE_FILE) {
    const id = String(leadId || '').trim().toLowerCase();
    if (!id) return false;
    return reduceState(file).optedOut.has(id);
}

// ---- planning (after a SENT) ----------------------------------------------

// Create the D2/D5/D10 tasks for one SENT, skipping any that already exist
// (duplicate protection) and any lead that has opted out. Returns
// { created:[task...], skipped_reason? }.
export function planFollowups(input = {}, file = FOLLOWUP_STATE_FILE, createdAt = new Date().toISOString()) {
    const lead_id = String(input.lead_id || '').trim();
    if (!lead_id) return { created: [], skipped_reason: 'NO_LEAD_ID' };

    const { tasks, optedOut } = reduceState(file);
    if (optedOut.has(lead_id.toLowerCase())) {
        return { created: [], skipped_reason: 'OPTED_OUT' };
    }
    const built = buildFollowupTasks(input, createdAt);
    const created = [];
    for (const task of built) {
        if (tasks.has(task.task_id)) continue; // duplicate guard
        appendEvent(task, file);
        created.push(task);
    }
    return { created, skipped_reason: created.length ? null : 'ALL_EXIST' };
}

// ---- queue (read) ----------------------------------------------------------

// All pending tasks whose due_at <= now and whose lead is not opted out,
// soonest-due first.
export function dueTasks(now = new Date().toISOString(), file = FOLLOWUP_STATE_FILE) {
    const { tasks, optedOut } = reduceState(file);
    const nowMs = new Date(now).getTime();
    const out = [];
    for (const t of tasks.values()) {
        if (t.status !== STATUS_PENDING) continue;
        if (optedOut.has(String(t.lead_id).trim().toLowerCase())) continue;
        const dueMs = new Date(t.due_at).getTime();
        if (Number.isNaN(dueMs) || dueMs > nowMs) continue;
        out.push(t);
    }
    out.sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)));
    return out;
}

export function nextDueTask(now = new Date().toISOString(), file = FOLLOWUP_STATE_FILE) {
    return dueTasks(now, file)[0] || null;
}

export function getTask(taskId, file = FOLLOWUP_STATE_FILE) {
    return reduceState(file).tasks.get(String(taskId || '').trim()) || null;
}

// ---- send guard (pure decision — does NOT send) ----------------------------

// Decide whether a task may be sent right now. Returns { ok, reason }.
// reason ∈ OK | NOT_FOUND | ALREADY_DONE | OPTED_OUT | TOO_EARLY
export function canSendTask(taskId, now = new Date().toISOString(), file = FOLLOWUP_STATE_FILE) {
    const { tasks, optedOut } = reduceState(file);
    const t = tasks.get(String(taskId || '').trim());
    if (!t) return { ok: false, reason: 'NOT_FOUND' };
    if (t.status !== STATUS_PENDING) return { ok: false, reason: 'ALREADY_DONE' };
    if (optedOut.has(String(t.lead_id).trim().toLowerCase())) return { ok: false, reason: 'OPTED_OUT' };
    const dueMs = new Date(t.due_at).getTime();
    if (Number.isNaN(dueMs) || dueMs > new Date(now).getTime()) {
        return { ok: false, reason: 'TOO_EARLY' };
    }
    return { ok: true, reason: 'OK' };
}

// ---- state transitions -----------------------------------------------------

// Record that a follow-up touch was sent (called by the approved path AFTER a
// human ✅ and a real send). Enforces all guards, marks the task sent, and
// appends a follow-up touch line to the outbound ledger. Returns
// { written:boolean, reason, task, ledgerEntry }.
export function recordFollowupSent(taskId, opts = {}, file = FOLLOWUP_STATE_FILE, ledgerFile = LEDGER_FILE) {
    const now = opts.now || new Date().toISOString();
    const gate = canSendTask(taskId, now, file);
    if (!gate.ok) return { written: false, reason: gate.reason, task: null, ledgerEntry: null };

    const task = reduceState(file).tasks.get(String(taskId).trim());
    appendEvent({ kind: 'sent', task_id: task.task_id, lead_id: task.lead_id, timestamp: now }, file);

    // Mirror the touch into the outbound ledger so CRM/history see it.
    // pipeline_stage stays within the canonical dictionary ('sent'); the
    // follow-up context lives in subject/draft_id. smtp_message_id is NEVER
    // fabricated here — only passed through if a real transport returned one.
    const ledgerEntry = appendLedgerEntry({
        timestamp: now,
        lead_id: task.lead_id,
        company: task.company,
        website: task.website,
        recipient: task.recipient,
        subject: opts.subject || `Follow-up ${task.step}`,
        draft_id: opts.draft_id || `followup_${task.step.toLowerCase()}`,
        result: RESULT_SENT,
        smtp_message_id: opts.smtp_message_id || '',
        approved_by: opts.approved_by || 'Dmitry',
        contacted_marked: true,
        pipeline_stage: 'sent',
        next_followup_at: nextDueAfter(task, file) || '',
    }, ledgerFile);

    return { written: true, reason: 'OK', task, ledgerEntry };
}

// The due_at of the next still-pending task for the same lead (for ledger's
// next_followup_at), excluding the task just sent. '' if none.
function nextDueAfter(sentTask, file = FOLLOWUP_STATE_FILE) {
    const { tasks } = reduceState(file);
    const lead = String(sentTask.lead_id).trim().toLowerCase();
    const candidates = [];
    for (const t of tasks.values()) {
        if (t.task_id === sentTask.task_id) continue;
        if (String(t.lead_id).trim().toLowerCase() !== lead) continue;
        if (t.status !== STATUS_PENDING) continue;
        candidates.push(t.due_at);
    }
    candidates.sort((a, b) => String(a).localeCompare(String(b)));
    return candidates[0] || '';
}

// Skip/close one task with a reason. Returns { written, reason, task }.
export function skipTask(taskId, reason = '', opts = {}, file = FOLLOWUP_STATE_FILE) {
    const now = opts.now || new Date().toISOString();
    const t = reduceState(file).tasks.get(String(taskId || '').trim());
    if (!t) return { written: false, reason: 'NOT_FOUND', task: null };
    if (t.status !== STATUS_PENDING) return { written: false, reason: 'ALREADY_DONE', task: t };
    appendEvent({ kind: 'skip', task_id: t.task_id, lead_id: t.lead_id, reason: String(reason || ''), timestamp: now }, file);
    return { written: true, reason: 'OK', task: t };
}

// Permanently opt a lead out (declined / "не писать"). Idempotent.
export function markOptedOut(leadId, reason = '', opts = {}, file = FOLLOWUP_STATE_FILE) {
    const id = String(leadId || '').trim();
    if (!id) return { written: false, reason: 'NO_LEAD_ID' };
    const now = opts.now || new Date().toISOString();
    if (isOptedOut(id, file)) return { written: false, reason: 'ALREADY_OPTED_OUT' };
    appendEvent({ kind: 'optout', lead_id: id, reason: String(reason || ''), timestamp: now }, file);
    return { written: true, reason: 'OK' };
}

// ---- Telegram formatters (text only — no sending) --------------------------

function shortWhen(iso) {
    return String(iso || '').replace('T', ' ').slice(0, 16);
}

// /followups_due
export function formatFollowupsDue(now = new Date().toISOString(), file = FOLLOWUP_STATE_FILE) {
    const rows = dueTasks(now, file);
    if (rows.length === 0) {
        return '📭 Follow-up задач к отправке сейчас нет.';
    }
    const lines = [`⏰ Follow-up к отправке (${rows.length}):`, ''];
    for (const t of rows) {
        lines.push(`• [${t.step}] ${t.company || t.lead_id} <${t.recipient || '—'}>`);
        lines.push(`  due: ${shortWhen(t.due_at)} | id: ${t.task_id}`);
    }
    lines.push('', 'Дальше: /followup_next — превью следующей задачи.');
    return lines.join('\n');
}

// /followup_next
export function formatFollowupNext(now = new Date().toISOString(), file = FOLLOWUP_STATE_FILE) {
    const t = nextDueTask(now, file);
    if (!t) {
        return '📭 Следующих follow-up задач нет.';
    }
    const lines = [
        `📨 Следующий follow-up: [${t.step}]`,
        '',
        `Компания: ${t.company || t.lead_id}`,
        `Контакт: ${t.recipient || '—'}`,
        `Сайт: ${t.website || '—'}`,
        `Запланировано: ${shortWhen(t.due_at)}`,
        `task_id: ${t.task_id}`,
        '',
        '✅ Отправка только после твоего подтверждения (/followup_send).',
        'Пропустить: /followup_skip',
    ];
    return lines.join('\n');
}

export default {
    FOLLOWUP_DIR,
    FOLLOWUP_STATE_FILE,
    CADENCE_DAYS,
    STEP_LABELS,
    STATUS_PENDING,
    STATUS_SENT,
    STATUS_SKIPPED,
    buildTaskId,
    addDaysIso,
    buildFollowupTasks,
    ensureFollowupStateFile,
    readEvents,
    reduceState,
    isOptedOut,
    planFollowups,
    dueTasks,
    nextDueTask,
    getTask,
    canSendTask,
    recordFollowupSent,
    skipTask,
    markOptedOut,
    formatFollowupsDue,
    formatFollowupNext,
};
