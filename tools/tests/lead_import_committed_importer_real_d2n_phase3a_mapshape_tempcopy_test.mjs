/**
 * lead_import_committed_importer_real_d2n_phase3a_mapshape_tempcopy_test.mjs
 * ---------------------------------------------------------------------------
 * D2N Phase 3A — leadRecord + store-shape compatibility fix verification.
 *
 * Verifies the importer's NEW map-shape support (production
 * 13_sales/lead_contacts.json is a lead_id-keyed MAP, not an array / {leads:[]}).
 *
 * SAFETY:
 *   - Writes ONLY into an OS temp directory (os.tmpdir()).
 *   - NEVER touches production leads_master / lead_contacts.json.
 *   - NEVER writes the real approval queue.
 *   - No network, no client contact, no live bot.
 *
 * Run:
 *   node tools/tests/lead_import_committed_importer_real_d2n_phase3a_mapshape_tempcopy_test.mjs
 * ---------------------------------------------------------------------------
 */

'use strict';

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

import {
  importApprovedCard,
  computeSnapshotId,
  getCommittedImporterVersion,
  COMMITTED_IMPORTER_VERSION,
} from '../telegram_gateway/lead_import_committed_importer_real.mjs';

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

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'd2n-phase3a-'));
  return dir;
}

// A minimal APPROVED_BY_DMITRY approval-queue, matching the queue loader shape.
function approvedQueue(importId, textHash) {
  return {
    version: 'lead-intake-approval-queue-v1',
    cards: [
      {
        import_id: importId,
        status: 'APPROVED_BY_DMITRY',
        approved_by: 'Dmitry',
        qa_status: 'PASS',
        text_hash: textHash,
        snapshot_id: null,
      },
    ],
  };
}

