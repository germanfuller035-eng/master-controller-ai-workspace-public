/**
 * lead_import_committed_importer_real_d2n_tempcopy_test.mjs
 *
 * Daily Lead Factory — D2N Phase 1 — Standalone TEMP/SNAPSHOT test for the
 * controlled Approved-Card Importer (lead_import_committed_importer_real.mjs).
 *
 * HARD SAFETY CONTRACT (mirrors the module under test):
 *   - NO real import. Every write happens against a DISPOSABLE COPY in a tmp
 *     scratch dir, recreated fresh each run. The production leads_master and
 *     the production approval queue are NEVER touched.
 *   - NO leads_master write. We seed a throwaway leads store; never the live one.
 *   - NO queue write. The importer never writes the approval queue; the test
 *     asserts the seeded queue file is byte-identical before/after.
 *   - NO client contact / auto_send / external send.
 *   - NO live bot patch. NO Telegram API. NO bot import / touch.
 *   - NO SMTP / email / network / fetch.
 *   - NO .env / AI_SECRETS reads.
 *
 * Scratch dir (tmp, disposable):
 *   tmp/lead_import_committed_importer_real_d2n_workspace/
 *
 * Run:
 *   node --check tools/tests/lead_import_committed_importer_real_d2n_tempcopy_test.mjs
 *   node tools/tests/lead_import_committed_importer_real_d2n_tempcopy_test.mjs
 */

'use strict';

import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  getCommittedImporterVersion,
  COMMITTED_IMPORTER_VERSION,
  computeSnapshotId,
  importApprovedCard,
} from '../telegram_gateway/lead_import_committed_importer_real.mjs';

// ---------------------------------------------------------------------------
// Paths — disposable tmp scratch only
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');

const SCRATCH_DIR = path.join(
  WORKSPACE_ROOT,
  'tmp',
  'lead_import_committed_importer_real_d2n_workspace'
);
const QUEUE_FILE = path.join(SCRATCH_DIR, 'approval_queue', 'lead_import_approvals.json');
const LEADS_FILE = path.join(SCRATCH_DIR, 'leads_store', 'leads_master_TEMP.json');

const FIXED_CLOCK = new Date('2026-06-06T12:00:00.000Z');

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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const APPROVED_IMPORT_ID = 'IMP-20260606-100554-941263';
const PENDING_IMPORT_ID = 'IMP-20260606-093721-ef3dff';

function seedQueue() {
  return {
    version: 'lead-intake-approval-queue-d2b-v1',
    updated_at: '2026-06-06T10:18:49.116Z',
    cards: [
      {
        import_id: PENDING_IMPORT_ID,
        created_at: '2026-06-06T09:37:21.378Z',
        source: 'seed_pending',
        text_hash: 'a'.repeat(64),
        parsed_count: 1,
        valid_count: 1,
        needs_review_count: 0,
        qa_status: 'PASS',
        status: 'PENDING',
        approved_by: null,
        approved_at: null,
        snapshot_id: null,
        commit_result: null,
        history: [],
      },
      {
        import_id: APPROVED_IMPORT_ID,
        created_at: '2026-06-06T10:05:54.091Z',
        source: 'seed_approved__dlf-zavod-atom',
        text_hash: '3471e797ef0e7394b1f3f8f7bb6a42f523365ea8063b72745f34df5911f2b12f',
        parsed_count: 1,
        valid_count: 1,
        needs_review_count: 1,
        qa_status: 'PASS_WITH_REVIEW',
        status: 'APPROVED_BY_DMITRY',
        approved_by: 'Dmitry',
        approved_at: '2026-06-06T10:18:49.116Z',
        snapshot_id: null,
        commit_result: null,
        history: [],
      },
    ],
  };
}

function seedLeads() {
  return {
    version: 'leads-store-temp-v1',
    updated_at: null,
    leads: [
      { lead_id: 'EXISTING-001', company: 'Pre-existing Co', stage: 'cold' },
    ],
  };
}

const LEAD_RECORD = Object.freeze({
  lead_id: 'DLF-ZAVOD-ATOM-001',
  company: 'Zavod Atom (synthetic temp)',
  stage: 'needs_review',
  source: 'd2n_temp_test',
});

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

async function freshSeed() {
  await fs.rm(SCRATCH_DIR, { recursive: true, force: true });
  await fs.mkdir(path.dirname(QUEUE_FILE), { recursive: true });
  await fs.mkdir(path.dirname(LEADS_FILE), { recursive: true });
  await fs.writeFile(QUEUE_FILE, `${JSON.stringify(seedQueue(), null, 2)}\n`, 'utf8');
  await fs.writeFile(LEADS_FILE, `${JSON.stringify(seedLeads(), null, 2)}\n`, 'utf8');
}

async function readQueueRaw() {
  return fs.readFile(QUEUE_FILE, 'utf8');
}

