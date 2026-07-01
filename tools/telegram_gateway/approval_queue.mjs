/**
 * approval_queue.mjs — Standalone Approval Queue (Phase B1, semi-automatic sales)
 *
 * Purpose:
 *   A local-only approval queue for the semi-automatic sales mode. It lets the
 *   owner prepare an outbound action (e.g. an email follow-up), store it as a
 *   DRAFT + approval request, review pending approvals, and approve/reject them.
 *
 *   APPROVE/REJECT ONLY CHANGE A LOCAL STATUS. Nothing is ever sent to clients.
 *
 * Storage (relative to <workspace>):
 *   13_sales/approval_queue/approval_queue.json    — array of approvals (state)
 *   13_sales/approval_queue/approval_events.jsonl  — append-only event log
 *   13_sales/approval_queue/drafts/                — saved draft files
 *
 * Exports:
 *   - createApproval(workspace, payload)
 *   - listPendingApprovals(workspace)
 *   - getApproval(workspace, approvalId)
 *   - approveApproval(workspace, approvalId, approvedBy)
 *   - rejectApproval(workspace, approvalId, reason)
 *   - renderApprovalForTelegram(approval)
 *
 * SAFETY CONTRACT (HARD MODE):
 *   - WRITE-TO-LOCAL-FILES ONLY. Never sends email / WhatsApp / Telegram.
 *   - approve()/reject() only change local status. They never transmit anything.
 *   - Never reads .env / AI_SECRETS. Never prints BOT_TOKEN / CHAT_ID / tokens.
 *   - Never touches VPS. Never touches dashboard production files.
 *   - Unknown approval_id → clear error (never throws on caller-facing API).
 *   - Double approve/reject → safe error, no repeated action.
 */

import fs   from 'fs';
import path from 'path';

// ──────────────────────────────────────────────
// Statuses
// ──────────────────────────────────────────────

export const APPROVAL_STATUSES = Object.freeze({
    PENDING:   'pending',
    APPROVED:  'approved_ready_to_send',
    REJECTED:  'rejected',
    EXECUTED:  'executed_later',
    CANCELLED: 'cancelled',
});

const SEND_POLICY = 'manual_or_phase_c_only';

// ──────────────────────────────────────────────
// Safe file helpers (never throw on read)
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
    // YYYYMMDD-HHMMSS
    const p = (n) => String(n).padStart(2, '0');
    return (
        `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
        `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
    );
}

function safeSlug(s, max = 40) {
    return String(s || '').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, max);
}

// ──────────────────────────────────────────────
// Paths
// ──────────────────────────────────────────────

export function getApprovalPaths(workspace) {
    const root = path.join(workspace, '13_sales', 'approval_queue');
    return {
        root,
        queueFile:  path.join(root, 'approval_queue.json'),
        eventsFile: path.join(root, 'approval_events.jsonl'),
        draftsDir:  path.join(root, 'drafts'),
    };
}

// ──────────────────────────────────────────────
// Queue load/save
// ──────────────────────────────────────────────

function loadQueue(workspace) {
    const P = getApprovalPaths(workspace);
    const raw = readJSON(P.queueFile, null);
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.approvals)) return raw.approvals;
    return [];
}

function saveQueue(workspace, approvals) {
    const P = getApprovalPaths(workspace);
    writeJSON(P.queueFile, approvals);
}

// ──────────────────────────────────────────────
// Event log (append-only jsonl)
// ──────────────────────────────────────────────

function appendEvent(workspace, event) {
    const P = getApprovalPaths(workspace);
    fs.mkdirSync(P.root, { recursive: true });
    const rec = { ts: nowISO(), ...event };
    fs.appendFileSync(P.eventsFile, JSON.stringify(rec) + '\n', 'utf-8');
    return rec;
}

// ──────────────────────────────────────────────
// ID generation: AP-YYYYMMDD-HHMMSS-LEADID-EMAIL
// ──────────────────────────────────────────────

function buildApprovalId(payload) {
    const lead    = safeSlug((payload.lead_id || 'UNKNOWN'), 20).toUpperCase();
    const channel = safeSlug((payload.channel || payload.action_type || 'EMAIL'), 12).toUpperCase();
    return `AP-${tsCompact()}-${lead}-${channel}`;
}

function previewOf(text, max = 240) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max) + '…' : s;
}

// ──────────────────────────────────────────────
// Public: createApproval(workspace, payload)
// ──────────────────────────────────────────────

/**
 * Create a pending approval. Optionally persist a draft body into drafts/.
 *
 * payload:
 *   lead_id, action_type, channel, subject, body (full text),
 *   body_preview (optional override), draft_path (optional, if already saved),
 *   save_draft (bool, default true if body provided)
 *
 * Returns: { ok, approval, error }
 */
