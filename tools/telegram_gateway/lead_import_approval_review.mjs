/**
 * lead_import_approval_review.mjs
 *
 * Daily Lead Factory — D2D — Standalone Lead Import Approval Review module
 *
 * Purpose:
 *   A STANDALONE, read-only REVIEW layer over the controlled real-import
 *   approval queue (the JSON store produced by lead_intake_approval_queue.mjs).
 *   It can:
 *     - load an approval queue (read-only),
 *     - validate approval cards,
 *     - list PENDING import cards as review cards,
 *     - build a human-readable review summary,
 *     - build a SAFE decision object (APPROVE / REJECT).
 *
 *   It DOES NOT execute a real import. Building an APPROVE decision NEVER
 *   triggers a write to lead data, NEVER mutates the queue file, and NEVER
 *   unlocks a real commit. `can_execute_real_import` is ALWAYS false.
 *
 * HARD SAFETY CONTRACT — what this module DOES NOT do:
 *   - No real import. Real import is ALWAYS BLOCKED.
 *   - No client contact. client_contact is ALWAYS BLOCKED.
 *   - No auto_send. auto_send is ALWAYS BLOCKED.
 *   - No network / HTTP / fetch.
 *   - No Telegram API. No bot integration / patch.
 *   - No SMTP / email / WhatsApp / MAX send.
 *   - No .env / AI_SECRETS / token reads.
 *   - NEVER writes lead data (13_sales).
 *   - NEVER writes / creates the approval queue file.
 *   - confirm=true is NOT honoured — there is no confirm path at all.
 *
 * Queue rules:
 *   - The queue path must be passed explicitly via options.queuePath.
 *   - If options.queuePath is missing -> FAIL_QUEUE_PATH_REQUIRED.
 *   - If the file is absent -> empty pending list (the file is NOT created).
 *   - A sandbox queue under tmp/ may be read.
 *   - A real queue may be read ONLY read-only and ONLY if a path is given.
 *   - This module NEVER writes the queue.
 *
 * Exports:
 *   - getLeadImportApprovalReviewVersion
 *   - loadLeadImportApprovalQueue
 *   - validateLeadImportApprovalCard
 *   - listPendingLeadImportApprovals
 *   - buildLeadImportApprovalReviewSummary
 *   - buildLeadImportApprovalDecision
 *   - handleLeadImportApprovalReviewCommand
 */

'use strict';

import path from 'node:path';
import fs from 'node:fs/promises';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REVIEW_VERSION = 'lead-import-approval-review-d2d-v1';

// The single, frozen safety contract surfaced by every review response.
// Real import, client contact and auto_send are HARD-BLOCKED, always.
const SAFETY = Object.freeze({
  real_import: 'BLOCKED',
  client_contact: 'BLOCKED',
  auto_send: 'BLOCKED',
  external_send: 'NO',
  smtp_used: 'NO',
  network_used: 'NO',
  telegram_api_called: 'NO',
  writes_data: 'NO',
  queue_write: 'NO',
  bot_integration: 'NO',
  env_secrets: 'NO',
  confirm_allowed: 'NO',
});

// Required fields on a valid approval card.
const REQUIRED_CARD_FIELDS = Object.freeze([
  'import_id',
  'created_at',
  'source',
  'text_hash',
  'parsed_count',
  'valid_count',
  'added_count',
  'needs_review_count',
  'qa_status',
  'safety',
  'status',
]);

const PENDING_STATUS = 'PENDING';

const SUPPORTED_ACTIONS = Object.freeze(['review', 'list', 'approve', 'reject']);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function isInteger(v) {
  return typeof v === 'number' && Number.isFinite(v) && Math.floor(v) === v;
}

/**
 * Read + parse a JSON file safely. Never throws; returns a structured result.
 * Missing file is reported as exists:false (the file is NOT created).
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

/**
 * Normalize an arbitrary parsed payload into a card array.
 * Accepts either a bare array or a { cards: [...] } shape.
 * @param {any} parsed
 * @returns {object[]}
 */
function extractCards(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (isPlainObject(parsed) && Array.isArray(parsed.cards)) return parsed.cards;
  return [];
}

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

