/**
 * lead_import_committed_importer_real_d2n_phase2_partC_full_chain_dryrun_harness.mjs
 * ---------------------------------------------------------------------------
 * Daily Lead Factory — D2N Phase 2 — PART C — Full importer→recorder DRY-RUN.
 *
 * WHAT THIS DOES
 *   Proves the COMPLETE commit chain end-to-end WITHOUT any production write:
 *
 *       approved card (REAL, read-only copy)
 *         → importer  (DRY-RUN  and  temp-store simulation)
 *         → planned snapshot_id / commit_result
 *         → recorder  (DRY-RUN)
 *         → verify COMMITTED *would* be stamped correctly
 *         → production unchanged
 *
 *   It chains the two already-built, already-tested modules:
 *     - lead_import_committed_importer_real.mjs   (importer half)
 *     - lead_import_commit_recorder_real.mjs      (recorder half)
 *   against a faithful, byte-checked TEMP COPY of the REAL approval queue and a
 *   synthetic TEMP leads store. The REAL approved card
 *   (IMP-20260606-100554-941263) is exercised through the whole chain, but the
 *   recorder is ALWAYS kept in DRY-RUN — so no COMMITTED stamp is ever written,
 *   not even to the temp copy.
 *
 * TWO VARIANTS
 *   Variant 1 — pure full DRY-RUN chain (safest):
 *       importer DRY-RUN  -> produces a planned (NOT imported) hand-off
 *       recorder          -> correctly REFUSES to stamp it
 *                            (FAIL_NOT_AN_IMPORTED_RESULT)
 *     Proves: a true full dry-run commits NOTHING, by design.
 *
 *   Variant 2 — temp-store simulation chain:
 *       importer gated write into the TEMP leads store ONLY -> OK_IMPORTED
 *       recorder DRY-RUN against the TEMP queue copy        -> planned COMMITTED
 *     Proves: given a real hand-off, COMMITTED *would* be stamped correctly,
 *             while the temp queue copy (and the real source) stay untouched.
 *
 * HARD SAFETY CONTRACT (mirrors the Phase 2 / Part C boundaries):
 *   - REAL approval queue is read READ-ONLY and copied to a disposable scratch
 *     dir; the copy is asserted byte-identical (sha256) to its source.
 *   - The chain is ONLY ever pointed at the TEMP copy + TEMP leads store,
 *     NEVER at the real queue and NEVER at the real leads_master.
 *   - The recorder is ALWAYS DRY-RUN here => no production approval-queue write,
 *     no COMMITTED stamp in production, not even in the temp copy.
 *   - The only write that happens at all is the importer's temp-store simulation
 *     into a synthetic throwaway leads store under tmp/ (never leads_master).
 *   - No real import. No production leads_master write. No production queue
 *     write. No client contact. No live bot patch.
 *   - No network / SMTP / Telegram. No .env / AI_SECRETS reads.
 *   - Scratch dir is recreated at start and removed at end.
 *
 * Real queue SOURCE (read-only): 13_sales/approval_queue/lead_import_approvals.json
 *
 * Run:
 *   node --check tools/tests/lead_import_committed_importer_real_d2n_phase2_partC_full_chain_dryrun_harness.mjs
 *   node tools/tests/lead_import_committed_importer_real_d2n_phase2_partC_full_chain_dryrun_harness.mjs
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

import {
  getCommitRecorderVersion,
  COMMIT_RECORDER_VERSION,
  recordCommit,
} from '../telegram_gateway/lead_import_commit_recorder_real.mjs';

import { CardStatus } from '../telegram_gateway/lead_intake_approval_queue.mjs';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');

// REAL queue — read-only source. NEVER handed to the chain directly.
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
  'lead_import_committed_importer_real_d2n_phase2_partC_workspace'
);
const QUEUE_COPY = path.join(SCRATCH_DIR, 'queue_copy', 'lead_import_approvals.json');
const LEADS_TEMP = path.join(SCRATCH_DIR, 'leads_store', 'leads_master_temp.json');

const APPROVED_IMPORT_ID = 'IMP-20260606-100554-941263';
const FIXED_CLOCK = new Date('2026-06-06T12:00:00.000Z');

// Synthetic, NON-PII placeholder lead record (the real out-of-card record is
// supplied by Dmitry later, at real commit time, under separate approval).
const SYNTHETIC_LEAD_RECORD = Object.freeze({
  lead_id: 'DLF-PHASE2-PARTC-SYNTH-001',
  company: 'Synthetic Full-Chain Dry-Run Placeholder (no real PII)',
  stage: 'needs_review',
  source: 'd2n_phase2_partC_full_chain_dryrun_harness',
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
    version: 'leads-store-temp-d2n-phase2-partC-v1',
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
  console.log('D2N Phase 2 — PART C — Full importer→recorder DRY-RUN harness\n');

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

  // Snapshots before any chain call.
  const queueCopyBefore = await fs.readFile(QUEUE_COPY, 'utf8');
  const leadsTempBefore = await fs.readFile(LEADS_TEMP, 'utf8');

  // --- S1: module identity (both halves) ----------------------------------
  check('S1.1 importer version getter matches constant',
    getCommittedImporterVersion() === COMMITTED_IMPORTER_VERSION,
    getCommittedImporterVersion());
  check('S1.2 recorder version getter matches constant',
    getCommitRecorderVersion() === COMMIT_RECORDER_VERSION,
    getCommitRecorderVersion());
  check('S1.3 both modules tagged d2n',
    /d2n/.test(COMMITTED_IMPORTER_VERSION) && /d2n/.test(COMMIT_RECORDER_VERSION));

  // =========================================================================
  // VARIANT 1 — pure full DRY-RUN chain (importer DRY-RUN -> recorder refuses)
  // =========================================================================
  console.log('\n[Variant 1] pure full DRY-RUN chain (nothing committed)');

  // Importer in its DEFAULT DRY-RUN mode (no triple gate) => planned, NOT imported.
  const impDry = await importApprovedCard({
    queuePath: QUEUE_COPY,        // TEMP copy — never the real file
    leadsStorePath: LEADS_TEMP,   // TEMP store — never real leads_master
    importId: APPROVED_IMPORT_ID, // the REAL approved card
    leadRecord: SYNTHETIC_LEAD_RECORD,
    clock: FIXED_CLOCK,
    // NO expectedImportId / allowRealImport / confirmRealImport => DRY-RUN
  });
  check('V1.1 importer status is DRY_RUN', impDry.status === 'DRY_RUN', impDry.status);
  check('V1.2 importer dry_run flag true', impDry.dry_run === true);
  check('V1.3 importer leads_written false', impDry.leads_written === false);
  check('V1.4 importer queue_written false', impDry.queue_written === false);
  check('V1.5 importer surfaces deterministic planned snapshot_id',
    typeof impDry.snapshot_id === 'string' && impDry.snapshot_id.startsWith('SNAP-941263-'),
    impDry.snapshot_id);
  check('V1.6 importer planned_commit_result present', !!impDry.planned_commit_result);

  // Recorder MUST refuse a non-imported (DRY_RUN) hand-off — proves a pure
  // full dry-run commits NOTHING, by design.
  const recRefuse = await recordCommit({
    queuePath: QUEUE_COPY,
    importerResult: impDry,           // a DRY_RUN result (ok:false, leads_written:false)
    leadRecord: SYNTHETIC_LEAD_RECORD,
    expectedImportId: APPROVED_IMPORT_ID,
    allowCommit: true,                // even fully gated, it must still refuse
    confirmCommit: true,
    clock: FIXED_CLOCK,
  });
  check('V1.7 recorder refuses the dry-run hand-off',
    recRefuse.status === 'FAIL_NOT_AN_IMPORTED_RESULT', recRefuse.status);
  check('V1.8 recorder wrote nothing on refusal', recRefuse.queue_written === false);
  check('V1.9 recorder reports real_data_changed false', recRefuse.real_data_changed === false);

  // Temp copy must still be byte-identical (nothing committed in Variant 1).
  const queueCopyAfterV1 = await fs.readFile(QUEUE_COPY, 'utf8');
  check('V1.10 temp queue copy unchanged after Variant 1',
    queueCopyAfterV1 === queueCopyBefore);
  const leadsTempAfterV1 = await fs.readFile(LEADS_TEMP, 'utf8');
  check('V1.11 temp leads store unchanged after Variant 1',
    leadsTempAfterV1 === leadsTempBefore);

  // =========================================================================
  // VARIANT 2 — temp-store simulation chain (importer write to TEMP store only,
  // then recorder DRY-RUN proving COMMITTED *would* be stamped correctly)
  // =========================================================================
  console.log('\n[Variant 2] temp-store simulation -> recorder DRY-RUN (planned COMMITTED)');

  // Importer gated write into the TEMP leads store ONLY (temp-store simulation).
  const impReal = await importApprovedCard({
    queuePath: QUEUE_COPY,
    leadsStorePath: LEADS_TEMP,
    importId: APPROVED_IMPORT_ID,
    expectedImportId: APPROVED_IMPORT_ID,
    leadRecord: SYNTHETIC_LEAD_RECORD,
    allowRealImport: true,            // gated -> writes the TEMP store only
    confirmRealImport: true,
    clock: FIXED_CLOCK,
  });
  check('V2.1 importer status OK_IMPORTED (temp store)', impReal.status === 'OK_IMPORTED', impReal.status);
  check('V2.2 importer leads_written true (temp store)', impReal.leads_written === true);
  check('V2.3 importer queue_written false (never writes queue)', impReal.queue_written === false);
  check('V2.4 importer snapshot_id matches Variant 1 planned snapshot (determinism)',
    impReal.snapshot_id === impDry.snapshot_id, `${impDry.snapshot_id} vs ${impReal.snapshot_id}`);
  check('V2.5 importer commit_result is IMPORTED',
    impReal.commit_result && impReal.commit_result.status === 'IMPORTED', impReal.commit_result && impReal.commit_result.status);
  check('V2.6 importer wrote ONLY the temp store (path contains leads_master_temp)',
    typeof impReal.commit_result.leads_store_path === 'string' &&
      impReal.commit_result.leads_store_path.includes('leads_master_temp'),
    impReal.commit_result.leads_store_path);

  // The importer's temp write must NOT have touched the queue copy.
  const queueCopyAfterImport = await fs.readFile(QUEUE_COPY, 'utf8');
  check('V2.7 temp queue copy still unchanged after importer temp-store write',
    queueCopyAfterImport === queueCopyBefore);

  // Recorder DRY-RUN against the temp queue copy -> planned COMMITTED, no write.
  const recDry = await recordCommit({
    queuePath: QUEUE_COPY,
    importerResult: impReal,
    leadRecord: SYNTHETIC_LEAD_RECORD, // enables snapshot determinism cross-check
    clock: FIXED_CLOCK,
    // NO expectedImportId / allowCommit / confirmCommit => DRY-RUN
  });
  check('V2.8 recorder status DRY_RUN', recDry.status === 'DRY_RUN', recDry.status);
  check('V2.9 recorder dry_run flag true', recDry.dry_run === true);
  check('V2.10 recorder queue_written false', recDry.queue_written === false);
  check('V2.11 recorder leads_written false (never writes leads)', recDry.leads_written === false);
  check('V2.12 recorder real_data_changed false', recDry.real_data_changed === false);
  check('V2.13 recorder import_id echoes the card', recDry.import_id === APPROVED_IMPORT_ID, recDry.import_id);
  check('V2.14 recorder snapshot_id echoes importer snapshot',
    recDry.snapshot_id === impReal.snapshot_id, recDry.snapshot_id);
  check('V2.15 recorder card_status_before is APPROVED_BY_DMITRY',
    recDry.card_status_before === CardStatus.APPROVED_BY_DMITRY, recDry.card_status_before);
  check('V2.16 recorder card_status_after still APPROVED_BY_DMITRY (no stamp written)',
    recDry.card_status_after === CardStatus.APPROVED_BY_DMITRY, recDry.card_status_after);
  check('V2.17 recorder planned_card_status is COMMITTED',
    recDry.planned_card_status === CardStatus.COMMITTED, recDry.planned_card_status);

  // The crux of Part C: verify COMMITTED *would* be stamped correctly.
  const ps = recDry.planned_stamp || {};
  check('V2.18 planned_stamp present', !!recDry.planned_stamp);
  check('V2.19 planned_stamp.snapshot_id matches importer snapshot',
    ps.snapshot_id === impReal.snapshot_id, String(ps.snapshot_id));
  check('V2.20 planned_stamp.commit_result.import_id matches card',
    ps.commit_result && ps.commit_result.import_id === APPROVED_IMPORT_ID,
    ps.commit_result && ps.commit_result.import_id);
  check('V2.21 planned_stamp.committed_by defaults to Dmitry',
    ps.committed_by === 'Dmitry', String(ps.committed_by));
  check('V2.22 planned_stamp.committed_at uses fixed clock',
    ps.committed_at === FIXED_CLOCK.toISOString(), String(ps.committed_at));

  // Independent reproducibility of the planned snapshot from the REAL card's
  // text_hash (read from the temp queue copy, never hardcoded).
  const queueParsed = JSON.parse(await fs.readFile(QUEUE_COPY, 'utf8'));
  const cards = Array.isArray(queueParsed)
    ? queueParsed
    : (Array.isArray(queueParsed.cards) ? queueParsed.cards
      : (Array.isArray(queueParsed.approvals) ? queueParsed.approvals
        : (Array.isArray(queueParsed.queue) ? queueParsed.queue : [])));
  const realCard = cards.find((c) => c && c.import_id === APPROVED_IMPORT_ID) || {};
  check('V2.23 real card located in temp queue copy',
    realCard.import_id === APPROVED_IMPORT_ID, realCard.import_id);
  check('V2.24 real card is still APPROVED_BY_DMITRY in the temp copy (un-committed)',
    realCard.status === CardStatus.APPROVED_BY_DMITRY, realCard.status);
  const expectedSnap = computeSnapshotId({
    importId: APPROVED_IMPORT_ID,
    textHash: realCard.text_hash || '',
    leadRecord: SYNTHETIC_LEAD_RECORD,
  });
  check('V2.25 planned snapshot reproducible from (import_id, text_hash, lead)',
    impReal.snapshot_id === expectedSnap, `${impReal.snapshot_id} vs ${expectedSnap}`);

  // --- S5: recorder DRY-RUN must leave the temp queue copy byte-identical --
  const queueCopyAfterRecDry = await fs.readFile(QUEUE_COPY, 'utf8');
  check('S5.1 temp queue copy unchanged after recorder DRY-RUN (no COMMITTED stamp)',
    queueCopyAfterRecDry === queueCopyBefore);
  check('S5.2 no .bak created on temp queue copy (recorder dry-run wrote nothing)',
    !(await pathExists(`${QUEUE_COPY}.bak`)));

  // --- S6: the REAL source on disk is STILL byte-identical to S0 ----------
  const realSourceNowBuf = await fs.readFile(REAL_QUEUE_SOURCE);
  check('S6.1 REAL queue source untouched (sha256 unchanged)',
    sha256OfBuffer(realSourceNowBuf) === sourceHash,
    sha256OfBuffer(realSourceNowBuf));

  // --- S7: safety surfaces on both halves ---------------------------------
  const si = impReal.safety || {};
  check('S7.1 importer safety.queue_write === NO', si.queue_write === 'NO', si.queue_write);
  check('S7.2 importer safety.real_import === GATED', si.real_import === 'GATED', si.real_import);
  check('S7.3 importer safety.client_contact === BLOCKED', si.client_contact === 'BLOCKED', si.client_contact);
  const sr = recDry.safety || {};
  check('S7.4 recorder safety.leads_write === NO', sr.leads_write === 'NO', sr.leads_write);
  check('S7.5 recorder safety.queue_write === GATED', sr.queue_write === 'GATED', sr.queue_write);
  check('S7.6 recorder safety.client_contact === BLOCKED', sr.client_contact === 'BLOCKED', sr.client_contact);
  check('S7.7 recorder safety.bot_live_patch === NO', sr.bot_live_patch === 'NO', sr.bot_live_patch);
  check('S7.8 recorder safety.network_used === NO', sr.network_used === 'NO', sr.network_used);

  // --- summary ------------------------------------------------------------
  console.log(`\n${'-'.repeat(64)}`);
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  console.log('Captured observations:');
  console.log(`  - planned snapshot_id      : ${impReal.snapshot_id}`);
  console.log(`  - importer (temp) status   : ${impReal.status}`);
  console.log(`  - recorder (dry) status    : ${recDry.status}`);
  console.log(`  - planned card status      : ${recDry.planned_card_status}`);
  console.log(`  - planned committed_by     : ${ps.committed_by}`);
  console.log(`  - temp queue copy stamped? : NO (still ${realCard.status})`);
  console.log(`  - real source touched?     : NO (sha256 unchanged)`);
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
