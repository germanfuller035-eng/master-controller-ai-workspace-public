/**
 * lead_import_approval_queue_write.mjs
 *
 * Daily Lead Factory — D2F — Standalone Lead Import Approval QUEUE-WRITE module
 *
 * Purpose:
 *   The D2F building block is the FIRST module that PERSISTS a reviewed
 *   decision back into the approval queue store. It composes:
 *     - D2D (lead_import_approval_review.mjs) -> validates the APPROVE/REJECT
 *       decision shape (pure, safe), and
 *     - D2B (lead_intake_approval_queue.mjs)  -> applies the matching state
 *       transition to the on-disk approval queue (PENDING -> APPROVED_BY_DMITRY
 *       or PENDING/APPROVED -> CANCELLED).
 *
 *   It WRITES the approval queue JSON (that is the whole point of D2F), but it
 *   NEVER runs a real lead import, NEVER writes lead data, NEVER contacts a
 *   client, and NEVER patches a live bot.
 *
 * HARD SAFETY CONTRACT — what this module DOES NOT do:
 *   - No real import. real_import is ALWAYS BLOCKED. Approving a card only
 *     unlocks a FUTURE commit; it imports nothing here.
 *   - No client contact. client_contact is ALWAYS BLOCKED.
 *   - No auto_send / external send (email / Telegram / WhatsApp / MAX).
 *   - No live bot patch. No Telegram API. No bot integration.
 *   - No network / HTTP / fetch. No SMTP.
 *   - No .env / AI_SECRETS / token reads.
 *   - NEVER writes lead data (leads_master.json / lead_contacts.json / 13_sales).
 *
 * QUEUE-WRITE SAFETY (the D2F-specific gate):
 *   - options.queuePath is REQUIRED. Missing -> FAIL_QUEUE_PATH_REQUIRED.
 *   - By default the queue write is allowed ONLY to a SANDBOX path (a resolved
 *     path that contains a `tmp` segment). Writing to a real (non-tmp) queue is
 *     BLOCKED -> FAIL_REAL_QUEUE_WRITE_BLOCKED, unless the caller passes the
 *     explicit override options.allowRealQueueWrite === true (Dmitry-gated).
 *   - The module writes ONLY the approval queue file, via the D2B store's
 *     atomic save. It writes nothing else.
 *
 * Exports:
 *   - getQueueWriteVersion
 *   - isSandboxQueuePath
 *   - applyApprovalDecision
 *   - handleLeadImportApprovalQueueWriteCommand
 */

'use strict';

import path from 'node:path';

import {
  loadApprovalQueue,
  findCard,
  approveCard,
  cancelCard,
} from './lead_intake_approval_queue.mjs';


import {
  buildLeadImportApprovalDecision,
  validateLeadImportApprovalCard,
} from './lead_import_approval_review.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUEUE_WRITE_VERSION = 'lead-import-approval-queue-write-d2f-v1';