export function createApproval(workspace, payload = {}) {
    try {
        if (!payload || typeof payload !== 'object') {
            return { ok: false, error: 'payload отсутствует или некорректен.' };
        }
        if (!payload.lead_id) {
            return { ok: false, error: 'lead_id обязателен для создания approval.' };
        }

        const P = getApprovalPaths(workspace);
        const approvalId = payload.approval_id || buildApprovalId(payload);
        const actionType = payload.action_type || 'email_followup';
        const channel    = payload.channel || 'email';
        const subject    = payload.subject || `${actionType} — ${payload.lead_id}`;
        const body       = payload.body != null ? String(payload.body) : '';
        const bodyPreview = payload.body_preview || previewOf(body || subject);

        // Optionally persist draft to local file
        let draftPath = payload.draft_path || null;
        const wantSaveDraft = payload.save_draft !== false && (body || payload.draft_path == null);
        if (!draftPath && wantSaveDraft) {
            const fname = `${safeSlug(approvalId)}.md`;
            const full  = path.join(P.draftsDir, fname);
            const draftDoc = [
                `# Approval DRAFT — ${payload.lead_id}`,
                '',
                `- approval_id: ${approvalId}`,
                `- lead_id: ${payload.lead_id}`,
                `- action_type: ${actionType}`,
                `- channel: ${channel}`,
                `- subject: ${subject}`,
                `- created_at: ${nowISO()}`,
                `- send_policy: ${SEND_POLICY}`,
                '- status: DRAFT_ONLY — NOT SENT',
                '- auto_send: BLOCKED',
                '',
                '## Текст черновика',
                '',
                body || '(текст черновика не задан)',
                '',
                '---',
                '⚠️ Локальный черновик. Бот ничего не отправил клиенту.',
                'Отправка только вручную / в Phase C после подтверждения.',
            ].join('\n');
            fs.mkdirSync(P.draftsDir, { recursive: true });
            fs.writeFileSync(full, draftDoc + '\n', 'utf-8');
            // store a workspace-relative path for portability
            draftPath = path.relative(workspace, full).split(path.sep).join('/');
        }

        const approval = {
            approval_id: approvalId,
            created_at: nowISO(),
            lead_id: payload.lead_id,
            action_type: actionType,
            channel,
            status: APPROVAL_STATUSES.PENDING,
            draft_path: draftPath,
            subject,
            body_preview: bodyPreview,
            send_policy: SEND_POLICY,
            client_send_executed: false,
            approved_by: null,
            approved_at: null,
            rejected_at: null,
            reject_reason: null,
            notes: [],
        };

        const queue = loadQueue(workspace);
        if (queue.some(a => a.approval_id === approvalId)) {
            return { ok: false, error: `approval_id уже существует: ${approvalId}` };
        }
        queue.push(approval);
        saveQueue(workspace, queue);

        appendEvent(workspace, {
            event: 'approval_created',
            approval_id: approvalId,
            lead_id: approval.lead_id,
            action_type: actionType,
            channel,
            status: approval.status,
        });

        return { ok: true, approval };
    } catch (e) {
        return { ok: false, error: `Не удалось создать approval: ${e.message}` };
    }
}

// ──────────────────────────────────────────────
// Public: listPendingApprovals(workspace)
// ──────────────────────────────────────────────

export function listPendingApprovals(workspace) {
    const queue = loadQueue(workspace);
    return queue.filter(a => a.status === APPROVAL_STATUSES.PENDING);
}

// ──────────────────────────────────────────────
// Public: getApproval(workspace, approvalId)
// ──────────────────────────────────────────────

export function getApproval(workspace, approvalId) {
    if (!approvalId) return null;
    const queue = loadQueue(workspace);
    return queue.find(a => a.approval_id === approvalId) || null;
}

// ──────────────────────────────────────────────
// Internal: mutate a single approval safely
// ──────────────────────────────────────────────

function mutateApproval(workspace, approvalId, mutator) {
    const queue = loadQueue(workspace);
    const idx = queue.findIndex(a => a.approval_id === approvalId);
    if (idx < 0) {
        return { ok: false, error: `Неизвестный approval_id: ${approvalId}. Проверьте /pending_approvals.` };
    }
    const result = mutator(queue[idx]);
    if (result && result.error) {
        return { ok: false, error: result.error, approval: queue[idx] };
    }
    saveQueue(workspace, queue);
    return { ok: true, approval: queue[idx] };
}

// ──────────────────────────────────────────────
// Public: approveApproval(workspace, approvalId, approvedBy)
//   ONLY sets status to approved_ready_to_send. NEVER sends.
// ──────────────────────────────────────────────

