/**
 * lead_import_committed_importer_real_d2n_phase3b_realstore_tempcopy_dryrun_harness.mjs
 * ---------------------------------------------------------------------------
 * D2N Phase 3B — REAL-store temp-copy dry-run + confirmed import (TEMP ONLY).
 *
 * Scope confirmed by Dmitry (D2N Phase 3B real-store temp-copy dry-run):
 *   - READ the production approval queue + production lead_contacts.json
 *     (READ-ONLY — never written here);
 *   - COPY both into an OS temp directory (os.tmpdir());
 *   - run the committed importer's DRY-RUN, then a CONFIRMED triple-gated
 *     import, BOTH operating ONLY on the temp-copy;
 *   - verify the temp-copy mutated correctly AND that the two production
 *     files are byte-for-byte unchanged (sha256 before == after).
 *
 * HARD SAFETY ENVELOPE:
 *   - NO production write (queue or lead store) — asserted via sha256.
 *   - NO real commit recorder write to the production queue.
 *   - NO client contact (no network, no email/telegram/whatsapp).
 *   - NO live bot patch / restart.
 *   - All writes land strictly inside os.tmpdir()/<mkdtemp>.
 *
 * Run:
 *   node tools/tests/lead_import_committed_importer_real_d2n_phase3b_realstore_tempcopy_dryrun_harness.mjs
 * ---------------------------------------------------------------------------
 */

'use strict';

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

import {
  importApprovedCard,
  getCommittedImporterVersion,
  COMMITTED_IMPORTER_VERSION,
} from '../telegram_gateway/lead_import_committed_importer_real.mjs';

// -- production source paths (READ-ONLY) ------------------------------------
const PROD_QUEUE_PATH =
  path.resolve('D:/AI_WORKSPACE/13_sales/approval_queue/lead_import_approvals.json');
const PROD_STORE_PATH =
  path.resolve('D:/AI_WORKSPACE/13_sales/lead_contacts.json');

