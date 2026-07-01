/**
 * lead_import_approval_queue_write_real.mjs
 *
 * Daily Lead Factory — D2G — Standalone REAL approval-queue-WRITE wrapper.
 *
 * Purpose:
 *   D2G is a THIN wrapper around the already-tested D2F queue-write module
 *   (lead_import_approval_queue_write.mjs). D2F can persist an APPROVE/REJECT
 *   decision back into the approval queue, but writes to a REAL (non-tmp) queue
 *   are BLOCKED unless the caller passes the explicit, Dmitry-gated
 *   `allowRealQueueWrite:true` override — which D2F exposes but never wraps.
 *
 *   D2G adds the controlled obvязка around that override:
 *     1. a SECOND, real-specific gate (confirmRealQueueWrite) — without it the
 *        call is a DRY-RUN and the real file is never touched;
 *     2. an optimistic status check (expectedCardStatus) against stale/racing
 *        decisions;
 *     3. a pre-write BACKUP (snapshot) of the real queue file for rollback;
 *     4. then it delegates the actual transition to D2F (which delegates the
 *        business logic to the D2B store mutators). No transition logic is
 *        duplicated here.
 *
 *   REAL QUEUE WRITE != REAL IMPORT. A confirmed write only changes a card's
 *   `status` + `history`. It imports NOTHING and writes NO lead data.
 *
 * HARD SAFETY CONTRACT — what this module DOES NOT do (even with all gates=true):
 *   - No real import. real_import is ALWAYS BLOCKED.
 *   - No COMMITTED transition (that is the future D2-commit layer, BLOCKED here).
 *   - No lead-data writes (leads_master / lead_contacts / 13_sales lead rows).
 *   - No client contact. No auto_send / external send.
 *   - No live bot patch. No bot integration. No Telegram send.
 *   - No network / HTTP / fetch. No SMTP.
 *   - No .env / AI_SECRETS / token reads.
 *
 * Exports:
 *   - getRealQueueWriteVersion
 *   - planTransition
 *   - applyRealApprovalQueueWrite
 *   - handleLeadImportApprovalRealQueueWriteCommand
 */

'use strict';

import path from 'node:path';
import fs from 'node:fs/promises';

import {
  applyApprovalDecision,
  isSandboxQueuePath,
} from './lead_import_approval_queue_write.mjs';

import {
  loadApprovalQueue,
  findCard,
} from './lead_intake_approval_queue.mjs';

import {
  buildLeadImportApprovalDecision,
  validateLeadImportApprovalCard,
} from './lead_import_approval_review.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REAL_QUEUE_WRITE_VERSION = 'lead-import-approval-queue-write-real-d2g-v1';

const APPROVER_DMITRY = 'Dmitry';

// Frozen safety contract surfaced by every D2G response.
const SAFETY = Object.freeze({
  real_import: 'BLOCKED',
  committed_transition: 'BLOCKED',
  client_contact: 'BLOCKED',
  auto_send: 'BLOCKED',
  external_send: 'NO',
  live_bot_patch: 'NO',
  smtp_used: 'NO',
  network_used: 'NO',
  telegram_send: 'NO',
  writes_lead_data: 'NO',
  env_secrets: 'NO',
  queue_write: 'REAL_GATED',
});

