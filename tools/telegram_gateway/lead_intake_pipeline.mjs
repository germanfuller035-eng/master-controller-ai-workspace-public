/**
 * lead_intake_pipeline.mjs
 *
 * Daily Lead Factory — D1a — Standalone Lead Intake Pipeline
 *
 * Purpose:
 *   Orchestrate a full, OFFLINE lead intake run that composes the already
 *   approved standalone layers:
 *     - lead_intake_contract.mjs       (parse / validate)
 *     - lead_dedupe_engine.mjs         (dedupe / merge)
 *     - lead_data_backup_rollback.mjs  (snapshot / atomic write)
 *     - lead_import_qa_gate.mjs        (QA gate before commit)
 *     - lead_contact_enrichment_pipeline.mjs (OPTIONAL, offline, no sends)
 *
 *   Flow:
 *     textBlock -> parse -> normalize candidates -> load existing leads ->
 *     dedupe -> prepare import_result -> (snapshot only on real import) ->
 *     QA Gate -> (dry_run = no write) | (confirm + QA PASS/PASS_WITH_REVIEW =
 *     atomic save + append event) -> summary.
 *
 * HARD SAFETY CONTRACT — what this module DOES NOT do:
 *   - No network. No HTTP/fetch. No site scanning.
 *   - No SMTP. No email/Telegram/WhatsApp/MAX send. Auto-send always BLOCKED.
 *   - No Telegram API. No bot integration. No git. No VPS/SSH.
 *   - No .env / AI_SECRETS / tokens reads.
 *   - Default of EVERY import is dry_run (no write).
 *   - Real write happens ONLY when options.confirm === true AND QA passes,
 *     and ONLY after a mandatory snapshot has been created.
 *
 * Exports:
 *   - getLeadIntakePipelineVersion
 *   - getLeadIntakePipelinePaths
 *   - loadLeadsMaster
 *   - saveLeadsMasterAtomic
 *   - buildImportId
 *   - buildCombinedLeadText
 *   - prepareLeadCandidatesFromText
 *   - runLeadIntakeDryRun
 *   - runLeadIntakeImport
 *   - buildLeadIntakePipelineSummary
 */

'use strict';

import path from 'node:path';
import fs from 'node:fs/promises';

import {
  parseLeadInputBlock,
} from './lead_intake_contract.mjs';

import {
  dedupeLeadRecords,
  normalizeLeadId,
} from './lead_dedupe_engine.mjs';

import {
  createLeadDataSnapshot,
  readJsonSafe,
  writeJsonAtomic,
} from './lead_data_backup_rollback.mjs';

import {
  buildLeadImportQaReport,
  QA_STATUS,
} from './lead_import_qa_gate.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PIPELINE_VERSION = 'lead-intake-pipeline-d1a-v2';

// The single source of truth for the "safety contract" surfaced everywhere.
const SAFETY = Object.freeze({
  network_used: 'NO',
  external_send: 'NO',
  smtp_used: 'NO',
  auto_send: 'BLOCKED',
  enrichment_sends: 'BLOCKED',
});

// Real workspace root + protected real data locations (rule 12).
const REAL_WORKSPACE_ROOT = path.resolve('D:\\AI_WORKSPACE');

const LEADS_MASTER_REL =
  '13_sales/daily_lead_factory/data/processed/leads_master.json';
const LEAD_CONTACTS_REL = '13_sales/lead_contacts.json';
const LEAD_EVENTS_REL = '13_sales/lead_intake_events.jsonl';
const BACKUPS_DIR_REL = '13_sales/_backups/lead_data';

// Default sandbox workspace (kept INSIDE D:\AI_WORKSPACE but away from real data).
const DEFAULT_SANDBOX_REL = 'tmp/lead_intake_sandbox';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * Resolve the workspace root for this run.
 * - options.workspace (string) -> used as-is (resolved to absolute).
 * - otherwise -> default sandbox folder under D:\AI_WORKSPACE.
 * @param {object} [options]
 * @returns {string}
 */
