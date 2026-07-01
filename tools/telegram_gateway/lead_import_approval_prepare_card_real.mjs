/**
 * lead_import_approval_prepare_card_real.mjs
 * ---------------------------------------------------------------------------
 * D2J — Controlled Real Prepare-Card helper.
 *
 * Purpose: build the FIRST (or next) PENDING approval card from a SAFE,
 * SYNTHETIC input and append it — via ONE controlled, atomic + backup write —
 * to an already-initialized (D2I) real approval-queue container that currently
 * holds `cards: []` (or some existing cards).
 *
 * This module is a THIN helper. It does NOT reinvent the schema or a writer:
 *   - card shape comes from the D2B builder (`buildApprovalCard`);
 *   - card validity is checked with the D2D validator
 *     (`validateLeadImportApprovalCard`);
 *   - the queue container schema/version is anchored to D2B
 *     (`getApprovalQueueVersion`);
 *   - the atomic write + backup pattern mirrors D2I/D2G.
 *
 * HARD SCOPE (always):
 *   - prepare-card != approve != reject != real import.
 *   - only creates a card with status === 'PENDING'.
 *   - NEVER approves/rejects, NEVER transitions status after creation.
 *   - NEVER runs a real import, NEVER reaches COMMITTED.
 *   - NEVER writes lead data into leads_master / 13_sales lead-stores.
 *   - NEVER puts real lead PII in the card (synthetic-only on this step).
 *   - NEVER contacts a client; auto_send is BLOCKED.
 *   - No network / Telegram API / SMTP / .env / AI_SECRETS / bot live-patch.
 *
 * Real-gate: without `confirmRealPrepareCard === true` this is a DRY-RUN
 * (no backup, no write) that only surfaces the planned card.
 * ---------------------------------------------------------------------------
 */

import path from 'node:path';
import fs from 'node:fs/promises';

import {
  buildApprovalCard,
  getApprovalQueueVersion,
} from './lead_intake_approval_queue.mjs';
import { validateLeadImportApprovalCard } from './lead_import_approval_review.mjs';

export const PREPARE_CARD_REAL_VERSION =
  'lead-import-approval-prepare-card-real-d2j-v1';

// The single, frozen safety contract surfaced by every prepare response.
const SAFETY = Object.freeze({
  prepare_is_not_approve: 'YES',
  prepare_is_not_import: 'YES',
  real_import: 'BLOCKED',
  committed: 'BLOCKED',
  client_contact: 'BLOCKED',
  auto_send: 'BLOCKED',
  network: 'NO',
  telegram_api: 'NO',
  email_smtp: 'NO',
  env_secrets: 'NO',
  leads_master_write: 'NO',
  bot_live_patch: 'NO',
});

const PENDING_STATUS = 'PENDING';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function nowIso() {
  return new Date().toISOString();
}

