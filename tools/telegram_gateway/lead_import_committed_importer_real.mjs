/**
 * lead_import_committed_importer_real.mjs
 * ---------------------------------------------------------------------------
 * Daily Lead Factory — D2N Phase 1 — Controlled Approved-Card Importer
 *
 * Purpose:
 *   The MISSING half of a real COMMIT (see the D2N plan). The approval-queue
 *   module's commit recorder requires a `snapshot_id` + `commit_result` but
 *   deliberately performs NO import. THIS module is the controlled importer
 *   that:
 *     - reads an already-APPROVED_BY_DMITRY card from the approval queue;
 *     - reads the (out-of-card) real lead record supplied by the caller;
 *     - performs ONE atomic + `.bak` write into a leads store;
 *     - returns a deterministic `snapshot_id` + a structured `commit_result`
 *       that a later, separate recorder step (D2G commitCard) can stamp.
 *
 *   It mirrors the D2I/D2G/D2J discipline:
 *     - DRY-RUN by default (writes NOTHING unless triple-gated);
 *     - triple gate to write: allowRealImport:true + confirmRealImport:true +
 *       an exact expectedImportId match;
 *     - backup-then-atomic-rename (tmp write + fsync-free rename) with `.bak`;
 *     - refuses any import_id other than the explicitly named one;
 *     - never writes the approval queue (that is the recorder's job);
 *     - never contacts a client, never touches the live bot, no network.
 *
 * HARD SAFETY CONTRACT — what this module DOES NOT do:
 *   - No network. No HTTP/fetch. No site scanning.
 *   - No SMTP / email / Telegram / WhatsApp / MAX send. auto_send BLOCKED.
 *   - No Telegram API. No bot integration. No live bot patch/restart.
 *   - No .env / AI_SECRETS / token reads.
 *   - client_contact ALWAYS BLOCKED.
 *   - NEVER writes the approval queue JSON (no card status change here).
 *   - In DRY-RUN (default) writes NOTHING at all.
 *   - Real lead-store write ONLY when triple-gated, and even then writes ONLY
 *     the caller-provided leadsStorePath (plus its `.bak`/`.tmp`), nothing else.
 *
 * Exports:
 *   - getCommittedImporterVersion
 *   - COMMITTED_IMPORTER_VERSION
 *   - computeSnapshotId
 *   - importApprovedCard
 * ---------------------------------------------------------------------------
 */

'use strict';

import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

import {
  loadApprovalQueue,
  findCard,
  CardStatus,
} from './lead_intake_approval_queue.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const COMMITTED_IMPORTER_VERSION = 'lead-import-committed-importer-real-d2n-v2';

const APPROVER_DMITRY = 'Dmitry';

// The frozen safety contract surfaced on every importer response.
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
  queue_write: 'NO',          // importer NEVER writes the approval queue
  real_import: 'GATED',       // requires triple gate; DRY-RUN by default
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

function sha256Hex(s) {
  return crypto.createHash('sha256').update(typeof s === 'string' ? s : '', 'utf8').digest('hex');
}

/**
 * Stable JSON stringify (sorted keys) for deterministic hashing.
 */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

async function readJsonSafe(absPath) {
  try {
    const raw = await fs.readFile(absPath, 'utf8');
    try {
      return { exists: true, parsed: JSON.parse(raw), error: null };
    } catch (parseErr) {
      return { exists: true, parsed: null, error: parseErr.message || String(parseErr) };
    }
  } catch (err) {
    if (err && err.code === 'ENOENT') return { exists: false, parsed: null, error: null };
    return { exists: false, parsed: null, error: err.message || String(err) };
  }
}

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

export function getCommittedImporterVersion() {
  return COMMITTED_IMPORTER_VERSION;
}

// ---------------------------------------------------------------------------
// Deterministic snapshot id
// ---------------------------------------------------------------------------

