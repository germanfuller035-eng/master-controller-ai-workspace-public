// lead_import_approval_decision_live_control.mjs
// =============================================================================
// D3B — Approve/Reject Telegram Live-Control (battle-ready, write-gated)
//
// Purpose:
//   Provide explicit check -> confirm decision control for the internal
//   lead-import approval queue. Two commands, each with a MANDATORY phase:
//
//     /lead_import_approve <IMPORT_ID> check    -> read-only inspect, NO write
//     /lead_import_approve <IMPORT_ID> confirm  -> gated atomic write:
//                                                  PENDING -> APPROVED
//     /lead_import_reject  <IMPORT_ID> check    -> read-only inspect, NO write
//     /lead_import_reject  <IMPORT_ID> confirm  -> gated atomic write:
//                                                  PENDING -> REJECTED
//
//   A bare command WITHOUT a phase NEVER mutates and returns usage.
//
// Hard safety boundaries (always enforced & reported in the safety footer):
//   - queue_write:    CHECK_ONLY on check, CONFIRMED on a successful confirm
//   - real_import:    BLOCKED  (this module never runs a lead-intake)
//   - client_contact: BLOCKED  (never touches contacts / messaging APIs)
//   - auto_send:      BLOCKED  (no email / transport / messenger send)
//
// Confirm gate requires ALL of:
//   - owner/Dmitry-only context (opts.isOwner === true)
//   - phase literally 'confirm' (no stray extra tokens)
//   - card exists and card.status === 'PENDING' (unless already at target =
//     idempotent no-op)
//   - pre-write backup succeeds
//   - atomic write (tmp + rename) succeeds
//   - post-write verify succeeds
//
// Idempotency:
//   - approve confirm on an already-APPROVED card -> no-op (wrote:false)
//   - reject  confirm on an already-REJECTED card -> no-op (wrote:false)
//
// Rejected source states:
//   - approve refuses REJECTED / CANCELLED / COMMITTED
//   - reject  refuses APPROVED / CANCELLED / COMMITTED
//
// This module ONLY mutates the approval-queue JSON file it is given. It never
// runs a lead-intake and never reads/writes the contacts datastore.
// =============================================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const D3B_CONTROL_VERSION = 'd3b-approve-reject-live-control-1.0.0';

const VALID_ACTIONS = Object.freeze(['approve', 'reject']);
const VALID_PHASES = Object.freeze(['check', 'confirm']);

// Target status per action (D3B contract).
const TARGET_STATUS = Object.freeze({
    approve: 'APPROVED',
    reject: 'REJECTED',
});

// Source states that are explicitly refused per action (non-PENDING, non-target).
const REFUSED_STATUSES = Object.freeze({
    approve: Object.freeze(['REJECTED', 'CANCELLED', 'COMMITTED']),
    reject: Object.freeze(['APPROVED', 'CANCELLED', 'COMMITTED']),
});

// Safety footer factory. queue_write reflects the actual phase outcome.
export function safetyFooter(queueWriteState) {
    return Object.freeze({
        queue_write: queueWriteState,
        real_import: 'BLOCKED',
        client_contact: 'BLOCKED',
        auto_send: 'BLOCKED',
    });
}

// Static footer (CHECK_ONLY) used by refusals and check.
export const SAFETY_FOOTER = safetyFooter('CHECK_ONLY');

function nowStamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function sha256File(p) {
    return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function backupPathFor(queuePath, action) {
    const dir = path.dirname(queuePath);
    const base = path.basename(queuePath);
    return path.join(dir, `${base}.bak-${nowStamp()}-d3b_${action}`);
}

// ---------------------------------------------------------------------------
// Command parsing
// ---------------------------------------------------------------------------
// Accepts ONLY: /lead_import_approve ... | /lead_import_reject ...
// The short aliases /lead_approve and /lead_reject are intentionally NOT matched
// here (they remain inactive at the D3B stage).
export function parseDecisionCommand(text) {
    const raw = (text == null ? '' : String(text)).trim();
    const m = raw.match(/^\/lead_import_(approve|reject)\b(.*)$/i);
    if (!m) return { ok: false, reason: 'not_decision_command' };
    const action = m[1].toLowerCase();
    const rest = m[2].trim();
    const parts = rest.length ? rest.split(/\s+/) : [];
    const importId = parts[0] != null ? parts[0] : null;
    const phase = parts[1] != null ? String(parts[1]).toLowerCase() : null;
    return {
        ok: true,
        action,
        importId,
        phase,
        extra: parts.slice(2),
    };
}

export function isDecisionCommand(text) {
    return parseDecisionCommand(text).ok;
}

// ---------------------------------------------------------------------------
// Queue read (read-only)
// ---------------------------------------------------------------------------
function readQueue(queuePath) {
    if (!queuePath || !fs.existsSync(queuePath)) {
        return { ok: false, reason: 'queue_unreadable', detail: 'queue file not found' };
    }
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    } catch (e) {
        return { ok: false, reason: 'queue_unreadable', detail: 'invalid JSON' };
    }
    const cards = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.cards) ? parsed.cards : null);
    if (!cards) {
        return { ok: false, reason: 'queue_unreadable', detail: 'no cards array' };
    }
    return { ok: true, root: parsed, cards };
}