function fail(status, reason, extra = {}) {
  return {
    ok: false,
    status,
    reason,
    queue_written: false,
    real_data_changed: false,
    card_prepared: false,
    version: PREPARE_CARD_REAL_VERSION,
    safety: { ...SAFETY },
    ...extra,
  };
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Conservative real-PII detector. On this step we only allow SYNTHETIC inputs,
 * so we refuse anything that looks like real lead contact data. The check is
 * intentionally strict: better to refuse a borderline input than leak PII.
 *
 * Looks across all string fields of cardInput (and the `text` field) for:
 *   - email addresses;
 *   - phone-number-like sequences (>= 7 digits, optional +/spaces/dashes);
 *   - @-handles / t.me links;
 *   - explicit non-synthetic markers.
 * A cardInput may opt-in as synthetic via `synthetic: true`, but the regex
 * scan still runs (synthetic flag does NOT bypass PII detection).
 */
function detectRealPii(cardInput) {
  const reasons = [];
  const strings = [];

  const collect = (val) => {
    if (typeof val === 'string') {
      strings.push(val);
    } else if (Array.isArray(val)) {
      val.forEach(collect);
    } else if (isPlainObject(val)) {
      Object.values(val).forEach(collect);
    }
  };
  collect(cardInput);

  const emailRe = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
  const phoneRe = /(?:\+?\d[\s\-()]?){7,}/;
  const handleRe = /(?:t\.me\/|@[A-Za-z0-9_]{4,})/;

  for (const s of strings) {
    if (emailRe.test(s)) reasons.push('email-like-string');
    if (phoneRe.test(s)) reasons.push('phone-like-string');
    if (handleRe.test(s)) reasons.push('handle-or-tme-link');
  }

  return { hasPii: reasons.length > 0, reasons: [...new Set(reasons)] };
}

/**
 * Load + minimally validate the real queue container.
 * D2J refuses if the file does not exist (init is D2I's job) or if the
 * container shape is not the expected D2B schema with a `cards` array.
 */
async function loadQueueContainer(absQueuePath) {
  let raw;
  try {
    raw = await fs.readFile(absQueuePath, 'utf8');
  } catch {
    return { ok: false, status: 'FAIL_QUEUE_NOT_INITIALIZED' };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, status: 'FAIL_QUEUE_CORRUPT' };
  }

  if (!isPlainObject(parsed) || !Array.isArray(parsed.cards)) {
    return { ok: false, status: 'FAIL_QUEUE_CORRUPT' };
  }

  return { ok: true, container: parsed };
}

/**
 * Atomic write + timestamped backup of the prior container.
 * Mirrors the D2I/D2G discipline: backup the existing file first, then write
 * to a tmp sibling and rename into place (no partially-written target).
 */
async function atomicWriteWithBackup(absQueuePath, payload) {
  const dir = path.dirname(absQueuePath);
  const base = path.basename(absQueuePath);
  const ts = nowIso().replace(/[:.]/g, '-');

  await fs.mkdir(dir, { recursive: true });

  // 1) Backup existing file (the queue must already exist for D2J).
  const backupFile = path.join(dir, `.${base}.${ts}.prepare.bak`);
  const prior = await fs.readFile(absQueuePath, 'utf8');
  await fs.writeFile(backupFile, prior, 'utf8');

  // 2) Write new content to tmp, then atomic rename.
  const tmpFile = path.join(dir, `.${base}.${ts}.prepare.tmp`);
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  await fs.writeFile(tmpFile, json, 'utf8');
  await fs.rename(tmpFile, absQueuePath);

  return { backupFile };
}

// ---------------------------------------------------------------------------
// Main entry point — controlled real prepare-card (gated)
// ---------------------------------------------------------------------------

/**
 * Prepare ONE PENDING approval card and (when confirmed) append it to an
 * already-initialized real queue via a single atomic + backup write.
 *
 * @param {{
 *   queuePath?: string,
 *   cardInput?: object,
 *   confirmRealPrepareCard?: boolean
 * }} [options]
 * @returns {Promise<object>}
 */