/**
 * @returns {string} the review module version identifier.
 */
export function getLeadImportApprovalReviewVersion() {
  return REVIEW_VERSION;
}

// ---------------------------------------------------------------------------
// Queue loading (read-only)
// ---------------------------------------------------------------------------

/**
 * Load the approval queue from an explicitly-provided path, READ-ONLY.
 *
 *   - options.queuePath is REQUIRED. Missing -> { ok:false, status:
 *     'FAIL_QUEUE_PATH_REQUIRED' }.
 *   - Missing file -> { ok:true, exists:false, cards:[] }. The file is NOT
 *     created.
 *   - This function NEVER writes the queue.
 *
 * @param {{ queuePath?: string }} [options]
 * @returns {Promise<{
 *   ok: boolean,
 *   status: string,
 *   exists: boolean,
 *   cards: object[],
 *   queue_path: string|null,
 *   error: string|null,
 *   message?: string,
 *   safety: object
 * }>}
 */
export async function loadLeadImportApprovalQueue(options = {}) {
  const opts = isPlainObject(options) ? options : {};

  if (!isNonEmptyString(opts.queuePath)) {
    return {
      ok: false,
      status: 'FAIL_QUEUE_PATH_REQUIRED',
      exists: false,
      cards: [],
      queue_path: null,
      error: null,
      message:
        'options.queuePath is required. This module never assumes a default ' +
        'queue path and never writes the queue.',
      safety: { ...SAFETY },
    };
  }

  const abs = path.resolve(opts.queuePath);
  const res = await readJsonSafe(abs);

  if (res.error) {
    return {
      ok: false,
      status: 'FAIL_QUEUE_UNREADABLE',
      exists: res.exists === true,
      cards: [],
      queue_path: abs,
      error: res.error,
      message: `Approval queue is unreadable: ${res.error}`,
      safety: { ...SAFETY },
    };
  }

  if (res.exists !== true) {
    // Missing file -> empty pending list, file NOT created.
    return {
      ok: true,
      status: 'EMPTY_NO_FILE',
      exists: false,
      cards: [],
      queue_path: abs,
      error: null,
      safety: { ...SAFETY },
    };
  }

  return {
    ok: true,
    status: 'LOADED',
    exists: true,
    cards: extractCards(res.parsed),
    queue_path: abs,
    error: null,
    safety: { ...SAFETY },
  };
}

// ---------------------------------------------------------------------------
// Card validation (pure)
// ---------------------------------------------------------------------------

/**
 * Validate an approval card: all required fields must be present and of a
 * sane type. PURE — no IO.
 *
 * @param {object} card
 * @returns {{ valid: boolean, missing: string[], invalid: string[], import_id: string|null }}
 */
export function validateLeadImportApprovalCard(card) {
  const missing = [];
  const invalid = [];

  if (!isPlainObject(card)) {
    return {
      valid: false,
      missing: REQUIRED_CARD_FIELDS.slice(),
      invalid: [],
      import_id: null,
    };
  }

  for (const field of REQUIRED_CARD_FIELDS) {
    if (!(field in card) || card[field] === null || card[field] === undefined) {
      missing.push(field);
    }
  }

  // Type checks for present fields.
  if ('import_id' in card && !isNonEmptyString(card.import_id)) invalid.push('import_id');
  if ('created_at' in card && !isNonEmptyString(card.created_at)) invalid.push('created_at');
  if ('source' in card && !isNonEmptyString(card.source)) invalid.push('source');
  if ('text_hash' in card && !isNonEmptyString(card.text_hash)) invalid.push('text_hash');
  if ('qa_status' in card && !isNonEmptyString(card.qa_status)) invalid.push('qa_status');
  if ('status' in card && !isNonEmptyString(card.status)) invalid.push('status');
  if ('safety' in card && !isPlainObject(card.safety)) invalid.push('safety');

  for (const numField of [
    'parsed_count',
    'valid_count',
    'added_count',
    'needs_review_count',
  ]) {
    if (numField in card && card[numField] !== null && !isInteger(card[numField])) {
      invalid.push(numField);
    }
  }

  return {
    valid: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
    import_id: isNonEmptyString(card.import_id) ? card.import_id : null,
  };
}