/**
 * Compute a deterministic snapshot_id for an import. Derived from the import_id,
 * the card text_hash, and a stable hash of the lead record — so the same inputs
 * always yield the same snapshot_id (idempotent, auditable).
 *
 * @param {{ importId: string, textHash?: string, leadRecord?: object }} input
 * @returns {string} e.g. SNAP-941263-<hash10>
 */
export function computeSnapshotId(input = {}) {
  const importId = isNonEmptyString(input.importId) ? input.importId : 'IMP-UNKNOWN';
  const idSuffix = importId.split('-').pop() || 'XXXXXX';
  const seed = `${importId}|${input.textHash || ''}|${stableStringify(input.leadRecord || {})}`;
  const h = sha256Hex(seed).slice(0, 10);
  return `SNAP-${idSuffix}-${h}`;
}

// ---------------------------------------------------------------------------
// Leads store shape helpers
// ---------------------------------------------------------------------------

/**
 * Detect the on-disk leads-store shape.
 *   - 'array'  : bare array of lead records
 *   - 'leaves' : object wrapper with a `leads: []` array
 *   - 'map'    : object keyed by lead_id, each value a lead record (the
 *                production 13_sales/lead_contacts.json shape)
 *   - 'empty'  : empty/unknown object (treated as an empty map)
 */
function detectStoreShape(parsed) {
  if (Array.isArray(parsed)) return 'array';
  if (isPlainObject(parsed) && Array.isArray(parsed.leads)) return 'leaves';
  if (isPlainObject(parsed)) {
    const keys = Object.keys(parsed);
    if (keys.length === 0) return 'empty';
    // A map-of-leads: every value is an object, and at least one carries a
    // lead key (lead_id/id/leadId). This is the production contacts shape.
    const allObjects = keys.every((k) => isPlainObject(parsed[k]));
    const anyLeadKey = keys.some((k) => leadKey(parsed[k]) !== null);
    if (allObjects && anyLeadKey) return 'map';
    return 'empty';
  }
  return 'empty';
}

/**
 * Normalize a parsed leads store into { shape, container, leads }.
 * Accepts a bare array, an object with a `leads` array, or a map keyed by
 * lead_id. The map shape is flattened to a `leads` array for unified
 * dedup/merge logic, then re-serialized back to a map on write.
 */
function normalizeLeadsStore(parsed) {
  const shape = detectStoreShape(parsed);
  if (shape === 'array') {
    return { shape, container: { leads: parsed }, leads: parsed, wasArray: true };
  }
  if (shape === 'leaves') {
    return { shape, container: parsed, leads: parsed.leads, wasArray: false };
  }
  if (shape === 'map') {
    const leads = Object.keys(parsed).map((k) => parsed[k]);
    return { shape, container: parsed, leads, wasArray: false };
  }
  // 'empty' / unknown -> treat as empty object container.
  return { shape: 'empty', container: isPlainObject(parsed) ? parsed : {}, leads: [], wasArray: false };
}