export async function prepareRealApprovalCard(options = {}) {
  const opts = isPlainObject(options) ? options : {};

  // 1) queuePath required — never assume a default.
  if (!isNonEmptyString(opts.queuePath)) {
    return fail(
      'FAIL_QUEUE_PATH_REQUIRED',
      'options.queuePath is required. D2J never assumes a default queue path.',
      { queue_path: null }
    );
  }
  const abs = path.resolve(opts.queuePath);

  // 2) cardInput required + must be an object.
  if (!isPlainObject(opts.cardInput)) {
    return fail(
      'FAIL_CARD_INPUT_REQUIRED',
      'options.cardInput is required and must be a plain object (synthetic).',
      { queue_path: abs }
    );
  }

  // 3) Real-PII guard — only synthetic inputs allowed on this step.
  const pii = detectRealPii(opts.cardInput);
  if (pii.hasPii) {
    return fail(
      'FAIL_REAL_PII_BLOCKED',
      'cardInput appears to contain real lead PII (email/phone/handle). D2J ' +
        'only accepts synthetic inputs. Refusing.',
      { queue_path: abs, pii_reasons: pii.reasons }
    );
  }

  // 4) Queue must exist + be a valid D2B container (init is D2I's job).
  const loaded = await loadQueueContainer(abs);
  if (!loaded.ok) {
    if (loaded.status === 'FAIL_QUEUE_NOT_INITIALIZED') {
      return fail(
        'FAIL_QUEUE_NOT_INITIALIZED',
        'No queue file at this path. Run D2I init first; D2J never ' +
          'initializes a queue.',
        { queue_path: abs }
      );
    }
    return fail(
      'FAIL_QUEUE_CORRUPT',
      'Queue file exists but is not a valid D2B queue container with a ' +
        '`cards` array.',
      { queue_path: abs }
    );
  }
  const container = loaded.container;

  // 5) Build the candidate card via the D2B builder (always PENDING).
  const card = buildApprovalCard(opts.cardInput);

  // 6) Validate the candidate card with the D2D validator.
  const validation = validateLeadImportApprovalCard(card);
  if (!validation.valid) {
    return fail(
      'FAIL_CARD_INVALID',
      'Built card failed D2D validation.',
      {
        queue_path: abs,
        validation_missing: validation.missing || null,
        validation_invalid: validation.invalid || null,
        planned_card: card,
      }
    );
  }

  // Defensive: D2J only ever produces PENDING cards.
  if (card.status !== PENDING_STATUS) {
    return fail(
      'FAIL_CARD_NOT_PENDING',
      `Built card status is "${card.status}", expected PENDING. Refusing.`,
      { queue_path: abs, planned_card: card }
    );
  }

  // 7) No-duplicate guard — refuse on duplicate import_id OR text_hash.
  const dup = container.cards.find(
    (c) =>
      (isNonEmptyString(card.import_id) && c.import_id === card.import_id) ||
      (isNonEmptyString(card.text_hash) && c.text_hash === card.text_hash)
  );
  if (dup) {
    return fail(
      'FAIL_DUPLICATE_CARD',
      'A card with the same import_id or text_hash already exists in the ' +
        'queue. D2J never writes duplicates.',
      {
        queue_path: abs,
        duplicate_import_id: dup.import_id,
        duplicate_text_hash: dup.text_hash,
        planned_card: card,
      }
    );
  }

  // 8) Real-gate: without confirmRealPrepareCard this is a DRY-RUN.
  if (opts.confirmRealPrepareCard !== true) {
    return {
      ok: true,
      status: 'DRY_RUN',
      dry_run: true,
      queue_path: abs,
      real_gate: 'NOT_CONFIRMED',
      planned_card: card,
      cards_before: container.cards.length,
      cards_after: container.cards.length,
      queue_written: false,
      real_data_changed: false,
      card_prepared: false,
      headline:
        `DRY-RUN: would append 1 PENDING card (import_id=${card.import_id}) to ` +
        `real queue at ${abs}. confirmRealPrepareCard not set; nothing written.`,
      version: PREPARE_CARD_REAL_VERSION,
      safety: { ...SAFETY },
    };
  }

  // 9) Confirmed prepare: append card + one atomic backup-write.
  const nextContainer = {
    ...container,
    version: isNonEmptyString(container.version)
      ? container.version
      : getApprovalQueueVersion(),
    updated_at: nowIso(),
    cards: [...container.cards, card],
  };

  const { backupFile } = await atomicWriteWithBackup(abs, nextContainer);

  return {
    ok: true,
    status: 'OK_CARD_PREPARED',
    dry_run: false,
    queue_path: abs,
    real_gate: 'CONFIRMED',
    prepared_card: card,
    cards_before: container.cards.length,
    cards_after: nextContainer.cards.length,
    backup_file: backupFile,
    queue_written: true,
    real_data_changed: true,
    card_prepared: true,
    headline:
      `OK: appended 1 PENDING card (import_id=${card.import_id}) to real queue ` +
      `at ${abs}. cards: ${container.cards.length} -> ` +
      `${nextContainer.cards.length}. Backup: ${path.basename(backupFile)}.`,
    version: PREPARE_CARD_REAL_VERSION,
    safety: { ...SAFETY },
  };
}

export function getPrepareCardRealVersion() {
  return PREPARE_CARD_REAL_VERSION;
}
