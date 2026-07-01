/**
 * _d2n_phase3c_run_real_commit_once.mjs
 * ---------------------------------------------------------------------------
 * D2N Phase 3C — CONTROLLED PRODUCTION COMMIT (one-shot, explicitly authorized).
 *
 * Authorization (Dmitry, 2026-06-06):
 *   "Подтверждаю D2N Phase 3C controlled production commit: разрешаю однократно
 *    выполнить real import/commit для карточки IMP-20260606-100554-941263 в
 *    production 13_sales/lead_contacts.json и записать COMMITTED в production
 *    approval queue. Без client contact, без auto-send, без live bot patch."
 *
 * What this runner does (ONCE):
 *   1. READ production approval queue + production lead_contacts.json.
 *   2. Capture sha256 of both BEFORE.
 *   3. Extract the real lead record (DLF-20260603-0001) from the production store.
 *   4. importApprovedCard(...) triple-gated -> writes lead_contacts.json (+ .bak).
 *   5. recordCommit(...) triple-gated -> stamps COMMITTED into the queue (+ .bak).
 *   6. Re-read + verify: store snapshot stamped, card COMMITTED, sha changed.
 *
 * HARD SAFETY ENVELOPE (unchanged from validated tools):
 *   - NO client contact. NO network/HTTP/SMTP/Telegram/WhatsApp/MAX send.
 *   - NO auto-send. NO live bot patch / restart. NO .env / secrets reads.
 *   - Writes ONLY the two named production files (+ their .bak/.tmp).
 *   - Targets EXACTLY import_id IMP-20260606-100554-941263; refuses any other.
 * ---------------------------------------------------------------------------
 */

'use strict';

import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

import {
  importApprovedCard,
  getCommittedImporterVersion,
} from './lead_import_committed_importer_real.mjs';
import {
  recordCommit,
  getCommitRecorderVersion,
} from './lead_import_commit_recorder_real.mjs';

const PROD_QUEUE_PATH = path.resolve('D:/AI_WORKSPACE/13_sales/approval_queue/lead_import_approvals.json');
const PROD_STORE_PATH = path.resolve('D:/AI_WORKSPACE/13_sales/lead_contacts.json');

const TARGET_IMPORT_ID = 'IMP-20260606-100554-941263';
const TARGET_LEAD_KEY = 'DLF-20260603-0001';

async function sha256OfFile(p) {
  const buf = await fs.readFile(p);
  return crypto.createHash('sha256').update(buf).digest('hex');
}
async function readJson(p) {
  return JSON.parse(await fs.readFile(p, 'utf8'));
}

