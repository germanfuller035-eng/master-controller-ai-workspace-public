/**
 * lead_import_committed_importer_real_d2o_final_regression_harness.mjs
 * ---------------------------------------------------------------------------
 * D2O — FINAL regression / rollback / checkpoint (READ-ONLY + TEMP-COPY).
 *
 * Scope confirmed by Dmitry (D2O final regression / rollback / checkpoint):
 *   - READ-ONLY inspect of production state (approval queue + lead store);
 *   - run ONLY read-only / temp-copy regression checks;
 *   - NO production write, NO real import, NO queue write, NO client contact,
 *     NO auto-send, NO live bot patch.
 *
 * What this harness asserts:
 *   STEP 0  Production baseline integrity (sha256 + structural invariants),
 *           confirming the D2N Phase 3C committed state is intact.
 *   STEP 1  ROLLBACK artifact present + valid: lead_contacts.json.bak exists,
 *           parses, is the pre-commit MAP (does NOT carry the new snapshot_id),
 *           and the live store DOES carry the new snapshot_id. So a rollback
 *           (restore .bak) would cleanly revert the single committed lead.
 *   STEP 2  IDEMPOTENCY / double-import guard (TEMP-COPY): copy the production
 *           queue + store into os.tmpdir(); re-run importApprovedCard against
 *           the temp-copy with FULL triple-gate. Because the card is now
 *           COMMITTED (snapshot_id set), the importer MUST refuse with
 *           FAIL_PREFLIGHT_GATE and write NOTHING — proving no accidental
 *           re-import is possible.
 *   STEP 3  PRODUCTION UNTOUCHED: both production files byte-identical
 *           (sha256 before == after); no stray .tmp; temp dir removed.
 *
 * HARD SAFETY ENVELOPE:
 *   - NO production write (asserted via sha256 before == after).
 *   - NO real import (the only write attempt targets a temp-copy and is refused).
 *   - NO queue write. NO client contact. NO network. NO live bot patch.
 *   - All copies/writes land strictly inside os.tmpdir()/<mkdtemp>.
 *
 * Run:
 *   node tools/tests/lead_import_committed_importer_real_d2o_final_regression_harness.mjs
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
const PROD_STORE_BAK_PATH = `${PROD_STORE_PATH}.bak`;

// The single card committed in D2N Phase 3C (Завод АТОМ, lead DLF-20260603-0001).
const TARGET_IMPORT_ID = 'IMP-20260606-100554-941263';
const TARGET_LEAD_KEY = 'DLF-20260603-0001';
const EXPECTED_SNAPSHOT_ID = 'SNAP-941263-631e04cdbf';

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
  console.log('D2O — FINAL regression / rollback / checkpoint (READ-ONLY + TEMP-COPY)');
  console.log(`Importer version: ${getCommittedImporterVersion()} (${COMMITTED_IMPORTER_VERSION})`);
  console.log('');

  // =====================================================================
  // STEP 0 — production baseline integrity (read-only)
  // =====================================================================
  console.log('STEP 0 — production baseline integrity (read-only)');
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
  check('0.4 target card status COMMITTED',
    !!targetCard && targetCard.status === 'COMMITTED', targetCard && targetCard.status);
  check('0.5 target card carries expected snapshot_id',
    !!targetCard && targetCard.snapshot_id === EXPECTED_SNAPSHOT_ID,
    targetCard && targetCard.snapshot_id);
  check('0.6 target card approved_by Dmitry',
    !!targetCard && targetCard.approved_by === 'Dmitry', targetCard && targetCard.approved_by);

  const storeIsMap = !Array.isArray(prodStore) && !Array.isArray(prodStore.leads);
  check('0.7 production store is a lead_id-keyed MAP', storeIsMap, typeof prodStore);
  check('0.8 target lead key present in production store',
    storeIsMap && !!prodStore[TARGET_LEAD_KEY], TARGET_LEAD_KEY);
  check('0.9 production lead carries the committed snapshot_id',
    storeIsMap && prodStore[TARGET_LEAD_KEY] &&
    prodStore[TARGET_LEAD_KEY].snapshot_id === EXPECTED_SNAPSHOT_ID,
    storeIsMap && prodStore[TARGET_LEAD_KEY] && prodStore[TARGET_LEAD_KEY].snapshot_id);

  const prodLeadCount = storeIsMap ? Object.keys(prodStore).length : -1;
  check('0.10 production store has 7 leads (post-3C count)', prodLeadCount === 7, prodLeadCount);

  // =====================================================================
  // STEP 1 — ROLLBACK artifact present + valid (read-only)
  // =====================================================================
  console.log('');
  console.log('STEP 1 — rollback artifact (.bak) validity (read-only)');
  const bakExists = await fileExists(PROD_STORE_BAK_PATH);
  check('1.1 lead_contacts.json.bak exists (rollback point)', bakExists, PROD_STORE_BAK_PATH);

  let bakStore = null;
  if (bakExists) {
    try {
      bakStore = await readJson(PROD_STORE_BAK_PATH);
      check('1.2 .bak parses as JSON', true);
    } catch (e) {
      check('1.2 .bak parses as JSON', false, e.message);
    }
  }
  const bakIsMap = bakStore && !Array.isArray(bakStore) && !Array.isArray(bakStore.leads);
  check('1.3 .bak is a lead_id-keyed MAP', !!bakIsMap, typeof bakStore);

  // The .bak is the PRE-commit snapshot: target lead present but WITHOUT the
  // new snapshot_id (or absent entirely). Either way, restoring it reverts the
  // committed change cleanly.
  const bakTargetRec = bakIsMap ? bakStore[TARGET_LEAD_KEY] : undefined;
  const bakHasNewSnap = !!(bakTargetRec && bakTargetRec.snapshot_id === EXPECTED_SNAPSHOT_ID);
  check('1.4 .bak does NOT yet carry the committed snapshot_id (true rollback point)',
    !bakHasNewSnap, bakTargetRec && bakTargetRec.snapshot_id);
  check('1.5 live store DOES carry the snapshot_id (delta confirmed vs .bak)',
    storeIsMap && prodStore[TARGET_LEAD_KEY] &&
    prodStore[TARGET_LEAD_KEY].snapshot_id === EXPECTED_SNAPSHOT_ID,
    storeIsMap && prodStore[TARGET_LEAD_KEY] && prodStore[TARGET_LEAD_KEY].snapshot_id);

  // =====================================================================
  // STEP 2 — IDEMPOTENCY / double-import guard (TEMP-COPY, full triple gate)
  // =====================================================================
  console.log('');
  console.log('STEP 2 — idempotency / double-import guard (temp-copy, triple-gated)');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'd2o-regression-'));
  const tmpQueuePath = path.join(tmp, 'queue_copy.json');
  const tmpStorePath = path.join(tmp, 'lead_contacts_copy.json');

  await fs.copyFile(PROD_QUEUE_PATH, tmpQueuePath);
  await fs.copyFile(PROD_STORE_PATH, tmpStorePath);

  check('2.1 temp dir under os.tmpdir()', tmp.startsWith(os.tmpdir()), tmp);
  const tmpStoreShaBefore = await sha256OfFile(tmpStorePath);
  check('2.2 temp store copy sha matches prod',
    tmpStoreShaBefore === prodStoreShaBefore, tmpStorePath);

  // Reconstruct the same lead record the committed lead carries (from temp-copy).
  const tmpStoreObj = await readJson(tmpStorePath);
  const leadRecord = { ...tmpStoreObj[TARGET_LEAD_KEY] };

  // Attempt a FULL triple-gated re-import against the temp-copy. Because the
  // card is COMMITTED (snapshot_id set), the importer MUST refuse at preflight.
  const res = await importApprovedCard({
    queuePath: tmpQueuePath,
    leadsStorePath: tmpStorePath,
    importId: TARGET_IMPORT_ID,
    leadRecord,
    clock: new Date('2026-06-06T14:10:00.000Z'),
    expectedImportId: TARGET_IMPORT_ID,
    allowRealImport: true,
    confirmRealImport: true,
  });
  check('2.3 re-import REFUSED ok:false', res.ok === false, res.ok);
  check('2.4 status FAIL_PREFLIGHT_GATE', res.status === 'FAIL_PREFLIGHT_GATE', res.status);
  check('2.5 gate cites already-committed',
    Array.isArray(res.gate_failures) &&
    res.gate_failures.some((g) => /already committed|snapshot/i.test(g)),
    res.gate_failures);
  check('2.6 leads_written false (no temp write)', res.leads_written === false, res.leads_written);
  check('2.7 real_data_changed false', res.real_data_changed === false, res.real_data_changed);

  const tmpStoreShaAfter = await sha256OfFile(tmpStorePath);
  check('2.8 temp store UNCHANGED (refused write touched nothing)',
    tmpStoreShaAfter === tmpStoreShaBefore, tmpStoreShaAfter);
  const noTmpBak = !(await fileExists(`${tmpStorePath}.bak`));
  check('2.9 NO .bak created in temp during refused import', noTmpBak, `${tmpStorePath}.bak`);

  // =====================================================================
  // STEP 3 — PRODUCTION UNTOUCHED + cleanup
  // =====================================================================
  console.log('');
  console.log('STEP 3 — verify production untouched + cleanup');
  const prodQueueShaAfter = await sha256OfFile(PROD_QUEUE_PATH);
  const prodStoreShaAfter = await sha256OfFile(PROD_STORE_PATH);
  console.log(`  prod queue sha256 (after):  ${prodQueueShaAfter}`);
  console.log(`  prod store sha256 (after):  ${prodStoreShaAfter}`);
  check('3.1 production QUEUE byte-identical (no write)',
    prodQueueShaAfter === prodQueueShaBefore, [prodQueueShaBefore, prodQueueShaAfter]);
  check('3.2 production STORE byte-identical (no write)',
    prodStoreShaAfter === prodStoreShaBefore, [prodStoreShaBefore, prodStoreShaAfter]);
  const noProdTmp = !(await fileExists(`${PROD_STORE_PATH}.tmp`));
  check('3.3 no stray .tmp next to production store', noProdTmp, `${PROD_STORE_PATH}.tmp`);

  await fs.rm(tmp, { recursive: true, force: true });
  check('3.4 temp dir removed', !(await fileExists(tmp)), tmp);

  console.log('');
  console.log(`RESULTS: ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log(`FAILURES: ${failures.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log('ALL PASS — D2O regression green: baseline intact, rollback point valid, double-import refused, production untouched.');
  }
}

main().catch((err) => {
  console.error('HARNESS ERROR:', err);
  process.exitCode = 1;
});
