/**
 * lead_import_committed_importer_real_d2n_phase2_partA_dryrun_harness.mjs
 * ---------------------------------------------------------------------------
 * Daily Lead Factory — D2N Phase 2-run — PART A — Temp-Copy DRY-RUN harness.
 * Variant 1 (pure DRY-RUN, default, safest).
 *
 * WHAT THIS DOES
 *   Exercises the already-built importer (lead_import_committed_importer_real.mjs)
 *   against a faithful, byte-checked TEMP COPY of the REAL approval queue and a
 *   synthetic TEMP leads store, to prove that the real approved card
 *   (IMP-20260606-100554-941263) flows through all pre-flight gates and produces
 *   a stable snapshot_id + a planned_commit_result — WITHOUT writing anything real.
 *
 * HARD SAFETY CONTRACT (mirrors the Phase 2 plan, section A.6):
 *   - The REAL approval queue is read READ-ONLY and copied to a disposable
 *     scratch dir; the copy is asserted byte-identical (sha256) to its source.
 *   - The importer is ONLY ever pointed at the TEMP copy + TEMP leads store,
 *     NEVER at the real queue and NEVER at the real leads_master.
 *   - Variant 1 runs the importer in its DEFAULT DRY-RUN mode (no triple gate),
 *     so it writes NOTHING, even against the temp copy.
 *   - No real import. No leads_master write. No queue write. No client contact.
 *   - No network / SMTP / Telegram / live bot. No .env / AI_SECRETS reads.
 *   - Scratch dir is recreated at start and removed at end.
 *
 * Real queue SOURCE (read-only): 13_sales/approval_queue/lead_import_approvals.json
 *
 * Run:
 *   node --check tools/tests/lead_import_committed_importer_real_d2n_phase2_partA_dryrun_harness.mjs
 *   node tools/tests/lead_import_committed_importer_real_d2n_phase2_partA_dryrun_harness.mjs
 * ---------------------------------------------------------------------------
 */

'use strict';

import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  getCommittedImporterVersion,
  COMMITTED_IMPORTER_VERSION,
  computeSnapshotId,
  importApprovedCard,
} from '../telegram_gateway/lead_import_committed_importer_real.mjs';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');

// REAL queue — read-only source. NEVER handed to the importer.
const REAL_QUEUE_SOURCE = path.join(
  WORKSPACE_ROOT,
  '13_sales',
  'approval_queue',
  'lead_import_approvals.json'
);

// Disposable scratch workspace.
const SCRATCH_DIR = path.join(
  WORKSPACE_ROOT,
  'tmp',
  'lead_import_committed_importer_real_d2n_phase2_workspace'
);
const QUEUE_COPY = path.join(SCRATCH_DIR, 'queue_copy', 'lead_import_approvals.json');
const LEADS_TEMP = path.join(SCRATCH_DIR, 'leads_store', 'leads_master_temp.json');

const APPROVED_IMPORT_ID = 'IMP-20260606-100554-941263';
const FIXED_CLOCK = new Date('2026-06-06T12:00:00.000Z');

// Synthetic, NON-PII placeholder lead record (the real out-of-card record is
// supplied by Dmitry later, at real commit time, under separate approval).
const SYNTHETIC_LEAD_RECORD = Object.freeze({
  lead_id: 'DLF-PHASE2-DRYRUN-SYNTH-001',
  company: 'Synthetic Dry-Run Placeholder (no real PII)',
  stage: 'needs_review',
  source: 'd2n_phase2_partA_dryrun_harness',
});