// The single APPROVED_BY_DMITRY card from D2M (Завод АТОМ, lead DLF-20260603-0001).
const TARGET_IMPORT_ID = 'IMP-20260606-100554-941263';
const TARGET_LEAD_KEY = 'DLF-20260603-0001';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ''}`);
  }
}

async function sha256OfFile(p) {
  const buf = await fs.readFile(p);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function readJson(p) {
  return JSON.parse(await fs.readFile(p, 'utf8'));
}

async function fileExists(p) {
  return fs.access(p).then(() => true).catch(() => false);
}

async function main() {
  console.log('D2N Phase 3B — REAL-store temp-copy dry-run + confirmed import (TEMP ONLY)');
  console.log(`Importer version: ${getCommittedImporterVersion()} (${COMMITTED_IMPORTER_VERSION})`);
  console.log('');

  // =====================================================================
  // STEP 0 — production sources present; capture pre-state fingerprints
  // =====================================================================
  check('0.1 production queue exists', await fileExists(PROD_QUEUE_PATH), PROD_QUEUE_PATH);
  check('0.2 production lead store exists', await fileExists(PROD_STORE_PATH), PROD_STORE_PATH);

  const prodQueueShaBefore = await sha256OfFile(PROD_QUEUE_PATH);
  const prodStoreShaBefore = await sha256OfFile(PROD_STORE_PATH);
  console.log(`  prod queue sha256 (before): ${prodQueueShaBefore}`);
  console.log(`  prod store sha256 (before): ${prodStoreShaBefore}`);

  const prodQueue = await readJson(PROD_QUEUE_PATH);
  const prodStore = await readJson(PROD_STORE_PATH);

  const targetCard = (prodQueue.cards || []).find((c) => c.import_id === TARGET_IMPORT_ID);
  check('0.3 target card present in queue', !!targetCard, TARGET_IMPORT_ID);
  check('0.4 target card APPROVED_BY_DMITRY',
    !!targetCard && targetCard.status === 'APPROVED_BY_DMITRY', targetCard && targetCard.status);
  check('0.5 target card not yet committed (snapshot_id null)',
    !!targetCard && targetCard.snapshot_id === null, targetCard && targetCard.snapshot_id);

  const storeIsMap = !Array.isArray(prodStore) && !Array.isArray(prodStore.leads);
  check('0.6 production store is a lead_id-keyed MAP', storeIsMap, typeof prodStore);
  check('0.7 target lead key exists in production store',
    storeIsMap && !!prodStore[TARGET_LEAD_KEY], TARGET_LEAD_KEY);

  // =====================================================================
  // STEP 1 — copy BOTH production files into an OS temp directory
  // =====================================================================
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'd2n-phase3b-'));
  const tmpQueuePath = path.join(tmp, 'queue_copy.json');
  const tmpStorePath = path.join(tmp, 'lead_contacts_copy.json');

  await fs.copyFile(PROD_QUEUE_PATH, tmpQueuePath);
  await fs.copyFile(PROD_STORE_PATH, tmpStorePath);

  check('1.1 temp dir is under os.tmpdir()', tmp.startsWith(os.tmpdir()), tmp);
  check('1.2 temp queue copy sha matches prod',
    (await sha256OfFile(tmpQueuePath)) === prodQueueShaBefore, tmpQueuePath);
  check('1.3 temp store copy sha matches prod',
    (await sha256OfFile(tmpStorePath)) === prodStoreShaBefore, tmpStorePath);

  // The real lead record is taken from the TEMP-COPY of the store (never re-read
  // from production again from here on). Existing key => importer should MERGE.
  const tmpStoreObj = await readJson(tmpStorePath);
  const leadRecord = { ...tmpStoreObj[TARGET_LEAD_KEY] };
  check('1.4 leadRecord carries its lead key', !!leadRecord[TARGET_LEAD_KEY === leadRecord.lead_id ? 'lead_id' : 'lead_id'] || !!leadRecord.lead_id || !!leadRecord.id || !!leadRecord.leadId,
    Object.keys(leadRecord));

  const clock = new Date('2026-06-06T13:20:00.000Z');
  const tmpStoreKeysBefore = Object.keys(tmpStoreObj).length;

  // =====================================================================
  // STEP 2 — DRY-RUN against the TEMP-COPY (must write nothing)
  // =====================================================================
  console.log('');
  console.log('STEP 2 — DRY-RUN (temp-copy, no confirm flags)');
  const dry = await importApprovedCard({
    queuePath: tmpQueuePath,
    leadsStorePath: tmpStorePath,
    importId: TARGET_IMPORT_ID,
    leadRecord,
    clock,
  });
  check('2.1 dry-run status DRY_RUN', dry.status === 'DRY_RUN', dry.status);
  check('2.2 dry-run leads_written false', dry.leads_written === false, dry.leads_written);

  const tmpStoreShaAfterDry = await sha256OfFile(tmpStorePath);
  check('2.3 temp store UNCHANGED after dry-run',
    tmpStoreShaAfterDry === prodStoreShaBefore, tmpStoreShaAfterDry);
  const noBakAfterDry = !(await fileExists(`${tmpStorePath}.bak`));
  check('2.4 NO .bak created during dry-run', noBakAfterDry, `${tmpStorePath}.bak`);

  // =====================================================================
  // STEP 3 — CONFIRMED triple-gated import against the TEMP-COPY
  // =====================================================================
  console.log('');
  console.log('STEP 3 — CONFIRMED import (temp-copy, triple-gated)');
  const res = await importApprovedCard({
    queuePath: tmpQueuePath,
    leadsStorePath: tmpStorePath,
    importId: TARGET_IMPORT_ID,
    leadRecord,
    clock,
    expectedImportId: TARGET_IMPORT_ID,
    allowRealImport: true,
    confirmRealImport: true,
  });
  check('3.1 confirmed ok', res.ok === true, res.status);
  check('3.2 status OK_IMPORTED', res.status === 'OK_IMPORTED', res.status);
  check('3.3 action merged (existing lead key)', res.action === 'merged', res.action);
  check('3.4 store_shape map', res.commit_result && res.commit_result.store_shape === 'map',
    res.commit_result && res.commit_result.store_shape);
  check('3.5 leads_after unchanged count (merge, no dup key)',
    res.leads_after === tmpStoreKeysBefore, [res.leads_after, tmpStoreKeysBefore]);
  check('3.6 snapshot_id present', typeof res.snapshot_id === 'string' && res.snapshot_id.length > 0,
    res.snapshot_id);

  const tmpStoreAfter = await readJson(tmpStorePath);
  check('3.7 temp store still a MAP (not array)', !Array.isArray(tmpStoreAfter), typeof tmpStoreAfter);
  check('3.8 temp store key count preserved',
    Object.keys(tmpStoreAfter).length === tmpStoreKeysBefore, Object.keys(tmpStoreAfter).length);
  check('3.9 target lead still present', !!tmpStoreAfter[TARGET_LEAD_KEY], TARGET_LEAD_KEY);
  check('3.10 imported record carries snapshot_id',
    tmpStoreAfter[TARGET_LEAD_KEY].snapshot_id === res.snapshot_id,
    tmpStoreAfter[TARGET_LEAD_KEY].snapshot_id);

  const tmpBakExists = await fileExists(`${tmpStorePath}.bak`);
  check('3.11 .bak backup created in TEMP', tmpBakExists === true, `${tmpStorePath}.bak`);

  // =====================================================================
  // STEP 4 — PRODUCTION UNTOUCHED (sha256 before == after, both files)
  // =====================================================================
  console.log('');
  console.log('STEP 4 — VERIFY PRODUCTION UNTOUCHED');
  const prodQueueShaAfter = await sha256OfFile(PROD_QUEUE_PATH);
  const prodStoreShaAfter = await sha256OfFile(PROD_STORE_PATH);
  console.log(`  prod queue sha256 (after):  ${prodQueueShaAfter}`);
  console.log(`  prod store sha256 (after):  ${prodStoreShaAfter}`);
  check('4.1 production QUEUE byte-identical (no write)',
    prodQueueShaAfter === prodQueueShaBefore, [prodQueueShaBefore, prodQueueShaAfter]);
  check('4.2 production STORE byte-identical (no write)',
    prodStoreShaAfter === prodStoreShaBefore, [prodStoreShaBefore, prodStoreShaAfter]);
  const prodStoreBakAbsent = !(await fileExists(`${PROD_STORE_PATH}.bak`));
  check('4.3 NO .bak next to production store', prodStoreBakAbsent, `${PROD_STORE_PATH}.bak`);

  // =====================================================================
  // STEP 5 — cleanup temp dir
  // =====================================================================
  await fs.rm(tmp, { recursive: true, force: true });
  check('5.1 temp dir removed', !(await fileExists(tmp)), tmp);

  console.log('');
  console.log(`RESULTS: ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log(`FAILURES: ${failures.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log('ALL PASS — real-store temp-copy dry-run + confirmed import verified; production untouched.');
  }
}

main().catch((err) => {
  console.error('HARNESS ERROR:', err);
  process.exitCode = 1;
});
