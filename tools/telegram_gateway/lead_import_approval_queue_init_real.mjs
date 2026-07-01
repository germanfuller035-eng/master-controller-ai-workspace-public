/**
 * lead_import_approval_queue_init_real.mjs
 *
 * Daily Lead Factory — D2I — Standalone REAL approval-queue INIT helper.
 *
 * Purpose:
 *   D2I performs the FIRST controlled creation of an EMPTY real approval-queue
 *   file at a real (non-tmp) production path. It materializes the D2B default
 *   empty-queue shape on disk:
 *
 *       { version: <D2B version>, updated_at: <ISO>, cards: [] }
 *
 *   That is ALL it does. It creates an empty container — zero cards, zero
 *   status transitions, zero imports.
 *
 *   CRITICAL: empty queue init != queue write != real import.
 *     - init writes ONLY `cards: []`;
 *     - it NEVER adds an approval card;
 *     - it NEVER performs a status transition;
 *     - it NEVER imports a lead or writes lead data;
 *     - it NEVER contacts a client.
 *
 *   The schema/version is NOT duplicated here — it is reused from the D2B store
 *   (getApprovalQueueVersion). The "real vs sandbox" decision is reused from the
 *   D2F write module (isSandboxQueuePath). D2I exists precisely to write a real
 *   (non-tmp) path, so a sandbox/tmp target is refused.
 *
 * Gate order (initRealApprovalQueue):
 *   1. queuePath required (no default ever)        -> FAIL_QUEUE_PATH_REQUIRED
 *   2. real path (NOT sandbox/tmp)                  -> FAIL_NOT_REAL_PATH
 *   3. refuse-if-exists (never overwrite)           -> FAIL_QUEUE_ALREADY_EXISTS
 *   4. without confirmRealQueueInit:true -> DRY_RUN (no write, file untouched)
 *   5. with confirmRealQueueInit:true    -> atomic write (temp -> rename)
 *
 * HARD SAFETY CONTRACT — what this module DOES NOT do (even with all gates=true):
 *   - No approval card is ever written (cards stays []).
 *   - No status transition. No real import. No COMMITTED transition.
 *   - No lead-data writes (leads_master / lead_contacts / 13_sales lead rows).
 *   - No existing queue file is ever overwritten (refuse-if-exists).
 *   - No client contact. No auto_send / external send.
 *   - No live bot patch. No Telegram send. No network / HTTP / fetch. No SMTP.
 *   - No .env / AI_SECRETS / token reads.
 *
 * Exports:
 *   - getInitRealQueueVersion
 *   - planInitRealApprovalQueue
 *   - initRealApprovalQueue
 *   - handleLeadImportApprovalQueueInitRealCommand
 */

'use strict';

import path from 'node:path';
import fs from 'node:fs/promises';

import { isSandboxQueuePath } from './lead_import_approval_queue_write.mjs';
import { getApprovalQueueVersion } from './lead_intake_approval_queue.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INIT_REAL_QUEUE_VERSION = 'lead-import-approval-queue-init-real-d2i-v1';

const SUPPORTED_ACTIONS = Object.freeze(['init', 'help']);