const SUPPORTED_ACTIONS = Object.freeze(['approve', 'reject', 'help']);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function fail(status, message, extra = {}) {
  return {
    ok: false,
    status,
    real_data_changed: false,
    queue_write: false,
    queue_written: false,
    dry_run: false,
    backup_path: null,
    message,
    version: REAL_QUEUE_WRITE_VERSION,
    safety: { ...SAFETY },
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

/**
 * @returns {string} the D2G real-queue-write wrapper version identifier.
 */
export function getRealQueueWriteVersion() {
  return REAL_QUEUE_WRITE_VERSION;
}

// ---------------------------------------------------------------------------
// Transition planning (pure) — mirrors D2B eligibility, never mutates
// ---------------------------------------------------------------------------

/**
 * Compute the planned target status for a decision against a current card
 * status. PURE — no IO, no mutation. Used both for the dry-run report and the
 * pre-write eligibility check. The actual transition is still applied by D2B
 * (via D2F); this only predicts/validates it.
 *
 * @param {'APPROVE'|'REJECT'} decision
 * @param {string} currentStatus
 * @returns {{ ok: boolean, from: string, to: string|null }}
 */
export function planTransition(decision, currentStatus) {
  if (decision === 'APPROVE') {
    if (currentStatus !== 'PENDING') {
      return { ok: false, from: currentStatus, to: null };
    }
    return { ok: true, from: currentStatus, to: 'APPROVED_BY_DMITRY' };
  }
  // REJECT
  if (currentStatus !== 'PENDING' && currentStatus !== 'APPROVED_BY_DMITRY') {
    return { ok: false, from: currentStatus, to: null };
  }
  return { ok: true, from: currentStatus, to: 'CANCELLED' };
}

// ---------------------------------------------------------------------------
// Pre-write backup (snapshot) of the real queue file
// ---------------------------------------------------------------------------

/**
 * Copy the real queue file to a timestamped sibling backup BEFORE any mutation.
 * Backup name: <queueBasename>.<importId>.<timestamp>.bak.json next to the
 * original. Writes ONLY this backup; touches no lead data.
 *
 * @param {string} absQueuePath  absolute path to the queue JSON (must exist)
 * @param {string} importId
 * @returns {Promise<{ path: string }>}
 */
async function backupQueueFile(absQueuePath, importId) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.dirname(absQueuePath);
  const base = path.basename(absQueuePath);
  const safeId = String(importId).replace(/[^A-Za-z0-9._-]/g, '_');
  const bak = path.join(dir, `${base}.${safeId}.${ts}.bak.json`);
  await fs.copyFile(absQueuePath, bak);
  return { path: bak };
}

// ---------------------------------------------------------------------------
// Main entry point — controlled real queue write (gated)
// ---------------------------------------------------------------------------

/**
 * Apply an APPROVE / REJECT decision to a REAL (non-tmp) approval queue file,
 * under D2G's triple gate. By default (no confirmRealQueueWrite) this is a
 * DRY-RUN and the real file is never touched.
 *
 * Gate order:
 *   1. D2D decision shape (APPROVE/REJECT + import_id);
 *   2. queuePath required;
 *   3. sandbox path -> delegate straight to D2F (no real-gate needed);
 *   4. real path -> require allowRealQueueWrite === true (D2F override);
 *   5. load + validate card; check transition eligibility; expectedCardStatus;
 *      approver (Dmitry for APPROVE);
 *   6. without confirmRealQueueWrite === true -> DRY-RUN (no backup, no write);
 *   7. with confirmRealQueueWrite === true -> BACKUP then delegate to D2F with
 *      allowRealQueueWrite:true.
 *
 * NEVER reaches COMMITTED, NEVER runs an import, NEVER writes lead data.
 *
 * @param {'APPROVE'|'REJECT'} decision
 * @param {string} importId
 * @param {{
 *   queuePath?: string,
 *   reason?: string,
 *   approver?: string,
 *   approved_by?: string,
 *   allowRealQueueWrite?: boolean,
 *   confirmRealQueueWrite?: boolean,
 *   expectedCardStatus?: string
 * }} [options]
 * @returns {Promise<object>}
 */
export async function applyRealApprovalQueueWrite(decision, importId, options = {}) {
  const opts = isPlainObject(options) ? options : {};

  // 1) Validate decision shape using the D2D pure builder.
  const built = buildLeadImportApprovalDecision(decision, importId, {
    reason: opts.reason,
  });
  if (!built.ok) {
    return fail(built.status, built.reason, {
      decision: built.decision,
      import_id: built.import_id,
      queue_path: null,
    });
  }
  const normalized = built.decision; // 'APPROVE' | 'REJECT'

  // 2) queuePath is required — never assume a default.
  if (!isNonEmptyString(opts.queuePath)) {
    return fail(
      'FAIL_QUEUE_PATH_REQUIRED',
      'options.queuePath is required. D2G never assumes a default queue path.',
      { decision: normalized, import_id: importId, queue_path: null }
    );
  }

  const abs = path.resolve(opts.queuePath);
  const approver = isNonEmptyString(opts.approved_by)
    ? opts.approved_by
    : (isNonEmptyString(opts.approver) ? opts.approver : undefined);

  // 3) Sandbox path -> the D2G real-gate is not required. Delegate to D2F as-is
  //    (D2F writes sandbox paths without any override).
  if (isSandboxQueuePath(abs)) {
    const res = await applyApprovalDecision(normalized, importId, {
      queuePath: abs,
      reason: opts.reason,
      approved_by: approver,
    });
    return {
      ...res,
      version: REAL_QUEUE_WRITE_VERSION,
      real_gate: 'NOT_REQUIRED_SANDBOX',
      dry_run: false,
      queue_write: res.queue_written === true,
      backup_path: null,
    };
  }

  // ----- REAL (non-sandbox) path from here -----

  // 4) allowRealQueueWrite is the D2F override; without it the real path is
  //    BLOCKED. We pre-check so we can report cleanly (no card load, no IO).
  if (opts.allowRealQueueWrite !== true) {
    return fail(
      'FAIL_REAL_QUEUE_WRITE_BLOCKED',
      'Real (non-tmp) queue write is BLOCKED. Pass allowRealQueueWrite:true ' +
        '(Dmitry-gated D2F override) to proceed.',
      { decision: normalized, import_id: importId, queue_path: abs, is_sandbox: false }
    );
  }

  // 5) Load + validate the card so dry-run can report the real planned change.
  const queue = await loadApprovalQueue(abs);
  if (queue.error) {
    return fail('FAIL_QUEUE_UNREADABLE', `Approval queue is unreadable: ${queue.error}`, {
      decision: normalized, import_id: importId, queue_path: abs, is_sandbox: false,
    });
  }

  const card = findCard(queue, importId);
  if (!card) {
    return fail('FAIL_CARD_NOT_FOUND', `No card with import_id: ${importId}`, {
      decision: normalized, import_id: importId, queue_path: abs, is_sandbox: false,
    });
  }

  const valid = validateLeadImportApprovalCard(card);
  if (!valid.valid) {
    return fail('FAIL_INVALID_CARD', 'Target card is structurally invalid.', {
      decision: normalized, import_id: importId, queue_path: abs, is_sandbox: false,
      missing: valid.missing, invalid: valid.invalid,
    });
  }

  // Transition eligibility (mirrors D2B; refuse early, no backup, no write).
  const planned = planTransition(normalized, card.status);
  if (!planned.ok) {
    return fail(
      'INVALID_TRANSITION',
      `Decision ${normalized} not allowed from status ${card.status}.`,
      {
        decision: normalized, import_id: importId, queue_path: abs, is_sandbox: false,
        card_status: card.status,
      }
    );
  }

  // Optimistic status check against stale/racing decisions.
  if (isNonEmptyString(opts.expectedCardStatus) && opts.expectedCardStatus !== card.status) {
    return fail(
      'FAIL_STATUS_MISMATCH',
      `expectedCardStatus (${opts.expectedCardStatus}) != actual (${card.status}).`,
      {
        decision: normalized, import_id: importId, queue_path: abs, is_sandbox: false,
        card_status: card.status, expected_card_status: opts.expectedCardStatus,
      }
    );
  }

  // Approver pre-check for APPROVE (D2B requires Dmitry). Report cleanly here.
  if (normalized === 'APPROVE' && isNonEmptyString(approver) && approver !== APPROVER_DMITRY) {
    return fail(
      'APPROVER_NOT_ALLOWED',
      `Only ${APPROVER_DMITRY} can approve (got: ${approver}).`,
      {
        decision: normalized, import_id: importId, queue_path: abs, is_sandbox: false,
        card_status: card.status,
      }
    );
  }

  // 6) Second real-gate: without confirmRealQueueWrite this is a DRY-RUN.
  if (opts.confirmRealQueueWrite !== true) {
    return {
      ok: true,
      status: 'DRY_RUN',
      decision: normalized,
      import_id: importId,
      queue_path: abs,
      is_sandbox: false,
      dry_run: true,
      real_gate: 'NOT_CONFIRMED',
      card_status: card.status,
      planned_transition: { from: planned.from, to: planned.to },
      real_data_changed: false,
      queue_write: false,
      queue_written: false,
      backup_path: null,
      headline:
        `DRY-RUN: ${normalized} would move ${importId} ${planned.from} -> ` +
        `${planned.to} on real queue. confirmRealQueueWrite not set; file untouched.`,
      version: REAL_QUEUE_WRITE_VERSION,
      safety: { ...SAFETY },
    };
  }

  // 7) Confirmed real write: backup first, then delegate to D2F with override.
  const backup = await backupQueueFile(abs, importId);

  const res = await applyApprovalDecision(normalized, importId, {
    queuePath: abs,
    reason: opts.reason,
    approved_by: approver,
    allowRealQueueWrite: true,
  });

  return {
    ...res,
    version: REAL_QUEUE_WRITE_VERSION,
    real_gate: 'CONFIRMED',
    dry_run: false,
    is_sandbox: false,
    queue_write: res.queue_written === true,
    backup_path: backup.path,
    safety: { ...SAFETY },
  };
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function buildHelp() {
  return {
    ok: true,
    status: 'HELP',
    version: REAL_QUEUE_WRITE_VERSION,
    supported_actions: SUPPORTED_ACTIONS.slice(),
    usage: {
      approve:
        'Real-queue APPROVE (PENDING -> APPROVED_BY_DMITRY). Requires ' +
        'queuePath + importId + allowRealQueueWrite:true + ' +
        'confirmRealQueueWrite:true. Without confirm -> dry-run.',
      reject:
        'Real-queue REJECT (PENDING/APPROVED -> CANCELLED). Same gates. ' +
        'Without confirm -> dry-run.',
    },
    real_data_changed: false,
    queue_write: false,
    queue_written: false,
    dry_run: false,
    backup_path: null,
    safety: { ...SAFETY },
  };
}

// ---------------------------------------------------------------------------
// Command handler (standalone)
// ---------------------------------------------------------------------------

/**
 * Standalone command handler routing an approve/reject action to the real
 * gated queue-write step. Anything else -> help.
 *
 * @param {string} action
 * @param {{
 *   queuePath?: string,
 *   importId?: string,
 *   reason?: string,
 *   approver?: string,
 *   approved_by?: string,
 *   allowRealQueueWrite?: boolean,
 *   confirmRealQueueWrite?: boolean,
 *   expectedCardStatus?: string
 * }} [options]
 * @returns {Promise<object>}
 */
export async function handleLeadImportApprovalRealQueueWriteCommand(action, options = {}) {
  const opts = isPlainObject(options) ? options : {};
  const act = isNonEmptyString(action) ? action.trim().toLowerCase() : '';

  if (act === 'approve' || act === 'reject') {
    const result = await applyRealApprovalQueueWrite(act.toUpperCase(), opts.importId, {
      queuePath: opts.queuePath,
      reason: opts.reason,
      approver: opts.approver,
      approved_by: opts.approved_by,
      allowRealQueueWrite: opts.allowRealQueueWrite,
      confirmRealQueueWrite: opts.confirmRealQueueWrite,
      expectedCardStatus: opts.expectedCardStatus,
    });
    return { action: act, ...result };
  }

  return { action: act || null, ...buildHelp() };
}

// ---------------------------------------------------------------------------
// Default export (named bundle)
// ---------------------------------------------------------------------------

export default {
  getRealQueueWriteVersion,
  planTransition,
  applyRealApprovalQueueWrite,
  handleLeadImportApprovalRealQueueWriteCommand,
};
