/**
 * lead_import_commit_recorder_real_d2n_phase2_tempcopy_test.mjs
 * ---------------------------------------------------------------------------
 * Temp-copy build/test for the D2N Phase 2 (Part B) Commit Recorder.
 *
 * SAFETY: this test ONLY touches a disposable scratch dir under tmp/. It NEVER
 * reads or writes the real approval queue or any real leads_master. It builds a
 * synthetic APPROVED_BY_DMITRY card, runs the real importer against a temp leads
 * store, and feeds the importer hand-off to the recorder — DRY-RUN first, then a
 * gated write into the TEMP queue copy only. No network, no client contact, no
 * live bot patch.
 *
 * Run:
 *   node tools/tests/lead_import_commit_recorder_real_d2n_phase2_tempcopy_test.mjs
 * ---------------------------------------------------------------------------
 */

'use strict';

import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  buildApprovalCard,
  saveApprovalQueue,
  loadApprovalQueue,
  findCard,
  approveCard,
  CardStatus,
} from '../telegram_gateway/lead_intake_approval_queue.mjs';

import { importApprovedCard } from '../telegram_gateway/lead_import_committed_importer_real.mjs';

import {
  recordCommit,
  getCommitRecorderVersion,
  COMMIT_RECORDER_VERSION,
} from '../telegram_gateway/lead_import_commit_recorder_real.mjs';

// ---------------------------------------------------------------------------
// Tiny assert harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  ❌ ${label}`);
  }
}