function findCard(cards, importId) {
    return cards.find((c) => c && (c.import_id === importId || c.importId === importId)) || null;
}

function cardStatusOf(card) {
    return card ? (card.status || card.state || null) : null;
}

function safeSummary(card) {
    if (!card) return {};
    return {
        import_id: card.import_id || card.importId || null,
        status: cardStatusOf(card),
        source: card.source || card.source_label || null,
        lead_count: card.lead_count != null
            ? card.lead_count
            : (Array.isArray(card.leads) ? card.leads.length : null),
        created_at: card.created_at || card.createdAt || null,
    };
}

// ---------------------------------------------------------------------------
// Validation shared by check & confirm
// ---------------------------------------------------------------------------
function validateBasics(parsed) {
    if (!parsed.ok) return { ok: false, reason: 'not_decision_command' };
    if (!VALID_ACTIONS.includes(parsed.action)) return { ok: false, reason: 'unknown_action' };
    if (!parsed.importId) return { ok: false, reason: 'missing_import_id' };
    if (!parsed.phase) return { ok: false, reason: 'missing_phase' };
    if (!VALID_PHASES.includes(parsed.phase)) return { ok: false, reason: 'invalid_phase' };
    return { ok: true };
}

function refusal(reason, extra) {
    return {
        ok: false,
        wrote: false,
        reason,
        safety: SAFETY_FOOTER,
        ...(extra || {}),
    };
}

// Usage payload for a bare command (no/invalid phase) — never mutates.
function usagePayload(action, importId, reason) {
    return {
        ok: false,
        wrote: false,
        usage: true,
        reason: reason || 'missing_phase',
        action: action || null,
        import_id: importId || null,
        usage_lines: [
            `/lead_import_${action || 'approve'} <IMPORT_ID> check`,
            `/lead_import_${action || 'approve'} <IMPORT_ID> confirm`,
        ],
        note: 'No write without explicit confirm.',
        safety: SAFETY_FOOTER,
    };
}

// ---------------------------------------------------------------------------
// CHECK (read-only, never writes)
// ---------------------------------------------------------------------------
export function handleCheck(parsed, opts) {
    const queuePath = opts.queuePath;
    const basics = validateBasics(parsed);
    if (!basics.ok) {
        if (basics.reason === 'missing_phase' || basics.reason === 'invalid_phase') {
            return usagePayload(parsed.action, parsed.importId, basics.reason);
        }
        return refusal(basics.reason, { action: parsed.action, import_id: parsed.importId });
    }

    const q = readQueue(queuePath);
    if (!q.ok) return refusal(q.reason, { detail: q.detail, import_id: parsed.importId });

    const card = findCard(q.cards, parsed.importId);
    if (!card) return refusal('unknown_import_id', { import_id: parsed.importId });

    const status = cardStatusOf(card);
    const target = TARGET_STATUS[parsed.action];

    // Already at target -> idempotent (check reports no-op, still no write).
    if (status === target) {
        return {
            ok: true,
            wrote: false,
            idempotent: true,
            phase: 'check',
            action: parsed.action,
            import_id: parsed.importId,
            current_status: status,
            would_transition: `${status} (no-op, already ${target})`,
            queue_path: queuePath,
            planned_backup: backupPathFor(queuePath, parsed.action),
            summary: safeSummary(card),
            safety: safetyFooter('CHECK_ONLY'),
        };
    }

    if (status !== 'PENDING') {
        return refusal('status_not_pending', {
            import_id: parsed.importId,
            current_status: status,
            summary: safeSummary(card),
        });
    }

    return {
        ok: true,
        wrote: false,
        phase: 'check',
        action: parsed.action,
        import_id: parsed.importId,
        current_status: status,
        would_transition: `PENDING -> ${target}`,
        queue_path: queuePath,
        planned_backup: backupPathFor(queuePath, parsed.action),
        backup_rule: 'a timestamped backup is created before any atomic write',
        confirm_command: `/lead_import_${parsed.action} ${parsed.importId} confirm`,
        summary: safeSummary(card),
        safety: safetyFooter('CHECK_ONLY'),
    };
}

