/**
 * lead_import_commit_recorder_real.mjs
 * ---------------------------------------------------------------------------
 * Daily Lead Factory — D2N Phase 2 (Part B) — Commit Recorder (hand-off)
 *
 * Purpose:
 *   The "recorder half" of a real COMMIT. The importer
 *   (lead_import_committed_importer_real.mjs) performs the leads-store write and
 *   returns { snapshot_id, commit_result } but DELIBERATELY never writes the
 *   approval queue. THIS module is the controlled recorder that consumes the
 *   importer's successful (OK_IMPORTED) hand-off payload and:
 *     - reads the approval-queue card (read-only first);
 *     - verifies the hand-off against the card (B.3 pre-conditions);
 *     - performs ONE atomic + `.bak` write into the approval queue that stamps
 *       snapshot_id + commit_result and transitions the card
 *       APPROVED_BY_DMITRY -> COMMITTED;
 *     - preserves needs_review_count and all existing fields + history.
 *
 *   It mirrors the D2G / D2N importer discipline:
 *     - DRY-RUN by default (writes NOTHING unless triple-gated);
 *     - triple gate to write: allowCommit:true + confirmCommit:true +
 *       expectedImportId === import_id (exact match);
 *     - backup-then-atomic-rename (.bak + tmp write + rename);
 *     - idempotent: re-recording the SAME snapshot_id on an already-COMMITTED
 *       card is a no-op success; a DIFFERENT snapshot is a hard refuse;
 *     - refuses to stamp a DRY-RUN / planned / failed importer result;
 *     - never imports leads data (that is the importer's job);
 *     - never contacts a client, never touches the live bot, no network.
 *
 * HARD SAFETY CONTRACT — what this module DOES NOT do:
 *   - No network. No HTTP/fetch. No site scanning.
 *   - No SMTP / email / Telegram / WhatsApp / MAX send. auto_send BLOCKED.
 *   - No Telegram API. No bot integration. No live bot patch/restart.
 *   - No .env / AI_SECRETS / token reads.
 *   - client_contact ALWAYS BLOCKED.
 *   - NEVER imports / writes leads data (no leads_master write here).
 *   - In DRY-RUN (default) writes NOTHING at all.
 *   - Real approval-queue write ONLY when triple-gated, and even then writes
 *     ONLY the caller-provided queuePath (plus its `.bak`/`.tmp`), nothing else.
 *
 * Exports:
 *   - getCommitRecorderVersion
 *   - COMMIT_RECORDER_VERSION
 *   - recordCommit
 * ---------------------------------------------------------------------------
 */

'use strict';

import path from 'node:path';
import fs from 'node:fs/promises';

import {
  loadApprovalQueue,
  findCard,
  CardStatus,
} from './lead_intake_approval_queue.mjs';

import { computeSnapshotId } from './lead_import_committed_importer_real.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const COMMIT_RECORDER_VERSION = 'lead-import-commit-recorder-real-d2n-phase2-v1';

const APPROVER_DMITRY = 'Dmitry';