async function readLeads() {
  return JSON.parse(await fs.readFile(LEADS_FILE, 'utf8'));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function run() {
  console.log('D2N Phase 1 — controlled importer temp/snapshot test\n');

  // --- T0: version + safety surface --------------------------------------
  check('T0.1 version getter matches constant',
    getCommittedImporterVersion() === COMMITTED_IMPORTER_VERSION,
    getCommittedImporterVersion());
  check('T0.2 version tag is d2n', /d2n/.test(COMMITTED_IMPORTER_VERSION));

  // --- T1: computeSnapshotId is deterministic + input-sensitive ----------
  const snapA = computeSnapshotId({ importId: APPROVED_IMPORT_ID, textHash: 'x', leadRecord: LEAD_RECORD });
  const snapB = computeSnapshotId({ importId: APPROVED_IMPORT_ID, textHash: 'x', leadRecord: LEAD_RECORD });
  const snapC = computeSnapshotId({ importId: APPROVED_IMPORT_ID, textHash: 'y', leadRecord: LEAD_RECORD });
  check('T1.1 snapshot id deterministic for identical inputs', snapA === snapB, `${snapA} vs ${snapB}`);
  check('T1.2 snapshot id changes when text_hash changes', snapA !== snapC);
  check('T1.3 snapshot id carries import suffix', snapA.startsWith('SNAP-941263-'), snapA);

  // --- T2: input validation ----------------------------------------------
  await freshSeed();
  const vQueue = await importApprovedCard({ leadsStorePath: LEADS_FILE, importId: APPROVED_IMPORT_ID, leadRecord: LEAD_RECORD });
  check('T2.1 missing queuePath -> FAIL_QUEUE_PATH_REQUIRED', vQueue.status === 'FAIL_QUEUE_PATH_REQUIRED', vQueue.status);
  const vLeads = await importApprovedCard({ queuePath: QUEUE_FILE, importId: APPROVED_IMPORT_ID, leadRecord: LEAD_RECORD });
  check('T2.2 missing leadsStorePath -> FAIL_LEADS_STORE_PATH_REQUIRED', vLeads.status === 'FAIL_LEADS_STORE_PATH_REQUIRED', vLeads.status);
  const vId = await importApprovedCard({ queuePath: QUEUE_FILE, leadsStorePath: LEADS_FILE, leadRecord: LEAD_RECORD });
  check('T2.3 missing importId -> FAIL_IMPORT_ID_REQUIRED', vId.status === 'FAIL_IMPORT_ID_REQUIRED', vId.status);
  const vRec = await importApprovedCard({ queuePath: QUEUE_FILE, leadsStorePath: LEADS_FILE, importId: APPROVED_IMPORT_ID });
  check('T2.4 missing leadRecord -> FAIL_LEAD_RECORD_REQUIRED', vRec.status === 'FAIL_LEAD_RECORD_REQUIRED', vRec.status);

  // --- T3: card lookup + preflight gates ---------------------------------
  const notFound = await importApprovedCard({ queuePath: QUEUE_FILE, leadsStorePath: LEADS_FILE, importId: 'IMP-DOES-NOT-EXIST', leadRecord: LEAD_RECORD });
  check('T3.1 unknown import_id -> FAIL_CARD_NOT_FOUND', notFound.status === 'FAIL_CARD_NOT_FOUND', notFound.status);
  const notApproved = await importApprovedCard({ queuePath: QUEUE_FILE, leadsStorePath: LEADS_FILE, importId: PENDING_IMPORT_ID, leadRecord: LEAD_RECORD });
  check('T3.2 non-approved card -> FAIL_PREFLIGHT_GATE', notApproved.status === 'FAIL_PREFLIGHT_GATE', notApproved.status);

  // --- T4: DRY-RUN by default (no gate) ----------------------------------
  const queueBeforeDry = await readQueueRaw();
  const leadsBeforeDry = await readLeads();
  const dry = await importApprovedCard({
    queuePath: QUEUE_FILE, leadsStorePath: LEADS_FILE,
    importId: APPROVED_IMPORT_ID, leadRecord: LEAD_RECORD, clock: FIXED_CLOCK,
  });
  check('T4.1 default call is DRY_RUN', dry.status === 'DRY_RUN' && dry.dry_run === true, dry.status);
  check('T4.2 dry run did not write leads', dry.leads_written === false && dry.real_data_changed === false);
  check('T4.3 dry run surfaces planned snapshot id', typeof dry.snapshot_id === 'string' && dry.snapshot_id.startsWith('SNAP-'));
  check('T4.4 queue file unchanged after dry run', (await readQueueRaw()) === queueBeforeDry);
  check('T4.5 leads file unchanged after dry run', JSON.stringify(await readLeads()) === JSON.stringify(leadsBeforeDry));

  // --- T5: expectedImportId mismatch is hard-refused ---------------------
  const mismatch = await importApprovedCard({
    queuePath: QUEUE_FILE, leadsStorePath: LEADS_FILE,
    importId: APPROVED_IMPORT_ID, expectedImportId: 'IMP-WRONG',
    leadRecord: LEAD_RECORD, allowRealImport: true, confirmRealImport: true, clock: FIXED_CLOCK,
  });
  check('T5.1 id mismatch -> FAIL_IMPORT_ID_MISMATCH', mismatch.status === 'FAIL_IMPORT_ID_MISMATCH', mismatch.status);
  check('T5.2 id mismatch wrote nothing', mismatch.leads_written !== true && mismatch.real_data_changed !== true);
  check('T5.3 leads file unchanged after mismatch', JSON.stringify(await readLeads()) === JSON.stringify(leadsBeforeDry));

  // --- T6: partial gate (allow but not confirm) stays DRY_RUN ------------
  const partial = await importApprovedCard({
    queuePath: QUEUE_FILE, leadsStorePath: LEADS_FILE,
    importId: APPROVED_IMPORT_ID, expectedImportId: APPROVED_IMPORT_ID,
    leadRecord: LEAD_RECORD, allowRealImport: true, confirmRealImport: false, clock: FIXED_CLOCK,
  });
  check('T6.1 allow-without-confirm stays DRY_RUN', partial.status === 'DRY_RUN', partial.status);
  check('T6.2 partial gate wrote nothing', partial.leads_written === false);

  // --- T7: CONFIRMED real write (against the TEMP copy only) -------------
  const queueBeforeReal = await readQueueRaw();
  const confirmed = await importApprovedCard({
    queuePath: QUEUE_FILE, leadsStorePath: LEADS_FILE,
    importId: APPROVED_IMPORT_ID, expectedImportId: APPROVED_IMPORT_ID,
    leadRecord: LEAD_RECORD, allowRealImport: true, confirmRealImport: true, clock: FIXED_CLOCK,
  });
  check('T7.1 confirmed write -> OK_IMPORTED', confirmed.status === 'OK_IMPORTED' && confirmed.ok === true, confirmed.status);
  check('T7.2 confirmed write reports leads_written', confirmed.leads_written === true && confirmed.real_data_changed === true);
  check('T7.3 confirmed write NEVER wrote the queue (flag)', confirmed.queue_written === false);
  check('T7.4 queue file byte-identical after real write', (await readQueueRaw()) === queueBeforeReal);
  check('T7.5 backup .bak file created', typeof confirmed.backup_file === 'string' && confirmed.backup_file.endsWith('.bak'));

  const leadsAfter = await readLeads();
  const imported = leadsAfter.leads.find((r) => r.lead_id === LEAD_RECORD.lead_id);
  check('T7.6 lead record appended to temp store', !!imported, JSON.stringify(leadsAfter.leads.map((r) => r.lead_id)));
  check('T7.7 imported lead stamped with snapshot_id', imported && imported.snapshot_id === confirmed.snapshot_id);
  check('T7.8 pre-existing lead preserved', leadsAfter.leads.some((r) => r.lead_id === 'EXISTING-001'));
  check('T7.9 action is added (new key)', confirmed.action === 'added', confirmed.action);
  check('T7.10 .bak exists on disk', await pathExists(`${LEADS_FILE}.bak`));

  // --- T8: idempotency / dedup-merge on second confirmed run -------------
  const second = await importApprovedCard({
    queuePath: QUEUE_FILE, leadsStorePath: LEADS_FILE,
    importId: APPROVED_IMPORT_ID, expectedImportId: APPROVED_IMPORT_ID,
    leadRecord: LEAD_RECORD, allowRealImport: true, confirmRealImport: true, clock: FIXED_CLOCK,
  });
  check('T8.1 second confirmed run merges (no duplicate)', second.action === 'merged', second.action);
  const leadsAfter2 = await readLeads();
  const dupes = leadsAfter2.leads.filter((r) => r.lead_id === LEAD_RECORD.lead_id).length;
  check('T8.2 exactly one lead record for the key', dupes === 1, `count=${dupes}`);
  check('T8.3 snapshot id stable across identical runs', second.snapshot_id === confirmed.snapshot_id);

  // --- summary -----------------------------------------------------------
  console.log(`\n${'-'.repeat(60)}`);
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f.name}${f.detail ? `  -> ${f.detail}` : ''}`);
  }

  // Best-effort cleanup of the disposable scratch dir.
  await fs.rm(SCRATCH_DIR, { recursive: true, force: true });

  process.exit(failed > 0 ? 1 : 0);
}

async function pathExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

run().catch((err) => {
  console.error('TEST HARNESS ERROR:', err);
  process.exit(2);
});