function eq(actual, expected, label) {
  ok(actual === expected, `${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

// ---------------------------------------------------------------------------
// Scratch workspace
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');
const SCRATCH = path.resolve(
  WORKSPACE_ROOT,
  'tmp',
  'lead_import_commit_recorder_real_d2n_phase2_workspace',
);

const QUEUE_PATH = path.join(SCRATCH, 'queue_copy', 'lead_import_approvals.json');
const LEADS_PATH = path.join(SCRATCH, 'leads_store', 'leads_master_temp.json');

const IMPORT_ID = 'IMP-20260606-100554-941263';
const FIXED_CLOCK = new Date('2026-06-06T11:00:00.000Z');

const SYNTHETIC_LEAD = {
  lead_id: 'LEAD-SYNTH-0001',
  company: 'Synthetic Test Co',
  source: 'd2n_phase2_recorder_test',
  // NOTE: synthetic only — no real client PII.
};

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function setupScratch() {
  // Recreate scratch from clean.
  await fs.rm(SCRATCH, { recursive: true, force: true });
  await fs.mkdir(path.dirname(QUEUE_PATH), { recursive: true });
  await fs.mkdir(path.dirname(LEADS_PATH), { recursive: true });

  // Build a synthetic PENDING card, save, then approve -> APPROVED_BY_DMITRY.
  const card = buildApprovalCard({
    import_id: IMPORT_ID,
    text: 'synthetic source text for recorder test',
    source: 'd2n_phase2_recorder_test',
    parsed_count: 1,
    valid_count: 1,
    added_count: 1,
    merged_count: 0,
    needs_review_count: 1,
    qa_status: 'PASS_WITH_REVIEW',
    created_at: FIXED_CLOCK.toISOString(),
  });
  await saveApprovalQueue(QUEUE_PATH, { cards: [card] });
  await approveCard(QUEUE_PATH, IMPORT_ID, { approved_by: 'Dmitry', approved_at: FIXED_CLOCK.toISOString() });

  // Initialise an empty temp leads store (importer refuses to create implicitly).
  await fs.writeFile(LEADS_PATH, `${JSON.stringify({ leads: [] }, null, 2)}\n`, 'utf8');
}

async function teardownScratch() {
  await fs.rm(SCRATCH, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Test body
// ---------------------------------------------------------------------------

async function main() {
  console.log('D2N Phase 2 (Part B) — Commit Recorder temp-copy test');
  console.log(`recorder version: ${getCommitRecorderVersion()}`);
  console.log('');

  await setupScratch();

  // -- Module sanity -------------------------------------------------------
  console.log('[group] module sanity');
  eq(getCommitRecorderVersion(), COMMIT_RECORDER_VERSION, 'version getter matches constant');
  ok(typeof recordCommit === 'function', 'recordCommit exported as function');

  // -- Produce a real importer hand-off (gated write into TEMP leads store) -
  console.log('[group] importer hand-off (temp leads store only)');
  const importRes = await importApprovedCard({
    queuePath: QUEUE_PATH,
    leadsStorePath: LEADS_PATH,
    importId: IMPORT_ID,
    expectedImportId: IMPORT_ID,
    leadRecord: SYNTHETIC_LEAD,
    allowRealImport: true,
    confirmRealImport: true,
    clock: FIXED_CLOCK,
  });
  eq(importRes.status, 'OK_IMPORTED', 'importer status OK_IMPORTED');
  eq(importRes.leads_written, true, 'importer wrote temp leads store');
  eq(importRes.queue_written, false, 'importer did NOT write queue');
  ok(typeof importRes.snapshot_id === 'string' && importRes.snapshot_id.startsWith('SNAP-'), 'importer returned snapshot_id');

  // Snapshot of queue + leads byte content for later equality checks.
  const queueBeforeDryRun = await fs.readFile(QUEUE_PATH, 'utf8');

  // -- Recorder DRY-RUN (default, no gate) ---------------------------------
  console.log('[group] recorder DRY-RUN (default)');
  const dry = await recordCommit({
    queuePath: QUEUE_PATH,
    importerResult: importRes,
    leadRecord: SYNTHETIC_LEAD,
    clock: FIXED_CLOCK,
  });
  eq(dry.status, 'DRY_RUN', 'dry-run status DRY_RUN');
  eq(dry.dry_run, true, 'dry-run flag true');
  eq(dry.queue_written, false, 'dry-run wrote nothing to queue');
  eq(dry.leads_written, false, 'recorder never writes leads');
  eq(dry.card_status_after, CardStatus.APPROVED_BY_DMITRY, 'dry-run leaves card APPROVED_BY_DMITRY');
  ok(dry.planned_stamp && dry.planned_stamp.snapshot_id === importRes.snapshot_id, 'dry-run planned_stamp carries snapshot_id');
  const queueAfterDryRun = await fs.readFile(QUEUE_PATH, 'utf8');
  eq(queueAfterDryRun, queueBeforeDryRun, 'queue byte-identical after dry-run');

  // -- Recorder refuses a non-imported (DRY_RUN) hand-off ------------------
  console.log('[group] recorder refuses non-imported hand-off');
  const refuse = await recordCommit({
    queuePath: QUEUE_PATH,
    importerResult: { ...importRes, status: 'DRY_RUN', ok: false, leads_written: false },
    expectedImportId: IMPORT_ID,
    allowCommit: true,
    confirmCommit: true,
    clock: FIXED_CLOCK,
  });
  eq(refuse.status, 'FAIL_NOT_AN_IMPORTED_RESULT', 'refuses to stamp a non-imported result');
  eq(refuse.queue_written, false, 'refusal wrote nothing');

  // -- Recorder gate mismatch (expectedImportId wrong) ---------------------
  console.log('[group] recorder gate mismatch');
  const mismatch = await recordCommit({
    queuePath: QUEUE_PATH,
    importerResult: importRes,
    expectedImportId: 'IMP-WRONG-0000',
    allowCommit: true,
    confirmCommit: true,
    clock: FIXED_CLOCK,
  });
  eq(mismatch.status, 'FAIL_IMPORT_ID_MISMATCH', 'expectedImportId mismatch refused');
  eq(mismatch.queue_written, false, 'mismatch wrote nothing');

  // -- Recorder snapshot tamper cross-check --------------------------------
  console.log('[group] recorder snapshot tamper cross-check');
  const tamperRes = {
    ...importRes,
    snapshot_id: 'SNAP-941263-deadbeef00',
    commit_result: { ...importRes.commit_result, snapshot_id: 'SNAP-941263-deadbeef00' },
  };
  const tamper = await recordCommit({
    queuePath: QUEUE_PATH,
    importerResult: tamperRes,
    leadRecord: SYNTHETIC_LEAD,
    expectedImportId: IMPORT_ID,
    allowCommit: true,
    confirmCommit: true,
    clock: FIXED_CLOCK,
  });
  eq(tamper.status, 'FAIL_SNAPSHOT_CROSS_CHECK', 'tampered snapshot refused');
  eq(tamper.queue_written, false, 'tamper wrote nothing');

  // -- Recorder CONFIRMED gated write into TEMP queue ----------------------
  console.log('[group] recorder CONFIRMED write (temp queue only)');
  const rec = await recordCommit({
    queuePath: QUEUE_PATH,
    importerResult: importRes,
    leadRecord: SYNTHETIC_LEAD,
    expectedImportId: IMPORT_ID,
    allowCommit: true,
    confirmCommit: true,
    clock: FIXED_CLOCK,
  });
  eq(rec.status, 'OK_RECORDED', 'confirmed write status OK_RECORDED');
  eq(rec.ok, true, 'confirmed write ok:true');
  eq(rec.queue_written, true, 'confirmed write wrote queue');
  eq(rec.leads_written, false, 'recorder never writes leads (confirmed)');
  eq(rec.card_status_after, CardStatus.COMMITTED, 'card transitioned to COMMITTED');
  ok(await fileExists(`${QUEUE_PATH}.bak`), '.bak created before write');

  // Verify the stamped card.
  const q2 = await loadApprovalQueue(QUEUE_PATH);
  const committedCard = findCard(q2, IMPORT_ID);
  eq(committedCard.status, CardStatus.COMMITTED, 'persisted card status COMMITTED');
  eq(committedCard.snapshot_id, importRes.snapshot_id, 'persisted snapshot_id stamped');
  eq(committedCard.needs_review_count, 1, 'needs_review_count preserved (=1)');
  eq(committedCard.committed_by, 'Dmitry', 'committed_by = Dmitry');
  ok(committedCard.commit_result && committedCard.commit_result.import_id === IMPORT_ID, 'commit_result stamped');
  ok(Array.isArray(committedCard.history) && committedCard.history.some((h) => h.to === CardStatus.COMMITTED), 'history records COMMITTED transition');

  // -- Idempotency: re-record same snapshot -> NOOP ------------------------
  console.log('[group] recorder idempotency (same snapshot)');
  const again = await recordCommit({
    queuePath: QUEUE_PATH,
    importerResult: importRes,
    leadRecord: SYNTHETIC_LEAD,
    expectedImportId: IMPORT_ID,
    allowCommit: true,
    confirmCommit: true,
    clock: FIXED_CLOCK,
  });
  eq(again.status, 'NOOP_ALREADY_RECORDED', 're-record same snapshot is NOOP');
  eq(again.ok, true, 'NOOP reported ok:true');
  eq(again.queue_written, false, 'NOOP wrote nothing');

  // -- Idempotency: different snapshot on COMMITTED card -> hard refuse -----
  console.log('[group] recorder idempotency (different snapshot hard refuse)');
  const diff = await recordCommit({
    queuePath: QUEUE_PATH,
    importerResult: tamperRes,
    expectedImportId: IMPORT_ID,
    allowCommit: true,
    confirmCommit: true,
    clock: FIXED_CLOCK,
  });
  eq(diff.status, 'FAIL_ALREADY_COMMITTED_DIFFERENT_SNAPSHOT', 'different snapshot on committed card refused');
  eq(diff.queue_written, false, 'different-snapshot refusal wrote nothing');

  // -- Safety contract surface ---------------------------------------------
  console.log('[group] safety contract');
  eq(rec.safety.queue_write, 'GATED', 'safety.queue_write = GATED');
  eq(rec.safety.leads_write, 'NO', 'safety.leads_write = NO');
  eq(rec.safety.client_contact, 'BLOCKED', 'safety.client_contact = BLOCKED');
  eq(rec.safety.bot_live_patch, 'NO', 'safety.bot_live_patch = NO');
  eq(rec.safety.network_used, 'NO', 'safety.network_used = NO');

  await teardownScratch();

  // -- Summary -------------------------------------------------------------
  console.log('');
  console.log('---------------------------------------------');
  console.log(`PASSED: ${passed}   FAILED: ${failed}`);
  if (failed > 0) {
    console.log('FAILURES:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log('ALL TESTS PASSED ✅  (scratch removed; no real data touched)');
  }
}

main().catch(async (err) => {
  console.error('TEST HARNESS ERROR:', err);
  try { await teardownScratch(); } catch {}
  process.exitCode = 1;
});