// The single, frozen safety contract surfaced by every queue-write response.
// real_import, client_contact, auto_send and live_bot_patch are HARD-BLOCKED.
const SAFETY = Object.freeze({
  real_import: 'BLOCKED',
  client_contact: 'BLOCKED',
  auto_send: 'BLOCKED',
  live_bot_patch: 'NO',
  external_send: 'NO',
  smtp_used: 'NO',
  network_used: 'NO',
  telegram_api_called: 'NO',
  writes_lead_data: 'NO',
  env_secrets: 'NO',
  queue_write: 'SANDBOX_ONLY',
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

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

/**
 * @returns {string} the queue-write module version identifier.
 */
export function getQueueWriteVersion() {
  return QUEUE_WRITE_VERSION;
}

// ---------------------------------------------------------------------------
// Sandbox path gate (pure)
// ---------------------------------------------------------------------------

/**
 * Decide whether a queue path is a SANDBOX path (writes are allowed by
 * default only to sandbox). A path is treated as sandbox when, after
 * resolution, one of its directory segments is exactly `tmp`. PURE — no IO.
 *
 * @param {string} queuePath
 * @returns {boolean}
 */
export function isSandboxQueuePath(queuePath) {
  if (!isNonEmptyString(queuePath)) return false;
  const abs = path.resolve(queuePath);
  const segments = abs.split(/[\\/]+/).filter(Boolean);
  return segments.some((seg) => seg.toLowerCase() === 'tmp');
}

// ---------------------------------------------------------------------------
// Apply a reviewed decision to the queue (WRITES the queue)
// ---------------------------------------------------------------------------

/**
 * Apply an APPROVE / REJECT decision to the approval queue store, persisting
 * the matching state transition. This WRITES the approval queue JSON, but runs
 * NO real import and touches NO lead data / client / bot.
 *
 *   APPROVE -> approveCard (PENDING -> APPROVED_BY_DMITRY)
 *   REJECT  -> cancelCard  (PENDING/APPROVED -> CANCELLED)
 *
 * Guards (in order):
 *   1. decision shape valid (delegated to D2D buildLeadImportApprovalDecision);
 *   2. options.queuePath required;
 *   3. sandbox-only gate (unless options.allowRealQueueWrite === true);
 *   4. card must exist + be a valid card;
 *   5. D2B transition applied + saved.
 *
 * @param {'APPROVE'|'REJECT'} decision
 * @param {string} importId
 * @param {{
 *   queuePath?: string,
 *   reason?: string,
 *   approved_by?: string,
 *   allowRealQueueWrite?: boolean
 * }} [options]
 * @returns {Promise<object>}
 */
export async function applyApprovalDecision(decision, importId, options = {}) {
  const opts = isPlainObject(options) ? options : {};

  // 1) Validate the decision shape using the D2D pure builder.
  const built = buildLeadImportApprovalDecision(decision, importId, {
    reason: opts.reason,
  });
  if (!built.ok) {
    return {
      ok: false,
      status: built.status,
      decision: built.decision,
      import_id: built.import_id,
      queue_path: null,
      real_data_changed: false,
      queue_written: false,
      message: built.reason,
      safety: { ...SAFETY },
    };
  }

  const normalized = built.decision; // 'APPROVE' | 'REJECT'

  // 2) queuePath is required — never assume a default.
  if (!isNonEmptyString(opts.queuePath)) {
    return {
      ok: false,
      status: 'FAIL_QUEUE_PATH_REQUIRED',
      decision: normalized,
      import_id: importId,
      queue_path: null,
      real_data_changed: false,
      queue_written: false,
      message:
        'options.queuePath is required. This module never assumes a default ' +
        'queue path.',
      safety: { ...SAFETY },
    };
  }

  const abs = path.resolve(opts.queuePath);

  // 3) Sandbox-only gate — real queue writes are BLOCKED unless explicitly
  //    overridden by a Dmitry-gated allowRealQueueWrite flag.
  const sandbox = isSandboxQueuePath(abs);
  if (!sandbox && opts.allowRealQueueWrite !== true) {
    return {
      ok: false,
      status: 'FAIL_REAL_QUEUE_WRITE_BLOCKED',
      decision: normalized,
      import_id: importId,
      queue_path: abs,
      is_sandbox: false,
      real_data_changed: false,
      queue_written: false,
      message:
        'Queue write to a non-sandbox (non-tmp) path is BLOCKED. Pass ' +
        'allowRealQueueWrite:true to override (Dmitry-gated).',
      safety: { ...SAFETY },
    };
  }

  // 4) Card must exist and be structurally valid before we mutate.
  const queue = await loadApprovalQueue(abs);
  if (queue.error) {
    return {
      ok: false,
      status: 'FAIL_QUEUE_UNREADABLE',
      decision: normalized,
      import_id: importId,
      queue_path: abs,
      is_sandbox: sandbox,
      real_data_changed: false,
      queue_written: false,
      message: `Approval queue is unreadable: ${queue.error}`,
      safety: { ...SAFETY },
    };
  }

  const card = findCard(queue, importId);
  if (!card) {
    return {
      ok: false,
      status: 'FAIL_CARD_NOT_FOUND',
      decision: normalized,
      import_id: importId,
      queue_path: abs,
      is_sandbox: sandbox,
      real_data_changed: false,
      queue_written: false,
      message: `No card with import_id: ${importId}`,
      safety: { ...SAFETY },
    };
  }

  const valid = validateLeadImportApprovalCard(card);
  if (!valid.valid) {
    return {
      ok: false,
      status: 'FAIL_INVALID_CARD',
      decision: normalized,
      import_id: importId,
      queue_path: abs,
      is_sandbox: sandbox,
      real_data_changed: false,
      queue_written: false,
      message: 'Target card is structurally invalid.',
      missing: valid.missing,
      invalid: valid.invalid,
      safety: { ...SAFETY },
    };
  }

  // 5) Apply + persist the matching D2B transition (this WRITES the queue).
  const transition =
    normalized === 'APPROVE'
      ? await approveCard(abs, importId, { approved_by: opts.approved_by })
      : await cancelCard(abs, importId, { reason: opts.reason });

  if (!transition.ok) {
    return {
      ok: false,
      status: transition.status || 'FAIL_TRANSITION_REFUSED',
      decision: normalized,
      import_id: importId,
      queue_path: abs,
      is_sandbox: sandbox,
      real_data_changed: false,
      queue_written: false,
      message: transition.message || 'Queue transition refused.',
      card_status: transition.card ? transition.card.status : null,
      safety: { ...SAFETY },
    };
  }

  return {
    ok: true,
    status: 'QUEUE_WRITTEN',
    decision: normalized,
    import_id: importId,
    queue_path: abs,
    is_sandbox: sandbox,
    card_status: transition.card ? transition.card.status : null,
    real_data_changed: false,
    queue_written: true,
    headline:
      `Decision ${normalized} persisted to queue: ${importId} is now ` +
      `${transition.card ? transition.card.status : 'updated'} ` +
      `(${sandbox ? 'sandbox' : 'real'} queue, no real import).`,
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
    version: QUEUE_WRITE_VERSION,
    supported_actions: SUPPORTED_ACTIONS.slice(),
    usage: {
      approve:
        'Persist APPROVE to the queue (PENDING -> APPROVED_BY_DMITRY). ' +
        'Requires options.queuePath + options.importId. Sandbox-only by default.',
      reject:
        'Persist REJECT to the queue (PENDING/APPROVED -> CANCELLED). ' +
        'Requires options.queuePath + options.importId. Sandbox-only by default.',
    },
    real_data_changed: false,
    queue_written: false,
    safety: { ...SAFETY },
  };
}

// ---------------------------------------------------------------------------
// Command handler (standalone)
// ---------------------------------------------------------------------------

/**
 * Standalone command handler. Routes an approve/reject action to the
 * queue-write apply step. Anything else -> help.
 *
 * @param {string} action
 * @param {{
 *   queuePath?: string,
 *   importId?: string,
 *   reason?: string,
 *   approved_by?: string,
 *   allowRealQueueWrite?: boolean
 * }} [options]
 * @returns {Promise<object>}
 */
export async function handleLeadImportApprovalQueueWriteCommand(action, options = {}) {
  const opts = isPlainObject(options) ? options : {};
  const act = isNonEmptyString(action) ? action.trim().toLowerCase() : '';

  if (act === 'approve' || act === 'reject') {
    const result = await applyApprovalDecision(act.toUpperCase(), opts.importId, {
      queuePath: opts.queuePath,
      reason: opts.reason,
      approved_by: opts.approved_by,
      allowRealQueueWrite: opts.allowRealQueueWrite,
    });
    return { action: act, ...result };
  }

  return { action: act || null, ...buildHelp() };
}

// ---------------------------------------------------------------------------
// Default export (named bundle)
// ---------------------------------------------------------------------------

export default {
  getQueueWriteVersion,
  isSandboxQueuePath,
  applyApprovalDecision,
  handleLeadImportApprovalQueueWriteCommand,
};
