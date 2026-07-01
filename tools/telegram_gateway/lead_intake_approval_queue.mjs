/**
 * lead_intake_approval_queue.mjs
 *
 * Daily Lead Factory — D2b — Standalone Lead Import Approval Queue module
 *
 * Purpose:
 *   A STANDALONE approval-queue store + state machine for controlled real
 *   imports. It implements the data model and transitions described in the
 *   D2a plan (lead_intake_d2_controlled_real_import_approval_plan.md):
 *
 *     PENDING -> APPROVED_BY_DMITRY -> COMMITTED
 *     PENDING -> CANCELLED
 *     APPROVED_BY_DMITRY -> CANCELLED
 *     APPROVED_BY_DMITRY -> FAILED (commit attempt failed / rolled back)
 *
 *   This module manages ONLY the approval queue store (a small JSON file of
 *   approval cards). It does NOT parse leads, does NOT run imports, does NOT
 *   write lead data, and is NOT wired into any bot. It is the D2b building
 *   block that a future D2d command layer will compose.
 *
 * HARD SAFETY CONTRACT — what this module DOES NOT do:
 *   - No network. No HTTP/fetch. No site scanning.
 *   - No SMTP. No email/Telegram/WhatsApp/MAX send. auto_send always BLOCKED.
 *   - No Telegram API. No bot integration. No git. No VPS/SSH.
 *   - No .env / AI_SECRETS / tokens reads.
 *   - client_contact always BLOCKED.
 *   - NEVER writes leads_master.json / lead_contacts.json or any lead data.
 *   - NEVER runs an import. Approving a card does NOT import anything.
 *   - Only reads/writes the approval queue JSON at the caller-provided storePath.
 *
 * Exports:
 *   - getApprovalQueueVersion
 *   - getDefaultApprovalQueuePath
 *   - hashText
 *   - generateImportId
 *   - buildApprovalCard
 *   - loadApprovalQueue
 *   - saveApprovalQueue
 *   - addApprovalCard
 *   - findCard
 *   - listCards
 *   - listPendingCards
 *   - approveCard
 *   - cancelCard
 *   - markCommitted
 *   - markFailed
 *   - canCommit
 *   - buildApprovalQueueSummary
 */

'use strict';

import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const APPROVAL_QUEUE_VERSION = 'lead-intake-approval-queue-d2b-v1';

const REAL_WORKSPACE_ROOT = path.resolve('D:\\AI_WORKSPACE');

// Canonical (proposed) store location from the D2a plan. The module never
// writes here implicitly — a caller must pass this path on purpose. Tests use
// a tmp path so no 13_sales write occurs.
const DEFAULT_QUEUE_REL = '13_sales/approval_queue/lead_import_approvals.json';

// The single, frozen safety contract surfaced by every queue response.
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
  writes_lead_data: 'NO',
  runs_import: 'NO',
});

// Approval card lifecycle statuses.
const CARD_STATUS = Object.freeze({
  PENDING: 'PENDING',
  APPROVED_BY_DMITRY: 'APPROVED_BY_DMITRY',
  COMMITTED: 'COMMITTED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
});

// QA Gate verdicts allowed on a card.
const QA_STATUS = Object.freeze({
  PASS: 'PASS',
  PASS_WITH_REVIEW: 'PASS_WITH_REVIEW',
  FAIL: 'FAIL',
});

// The only approver allowed to unlock a commit.
const APPROVER_DMITRY = 'Dmitry';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function toSafeInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Read + parse a JSON file safely. Never throws; returns a structured result.
 * @param {string} absPath
 * @returns {Promise<{ exists: boolean, parsed: any, error: string|null }>}
 */