async function main() {
  console.log('=== D2N Phase 3C — CONTROLLED PRODUCTION COMMIT (one-shot) ===');
  console.log(`importer: ${getCommittedImporterVersion()}`);
  console.log(`recorder: ${getCommitRecorderVersion()}`);
  console.log('');

  // --- BEFORE fingerprints ---
  const queueShaBefore = await sha256OfFile(PROD_QUEUE_PATH);
  const storeShaBefore = await sha256OfFile(PROD_STORE_PATH);
  console.log(`prod queue sha256 (before): ${queueShaBefore}`);
  console.log(`prod store sha256 (before): ${storeShaBefore}`);

  const storeBefore = await readJson(PROD_STORE_PATH);
  const storeKeysBefore = Object.keys(storeBefore).length;
  if (!storeBefore[TARGET_LEAD_KEY]) {
    console.error(`ABORT: target lead key ${TARGET_LEAD_KEY} not present in production store.`);
    process.exitCode = 1;
    return;
  }
  const leadRecord = { ...storeBefore[TARGET_LEAD_KEY] };
  console.log(`store keys before: ${storeKeysBefore}; target lead present: yes`);
  console.log('');

  // =====================================================================
  // STEP 1 — REAL IMPORT (triple-gated) into production lead_contacts.json
  // =====================================================================
  console.log('STEP 1 — REAL IMPORT (triple-gated) -> production lead_contacts.json');
  const importRes = await importApprovedCard({
    queuePath: PROD_QUEUE_PATH,
    leadsStorePath: PROD_STORE_PATH,
    importId: TARGET_IMPORT_ID,
    leadRecord,
    expectedImportId: TARGET_IMPORT_ID,
    allowRealImport: true,
    confirmRealImport: true,
  });
  console.log(`  status: ${importRes.status} | ok: ${importRes.ok} | action: ${importRes.action}`);
  console.log(`  snapshot_id: ${importRes.snapshot_id}`);
  console.log(`  backup_file: ${importRes.backup_file}`);
  console.log(`  leads_after: ${importRes.leads_after}`);
  if (!importRes.ok || importRes.status !== 'OK_IMPORTED') {
    console.error('ABORT: importer did not return OK_IMPORTED. Queue NOT touched.');
    process.exitCode = 1;
    return;
  }

  // =====================================================================
  // STEP 2 — RECORD COMMITTED (triple-gated) into production queue
  // =====================================================================
  console.log('');
  console.log('STEP 2 — RECORD COMMITTED (triple-gated) -> production approval queue');
  const recRes = await recordCommit({
    queuePath: PROD_QUEUE_PATH,
    importerResult: importRes,
    leadRecord,
    expectedImportId: TARGET_IMPORT_ID,
    allowCommit: true,
    confirmCommit: true,
    committedBy: 'Dmitry',
  });
  console.log(`  status: ${recRes.status} | ok: ${recRes.ok}`);
  console.log(`  card ${recRes.card_status_before} -> ${recRes.card_status_after}`);
  console.log(`  snapshot_id: ${recRes.snapshot_id}`);
  console.log(`  backup_file: ${recRes.backup_file}`);
  console.log(`  committed_at: ${recRes.committed_at} by ${recRes.committed_by}`);

  // =====================================================================
  // STEP 3 — VERIFY post-commit state
  // =====================================================================
  console.log('');
  console.log('STEP 3 — VERIFY');
  const queueShaAfter = await sha256OfFile(PROD_QUEUE_PATH);
  const storeShaAfter = await sha256OfFile(PROD_STORE_PATH);
  console.log(`prod queue sha256 (after):  ${queueShaAfter}`);
  console.log(`prod store sha256 (after):  ${storeShaAfter}`);

  const storeAfter = await readJson(PROD_STORE_PATH);
  const queueAfter = await readJson(PROD_QUEUE_PATH);
  const cardAfter = (queueAfter.cards || []).find((c) => c.import_id === TARGET_IMPORT_ID);
  const leadAfter = storeAfter[TARGET_LEAD_KEY];

  const checks = [
    ['import OK_IMPORTED', importRes.status === 'OK_IMPORTED'],
    ['record OK_RECORDED', recRes.status === 'OK_RECORDED'],
    ['store changed (sha differs)', storeShaAfter !== storeShaBefore],
    ['queue changed (sha differs)', queueShaAfter !== queueShaBefore],
    ['store key count preserved (merge)', Object.keys(storeAfter).length === storeKeysBefore],
    ['lead stamped snapshot_id', leadAfter && leadAfter.snapshot_id === importRes.snapshot_id],
    ['card status COMMITTED', cardAfter && cardAfter.status === 'COMMITTED'],
    ['card snapshot_id matches', cardAfter && cardAfter.snapshot_id === importRes.snapshot_id],
    ['card committed_by Dmitry', cardAfter && cardAfter.committed_by === 'Dmitry'],
    ['card needs_review_count preserved (1)', cardAfter && cardAfter.needs_review_count === 1],
  ];
  let allPass = true;
  for (const [name, cond] of checks) {
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`);
    if (!cond) allPass = false;
  }

  console.log('');
  console.log(allPass
    ? 'ALL PASS — production commit complete; card COMMITTED; lead snapshot stamped.'
    : 'FAILURES present — review output above.');
  if (!allPass) process.exitCode = 1;
}

main().catch((err) => {
  console.error('RUN ERROR:', err);
  process.exitCode = 1;
});