// Frozen safety contract surfaced by every D2I response.
const SAFETY = Object.freeze({
  empty_init_only: 'YES',
  writes_card: 'NO',
  status_transition: 'NO',
  real_import: 'BLOCKED',
  committed_transition: 'BLOCKED',
  overwrites_existing: 'NO',
  client_contact: 'BLOCKED',
  auto_send: 'BLOCKED',
  external_send: 'NO',
  live_bot_patch: 'NO',
  smtp_used: 'NO',
  network_used: 'NO',
  telegram_send: 'NO',
  writes_lead_data: 'NO',
  env_secrets: 'NO',
  queue_init: 'REAL_GATED',
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

function nowIso() {
  return new Date().toISOString();
}

function fail(status, message, extra = {}) {
  return {
    ok: false,
    status,
    real_data_changed: false,
    queue_init: false,
    queue_written: false,
    dry_run: false,
    queue_path: null,
    version: INIT_REAL_QUEUE_VERSION,
    safety: { ...SAFETY },
    ...extra,
  };
}

/**
 * Build the exact empty-queue payload D2I would materialize on disk. The shape
 * mirrors the D2B store default: { version, updated_at, cards: [] }. The version
 * is taken from the D2B store, never hardcoded here.
 *
 * @param {string} updatedAt ISO-8601 timestamp
 * @returns {{ version: string, updated_at: string, cards: object[] }}
 */
function buildEmptyQueuePayload(updatedAt) {
  return {
    version: getApprovalQueueVersion(),
    updated_at: updatedAt,
    cards: [],
  };
}

/**
 * Does a path exist? PURE-ish (single fs.access). Returns boolean only.
 * @param {string} absPath
 * @returns {Promise<boolean>}
 */
async function pathExists(absPath) {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

/**
 * @returns {string} the D2I init-real helper version identifier.
 */
export function getInitRealQueueVersion() {
  return INIT_REAL_QUEUE_VERSION;
}

// ---------------------------------------------------------------------------
// Plan (pure-ish dry-run) — never writes
// ---------------------------------------------------------------------------

/**
 * Report the planned target path + planned empty-queue content WITHOUT writing
 * anything. Runs the same refuse gates as the real init (path required, real
 * path, refuse-if-exists) so the dry-run is honest about whether a write would
 * be allowed. Never creates a file, never touches lead data.
 *
 * @param {{ queuePath?: string }} [options]
 * @returns {Promise<object>}
 */
export async function planInitRealApprovalQueue(options = {}) {
  const opts = isPlainObject(options) ? options : {};

  // 1) queuePath required.
  if (!isNonEmptyString(opts.queuePath)) {
    return fail(
      'FAIL_QUEUE_PATH_REQUIRED',
      'options.queuePath is required. D2I never assumes a default queue path.'
    );
  }

  const abs = path.resolve(opts.queuePath);

  // 2) real path only.
  if (isSandboxQueuePath(abs)) {
    return fail(
      'FAIL_NOT_REAL_PATH',
      'options.queuePath is a sandbox/tmp path. D2I init only targets a real ' +
        '(non-tmp) production path.',
      { queue_path: abs, is_sandbox: true }
    );
  }

  // 3) refuse-if-exists.
  if (await pathExists(abs)) {
    return fail(
      'FAIL_QUEUE_ALREADY_EXISTS',
      'A queue file already exists at this path. D2I never overwrites an ' +
        'existing queue.',
      { queue_path: abs, is_sandbox: false }
    );
  }

  const planned = buildEmptyQueuePayload(nowIso());
  return {
    ok: true,
    status: 'DRY_RUN',
    dry_run: true,
    queue_path: abs,
    is_sandbox: false,
    real_gate: 'NOT_CONFIRMED',
    planned_content: planned,
    real_data_changed: false,
    queue_init: false,
    queue_written: false,
    headline:
      `DRY-RUN: would initialize EMPTY real queue at ${abs} with ` +
      `${planned.version} and cards: []. confirmRealQueueInit not set; ` +
      'no file created.',
    version: INIT_REAL_QUEUE_VERSION,
    safety: { ...SAFETY },
  };
}

// ---------------------------------------------------------------------------
// Atomic write of the empty queue (temp -> rename)
// ---------------------------------------------------------------------------

/**
 * Atomically write the empty-queue JSON: write to a sibling temp file, then
 * rename over the (non-existent) target so there is never a partially written
 * file. Creates the parent directory if needed. Writes ONLY this file.
 *
 * @param {string} absQueuePath absolute target path (must NOT already exist)
 * @param {object} payload      the empty-queue object to serialize
 * @returns {Promise<void>}
 */
async function atomicWriteEmptyQueue(absQueuePath, payload) {
  const dir = path.dirname(absQueuePath);
  await fs.mkdir(dir, { recursive: true });
  const ts = nowIso().replace(/[:.]/g, '-');
  const tmpFile = path.join(dir, `.${path.basename(absQueuePath)}.${ts}.init.tmp`);
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  await fs.writeFile(tmpFile, json, 'utf8');
  await fs.rename(tmpFile, absQueuePath);
}

// ---------------------------------------------------------------------------
// Main entry point — controlled empty real-queue init (gated)
// ---------------------------------------------------------------------------

/**
 * Initialize an EMPTY real (non-tmp) approval queue file under D2I's gates. By
 * default (no confirmRealQueueInit) this is a DRY-RUN and no file is created.
 *
 * @param {{
 *   queuePath?: string,
 *   confirmRealQueueInit?: boolean
 * }} [options]
 * @returns {Promise<object>}
 */
export async function initRealApprovalQueue(options = {}) {
  const opts = isPlainObject(options) ? options : {};

  // 1) queuePath required — never assume a default.
  if (!isNonEmptyString(opts.queuePath)) {
    return fail(
      'FAIL_QUEUE_PATH_REQUIRED',
      'options.queuePath is required. D2I never assumes a default queue path.'
    );
  }

  const abs = path.resolve(opts.queuePath);

  // 2) real path only — D2I refuses sandbox/tmp targets.
  if (isSandboxQueuePath(abs)) {
    return fail(
      'FAIL_NOT_REAL_PATH',
      'options.queuePath is a sandbox/tmp path. D2I init only targets a real ' +
        '(non-tmp) production path.',
      { queue_path: abs, is_sandbox: true }
    );
  }

  // 3) refuse-if-exists — never overwrite an existing queue.
  if (await pathExists(abs)) {
    return fail(
      'FAIL_QUEUE_ALREADY_EXISTS',
      'A queue file already exists at this path. D2I never overwrites an ' +
        'existing queue.',
      { queue_path: abs, is_sandbox: false }
    );
  }

  const payload = buildEmptyQueuePayload(nowIso());

  // 4) Real-gate: without confirmRealQueueInit this is a DRY-RUN.
  if (opts.confirmRealQueueInit !== true) {
    return {
      ok: true,
      status: 'DRY_RUN',
      dry_run: true,
      queue_path: abs,
      is_sandbox: false,
      real_gate: 'NOT_CONFIRMED',
      planned_content: payload,
      real_data_changed: false,
      queue_init: false,
      queue_written: false,
      headline:
        `DRY-RUN: would initialize EMPTY real queue at ${abs} with ` +
        `${payload.version} and cards: []. confirmRealQueueInit not set; ` +
        'no file created.',
      version: INIT_REAL_QUEUE_VERSION,
      safety: { ...SAFETY },
    };
  }

  // 5) Confirmed init: atomically write the empty queue container.
  await atomicWriteEmptyQueue(abs, payload);

  return {
    ok: true,
    status: 'OK_INITIALIZED',
    dry_run: false,
    queue_path: abs,
    is_sandbox: false,
    real_gate: 'CONFIRMED',
    content: payload,
    real_data_changed: false, // an EMPTY container is not lead data
    queue_init: true,
    queue_written: true,
    cards_count: 0,
    headline:
      `OK: initialized EMPTY real queue at ${abs} with ${payload.version} ` +
      'and cards: []. No cards, no import, no client contact.',
    version: INIT_REAL_QUEUE_VERSION,
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
    version: INIT_REAL_QUEUE_VERSION,
    supported_actions: SUPPORTED_ACTIONS.slice(),
    usage: {
      init:
        'Initialize an EMPTY real queue file. Requires queuePath (real, ' +
        'non-tmp) + confirmRealQueueInit:true. Without confirm -> dry-run. ' +
        'Refuses if the file already exists. Writes ONLY { version, ' +
        'updated_at, cards: [] }.',
    },
    real_data_changed: false,
    queue_init: false,
    queue_written: false,
    dry_run: false,
    queue_path: null,
    safety: { ...SAFETY },
  };
}

// ---------------------------------------------------------------------------
// Command handler (standalone)
// ---------------------------------------------------------------------------

/**
 * Standalone command handler routing an `init` action to the gated empty-queue
 * init. Anything else -> help.
 *
 * @param {string} action
 * @param {{ queuePath?: string, confirmRealQueueInit?: boolean }} [options]
 * @returns {Promise<object>}
 */
export async function handleLeadImportApprovalQueueInitRealCommand(action, options = {}) {
  const opts = isPlainObject(options) ? options : {};
  const act = isNonEmptyString(action) ? action.trim().toLowerCase() : '';

  if (act === 'init') {
    const result = await initRealApprovalQueue({
      queuePath: opts.queuePath,
      confirmRealQueueInit: opts.confirmRealQueueInit,
    });
    return { action: act, ...result };
  }

  return { action: act || null, ...buildHelp() };
}

// ---------------------------------------------------------------------------
// Default export (named bundle)
// ---------------------------------------------------------------------------

export default {
  getInitRealQueueVersion,
  planInitRealApprovalQueue,
  initRealApprovalQueue,
  handleLeadImportApprovalQueueInitRealCommand,
};