// ---------------------------------------------------------------------------
// Mini assertion harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push({ name, detail });
    console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`);
  }
}

function sha256OfBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function pathExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

// ---------------------------------------------------------------------------
// Setup: byte-checked copy of the REAL queue + synthetic temp leads store
// ---------------------------------------------------------------------------

async function freshScratch() {
  await fs.rm(SCRATCH_DIR, { recursive: true, force: true });
  await fs.mkdir(path.dirname(QUEUE_COPY), { recursive: true });
  await fs.mkdir(path.dirname(LEADS_TEMP), { recursive: true });

  // Read REAL queue (read-only) and copy byte-for-byte.
  const sourceBuf = await fs.readFile(REAL_QUEUE_SOURCE);
  await fs.writeFile(QUEUE_COPY, sourceBuf);

  const copyBuf = await fs.readFile(QUEUE_COPY);
  const sourceHash = sha256OfBuffer(sourceBuf);
  const copyHash = sha256OfBuffer(copyBuf);

  // Seed a throwaway temp leads store (never the live leads_master).
  const seedLeads = {
    version: 'leads-store-temp-d2n-phase2-v1',
    updated_at: null,
    last_snapshot_id: null,
    leads: [
      { lead_id: 'TEMP-SEED-001', company: 'Pre-existing temp seed', stage: 'cold' },
    ],
  };
  await fs.writeFile(LEADS_TEMP, `${JSON.stringify(seedLeads, null, 2)}\n`, 'utf8');

  return { sourceHash, copyHash };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function run() {
  console.log('D2N Phase 2-run — PART A — Temp-Copy DRY-RUN harness (Variant 1)\n');

  // Pre-flight: real source must exist.
  if (!(await pathExists(REAL_QUEUE_SOURCE))) {
    console.error(`REAL queue source not found: ${REAL_QUEUE_SOURCE}`);
    process.exit(2);
  }

  // --- S0: byte-checked copy of the real queue ----------------------------
  const { sourceHash, copyHash } = await freshScratch();
  check('S0.1 temp queue copy is byte-identical to real source (sha256)',
    sourceHash === copyHash, `${sourceHash} vs ${copyHash}`);
  console.log(`        real source sha256: ${sourceHash}`);

  // Snapshot of the copy + temp store before any importer call.
  const queueCopyBefore = await fs.readFile(QUEUE_COPY, 'utf8');
  const leadsTempBefore = await fs.readFile(LEADS_TEMP, 'utf8');

  // --- S1: module identity ------------------------------------------------
  check('S1.1 importer version getter matches constant',
    getCommittedImporterVersion() === COMMITTED_IMPORTER_VERSION,
    getCommittedImporterVersion());
  check('S1.2 importer version tag is d2n', /d2n/.test(COMMITTED_IMPORTER_VERSION));

  // --- S2: Variant 1 — pure DRY-RUN (no expectedImportId, no gates) -------
  const v1 = await importApprovedCard({
    queuePath: QUEUE_COPY,        // TEMP copy — never the real file
    leadsStorePath: LEADS_TEMP,   // TEMP store — never real leads_master
    importId: APPROVED_IMPORT_ID, // the REAL approved card
    leadRecord: SYNTHETIC_LEAD_RECORD,
    clock: FIXED_CLOCK,
    // NO expectedImportId, NO allowRealImport, NO confirmRealImport => DRY-RUN
  });

  check('S2.1 Variant 1 status is DRY_RUN', v1.status === 'DRY_RUN', v1.status);
  check('S2.2 dry_run flag is true', v1.dry_run === true);
  check('S2.3 leads_written is false', v1.leads_written === false);
  check('S2.4 queue_written is false', v1.queue_written === false);
  check('S2.5 real_data_changed is false', v1.real_data_changed === false);
  check('S2.6 deterministic snapshot_id surfaced',
    typeof v1.snapshot_id === 'string' && v1.snapshot_id.startsWith('SNAP-941263-'),
    v1.snapshot_id);
  check('S2.7 planned_commit_result present', !!v1.planned_commit_result);

  const pcr = v1.planned_commit_result || {};
  check('S2.8 planned_commit_result.import_id matches card',
    pcr.import_id === APPROVED_IMPORT_ID, pcr.import_id);
  check('S2.9 planned_commit_result.snapshot_id matches top-level',
    pcr.snapshot_id === v1.snapshot_id, pcr.snapshot_id);
  check('S2.10 planned_commit_result carries lead_key',
    pcr.lead_key === SYNTHETIC_LEAD_RECORD.lead_id, String(pcr.lead_key));
  check('S2.11 planned_commit_result carries imported_at (fixed clock)',
    pcr.imported_at === FIXED_CLOCK.toISOString(), pcr.imported_at);
  check('S2.12 planned_commit_result carries leads_store_path (temp)',
    typeof pcr.leads_store_path === 'string' && pcr.leads_store_path.includes('leads_master_temp'),
    pcr.leads_store_path);

  // --- S3: safety surface -------------------------------------------------
  const s = v1.safety || {};
  check('S3.1 safety.queue_write === NO', s.queue_write === 'NO', s.queue_write);
  check('S3.2 safety.client_contact === BLOCKED', s.client_contact === 'BLOCKED', s.client_contact);
  check('S3.3 safety.network_used === NO', s.network_used === 'NO', s.network_used);
  check('S3.4 safety.real_import === GATED', s.real_import === 'GATED', s.real_import);

  // --- S4: snapshot determinism across repeated DRY-RUN calls ------------
  const v1b = await importApprovedCard({
    queuePath: QUEUE_COPY, leadsStorePath: LEADS_TEMP,
    importId: APPROVED_IMPORT_ID, leadRecord: SYNTHETIC_LEAD_RECORD, clock: FIXED_CLOCK,
  });
  check('S4.1 snapshot_id stable across repeated dry-runs (same inputs)',
    v1b.snapshot_id === v1.snapshot_id, `${v1.snapshot_id} vs ${v1b.snapshot_id}`);

  // Cross-check determinism directly against computeSnapshotId using the REAL
  // card's text_hash (read from the TEMP queue copy, never hardcoded), proving
  // the planned snapshot is reproducible from its declared inputs.
  const queueParsed = JSON.parse(await fs.readFile(QUEUE_COPY, 'utf8'));
  const cards = Array.isArray(queueParsed)
    ? queueParsed
    : (Array.isArray(queueParsed.cards) ? queueParsed.cards
      : (Array.isArray(queueParsed.approvals) ? queueParsed.approvals
        : (Array.isArray(queueParsed.queue) ? queueParsed.queue : [])));
  const realCard = cards.find((c) => c && c.import_id === APPROVED_IMPORT_ID) || {};
  const realCardTextHash = realCard.text_hash || '';
  check('S4.2a real card located in temp queue copy',
    realCard.import_id === APPROVED_IMPORT_ID, realCard.import_id);
  const expectedSnap = computeSnapshotId({
    importId: APPROVED_IMPORT_ID,
    textHash: realCardTextHash,
    leadRecord: SYNTHETIC_LEAD_RECORD,
  });
  check('S4.2b planned snapshot_id reproducible from (import_id, text_hash, lead)',
    v1.snapshot_id === expectedSnap, `${v1.snapshot_id} vs ${expectedSnap}`);


  // --- S5: NOTHING was written (temp copy + temp store byte-identical) ----
  const queueCopyAfter = await fs.readFile(QUEUE_COPY, 'utf8');
  const leadsTempAfter = await fs.readFile(LEADS_TEMP, 'utf8');
  check('S5.1 temp queue copy unchanged after dry-runs',
    queueCopyAfter === queueCopyBefore);
  check('S5.2 temp leads store unchanged after dry-runs',
    leadsTempAfter === leadsTempBefore);

  // --- S6: the REAL source on disk is STILL byte-identical to S0 ----------
  const realSourceNowBuf = await fs.readFile(REAL_QUEUE_SOURCE);
  check('S6.1 REAL queue source untouched (sha256 unchanged)',
    sha256OfBuffer(realSourceNowBuf) === sourceHash,
    sha256OfBuffer(realSourceNowBuf));

  // --- S7: no leads_master / no .bak artefacts created --------------------
  check('S7.1 no .bak created on temp store (dry-run writes nothing)',
    !(await pathExists(`${LEADS_TEMP}.bak`)));

  // --- summary ------------------------------------------------------------
  console.log(`\n${'-'.repeat(64)}`);
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  console.log('Captured observations:');
  console.log(`  - planned snapshot_id : ${v1.snapshot_id}`);
  console.log(`  - planned lead_key    : ${pcr.lead_key}`);
  console.log(`  - planned imported_at : ${pcr.imported_at}`);
  console.log(`  - real card gates     : PASSED (status DRY_RUN reached => all G1..G4 passed)`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f.name}${f.detail ? `  -> ${f.detail}` : ''}`);
  }

  // Best-effort cleanup of the disposable scratch dir.
  await fs.rm(SCRATCH_DIR, { recursive: true, force: true });

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('HARNESS ERROR:', err);
  process.exit(2);
});