async function readJsonSafe(absPath) {
  try {
    const raw = await fs.readFile(absPath, 'utf8');
    try {
      return { exists: true, parsed: JSON.parse(raw), error: null };
    } catch (parseErr) {
      return {
        exists: true,
        parsed: null,
        error: parseErr && parseErr.message ? parseErr.message : String(parseErr),
      };
    }
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { exists: false, parsed: null, error: null };
    }
    return {
      exists: false,
      parsed: null,
      error: err && err.message ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Version + paths
// ---------------------------------------------------------------------------

/**
 * @returns {string} the approval queue module version identifier.
 */
export function getApprovalQueueVersion() {
  return APPROVAL_QUEUE_VERSION;
}

/**
 * The canonical (proposed) approval queue store path. The module never writes
 * here implicitly — a caller must pass this path on purpose.
 * @param {{ workspaceRoot?: string }} [options]
 * @returns {string} absolute path to lead_import_approvals.json
 */
export function getDefaultApprovalQueuePath(options = {}) {
  const root = isNonEmptyString(options.workspaceRoot)
    ? path.resolve(options.workspaceRoot)
    : REAL_WORKSPACE_ROOT;
  return path.resolve(root, DEFAULT_QUEUE_REL);
}

// ---------------------------------------------------------------------------
// Hashing + id generation
// ---------------------------------------------------------------------------

/**
 * Deterministic SHA-256 hex hash of the raw input text (integrity / dedupe of
 * submissions). Empty / non-string input hashes the empty string.
 * @param {string} text
 * @returns {string} 64-char hex digest
 */
export function hashText(text) {
  const s = typeof text === 'string' ? text : '';
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

/**
 * Generate a unique import_id of the form IMP-YYYYMMDD-HHMMSS-<6hex>.
 * The trailing hex segment is derived from the text hash (if provided) plus a
 * random component so identical text submitted twice still yields distinct ids.
 * @param {string} [text]  optional source text to seed the id
 * @param {Date} [when]    optional clock injection for deterministic tests
 * @returns {string}
 */
export function generateImportId(text, when) {
  const d = when instanceof Date && !Number.isNaN(when.getTime()) ? when : new Date();
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const datePart =
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  const timePart =
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  const seed = `${hashText(text)}:${crypto.randomBytes(4).toString('hex')}`;
  const suffix = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 6);
  return `IMP-${datePart}-${timePart}-${suffix}`;
}

// ---------------------------------------------------------------------------
// Card construction (pure)
// ---------------------------------------------------------------------------

/**
 * Build a fresh PENDING approval card object from a dry-run result descriptor.
 * Pure — no IO. The card matches the field set defined in the D2a plan.
 *
 * @param {{
 *   text?: string,
 *   text_hash?: string,
 *   source?: string,
 *   parsed_count?: number,
 *   valid_count?: number,
 *   added_count?: number,
 *   merged_count?: number,
 *   needs_review_count?: number,
 *   qa_status?: string,
 *   import_id?: string,
 *   created_at?: string
 * }} input
 * @returns {object} a PENDING approval card
 */
export function buildApprovalCard(input = {}) {
  const src = isPlainObject(input) ? input : {};

  const text_hash = isNonEmptyString(src.text_hash)
    ? src.text_hash
    : hashText(src.text);

  const import_id = isNonEmptyString(src.import_id)
    ? src.import_id
    : generateImportId(src.text);

  const created_at = isNonEmptyString(src.created_at) ? src.created_at : nowIso();

  const rawQa = isNonEmptyString(src.qa_status) ? src.qa_status : QA_STATUS.PASS;
  const qa_status = Object.values(QA_STATUS).includes(rawQa)
    ? rawQa
    : QA_STATUS.FAIL;

  return {
    import_id,
    created_at,
    source: isNonEmptyString(src.source) ? src.source : 'lead_import_prepare',
    text_hash,
    parsed_count: toSafeInt(src.parsed_count),
    valid_count: toSafeInt(src.valid_count),
    added_count: toSafeInt(src.added_count),
    merged_count: toSafeInt(src.merged_count),
    needs_review_count: toSafeInt(src.needs_review_count),
    qa_status,
    safety: { ...SAFETY },
    status: CARD_STATUS.PENDING,
    approved_by: null,
    approved_at: null,
    snapshot_id: null,
    commit_result: null,
    cancelled_at: null,
    failed_at: null,
    history: [
      { at: created_at, from: null, to: CARD_STATUS.PENDING, note: 'card created' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Store IO
// ---------------------------------------------------------------------------

/**
 * Normalize an arbitrary parsed payload into a queue shape:
 *   { version, updated_at, cards: [...] }
 * @param {any} parsed
 * @returns {{ version: string, updated_at: string|null, cards: object[] }}
 */
function normalizeQueue(parsed) {
  if (Array.isArray(parsed)) {
    return { version: APPROVAL_QUEUE_VERSION, updated_at: null, cards: parsed };
  }
  if (isPlainObject(parsed) && Array.isArray(parsed.cards)) {
    return {
      version: isNonEmptyString(parsed.version) ? parsed.version : APPROVAL_QUEUE_VERSION,
      updated_at: isNonEmptyString(parsed.updated_at) ? parsed.updated_at : null,
      cards: parsed.cards,
    };
  }
  return { version: APPROVAL_QUEUE_VERSION, updated_at: null, cards: [] };
}

/**
 * Load the approval queue from a store path. Missing file -> empty queue.
 * Never throws; surfaces parse errors in the returned object.
 *
 * @param {string} storePath  absolute path to the queue JSON
 * @returns {Promise<{
 *   version: string, updated_at: string|null, cards: object[],
 *   exists: boolean, error: string|null, store_path: string
 * }>}
 */
export async function loadApprovalQueue(storePath) {
  if (!isNonEmptyString(storePath)) {
    throw new Error('loadApprovalQueue: storePath is required');
  }
  const abs = path.resolve(storePath);
  const res = await readJsonSafe(abs);
  const queue = normalizeQueue(res.parsed);
  return {
    ...queue,
    exists: res.exists === true,
    error: res.error,
    store_path: abs,
  };
}

/**
 * Atomically save a queue object to the store path (write tmp + rename).
 * Creates the parent directory if needed. Writes ONLY the approval queue —
 * never any lead data.
 *
 * @param {string} storePath
 * @param {{ cards: object[] }} queue
 * @returns {Promise<{ ok: boolean, store_path: string, count: number }>}
 */
export async function saveApprovalQueue(storePath, queue) {
  if (!isNonEmptyString(storePath)) {
    throw new Error('saveApprovalQueue: storePath is required');
  }
  const abs = path.resolve(storePath);
  const cards = queue && Array.isArray(queue.cards) ? queue.cards : [];

  const payload = {
    version: APPROVAL_QUEUE_VERSION,
    updated_at: nowIso(),
    cards,
  };

  await fs.mkdir(path.dirname(abs), { recursive: true });

  const tmp = `${abs}.tmp-${process.pid}-${Date.now()}`;
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  await fs.writeFile(tmp, json, 'utf8');
  await fs.rename(tmp, abs);

  return { ok: true, store_path: abs, count: cards.length };
}

// ---------------------------------------------------------------------------
// Query helpers (pure)
// ---------------------------------------------------------------------------

/**
 * Find a card by import_id within a loaded queue object (or a raw card array).
 * @param {{ cards: object[] }|object[]} queue
 * @param {string} importId
 * @returns {object|null}
 */
export function findCard(queue, importId) {
  if (!isNonEmptyString(importId)) return null;
  const cards = Array.isArray(queue) ? queue : (queue && queue.cards) || [];
  for (const c of cards) {
    if (c && c.import_id === importId) return c;
  }
  return null;
}

/**
 * List all cards, optionally filtered by status.
 * @param {{ cards: object[] }|object[]} queue
 * @param {string} [status]  optional CARD_STATUS filter
 * @returns {object[]}
 */
export function listCards(queue, status) {
  const cards = Array.isArray(queue) ? queue : (queue && queue.cards) || [];
  if (!isNonEmptyString(status)) return cards.slice();
  return cards.filter((c) => c && c.status === status);
}

/**
 * List PENDING cards only.
 * @param {{ cards: object[] }|object[]} queue
 * @returns {object[]}
 */
export function listPendingCards(queue) {
  return listCards(queue, CARD_STATUS.PENDING);
}

// ---------------------------------------------------------------------------
// Persistence: add a card
// ---------------------------------------------------------------------------

/**
 * Build a PENDING card from input, append it to the on-disk queue, and save.
 * Refuses to add a duplicate import_id.
 *
 * @param {string} storePath
 * @param {object} cardInput  see buildApprovalCard
 * @returns {Promise<{ ok: boolean, status: string, card?: object, message?: string, store_path: string }>}
 */
export async function addApprovalCard(storePath, cardInput = {}) {
  const queue = await loadApprovalQueue(storePath);

  if (queue.error) {
    return {
      ok: false,
      status: 'ERROR',
      message: `Approval queue store is unreadable: ${queue.error}`,
      store_path: queue.store_path,
    };
  }

  const card = buildApprovalCard(cardInput);

  if (findCard(queue, card.import_id)) {
    return {
      ok: false,
      status: 'DUPLICATE_IMPORT_ID',
      message: `import_id already exists in queue: ${card.import_id}`,
      store_path: queue.store_path,
    };
  }

  const cards = queue.cards.slice();
  cards.push(card);
  await saveApprovalQueue(storePath, { cards });

  return {
    ok: true,
    status: CARD_STATUS.PENDING,
    card,
    store_path: queue.store_path,
  };
}

// ---------------------------------------------------------------------------
// State transitions (load -> mutate -> save)
// ---------------------------------------------------------------------------

/**
 * Internal: load queue, locate a card, apply a mutator, save, return result.
 * The mutator receives the card and must return either:
 *   { ok: true }                -> save and report success
 *   { ok: false, status, msg }  -> abort without saving
 *
 * @param {string} storePath
 * @param {string} importId
 * @param {(card: object) => { ok: boolean, status?: string, message?: string }} mutator
 * @returns {Promise<object>}
 */
async function mutateCard(storePath, importId, mutator) {
  const queue = await loadApprovalQueue(storePath);

  if (queue.error) {
    return {
      ok: false,
      status: 'ERROR',
      message: `Approval queue store is unreadable: ${queue.error}`,
      store_path: queue.store_path,
    };
  }

  const card = findCard(queue, importId);
  if (!card) {
    return {
      ok: false,
      status: 'NOT_FOUND',
      message: `No card with import_id: ${importId}`,
      store_path: queue.store_path,
    };
  }

  const before = card.status;
  const verdict = mutator(card);
  if (!verdict || verdict.ok !== true) {
    return {
      ok: false,
      status: verdict && verdict.status ? verdict.status : 'INVALID_TRANSITION',
      message: verdict && verdict.message ? verdict.message : 'Transition refused.',
      card,
      store_path: queue.store_path,
    };
  }

  if (!Array.isArray(card.history)) card.history = [];
  card.history.push({
    at: nowIso(),
    from: before,
    to: card.status,
    note: verdict.note || `${before} -> ${card.status}`,
  });

  await saveApprovalQueue(storePath, { cards: queue.cards });

  return {
    ok: true,
    status: card.status,
    card,
    store_path: queue.store_path,
  };
}

/**
 * Approve a PENDING card -> APPROVED_BY_DMITRY. The approver MUST be Dmitry.
 * This does NOT import anything; it only unlocks a future commit.
 *
 * @param {string} storePath
 * @param {string} importId
 * @param {{ approved_by?: string, approved_at?: string }} [options]
 * @returns {Promise<object>}
 */
export async function approveCard(storePath, importId, options = {}) {
  const approver = isNonEmptyString(options.approved_by)
    ? options.approved_by
    : APPROVER_DMITRY;

  return mutateCard(storePath, importId, (card) => {
    if (card.status !== CARD_STATUS.PENDING) {
      return {
        ok: false,
        status: 'INVALID_TRANSITION',
        message: `Only PENDING cards can be approved (current: ${card.status}).`,
      };
    }
    if (approver !== APPROVER_DMITRY) {
      return {
        ok: false,
        status: 'APPROVER_NOT_ALLOWED',
        message: `Only ${APPROVER_DMITRY} can approve (got: ${approver}).`,
      };
    }
    card.status = CARD_STATUS.APPROVED_BY_DMITRY;
    card.approved_by = approver;
    card.approved_at = isNonEmptyString(options.approved_at)
      ? options.approved_at
      : nowIso();
    return { ok: true, note: 'approved by Dmitry' };
  });
}

/**
 * Cancel a PENDING or APPROVED_BY_DMITRY card -> CANCELLED. Never touches lead
 * data. COMMITTED / FAILED cards cannot be cancelled.
 *
 * @param {string} storePath
 * @param {string} importId
 * @param {{ reason?: string }} [options]
 * @returns {Promise<object>}
 */
export async function cancelCard(storePath, importId, options = {}) {
  return mutateCard(storePath, importId, (card) => {
    if (
      card.status !== CARD_STATUS.PENDING &&
      card.status !== CARD_STATUS.APPROVED_BY_DMITRY
    ) {
      return {
        ok: false,
        status: 'INVALID_TRANSITION',
        message: `Only PENDING/APPROVED cards can be cancelled (current: ${card.status}).`,
      };
    }
    card.status = CARD_STATUS.CANCELLED;
    card.cancelled_at = nowIso();
    if (isNonEmptyString(options.reason)) {
      card.commit_result = { cancelled_reason: options.reason };
    }
    return { ok: true, note: 'cancelled (no lead data touched)' };
  });
}

/**
 * Mark an APPROVED_BY_DMITRY card -> COMMITTED. This module does NOT perform
 * the import; the caller (a future D2d/commit step) records the result here
 * AFTER its own controlled write. A snapshot_id is required to record COMMITTED.
 *
 * @param {string} storePath
 * @param {string} importId
 * @param {{ snapshot_id?: string, commit_result?: object }} [options]
 * @returns {Promise<object>}
 */
export async function markCommitted(storePath, importId, options = {}) {
  return mutateCard(storePath, importId, (card) => {
    if (card.status !== CARD_STATUS.APPROVED_BY_DMITRY) {
      return {
        ok: false,
        status: 'INVALID_TRANSITION',
        message: `Only APPROVED_BY_DMITRY cards can be committed (current: ${card.status}).`,
      };
    }
    if (!isNonEmptyString(options.snapshot_id)) {
      return {
        ok: false,
        status: 'SNAPSHOT_REQUIRED',
        message: 'A snapshot_id is required to mark a card COMMITTED.',
      };
    }
    card.status = CARD_STATUS.COMMITTED;
    card.snapshot_id = options.snapshot_id;
    card.commit_result = isPlainObject(options.commit_result)
      ? options.commit_result
      : { status: 'COMMITTED' };
    return { ok: true, note: 'committed (result recorded by caller)' };
  });
}

/**
 * Mark a card -> FAILED (commit attempt failed / rolled back). Allowed from
 * APPROVED_BY_DMITRY or COMMITTED (rollback). Records a reason.
 *
 * @param {string} storePath
 * @param {string} importId
 * @param {{ reason?: string, commit_result?: object }} [options]
 * @returns {Promise<object>}
 */
export async function markFailed(storePath, importId, options = {}) {
  return mutateCard(storePath, importId, (card) => {
    if (
      card.status !== CARD_STATUS.APPROVED_BY_DMITRY &&
      card.status !== CARD_STATUS.COMMITTED
    ) {
      return {
        ok: false,
        status: 'INVALID_TRANSITION',
        message: `Only APPROVED/COMMITTED cards can be marked FAILED (current: ${card.status}).`,
      };
    }
    card.status = CARD_STATUS.FAILED;
    card.failed_at = nowIso();
    card.commit_result = isPlainObject(options.commit_result)
      ? options.commit_result
      : { status: 'FAILED', reason: options.reason || 'unspecified' };
    return { ok: true, note: 'failed / rolled back' };
  });
}

// ---------------------------------------------------------------------------
// Commit gate (pure)
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a card is eligible for a real commit, enforcing the D2a
 * hard safety gates. PURE — performs no IO and triggers no import.
 *
 *   - card must exist;
 *   - status MUST be APPROVED_BY_DMITRY;
 *   - approved_by MUST be Dmitry;
 *   - qa_status MUST NOT be FAIL;
 *   - auto_send MUST be BLOCKED;
 *   - there MUST be something to write (added + merged > 0).
 *
 * @param {object} card
 * @returns {{ ok: boolean, reasons: string[], card_status: string|null }}
 */
export function canCommit(card) {
  const reasons = [];

  if (!isPlainObject(card)) {
    return { ok: false, reasons: ['card missing'], card_status: null };
  }

  if (card.status !== CARD_STATUS.APPROVED_BY_DMITRY) {
    reasons.push(`status must be APPROVED_BY_DMITRY (got ${card.status})`);
  }
  if (card.approved_by !== APPROVER_DMITRY) {
    reasons.push(`approved_by must be ${APPROVER_DMITRY} (got ${card.approved_by})`);
  }
  if (card.qa_status === QA_STATUS.FAIL) {
    reasons.push('qa_status is FAIL');
  }
  const autoSend = card.safety && card.safety.auto_send;
  if (autoSend !== 'BLOCKED') {
    reasons.push(`auto_send must be BLOCKED (got ${autoSend})`);
  }
  const writeCount = toSafeInt(card.added_count) + toSafeInt(card.merged_count);
  if (writeCount <= 0) {
    reasons.push('nothing to write (added_count + merged_count == 0)');
  }

  return {
    ok: reasons.length === 0,
    reasons,
    card_status: card.status || null,
  };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

/**
 * Build a compact, human-readable summary of a loaded queue (or card array).
 * @param {{ cards: object[] }|object[]} queue
 * @returns {object}
 */
export function buildApprovalQueueSummary(queue) {
  const cards = Array.isArray(queue) ? queue : (queue && queue.cards) || [];
  const counts = {
    total: cards.length,
    pending: 0,
    approved: 0,
    committed: 0,
    cancelled: 0,
    failed: 0,
  };
  for (const c of cards) {
    switch (c && c.status) {
      case CARD_STATUS.PENDING: counts.pending += 1; break;
      case CARD_STATUS.APPROVED_BY_DMITRY: counts.approved += 1; break;
      case CARD_STATUS.COMMITTED: counts.committed += 1; break;
      case CARD_STATUS.CANCELLED: counts.cancelled += 1; break;
      case CARD_STATUS.FAILED: counts.failed += 1; break;
      default: break;
    }
  }

  return {
    version: APPROVAL_QUEUE_VERSION,
    counts,
    real_data_changed: false,
    writes_lead_data: 'NO',
    runs_import: 'NO',
    bot_integration: 'NOT_CONNECTED',
    headline:
      `Approval queue: ${counts.total} card(s) — ` +
      `${counts.pending} pending, ${counts.approved} approved, ` +
      `${counts.committed} committed, ${counts.cancelled} cancelled, ${counts.failed} failed.`,
    safety: { ...SAFETY },
  };
}

// ---------------------------------------------------------------------------
// Exposed enums (read-only)
// ---------------------------------------------------------------------------

export const CardStatus = CARD_STATUS;
export const QaStatus = QA_STATUS;

// ---------------------------------------------------------------------------
// Default export (named bundle)
// ---------------------------------------------------------------------------

export default {
  getApprovalQueueVersion,
  getDefaultApprovalQueuePath,
  hashText,
  generateImportId,
  buildApprovalCard,
  loadApprovalQueue,
  saveApprovalQueue,
  addApprovalCard,
  findCard,
  listCards,
  listPendingCards,
  approveCard,
  cancelCard,
  markCommitted,
  markFailed,
  canCommit,
  buildApprovalQueueSummary,
  CardStatus,
  QaStatus,
};