// ---------------------------------------------------------------------------
// CONFIRM (gated atomic write)
// ---------------------------------------------------------------------------
export function handleConfirm(parsed, opts) {
    const queuePath = opts.queuePath;
    const basics = validateBasics(parsed);
    if (!basics.ok) {
        if (basics.reason === 'missing_phase' || basics.reason === 'invalid_phase') {
            return usagePayload(parsed.action, parsed.importId, basics.reason);
        }
        return refusal(basics.reason, { action: parsed.action, import_id: parsed.importId });
    }

    // Owner gate (fail-closed).
    if (opts.isOwner !== true) {
        return refusal('owner_gate_blocked', { import_id: parsed.importId });
    }

    // Exact command intent: phase must literally be 'confirm', no stray tokens.
    if (parsed.phase !== 'confirm' || (parsed.extra && parsed.extra.length > 0)) {
        return refusal('confirm_intent_not_exact', { import_id: parsed.importId });
    }

    const q = readQueue(queuePath);
    if (!q.ok) return refusal(q.reason, { detail: q.detail, import_id: parsed.importId });

    const card = findCard(q.cards, parsed.importId);
    if (!card) return refusal('unknown_import_id', { import_id: parsed.importId });

    const status = cardStatusOf(card);
    const target = TARGET_STATUS[parsed.action];

    // Idempotency: already at target -> no-op, no write.
    if (status === target) {
        return {
            ok: true,
            wrote: false,
            idempotent: true,
            phase: 'confirm',
            action: parsed.action,
            import_id: parsed.importId,
            previous_status: status,
            new_status: target,
            note: 'no-op: card already at target status',
            safety: safetyFooter('NO_OP'),
        };
    }

    // Any non-PENDING source is refused (covers REJECTED/CANCELLED/COMMITTED etc.).
    if (status !== 'PENDING') {
        return refusal('status_not_pending', {
            import_id: parsed.importId,
            current_status: status,
        });
    }

    // ---- pre-write backup ----
    let backupPath;
    try {
        backupPath = backupPathFor(queuePath, parsed.action);
        fs.copyFileSync(queuePath, backupPath);
    } catch (e) {
        return refusal('backup_failed', { import_id: parsed.importId, detail: (e && e.message) || '' });
    }
    if (!fs.existsSync(backupPath)) {
        return refusal('backup_failed', { import_id: parsed.importId, detail: 'backup missing post-copy' });
    }

    // ---- mutate in-memory copy ----
    if ('status' in card) card.status = target;
    else card.state = target;
    card.decided_at = new Date().toISOString();
    card.decided_by = 'DMITRY';
    card.decision_source = 'telegram_d3b_live_control';

    // ---- atomic write (tmp + rename) ----
    try {
        const tmp = `${queuePath}.tmp-${nowStamp()}`;
        fs.writeFileSync(tmp, JSON.stringify(q.root, null, 2), 'utf8');
        fs.renameSync(tmp, queuePath);
    } catch (e) {
        return refusal('write_failed', {
            import_id: parsed.importId,
            backup_path: backupPath,
            detail: (e && e.message) || '',
        });
    }

    // ---- post-write verify ----
    const verify = readQueue(queuePath);
    if (!verify.ok) {
        return refusal('post_verify_failed', { import_id: parsed.importId, backup_path: backupPath });
    }
    const vCard = findCard(verify.cards, parsed.importId);
    if (!vCard || cardStatusOf(vCard) !== target) {
        return refusal('post_verify_failed', {
            import_id: parsed.importId,
            backup_path: backupPath,
            observed_status: cardStatusOf(vCard),
        });
    }

    return {
        ok: true,
        wrote: true,
        phase: 'confirm',
        action: parsed.action,
        import_id: parsed.importId,
        previous_status: 'PENDING',
        new_status: target,
        backup_path: backupPath,
        queue_path: queuePath,
        verified: true,
        safety: safetyFooter('CONFIRMED'),
    };
}

// ---------------------------------------------------------------------------
// Top-level dispatch
// ---------------------------------------------------------------------------
export function handleDecisionCommand(text, opts = {}) {
    const parsed = parseDecisionCommand(text);
    if (!parsed.ok) return refusal('not_decision_command');

    if (!parsed.importId) {
        return refusal('missing_import_id', { action: parsed.action });
    }

    // Bare command (no phase) or invalid phase -> usage, never mutate.
    if (!parsed.phase || !VALID_PHASES.includes(parsed.phase)) {
        return usagePayload(parsed.action, parsed.importId, parsed.phase ? 'invalid_phase' : 'missing_phase');
    }

    if (parsed.phase === 'check') return handleCheck(parsed, opts);
    if (parsed.phase === 'confirm') return handleConfirm(parsed, opts);
    return usagePayload(parsed.action, parsed.importId, 'invalid_phase');
}

// Utility re-exports for tests
export const _internal = {
    sha256File,
    readQueue,
    findCard,
    cardStatusOf,
    backupPathFor,
    TARGET_STATUS,
    REFUSED_STATUSES,
    VALID_ACTIONS,
    VALID_PHASES,
};