async function writeJson(p, obj) {
  await fs.writeFile(p, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

async function readJson(p) {
  return JSON.parse(await fs.readFile(p, 'utf8'));
}

async function main() {
  console.log('D2N Phase 3A — map-shape compatibility temp-copy test');
  console.log(`Importer version: ${getCommittedImporterVersion()}`);
  console.log('');

  // -- V0: version bumped to v2 (carries the fix) -------------------------
  check('V0.1 version getter matches constant',
    getCommittedImporterVersion() === COMMITTED_IMPORTER_VERSION,
    getCommittedImporterVersion());
  check('V0.2 version is d2n-v2 (store-shape fix)',
    /d2n-v2/.test(COMMITTED_IMPORTER_VERSION), COMMITTED_IMPORTER_VERSION);

  const tmp = await makeTempDir();
  const clock = new Date('2026-06-06T12:00:00.000Z');

  // =====================================================================
  // SCENARIO A — MAP store, NEW lead_id (added), shape preserved
  // =====================================================================
  {
    const importId = 'IMP-300001';
    const textHash = 'th-mapadd';
    const queuePath = path.join(tmp, 'queueA.json');
    const storePath = path.join(tmp, 'contactsA.json');

    await writeJson(queuePath, approvedQueue(importId, textHash));
    // Production-like MAP shape keyed by lead_id.
    await writeJson(storePath, {
      'LEAD-existing-1': { lead_id: 'LEAD-existing-1', company: 'Old Co', email: 'old@example.com' },
      'LEAD-existing-2': { lead_id: 'LEAD-existing-2', company: 'Second Co' },
    });

    const leadRecord = { lead_id: 'LEAD-new-A', company: 'New Co', email: 'new@example.com' };

    // DRY-RUN first — must write nothing.
    const dry = await importApprovedCard({
      queuePath, leadsStorePath: storePath, importId, leadRecord, clock,
    });
    check('A.1 dry-run status DRY_RUN', dry.status === 'DRY_RUN', dry.status);
    check('A.2 dry-run leads_written false', dry.leads_written === false, dry.leads_written);
    const afterDry = await readJson(storePath);
    check('A.3 dry-run store unchanged (still 2 keys)',
      Object.keys(afterDry).length === 2, Object.keys(afterDry));
    check('A.4 dry-run store still a map (no leads[] array injected)',
      !Array.isArray(afterDry) && !Array.isArray(afterDry.leads), Object.keys(afterDry));

    // CONFIRMED triple-gated write.
    const res = await importApprovedCard({
      queuePath, leadsStorePath: storePath, importId, leadRecord, clock,
      expectedImportId: importId, allowRealImport: true, confirmRealImport: true,
    });
    check('A.5 confirmed ok', res.ok === true, res.status);
    check('A.6 status OK_IMPORTED', res.status === 'OK_IMPORTED', res.status);
    check('A.7 action added', res.action === 'added', res.action);
    check('A.8 store_shape map', res.commit_result.store_shape === 'map', res.commit_result.store_shape);
    check('A.9 leads_after 3', res.leads_after === 3, res.leads_after);

    const afterWrite = await readJson(storePath);
    check('A.10 store still a MAP (not array)', !Array.isArray(afterWrite), typeof afterWrite);
    check('A.11 store has NO leads[] array key', !Array.isArray(afterWrite.leads), Object.keys(afterWrite));
    check('A.12 new lead under its lead_id key',
      !!afterWrite['LEAD-new-A'] && afterWrite['LEAD-new-A'].company === 'New Co',
      afterWrite['LEAD-new-A']);
    check('A.13 existing keys preserved',
      !!afterWrite['LEAD-existing-1'] && !!afterWrite['LEAD-existing-2'],
      Object.keys(afterWrite));
    check('A.14 imported record carries snapshot_id',
      afterWrite['LEAD-new-A'].snapshot_id === res.snapshot_id,
      afterWrite['LEAD-new-A'].snapshot_id);
    check('A.15 NO injected top-level metadata (updated_at/last_snapshot_id)',
      !('updated_at' in afterWrite) && !('last_snapshot_id' in afterWrite),
      Object.keys(afterWrite));

    // backup created
    const bakExists = await fs.access(`${storePath}.bak`).then(() => true).catch(() => false);
    check('A.16 .bak backup created', bakExists === true, bakExists);
    const bak = await readJson(`${storePath}.bak`);
    check('A.17 .bak preserves pre-write 2 keys', Object.keys(bak).length === 2, Object.keys(bak));
  }

  // =====================================================================
  // SCENARIO B — MAP store, EXISTING lead_id (merged), keys not duplicated
  // =====================================================================
  {
    const importId = 'IMP-300002';
    const textHash = 'th-mapmerge';
    const queuePath = path.join(tmp, 'queueB.json');
    const storePath = path.join(tmp, 'contactsB.json');

    await writeJson(queuePath, approvedQueue(importId, textHash));
    await writeJson(storePath, {
      'LEAD-merge-1': { lead_id: 'LEAD-merge-1', company: 'Existing Co', stage: 'cold' },
    });

    const leadRecord = { lead_id: 'LEAD-merge-1', stage: 'warm', email: 'merge@example.com' };

    const res = await importApprovedCard({
      queuePath, leadsStorePath: storePath, importId, leadRecord, clock,
      expectedImportId: importId, allowRealImport: true, confirmRealImport: true,
    });
    check('B.1 confirmed ok', res.ok === true, res.status);
    check('B.2 action merged', res.action === 'merged', res.action);
    check('B.3 leads_after still 1 (no dup key)', res.leads_after === 1, res.leads_after);

    const after = await readJson(storePath);
    check('B.4 single key retained', Object.keys(after).length === 1, Object.keys(after));
    check('B.5 merged: original field kept', after['LEAD-merge-1'].company === 'Existing Co', after['LEAD-merge-1']);
    check('B.6 merged: new field applied (stage warm)', after['LEAD-merge-1'].stage === 'warm', after['LEAD-merge-1']);
    check('B.7 merged: new email added', after['LEAD-merge-1'].email === 'merge@example.com', after['LEAD-merge-1']);
  }

  // =====================================================================
  // SCENARIO C — MAP store but lead record has NO lead key -> safe refusal
  // =====================================================================
  {
    const importId = 'IMP-300003';
    const textHash = 'th-nokey';
    const queuePath = path.join(tmp, 'queueC.json');
    const storePath = path.join(tmp, 'contactsC.json');

    await writeJson(queuePath, approvedQueue(importId, textHash));
    await writeJson(storePath, {
      'LEAD-only': { lead_id: 'LEAD-only', company: 'Solo Co' },
    });

    const leadRecord = { company: 'No Key Co', email: 'nokey@example.com' }; // no lead_id/id/leadId

    const res = await importApprovedCard({
      queuePath, leadsStorePath: storePath, importId, leadRecord, clock,
      expectedImportId: importId, allowRealImport: true, confirmRealImport: true,
    });
    check('C.1 refused with FAIL_MAP_STORE_REQUIRES_LEAD_KEY',
      res.status === 'FAIL_MAP_STORE_REQUIRES_LEAD_KEY', res.status);
    check('C.2 not ok', res.ok === false, res.ok);
    check('C.3 leads_written false', res.leads_written === false, res.leads_written);

    const after = await readJson(storePath);
    check('C.4 store unchanged (still single original key)',
      Object.keys(after).length === 1 && !!after['LEAD-only'], Object.keys(after));
    const bakExists = await fs.access(`${storePath}.bak`).then(() => true).catch(() => false);
    check('C.5 NO .bak created (refused before write)', bakExists === false, bakExists);
  }

  // =====================================================================
  // SCENARIO D — REGRESSION: legacy {leads:[]} shape still works
  // =====================================================================
  {
    const importId = 'IMP-300004';
    const textHash = 'th-legacy';
    const queuePath = path.join(tmp, 'queueD.json');
    const storePath = path.join(tmp, 'contactsD.json');

    await writeJson(queuePath, approvedQueue(importId, textHash));
    await writeJson(storePath, { leads: [{ lead_id: 'LEAD-leg-1', company: 'Legacy Co' }] });

    const leadRecord = { lead_id: 'LEAD-leg-2', company: 'Legacy New' };

    const res = await importApprovedCard({
      queuePath, leadsStorePath: storePath, importId, leadRecord, clock,
      expectedImportId: importId, allowRealImport: true, confirmRealImport: true,
    });
    check('D.1 legacy confirmed ok', res.ok === true, res.status);
    check('D.2 store_shape leaves', res.commit_result.store_shape === 'leaves', res.commit_result.store_shape);
    check('D.3 leads_after 2', res.leads_after === 2, res.leads_after);

    const after = await readJson(storePath);
    check('D.4 still {leads:[]} array shape', Array.isArray(after.leads), typeof after.leads);
    check('D.5 array now has 2 leads', after.leads.length === 2, after.leads.length);
  }

  // =====================================================================
  // SCENARIO E — REGRESSION: bare array shape still works
  // =====================================================================
  {
    const importId = 'IMP-300005';
    const textHash = 'th-array';
    const queuePath = path.join(tmp, 'queueE.json');
    const storePath = path.join(tmp, 'contactsE.json');

    await writeJson(queuePath, approvedQueue(importId, textHash));
    await writeJson(storePath, [{ lead_id: 'LEAD-arr-1', company: 'Array Co' }]);

    const leadRecord = { lead_id: 'LEAD-arr-2', company: 'Array New' };

    const res = await importApprovedCard({
      queuePath, leadsStorePath: storePath, importId, leadRecord, clock,
      expectedImportId: importId, allowRealImport: true, confirmRealImport: true,
    });
    check('E.1 array confirmed ok', res.ok === true, res.status);
    check('E.2 store_shape array', res.commit_result.store_shape === 'array', res.commit_result.store_shape);
    check('E.3 leads_after 2', res.leads_after === 2, res.leads_after);

    const after = await readJson(storePath);
    check('E.4 still bare array', Array.isArray(after), typeof after);
    check('E.5 array now has 2 entries', after.length === 2, after.length);
  }

  // =====================================================================
  // SCENARIO F — snapshot_id determinism preserved across the fix
  // =====================================================================
  {
    const importId = 'IMP-300006';
    const textHash = 'th-det';
    const leadRecord = { lead_id: 'LEAD-det', company: 'Det Co' };
    const s1 = computeSnapshotId({ importId, textHash, leadRecord });
    const s2 = computeSnapshotId({ importId, textHash, leadRecord });
    check('F.1 snapshot deterministic', s1 === s2, [s1, s2]);
    check('F.2 snapshot format SNAP-<suffix>-<hash>', /^SNAP-300006-[0-9a-f]{10}$/.test(s1), s1);
  }

  // -- cleanup temp dir -----------------------------------------------------
  await fs.rm(tmp, { recursive: true, force: true });

  console.log('');
  console.log(`RESULTS: ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log(`FAILURES: ${failures.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log('ALL PASS — map-shape compatibility fix verified (temp-copy only).');
  }
}

main().catch((err) => {
  console.error('TEST HARNESS ERROR:', err);
  process.exitCode = 1;
});