// The frozen safety contract surfaced on every recorder response.
const SAFETY = Object.freeze({
  network_used: 'NO',
  external_send: 'NO',
  smtp_used: 'NO',
  auto_send: 'BLOCKED',
  client_contact: 'BLOCKED',
  email_send: 'BLOCKED',
  telegram_send: 'BLOCKED',
  whatsapp_send: 'BLOCKED',
  max_send: 'BLOCKED',
  env_secrets: 'NO',
  bot_integration: 'NO',
  bot_live_patch: 'NO',
  leads_write: 'NO',          // recorder NEVER imports / writes leads data
  queue_write: 'GATED',       // requires triple gate; DRY-RUN by default
});

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function nowIso(clock) {
  if (clock instanceof Date && !Number.isNaN(clock.getTime())) {
    return clock.toISOString();
  }
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

export function getCommitRecorderVersion() {
  return COMMIT_RECORDER_VERSION;
}

// ---------------------------------------------------------------------------
// Core: recordCommit
// ---------------------------------------------------------------------------

/**
 * Record exactly one importer hand-off onto its approval-queue card,
 * transitioning APPROVED_BY_DMITRY -> COMMITTED.
 *
 * DRY-RUN by default (writes nothing). A real queue write requires ALL of:
 *   - allowCommit === true
 *   - confirmCommit === true
 *   - expectedImportId === importerResult.import_id (exact match)
 *
 * @param {{
 *   queuePath: string,                 // approval queue JSON to write
 *   importerResult: object,            // the importer's OK_IMPORTED result
 *   leadRecord?: object,               // the imported lead record (snapshot cross-check)
 *   expectedImportId?: string,         // MUST equal import_id to write
 *   allowCommit?: boolean,
 *   confirmCommit?: boolean,
 *   committedBy?: string,              // defaults to Dmitry
 *   clock?: Date                       // deterministic-test clock injection
 * }} args
 * @returns {Promise<object>} structured result (never throws on expected paths)
 */
export async function recordCommit(args = {}) {
  const a = isPlainObject(args) ? args : {};
  const safety = { ...SAFETY };
  const base = {
    version: COMMIT_RECORDER_VERSION,
    ok: false,
    status: 'UNKNOWN',
    dry_run: true,
    queue_written: false,
    leads_written: false,        // ALWAYS false — recorder never writes leads
    real_data_changed: false,
    import_id: null,
    snapshot_id: null,
    card_status_before: null,
    card_status_after: null,
    backup_file: null,
    safety,
  };

  // -- input validation -----------------------------------------------------
  if (!isNonEmptyString(a.queuePath)) {
    return { ...base, status: 'FAIL_QUEUE_PATH_REQUIRED', message: 'queuePath is required.' };
  }
  if (!isPlainObject(a.importerResult)) {
    return { ...base, status: 'FAIL_IMPORTER_RESULT_REQUIRED', message: 'importerResult (object) is required.' };
  }

  const ir = a.importerResult;

  // -- B.3.1: importer must have actually imported -------------------------
  if (ir.ok !== true || ir.status !== 'OK_IMPORTED' || ir.leads_written !== true) {
    return {
      ...base,
      status: 'FAIL_NOT_AN_IMPORTED_RESULT',
      message: `Recorder refuses to stamp a non-imported result (status=${ir.status}, ok=${ir.ok}, leads_written=${ir.leads_written}).`,
    };
  }

  const commit_result = ir.commit_result;
  if (!isPlainObject(commit_result)) {
    return { ...base, status: 'FAIL_COMMIT_RESULT_MISSING', message: 'importerResult.commit_result (object) is required.' };
  }

  const importId = isNonEmptyString(commit_result.import_id) ? commit_result.import_id : ir.import_id;
  const snapshotId = isNonEmptyString(commit_result.snapshot_id) ? commit_result.snapshot_id : ir.snapshot_id;

  if (!isNonEmptyString(importId)) {
    return { ...base, status: 'FAIL_IMPORT_ID_MISSING', message: 'commit_result.import_id is required.' };
  }
  if (!isNonEmptyString(snapshotId)) {
    return { ...base, status: 'FAIL_SNAPSHOT_ID_MISSING', message: 'commit_result.snapshot_id is required.' };
  }

  base.import_id = importId;
  base.snapshot_id = snapshotId;

  // -- load + locate card (read-only) --------------------------------------
  const queue = await loadApprovalQueue(a.queuePath);
  if (queue.error) {
    return { ...base, status: 'FAIL_QUEUE_UNREADABLE', message: `Approval queue unreadable: ${queue.error}` };
  }
  if (!queue.exists) {
    return { ...base, status: 'FAIL_QUEUE_NOT_INITIALIZED', message: 'Approval queue not initialized.' };
  }
  const card = findCard(queue, importId);
  if (!card) {
    return { ...base, status: 'FAIL_CARD_NOT_FOUND', message: `No card with import_id: ${importId}` };
  }

  base.card_status_before = card.status;

  // -- B.3.3: import_id cross-check ----------------------------------------
  if (commit_result.import_id && commit_result.import_id !== card.import_id) {
    return {
      ...base,
      status: 'FAIL_IMPORT_ID_CROSS_CHECK',
      message: `commit_result.import_id (${commit_result.import_id}) != card.import_id (${card.import_id}).`,
    };
  }

  // -- B.3.2: idempotency on already-COMMITTED card ------------------------
  if (card.status === CardStatus.COMMITTED) {
    if (card.snapshot_id === snapshotId) {
      // Same snapshot already recorded -> no-op success (idempotent).
      return {
        ...base,
        ok: true,
        status: 'NOOP_ALREADY_RECORDED',
        dry_run: true,
        card_status_after: card.status,
        message: `Card already COMMITTED with the same snapshot_id (${snapshotId}). No-op.`,
      };
    }
    return {
      ...base,
      status: 'FAIL_ALREADY_COMMITTED_DIFFERENT_SNAPSHOT',
      card_status_after: card.status,
      message: `Card already COMMITTED with a different snapshot_id (card=${card.snapshot_id}, handoff=${snapshotId}). Hard refuse.`,
    };
  }

  // -- B.3.2 (cont.): card must be APPROVED_BY_DMITRY ----------------------
  if (card.status !== CardStatus.APPROVED_BY_DMITRY) {
    return {
      ...base,
      status: 'FAIL_CARD_NOT_APPROVED',
      message: `Card must be APPROVED_BY_DMITRY to record a commit (got ${card.status}).`,
    };
  }
  if (card.approved_by !== APPROVER_DMITRY) {
    return {
      ...base,
      status: 'FAIL_APPROVER_MISMATCH',
      message: `Card approved_by must be ${APPROVER_DMITRY} (got ${card.approved_by}).`,
    };
  }

  // -- B.3.4: snapshot determinism cross-check (anti-tamper) ---------------
  // Only enforced when the caller supplies the lead record that produced it.
  if (isPlainObject(a.leadRecord)) {
    const recomputed = computeSnapshotId({
      importId,
      textHash: card.text_hash,
      leadRecord: a.leadRecord,
    });
    if (recomputed !== snapshotId) {
      return {
        ...base,
        status: 'FAIL_SNAPSHOT_CROSS_CHECK',
        message: `snapshot_id does not recompute from card.text_hash + leadRecord (handoff=${snapshotId}, recomputed=${recomputed}).`,
      };
    }
  }

  const ts = nowIso(a.clock);
  const committedBy = isNonEmptyString(a.committedBy) ? a.committedBy : APPROVER_DMITRY;

  // -- B.5: triple gate ----------------------------------------------------
  const idMatch = isNonEmptyString(a.expectedImportId) && a.expectedImportId === importId;
  const triggered = a.allowCommit === true && a.confirmCommit === true && idMatch;

  if (!triggered) {
    let reason = 'DRY_RUN (no triple gate)';
    if (isNonEmptyString(a.expectedImportId) && !idMatch) {
      return {
        ...base,
        status: 'FAIL_IMPORT_ID_MISMATCH',
        card_status_after: card.status,
        message: `expectedImportId mismatch (got ${a.expectedImportId}, want ${importId}).`,
        planned_card_status: CardStatus.COMMITTED,
      };
    }
    return {
      ...base,
      status: 'DRY_RUN',
      dry_run: true,
      card_status_after: card.status,
      message: reason,
      planned_card_status: CardStatus.COMMITTED,
      planned_stamp: {
        snapshot_id: snapshotId,
        commit_result,
        committed_at: ts,
        committed_by: committedBy,
      },
    };
  }

  // -- CONFIRMED real queue write ------------------------------------------
  const absQueue = path.resolve(a.queuePath);

  // Mutate the located card in-place within the loaded queue's card array,
  // preserving all existing fields (incl. needs_review_count) and history.
  const before = card.status;
  card.status = CardStatus.COMMITTED;
  card.snapshot_id = snapshotId;
  card.commit_result = commit_result;
  card.committed_at = ts;
  card.committed_by = committedBy;
  if (!Array.isArray(card.history)) card.history = [];
  card.history.push({
    at: ts,
    from: before,
    to: CardStatus.COMMITTED,
    note: `committed (snapshot ${snapshotId}) recorded by ${committedBy}`,
  });

  const payload = {
    version: isNonEmptyString(queue.version) ? queue.version : undefined,
    updated_at: ts,
    cards: queue.cards,
  };
  // Drop undefined version so the saved shape stays clean.
  if (!payload.version) delete payload.version;

  // backup-then-atomic-rename
  const backupFile = `${absQueue}.bak`;
  await fs.copyFile(absQueue, backupFile);

  const tmp = `${absQueue}.tmp-${process.pid}-${Date.now()}`;
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  await fs.writeFile(tmp, json, 'utf8');
  await fs.rename(tmp, absQueue);

  return {
    ...base,
    ok: true,
    status: 'OK_RECORDED',
    dry_run: false,
    queue_written: true,
    leads_written: false,
    real_data_changed: true,
    card_status_after: CardStatus.COMMITTED,
    backup_file: backupFile,
    committed_at: ts,
    committed_by: committedBy,
    message: `Card ${importId} recorded COMMITTED (snapshot ${snapshotId}). Leads NOT written (importer is a separate step).`,
  };
}

// ---------------------------------------------------------------------------
// Default export (named bundle)
// ---------------------------------------------------------------------------

export default {
  getCommitRecorderVersion,
  COMMIT_RECORDER_VERSION,
  recordCommit,
};