// ---------------------------------------------------------------------------
// Pending listing (pure projection)
// ---------------------------------------------------------------------------

/**
 * Project a card into a compact, review-friendly shape.
 * @param {object} card
 * @returns {object}
 */
function toReviewCard(card) {
  return {
    import_id: isNonEmptyString(card.import_id) ? card.import_id : null,
    created_at: isNonEmptyString(card.created_at) ? card.created_at : null,
    source: isNonEmptyString(card.source) ? card.source : null,
    parsed_count: isInteger(card.parsed_count) ? card.parsed_count : null,
    valid_count: isInteger(card.valid_count) ? card.valid_count : null,
    added_count: isInteger(card.added_count) ? card.added_count : null,
    needs_review_count: isInteger(card.needs_review_count) ? card.needs_review_count : null,
    qa_status: isNonEmptyString(card.qa_status) ? card.qa_status : null,
    safety: isPlainObject(card.safety) ? card.safety : null,
    status: isNonEmptyString(card.status) ? card.status : null,
  };
}

/**
 * From a loaded card array, return only PENDING cards as review cards.
 * A card is PENDING only if status === "PENDING". Invalid cards are skipped
 * but reported in `skipped`.
 *
 * @param {object[]} cards
 * @returns {{ pending: object[], skipped: object[] }}
 */
export function listPendingLeadImportApprovals(cards) {
  const list = Array.isArray(cards) ? cards : [];
  const pending = [];
  const skipped = [];

  for (const card of list) {
    const check = validateLeadImportApprovalCard(card);
    if (!check.valid) {
      skipped.push({
        import_id: check.import_id,
        reason: 'INVALID_CARD',
        missing: check.missing,
        invalid: check.invalid,
      });
      continue;
    }
    if (card.status !== PENDING_STATUS) continue;
    pending.push(toReviewCard(card));
  }

  return { pending, skipped };
}

// ---------------------------------------------------------------------------
// Review summary
// ---------------------------------------------------------------------------

/**
 * Build a human-readable review summary from a loaded queue result.
 *
 * @param {{ ok?: boolean, exists?: boolean, cards?: object[], queue_path?: string|null, status?: string, error?: string|null }} loadResult
 * @returns {object}
 */
export function buildLeadImportApprovalReviewSummary(loadResult) {
  const lr = isPlainObject(loadResult) ? loadResult : {};
  const cards = Array.isArray(lr.cards) ? lr.cards : [];
  const { pending, skipped } = listPendingLeadImportApprovals(cards);

  const headline = lr.ok === false
    ? `Approval review BLOCKED: ${lr.status || 'ERROR'}.`
    : `Approval review: ${pending.length} pending import card(s)` +
      (skipped.length ? `, ${skipped.length} skipped (invalid).` : '.');

  return {
    version: REVIEW_VERSION,
    ok: lr.ok !== false,
    status: lr.status || null,
    queue_path: lr.queue_path || null,
    queue_exists: lr.exists === true,
    total_cards: cards.length,
    pending_count: pending.length,
    skipped_count: skipped.length,
    pending,
    skipped,
    headline,
    real_data_changed: false,
    can_execute_real_import: false,
    queue_write: false,
    bot_touched: false,
    safety: { ...SAFETY },
  };
}

// ---------------------------------------------------------------------------
// Decision builder (pure, SAFE)
// ---------------------------------------------------------------------------

/**
 * Build a SAFE decision object for an approval card. This NEVER executes a
 * real import, NEVER mutates the queue, and NEVER writes lead data.
 * `can_execute_real_import` is ALWAYS false.
 *
 * @param {'APPROVE'|'REJECT'} decision
 * @param {string} importId
 * @param {{ reason?: string }} [options]
 * @returns {object}
 */