export function approveApproval(workspace, approvalId, approvedBy = 'owner') {
    const res = mutateApproval(workspace, approvalId, (a) => {
        if (a.status === APPROVAL_STATUSES.APPROVED) {
            return { error: `Уже подтверждено ранее (approved_at=${a.approved_at}). Повторное действие не выполнено.` };
        }
        if (a.status === APPROVAL_STATUSES.REJECTED) {
            return { error: `Заявка уже отклонена (rejected_at=${a.rejected_at}). Подтвердить нельзя.` };
        }
        if (a.status !== APPROVAL_STATUSES.PENDING) {
            return { error: `Подтвердить можно только pending. Текущий статус: ${a.status}.` };
        }
        a.status = APPROVAL_STATUSES.APPROVED;
        a.approved_by = approvedBy || 'owner';
        a.approved_at = nowISO();
        // HARD: approve never sends. client_send_executed stays false.
        a.client_send_executed = false;
        return null;
    });

    if (res.ok) {
        appendEvent(workspace, {
            event: 'approval_approved',
            approval_id: approvalId,
            approved_by: approvedBy || 'owner',
            status: res.approval.status,
            client_send_executed: false,
        });
    }
    return res;
}

// ──────────────────────────────────────────────
// Public: rejectApproval(workspace, approvalId, reason)
//   ONLY sets status to rejected. NEVER sends.
// ──────────────────────────────────────────────

export function rejectApproval(workspace, approvalId, reason = '') {
    const res = mutateApproval(workspace, approvalId, (a) => {
        if (a.status === APPROVAL_STATUSES.REJECTED) {
            return { error: `Уже отклонено ранее (rejected_at=${a.rejected_at}). Повторное действие не выполнено.` };
        }
        if (a.status === APPROVAL_STATUSES.APPROVED) {
            return { error: `Заявка уже подтверждена (approved_at=${a.approved_at}). Отклонить нельзя.` };
        }
        if (a.status !== APPROVAL_STATUSES.PENDING) {
            return { error: `Отклонить можно только pending. Текущий статус: ${a.status}.` };
        }
        a.status = APPROVAL_STATUSES.REJECTED;
        a.rejected_at = nowISO();
        a.reject_reason = String(reason || '').trim() || '(причина не указана)';
        a.client_send_executed = false;
        return null;
    });

    if (res.ok) {
        appendEvent(workspace, {
            event: 'approval_rejected',
            approval_id: approvalId,
            reason: res.approval.reject_reason,
            status: res.approval.status,
        });
    }
    return res;
}

// ──────────────────────────────────────────────
// Public: renderApprovalForTelegram(approval)
// ──────────────────────────────────────────────

const STATUS_EMOJI = {
    pending: '🟡',
    approved_ready_to_send: '🟢',
    rejected: '🔴',
    executed_later: '✅',
    cancelled: '⚪',
};

export function renderApprovalForTelegram(approval) {
    if (!approval || typeof approval !== 'object') {
        return '❌ approval отсутствует.';
    }
    const emoji = STATUS_EMOJI[approval.status] || '•';
    const lines = [
        `${emoji} *APPROVAL ${approval.status}*`,
        '',
        `approval_id: \`${approval.approval_id}\``,
        `lead_id: \`${approval.lead_id}\``,
        `action: ${approval.action_type} | канал: ${approval.channel}`,
        `subject: ${approval.subject || '—'}`,
        '',
        '*Превью:*',
        approval.body_preview || '(пусто)',
    ];
    if (approval.draft_path) {
        lines.push('', `💾 draft: \`${approval.draft_path}\``);
    }
    lines.push('', `send_policy: ${approval.send_policy}`);
    lines.push(`client_send_executed: ${approval.client_send_executed ? 'true' : 'false'}`);

    if (approval.status === APPROVAL_STATUSES.PENDING) {
        lines.push(
            '',
            'Действия:',
            `  ✅ \`/approve ${approval.approval_id}\``,
            `  ❌ \`/reject ${approval.approval_id} <причина>\``,
        );
    } else if (approval.status === APPROVAL_STATUSES.APPROVED) {
        lines.push('', `Подтверждено: ${approval.approved_by || 'owner'} @ ${approval.approved_at}`,
            '🚫 Авто-отправка ЗАБЛОКИРОВАНА. Готово к ручной отправке / Phase C.');
    } else if (approval.status === APPROVAL_STATUSES.REJECTED) {
        lines.push('', `Отклонено @ ${approval.rejected_at}`, `Причина: ${approval.reject_reason || '—'}`);
    }
    return lines.join('\n');
}

export default {
    APPROVAL_STATUSES,
    getApprovalPaths,
    createApproval,
    listPendingApprovals,
    getApproval,
    approveApproval,
    rejectApproval,
    renderApprovalForTelegram,
};