function resolveWorkspaceRoot(options = {}) {
  const ws = options && options.workspace;
  if (isNonEmptyString(ws)) {
    return path.resolve(ws);
  }
  return path.resolve(REAL_WORKSPACE_ROOT, DEFAULT_SANDBOX_REL);
}

/**
 * Real write is requested ONLY when options.confirm === true.
 * @param {object} [options]
 * @returns {boolean}
 */
function isConfirmed(options = {}) {
  return options && options.confirm === true;
}

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

/**
 * @returns {string} the pipeline version identifier.
 */
export function getLeadIntakePipelineVersion() {
  return PIPELINE_VERSION;
}

// ---------------------------------------------------------------------------
// Import id
// ---------------------------------------------------------------------------

/**
 * Generate a safe import_id (UTC timestamp + short random suffix).
 * @param {Date} [now]
 * @returns {string}
 */
export function buildImportId(now = new Date()) {
  const d = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const ts =
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  const rand = Math.random().toString(36).slice(2, 8);
  return `import-${ts}-${rand}`;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * Resolve all paths used by the pipeline for a given run.
 *
 * @param {{ workspace?: string }} [options]
 * @returns {{
 *   workspaceRoot: string,
 *   leadsMasterRel: string,
 *   leadsMasterAbs: string,
 *   leadContactsRel: string,
 *   leadContactsAbs: string,
 *   leadEventsRel: string,
 *   leadEventsAbs: string,
 *   backupsDirRel: string,
 *   backupsDirAbs: string,
 *   realLeadsMasterAbs: string,
 *   isRealTarget: boolean
 * }}
 */
export function getLeadIntakePipelinePaths(options = {}) {
  const workspaceRoot = resolveWorkspaceRoot(options);
  const leadsMasterAbs = path.resolve(workspaceRoot, LEADS_MASTER_REL);
  const realLeadsMasterAbs = path.resolve(REAL_WORKSPACE_ROOT, LEADS_MASTER_REL);
  const isRealTarget = leadsMasterAbs === realLeadsMasterAbs;

  return {
    workspaceRoot,
    leadsMasterRel: LEADS_MASTER_REL,
    leadsMasterAbs,
    leadContactsRel: LEAD_CONTACTS_REL,
    leadContactsAbs: path.resolve(workspaceRoot, LEAD_CONTACTS_REL),
    leadEventsRel: LEAD_EVENTS_REL,
    leadEventsAbs: path.resolve(workspaceRoot, LEAD_EVENTS_REL),
    backupsDirRel: BACKUPS_DIR_REL,
    backupsDirAbs: path.resolve(workspaceRoot, BACKUPS_DIR_REL),
    realLeadsMasterAbs,
    isRealTarget,
  };
}

// ---------------------------------------------------------------------------
// Load / save leads_master
// ---------------------------------------------------------------------------

/**
 * Load the leads_master for a workspace. Never throws on missing/malformed
 * file; returns an empty list instead and reports the issue.
 *
 * Accepts either an array payload or an object with a `leads` array.
 * If the file is absent (rule 11) -> returns leads: [].
 *
 * @param {{ workspace?: string }} [options]
 * @returns {Promise<{ leads: object[], exists: boolean, error: string|null, path: string }>}
 */
export async function loadLeadsMaster(options = {}) {
  const paths = getLeadIntakePipelinePaths(options);
  const res = await readJsonSafe(paths.leadsMasterAbs);

  let leads = [];
  if (res.exists && res.parsed && !res.error) {
    if (Array.isArray(res.parsed)) {
      leads = res.parsed;
    } else if (Array.isArray(res.parsed.leads)) {
      leads = res.parsed.leads;
    }
  }

  return {
    leads,
    exists: res.exists,
    error: res.error,
    path: paths.leadsMasterAbs,
  };
}

/**
 * Atomically save the leads_master into the run's workspace.
 *
 * Hard safety: if the resolved target is the REAL 13_sales leads_master and
 * the run is NOT explicitly confirmed (options.confirm === true), the write is
 * REFUSED and an Error is thrown. The pipeline never reaches this point
 * unconfirmed, but this is defense-in-depth.
 *
 * @param {object[]} leads
 * @param {{
 *   workspace?: string,
 *   confirm?: boolean,
 *   now?: string
 * }} [options]
 * @returns {Promise<{ path: string, bytes: number, count: number }>}
 */
export async function saveLeadsMasterAtomic(leads, options = {}) {
  const paths = getLeadIntakePipelinePaths(options);

  if (paths.isRealTarget && !isConfirmed(options)) {
    throw new Error(
      'Refusing to write real 13_sales leads_master without options.confirm === true. ' +
        'No write performed.'
    );
  }

  const list = Array.isArray(leads) ? leads : [];
  const now =
    isNonEmptyString(options.now) ? options.now : new Date().toISOString();

  const payload = {
    schema: 'leads_master',
    pipeline_version: PIPELINE_VERSION,
    updated_at: now,
    count: list.length,
    leads: list,
  };

  const writeRes = await writeJsonAtomic(paths.leadsMasterAbs, payload, {
    workspaceRoot: paths.workspaceRoot,
  });

  return {
    path: writeRes.path,
    bytes: writeRes.bytes,
    count: list.length,
  };
}

/**
 * Append a single JSONL event into lead_intake_events.jsonl for the workspace.
 * Local file only, offline, no network. Best-effort; never throws to caller.
 *
 * @param {object} event
 * @param {{ workspace?: string }} [options]
 * @returns {Promise<{ ok: boolean, path: string, error: string|null }>}
 */
async function appendLeadIntakeEvent(event, options = {}) {
  const paths = getLeadIntakePipelinePaths(options);
  try {
    await fs.mkdir(path.dirname(paths.leadEventsAbs), { recursive: true });
    const line = `${JSON.stringify(event)}\n`;
    await fs.appendFile(paths.leadEventsAbs, line, 'utf8');
    return { ok: true, path: paths.leadEventsAbs, error: null };
  } catch (err) {
    return {
      ok: false,
      path: paths.leadEventsAbs,
      error: err && err.message ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/**
 * Combine multiple raw lead text fragments into a single text block.
 * Accepts an array of strings (or a single string). Empty fragments dropped.
 *
 * @param {string|string[]} parts
 * @returns {string}
 */
export function buildCombinedLeadText(parts) {
  if (isNonEmptyString(parts)) {
    return parts.trim();
  }
  if (!Array.isArray(parts)) {
    return '';
  }
  return parts
    .map((p) => (typeof p === 'string' ? p : String(p ?? '')))
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .join('\n');
}

// ---------------------------------------------------------------------------
// Candidate preparation
// ---------------------------------------------------------------------------

/**
 * Parse + normalize a text block into lead candidates, split into valid and
 * needs_review buckets. Pure / offline.
 *
 * @param {string} textBlock
 * @param {{ source?: string, status?: string }} [options]
 * @returns {{
 *   total: number,
 *   valid_count: number,
 *   valid: object[],
 *   needs_review: object[],
 *   needs_review_rows: object[]
 * }}
 */
export function prepareLeadCandidatesFromText(textBlock, options = {}) {
  const parsed = parseLeadInputBlock(textBlock, {
    source: options.source,
    status: options.status,
  });

  const valid = Array.isArray(parsed.valid) ? parsed.valid : [];
  const needsReview = Array.isArray(parsed.needs_review)
    ? parsed.needs_review
    : [];

  const needsReviewRows = needsReview.map((c) => ({
    lead_id: c && c.lead_id ? c.lead_id : '',
    name: c && c.name ? c.name : '',
    website: c && c.website ? c.website : '',
    raw_text: c && c.raw_text ? c.raw_text : '',
    reason: isNonEmptyString(c && c.needs_review_reason)
      ? c.needs_review_reason
      : 'needs review',
  }));

  return {
    total: typeof parsed.total === 'number' ? parsed.total : valid.length + needsReview.length,
    valid_count:
      typeof parsed.valid_count === 'number' ? parsed.valid_count : valid.length,
    valid,
    needs_review: needsReview,
    needs_review_rows: needsReviewRows,
  };
}

// ---------------------------------------------------------------------------
// Canonical lead_id minting (DLF-YYYYMMDD-NNNN)
// ---------------------------------------------------------------------------

// Canonical lead_id shape: DLF-YYYYMMDD-NNNN (4+ digit zero-padded sequence).
const LEAD_ID_PREFIX = 'DLF';
const LEAD_ID_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LEAD_ID_CANONICAL_RE = /^DLF-(\d{8})-(\d{3,})$/;

/**
 * Resolve the YYYYMMDD date stamp used to mint new lead_id values.
 * Priority:
 *   - options.import_date when it is a valid 'YYYY-MM-DD' string (test-stable);
 *   - otherwise the current UTC date.
 * Pure / deterministic for a given input.
 *
 * @param {{ import_date?: string }} [options]
 * @param {Date} [now]
 * @returns {string} 8-digit 'YYYYMMDD'
 */
function resolveLeadIdDateStamp(options = {}, now = new Date()) {
  const provided = options && options.import_date;
  if (isNonEmptyString(provided) && LEAD_ID_DATE_RE.test(provided.trim())) {
    return provided.trim().replace(/-/g, '');
  }
  const d = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

/**
 * Format a canonical lead_id from a date stamp + sequence number.
 * @param {string} dateStamp  8-digit 'YYYYMMDD'
 * @param {number} seq
 * @returns {string} e.g. 'DLF-20260603-0002'
 */
function formatLeadId(dateStamp, seq) {
  return `${LEAD_ID_PREFIX}-${dateStamp}-${String(seq).padStart(4, '0')}`;
}

/**
 * Scan a corpus of leads and find the maximum existing sequence number that
 * was minted for the given YYYYMMDD date stamp. Returns 0 when none exist.
 * Only canonical DLF-YYYYMMDD-NNNN ids matching the date stamp are considered.
 *
 * @param {object[]} leads
 * @param {string} dateStamp 8-digit 'YYYYMMDD'
 * @returns {number}
 */
function maxLeadIdSeqForDate(leads, dateStamp) {
  const list = Array.isArray(leads) ? leads : [];
  let max = 0;
  for (const lead of list) {
    const id = normalizeLeadId(lead && lead.lead_id);
    if (!id) continue;
    const m = LEAD_ID_CANONICAL_RE.exec(id);
    if (!m) continue;
    if (m[1] !== dateStamp) continue;
    const n = parseInt(m[2], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

/**
 * Assign / mint a non-empty, unique canonical lead_id for every candidate.
 *
 * Rules:
 *   - A candidate that already carries a (normalized) non-empty lead_id keeps
 *     it; that id participates in uniqueness checks.
 *   - A candidate with an empty lead_id is assigned the next sequential
 *     DLF-<dateStamp>-NNNN id, starting after the max sequence already present
 *     in the existing corpus AND any ids assigned earlier in this same batch.
 *   - Deterministic: same input order + same existing corpus => same output.
 *     No random / crypto is used.
 *
 * @param {object[]} candidates
 * @param {object[]} existingLeads
 * @param {{ import_date?: string }} [options]
 * @param {Date} [now]
 * @returns {{
 *   candidates: object[],
 *   assigned_count: number,
 *   kept_count: number,
 *   empty_after: string[],
 *   duplicates: string[]
 * }}
 */
function mintLeadIdsForCandidates(candidates, existingLeads, options = {}, now = new Date()) {
  const list = Array.isArray(candidates) ? candidates : [];
  const dateStamp = resolveLeadIdDateStamp(options, now);

  // Seed the "seen" set with all normalized existing ids (canonical or not),
  // so we never collide with the existing corpus.
  const seen = new Set();
  for (const lead of (Array.isArray(existingLeads) ? existingLeads : [])) {
    const id = normalizeLeadId(lead && lead.lead_id);
    if (id) seen.add(id);
  }

  let nextSeq = maxLeadIdSeqForDate(existingLeads, dateStamp);
  let assigned = 0;
  let kept = 0;
  const duplicates = [];
  const emptyAfter = [];

  const out = list.map((cand) => {
    const c = cand && typeof cand === 'object' ? { ...cand } : {};
    const current = normalizeLeadId(c.lead_id);

    if (current) {
      // Keep existing id but verify uniqueness within batch + corpus.
      if (seen.has(current)) {
        duplicates.push(current);
      } else {
        seen.add(current);
      }
      c.lead_id = current;
      kept += 1;
      return c;
    }

    // Mint a new sequential id, skipping any already-seen collisions.
    let newId;
    do {
      nextSeq += 1;
      newId = formatLeadId(dateStamp, nextSeq);
    } while (seen.has(newId));
    seen.add(newId);
    c.lead_id = newId;
    assigned += 1;
    return c;
  });

  // Post-mint integrity: detect any still-empty id (should never happen).
  for (const c of out) {
    if (!isNonEmptyString(c.lead_id)) emptyAfter.push('');
  }

  return {
    candidates: out,
    assigned_count: assigned,
    kept_count: kept,
    empty_after: emptyAfter,
    duplicates,
  };
}

// ---------------------------------------------------------------------------
// Core run (shared by dry-run and import)
// ---------------------------------------------------------------------------


/**
 * Internal: run the full pipeline. `mode` is either 'dry_run' or 'import'.
 * In 'dry_run' nothing is ever written and no snapshot is taken.
 * In 'import' a snapshot is created before any write, and the write only
 * proceeds when options.confirm === true AND QA passes.
 *
 * @param {string} textBlock
 * @param {object} options
 * @param {'dry_run'|'import'} mode
 * @returns {Promise<object>}
 */
async function runPipeline(textBlock, options, mode) {
  const opts = options && typeof options === 'object' ? options : {};
  const now = isNonEmptyString(opts.now) ? opts.now : new Date().toISOString();
  const importId = isNonEmptyString(opts.import_id)
    ? opts.import_id
    : buildImportId(new Date());
  const paths = getLeadIntakePipelinePaths(opts);
  const confirmed = isConfirmed(opts);
  const isImport = mode === 'import';

  const base = {
    pipeline_version: PIPELINE_VERSION,
    mode,
    dry_run: !isImport || !confirmed,
    import_id: importId,
    workspace_root: paths.workspaceRoot,
    leads_master_path: paths.leadsMasterAbs,
    events_path: paths.leadEventsAbs,
    is_real_target: paths.isRealTarget,
    confirmed,
    snapshot_id: null,
    qa_status: QA_STATUS.FAIL,
    status: 'FAIL',
    can_commit_import: false,
    written: false,
    write: null,
    event_appended: false,
    counts: {
      total_rows: 0,
      parsed_count: 0,
      valid_count: 0,
      added_count: 0,
      merged_count: 0,
      duplicate_count: 0,
      needs_review_count: 0,
      error_count: 0,
      final_unique_count: 0,
    },
    needs_review_rows: [],
    blockers: [],
    warnings: [],
    safety: { ...SAFETY },
  };

  // 1-3. Parse + normalize candidates.
  const prepared = prepareLeadCandidatesFromText(textBlock, {
    source: opts.source,
    status: opts.status,
  });
  const validCandidates = prepared.valid;
  const needsReviewRows = prepared.needs_review_rows;

  // 4. Load existing leads.
  const existing = await loadLeadsMaster(opts);

  // 4b. Canonical lead_id minting (rules 1-7). Every valid candidate must carry
  //     a non-empty, unique DLF-YYYYMMDD-NNNN lead_id BEFORE dedupe / QA / commit.
  //     Deterministic: existing canonical ids for the same date stamp set the
  //     starting sequence; ids are minted in input order without random/crypto.
  const minted = mintLeadIdsForCandidates(
    validCandidates,
    existing.leads,
    { import_date: opts.import_date },
    new Date()
  );
  const mintedCandidates = minted.candidates;

  // 4c. Integrity guards (rules 10-11). Surface as blockers; a hard FAIL here
  //     means nothing is ever written, in dry-run and confirmed import alike.
  const mintBlockers = [];
  if (minted.empty_after.length > 0) {
    mintBlockers.push({
      code: 'LEAD_ID_EMPTY_AFTER_MINT',
      message:
        `${minted.empty_after.length} candidate(s) still have an empty lead_id after minting. ` +
        'Nothing will be written.',
      severity: 'blocker',
    });
  }
  if (minted.duplicates.length > 0) {
    const uniqDup = Array.from(new Set(minted.duplicates));
    mintBlockers.push({
      code: 'LEAD_ID_DUPLICATE',
      message:
        `Duplicate lead_id detected within batch or against existing corpus: ` +
        `${uniqDup.join(', ')}. Nothing will be written.`,
      severity: 'blocker',
    });
  }

  // 5. Snapshot — ONLY for a confirmed real import (rule 3 / rule 6).

  let snapshotId = null;
  let snapshotError = null;
  if (isImport && confirmed) {
    try {
      const snapshot = await createLeadDataSnapshot({
        workspaceRoot: paths.workspaceRoot,
        reason: isNonEmptyString(opts.reason)
          ? opts.reason
          : `lead_intake_pipeline:${importId}`,
      });
      snapshotId = snapshot && snapshot.snapshot_id ? snapshot.snapshot_id : null;
    } catch (err) {
      snapshotError = err && err.message ? err.message : String(err);
    }
  }
  base.snapshot_id = snapshotId;

  // 6. Dedupe minted candidates against existing leads. Dedupe (and therefore
  //    QA Gate downstream) now always sees candidates that already carry a
  //    non-empty lead_id (rules 8-9).
  const dedupe = dedupeLeadRecords(existing.leads, mintedCandidates, { now });


  // 7. Prepare import_result for the QA gate.
  const importResult = {
    import_id: importId,
    // For a confirmed import a snapshot is mandatory; for dry-run / unconfirmed
    // QA must FAIL the snapshot rule (no write should ever happen).
    snapshot_id: snapshotId,
    total_rows: prepared.total,
    parsed_count: prepared.total,
    valid_count: prepared.valid_count,
    added_count: dedupe.added_count,
    merged_count: dedupe.merged_count,
    duplicate_count: dedupe.duplicate_count,
    needs_review_count: needsReviewRows.length,
    error_count: 0,
    needs_review_rows: needsReviewRows,
    leads: dedupe.leads,
    safety: { ...SAFETY },
  };

  base.counts = {
    total_rows: prepared.total,
    parsed_count: prepared.total,
    valid_count: prepared.valid_count,
    added_count: dedupe.added_count,
    merged_count: dedupe.merged_count,
    duplicate_count: dedupe.duplicate_count,
    needs_review_count: needsReviewRows.length,
    error_count: 0,
    final_unique_count: Array.isArray(dedupe.leads) ? dedupe.leads.length : 0,
  };
  base.needs_review_rows = needsReviewRows;

  // 8. Run QA Gate (full report contract: qa_status, can_commit_import, etc.).
  const evaluation = buildLeadImportQaReport(importResult);
  base.qa_status = evaluation.qa_status;
  base.can_commit_import = evaluation.can_commit_import;
  base.blockers = Array.isArray(evaluation.blockers) ? evaluation.blockers : [];
  base.warnings = Array.isArray(evaluation.warnings) ? evaluation.warnings : [];

  // 8b. Pipeline-level guard (rule 5): an import with NO valid leads has nothing
  //     safe to commit. The QA gate may only surface needs_review *warnings*
  //     (which downgrade to PASS_WITH_REVIEW once a snapshot exists), but the
  //     pipeline must treat a zero-valid-lead batch as a hard FAIL so it never
  //     writes an empty/garbage import. evaluateLeadImportResult stays untouched.
  if (prepared.valid_count <= 0) {
    base.qa_status = QA_STATUS.FAIL;
    base.can_commit_import = false;
    if (!base.blockers.some((b) => b && b.code === 'NO_VALID_LEADS')) {
      base.blockers = base.blockers.concat([
        {
          code: 'NO_VALID_LEADS',
          message:
            'No valid, committable leads were produced from the input. Nothing will be written.',
          severity: 'blocker',
        },
      ]);
    }
  }

  // 8c. lead_id integrity guards (rules 10-11). Any empty-after-mint or
  //     duplicate lead_id is a hard FAIL: nothing is written in any mode.
  if (mintBlockers.length > 0) {
    base.qa_status = QA_STATUS.FAIL;
    base.can_commit_import = false;
    base.blockers = base.blockers.concat(mintBlockers);
  }

  if (snapshotError) {

    base.warnings = base.warnings.concat([
      { code: 'SNAPSHOT_ERROR', message: snapshotError },
    ]);
  }


  // 9. DRY RUN (or unconfirmed import) -> never write. Return QA summary.
  if (!isImport || !confirmed) {
    base.written = false;
    // Surface QA outcome but make it explicit nothing was committed.
    base.status =
      base.qa_status === QA_STATUS.FAIL ? 'FAIL' : 'DRY_RUN';

    if (isImport && !confirmed) {
      base.warnings = base.warnings.concat([
        {
          code: 'CONFIRM_REQUIRED',
          message:
            'Real import requires options.confirm === true. Treated as dry_run; no write performed.',
        },
      ]);
    }
    return base;
  }

  // 10. QA FAIL -> no write (rule 5). Read the FINAL pipeline verdict (base),
  //     which already folds in the 8b NO_VALID_LEADS guard, not the raw
  //     QA-gate evaluation.
  if (
    base.qa_status === QA_STATUS.FAIL ||
    base.can_commit_import !== true
  ) {
    base.status = 'FAIL';
    base.written = false;
    return base;
  }


  // Invariant: snapshot_id mandatory before any commit (rule 3).
  if (!isNonEmptyString(snapshotId)) {
    base.status = 'FAIL';
    base.qa_status = QA_STATUS.FAIL;
    base.written = false;
    base.blockers = base.blockers.concat([
      {
        code: 'SNAPSHOT_REQUIRED',
        message: 'snapshot_id is mandatory before commit. No write performed.',
      },
    ]);
    return base;
  }

  // 11. QA PASS / PASS_WITH_REVIEW + confirmed -> atomic save + append event.
  try {
    const writeRes = await saveLeadsMasterAtomic(dedupe.leads, {
      workspace: opts.workspace,
      confirm: opts.confirm,
      now,
    });
    base.write = writeRes;
    base.written = true;
    base.status = evaluation.qa_status; // PASS or PASS_WITH_REVIEW

    const eventRes = await appendLeadIntakeEvent(
      {
        event: 'lead_intake_import',
        pipeline_version: PIPELINE_VERSION,
        import_id: importId,
        at: now,
        snapshot_id: snapshotId,
        qa_status: evaluation.qa_status,
        counts: base.counts,
        write: writeRes,
        safety: { ...SAFETY },
      },
      opts
    );
    base.event_appended = eventRes.ok === true;
    if (!eventRes.ok) {
      base.warnings = base.warnings.concat([
        { code: 'EVENT_APPEND_FAILED', message: eventRes.error },
      ]);
    }
  } catch (err) {
    base.status = 'FAIL';
    base.written = false;
    base.blockers = base.blockers.concat([
      {
        code: 'WRITE_FAILED',
        message: err && err.message ? err.message : String(err),
      },
    ]);
    return base;
  }

  // 12. Return full result.
  return base;
}

/**
 * Run the pipeline in DRY RUN mode. Never writes, never snapshots.
 *
 * @param {string} textBlock
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function runLeadIntakeDryRun(textBlock, options = {}) {
  return runPipeline(textBlock, options, 'dry_run');
}

/**
 * Run the pipeline in IMPORT mode.
 *   - Without options.confirm === true it behaves as a dry_run (no write).
 *   - With options.confirm === true it creates a snapshot, runs QA, and only
 *     writes when QA is PASS / PASS_WITH_REVIEW.
 *
 * @param {string} textBlock
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function runLeadIntakeImport(textBlock, options = {}) {
  return runPipeline(textBlock, options, 'import');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

/**
 * Build a compact, human-readable summary from a pipeline run result.
 *
 * @param {object} result
 * @returns {object}
 */
export function buildLeadIntakePipelineSummary(result) {
  const r = result && typeof result === 'object' ? result : {};
  const counts = r.counts && typeof r.counts === 'object' ? r.counts : {};
  const blockers = Array.isArray(r.blockers) ? r.blockers : [];
  const warnings = Array.isArray(r.warnings) ? r.warnings : [];

  let headline;
  switch (r.status) {
    case 'PASS':
      headline = 'Lead intake PASSED QA and was committed.';
      break;
    case 'PASS_WITH_REVIEW':
      headline = 'Lead intake committed; some rows need manual review.';
      break;
    case 'DRY_RUN':
      headline = 'Dry run complete — QA evaluated, nothing written.';
      break;
    default:
      headline = `Lead intake FAILED — not committed (${blockers.length} blocker(s)).`;
      break;
  }

  return {
    pipeline_version: r.pipeline_version || PIPELINE_VERSION,
    mode: r.mode || 'dry_run',
    dry_run: r.dry_run !== false,
    import_id: r.import_id || null,
    status: r.status || 'FAIL',
    qa_status: r.qa_status || QA_STATUS.FAIL,
    written: r.written === true,
    event_appended: r.event_appended === true,
    workspace_root: r.workspace_root || null,
    leads_master_path: r.leads_master_path || null,
    is_real_target: r.is_real_target === true,
    confirmed: r.confirmed === true,
    snapshot_id: r.snapshot_id || null,
    counts: {
      total_rows: counts.total_rows || 0,
      valid_count: counts.valid_count || 0,
      added_count: counts.added_count || 0,
      merged_count: counts.merged_count || 0,
      duplicate_count: counts.duplicate_count || 0,
      needs_review_count: counts.needs_review_count || 0,
      error_count: counts.error_count || 0,
      final_unique_count: counts.final_unique_count || 0,
    },
    blocker_count: blockers.length,
    warning_count: warnings.length,
    headline,
    safety: { ...SAFETY },
  };
}

// ---------------------------------------------------------------------------
// Default export (named bundle)
// ---------------------------------------------------------------------------

export default {
  getLeadIntakePipelineVersion,
  getLeadIntakePipelinePaths,
  loadLeadsMaster,
  saveLeadsMasterAtomic,
  buildImportId,
  buildCombinedLeadText,
  prepareLeadCandidatesFromText,
  runLeadIntakeDryRun,
  runLeadIntakeImport,
  buildLeadIntakePipelineSummary,
};