export function buildLeadImportApprovalDecision(decision, importId, options = {}) {
  const opts = isPlainObject(options) ? options : {};
  const normalized = isNonEmptyString(decision) ? decision.trim().toUpperCase() : '';

  if (normalized !== 'APPROVE' && normalized !== 'REJECT') {
    return {
      ok: false,
      status: 'FAIL_UNKNOWN_DECISION',
      decision: null,
      import_id: isNonEmptyString(importId) ? importId : null,
      can_execute_real_import: false,
      reason: `Unknown decision: ${decision}. Expected APPROVE or REJECT.`,
      safety: { ...SAFETY },
    };
  }

  if (!isNonEmptyString(importId)) {
    return {
      ok: false,
      status: 'FAIL_IMPORT_ID_REQUIRED',
      decision: normalized,
      import_id: null,
      can_execute_real_import: false,
      reason: 'import_id is required to build a decision.',
      safety: { ...SAFETY },
    };
  }

  const reason = isNonEmptyString(opts.reason)
    ? opts.reason
    : normalized === 'APPROVE'
      ? 'Reviewed and approved (no real import executed).'
      : 'Reviewed and rejected.';

  return {
    ok: true,
    status: 'DECISION_BUILT',
    decision: normalized,
    import_id: importId,
    can_execute_real_import: false,
    reason,
    real_data_changed: false,
    queue_write: false,
    bot_touched: false,
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
    version: REVIEW_VERSION,
    supported_actions: SUPPORTED_ACTIONS.slice(),
    usage: {
      'review|list': 'Show PENDING import cards. Requires options.queuePath.',
      approve:
        'Build APPROVE decision object only. Requires options.importId. ' +
        'Does NOT run import, does NOT change queue, does NOT write 13_sales.',
      reject:
        'Build REJECT decision object only. Requires options.importId. ' +
        'Does NOT change queue.',
    },
    can_execute_real_import: false,
    queue_write: false,
    bot_touched: false,
    safety: { ...SAFETY },
  };
}

// ---------------------------------------------------------------------------
// Command handler (standalone)
// ---------------------------------------------------------------------------

/**
 * Standalone command handler. Routes a review action to the right builder.
 *
 *   action "review" | "list":
 *     -> load queue (read-only) + build review summary.
 *   action "approve":
 *     -> build APPROVE decision object only (no import, no queue write).
 *   action "reject":
 *     -> build REJECT decision object only (no queue write).
 *   anything else:
 *     -> help.
 *
 * @param {string} action
 * @param {{ queuePath?: string, importId?: string, reason?: string }} [options]
 * @returns {Promise<object>}
 */
export async function handleLeadImportApprovalReviewCommand(action, options = {}) {
  const opts = isPlainObject(options) ? options : {};
  const act = isNonEmptyString(action) ? action.trim().toLowerCase() : '';

  if (act === 'review' || act === 'list') {
    const loaded = await loadLeadImportApprovalQueue({ queuePath: opts.queuePath });
    if (!loaded.ok) {
      return {
        ok: false,
        action: act,
        status: loaded.status,
        message: loaded.message || null,
        error: loaded.error || null,
        queue_path: loaded.queue_path,
        can_execute_real_import: false,
        queue_write: false,
        bot_touched: false,
        safety: { ...SAFETY },
      };
    }
    const summary = buildLeadImportApprovalReviewSummary(loaded);
    return { ok: true, action: act, ...summary };
  }

  if (act === 'approve') {
    const decision = buildLeadImportApprovalDecision('APPROVE', opts.importId, {
      reason: opts.reason,
    });
    return { action: act, ...decision };
  }

  if (act === 'reject') {
    const decision = buildLeadImportApprovalDecision('REJECT', opts.importId, {
      reason: opts.reason,
    });
    return { action: act, ...decision };
  }

  // unknown -> help
  return { action: act || null, ...buildHelp() };
}

// ---------------------------------------------------------------------------
// Default export (named bundle)
// ---------------------------------------------------------------------------

export default {
  getLeadImportApprovalReviewVersion,
  loadLeadImportApprovalQueue,
  validateLeadImportApprovalCard,
  listPendingLeadImportApprovals,
  buildLeadImportApprovalReviewSummary,
  buildLeadImportApprovalDecision,
  handleLeadImportApprovalReviewCommand,
};