function leadKey(record) {
  if (!isPlainObject(record)) return null;
  for (const k of ['lead_id', 'id', 'leadId']) {
    if (isNonEmptyString(record[k])) return record[k];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Core: importApprovedCard
// ---------------------------------------------------------------------------

/**
 * Import exactly one already-APPROVED card's lead record into a leads store.
 *
 * DRY-RUN by default (writes nothing). A real write requires ALL of:
 *   - allowRealImport === true
 *   - confirmRealImport === true
 *   - expectedImportId === importId (exact match)
 *
 * @param {{
 *   queuePath: string,                 // approval queue JSON (read-only here)
 *   leadsStorePath: string,            // leads store JSON to write
 *   importId: string,                  // the approved card to import
 *   expectedImportId?: string,         // MUST equal importId to write
 *   leadRecord: object,                // the out-of-card real lead record
 *   allowRealImport?: boolean,
 *   confirmRealImport?: boolean,
 *   clock?: Date                       // deterministic-test clock injection
 * }} args
 * @returns {Promise<object>} structured result (never throws on expected paths)
 */
export async function importApprovedCard(args = {}) {
  const a = isPlainObject(args) ? args : {};
  const safety = { ...SAFETY };
  const base = {
    version: COMMITTED_IMPORTER_VERSION,
    ok: false,
    status: 'UNKNOWN',
    dry_run: true,
    queue_written: false,        // ALWAYS false — importer never writes queue
    leads_written: false,
    real_data_changed: false,
    snapshot_id: null,
    commit_result: null,
    backup_file: null,
    safety,
  };

  // -- input validation -----------------------------------------------------
  if (!isNonEmptyString(a.queuePath)) {
    return { ...base, status: 'FAIL_QUEUE_PATH_REQUIRED', message: 'queuePath is required.' };
  }
  if (!isNonEmptyString(a.leadsStorePath)) {
    return { ...base, status: 'FAIL_LEADS_STORE_PATH_REQUIRED', message: 'leadsStorePath is required.' };
  }
  if (!isNonEmptyString(a.importId)) {
    return { ...base, status: 'FAIL_IMPORT_ID_REQUIRED', message: 'importId is required.' };
  }
  if (!isPlainObject(a.leadRecord)) {
    return { ...base, status: 'FAIL_LEAD_RECORD_REQUIRED', message: 'leadRecord (object) is required.' };
  }

  const importId = a.importId;

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

  // -- pre-flight gates (G1..G7 from the D2N plan) -------------------------
  const gates = [];
  if (card.status !== CardStatus.APPROVED_BY_DMITRY) {
    gates.push(`status must be APPROVED_BY_DMITRY (got ${card.status})`);
  }
  if (card.approved_by !== APPROVER_DMITRY) {
    gates.push(`approved_by must be ${APPROVER_DMITRY} (got ${card.approved_by})`);
  }
  if (card.qa_status === 'FAIL') {
    gates.push('qa_status is FAIL');
  }
  if (card.snapshot_id || card.status === CardStatus.COMMITTED) {
    gates.push('card already committed / has snapshot');
  }
  if (gates.length > 0) {
    return {
      ...base,
      status: 'FAIL_PREFLIGHT_GATE',
      message: `Pre-flight gate(s) failed: ${gates.join('; ')}`,
      gate_failures: gates,
    };
  }

  // -- deterministic snapshot id -------------------------------------------
  const snapshot_id = computeSnapshotId({
    importId,
    textHash: card.text_hash,
    leadRecord: a.leadRecord,
  });

  const lkey = leadKey(a.leadRecord);
  const ts = nowIso(a.clock);

  const commit_result = {
    status: 'IMPORTED',
    import_id: importId,
    snapshot_id,
    lead_key: lkey,
    imported_at: ts,
    leads_store_path: path.resolve(a.leadsStorePath),
    backup_file: null,
  };

  // -- DRY-RUN gate ---------------------------------------------------------
  const idMatch = isNonEmptyString(a.expectedImportId) && a.expectedImportId === importId;
  const triggered =
    a.allowRealImport === true && a.confirmRealImport === true && idMatch;

  if (!triggered) {
    // Decide why we are in DRY-RUN (informational, still writes nothing).
    let reason = 'DRY_RUN (no triple gate)';
    if (isNonEmptyString(a.expectedImportId) && !idMatch) {
      reason = `expectedImportId mismatch (got ${a.expectedImportId}, want ${importId})`;
      return {
        ...base,
        status: 'FAIL_IMPORT_ID_MISMATCH',
        message: reason,
        snapshot_id,
        planned_commit_result: commit_result,
      };
    }
    return {
      ...base,
      status: 'DRY_RUN',
      dry_run: true,
      message: reason,
      snapshot_id,
      planned_commit_result: commit_result,
      planned_lead_key: lkey,
    };
  }

  // -- CONFIRMED real write -------------------------------------------------
  const absStore = path.resolve(a.leadsStorePath);

  const storeRead = await readJsonSafe(absStore);
  if (storeRead.error) {
    return { ...base, status: 'FAIL_LEADS_STORE_UNREADABLE', message: `Leads store unreadable: ${storeRead.error}`, snapshot_id };
  }
  if (!storeRead.exists) {
    return { ...base, status: 'FAIL_LEADS_STORE_NOT_INITIALIZED', message: 'Leads store not initialized (refusing to create implicitly).', snapshot_id };
  }

  const { shape, container, leads } = normalizeLeadsStore(storeRead.parsed);

  // The production leads store (13_sales/lead_contacts.json) is a MAP keyed by
  // lead_id. A map import is only safe when the new record actually carries a
  // lead key, otherwise we'd have no map key to write under.
  if (shape === 'map' && !lkey) {
    return {
      ...base,
      status: 'FAIL_MAP_STORE_REQUIRES_LEAD_KEY',
      message: 'Leads store is a lead_id-keyed map but the lead record has no lead_id/id/leadId.',
      snapshot_id,
    };
  }

  // Dedup by lead key; merge if present, else append.
  let action = 'added';
  let nextContainer;

  if (shape === 'map') {
    // Preserve the exact on-disk map shape: NO leads[] array, NO injected
    // top-level metadata. Write the record back under its lead_id key.
    const importedRecord = { ...a.leadRecord, imported_at: ts, snapshot_id };
    const hadKey = Object.prototype.hasOwnProperty.call(container, lkey);
    action = hadKey ? 'merged' : 'added';
    const mergedRecord = hadKey
      ? { ...container[lkey], ...importedRecord }
      : importedRecord;
    nextContainer = { ...container, [lkey]: mergedRecord };
  } else {
    let nextLeads = leads.slice();
    if (lkey) {
      const idx = nextLeads.findIndex((r) => leadKey(r) === lkey);
      if (idx >= 0) {
        nextLeads[idx] = { ...nextLeads[idx], ...a.leadRecord, imported_at: ts, snapshot_id };
        action = 'merged';
      } else {
        nextLeads.push({ ...a.leadRecord, imported_at: ts, snapshot_id });
      }
    } else {
      nextLeads.push({ ...a.leadRecord, imported_at: ts, snapshot_id });
    }
    nextContainer = Array.isArray(storeRead.parsed)
      ? nextLeads
      : { ...container, leads: nextLeads, updated_at: ts, last_snapshot_id: snapshot_id };
  }

  // backup-then-atomic-rename
  const backupFile = `${absStore}.bak`;
  await fs.copyFile(absStore, backupFile);

  const tmp = `${absStore}.tmp-${process.pid}-${Date.now()}`;
  const json = `${JSON.stringify(nextContainer, null, 2)}\n`;
  await fs.writeFile(tmp, json, 'utf8');
  await fs.rename(tmp, absStore);

  // Count leads after write, agnostic to store shape.
  let leadsAfter;
  if (Array.isArray(nextContainer)) {
    leadsAfter = nextContainer.length;
  } else if (Array.isArray(nextContainer.leads)) {
    leadsAfter = nextContainer.leads.length;
  } else {
    // map shape: number of lead_id keys
    leadsAfter = Object.keys(nextContainer).length;
  }

  commit_result.status = 'IMPORTED';
  commit_result.action = action;
  commit_result.backup_file = backupFile;
  commit_result.store_shape = shape;
  commit_result.leads_after = leadsAfter;

  return {
    ...base,
    ok: true,
    status: 'OK_IMPORTED',
    dry_run: false,
    queue_written: false,
    leads_written: true,
    real_data_changed: true,
    snapshot_id,
    commit_result,
    backup_file: backupFile,
    action,
    leads_after: commit_result.leads_after,
    message: `Imported lead (${action}); snapshot ${snapshot_id}. Queue NOT written (recorder is a separate step).`,
  };
}

// ---------------------------------------------------------------------------
// Default export (named bundle)
// ---------------------------------------------------------------------------

export default {
  getCommittedImporterVersion,
  COMMITTED_IMPORTER_VERSION,
  computeSnapshotId,
  importApprovedCard,
};
