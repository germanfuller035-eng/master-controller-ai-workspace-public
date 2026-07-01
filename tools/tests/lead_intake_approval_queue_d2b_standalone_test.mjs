/**
 * lead_intake_approval_queue_d2b_standalone_test.mjs
 *
 * Daily Lead Factory — D2b — Standalone test for lead_intake_approval_queue.mjs
 *
 * WHAT THIS TEST IS:
 *   A self-contained verification harness for the standalone approval-queue
 *   module (tools/telegram_gateway/lead_intake_approval_queue.mjs).
 *
 * HARD SAFETY CONTRACT — what this test DOES NOT do:
 *   - No network. No HTTP/fetch. No site scanning.
 *   - No SMTP. No email/Telegram/WhatsApp send.
 *   - No Telegram API. No bot integration. No bot file touched.
 *   - No .env / AI_SECRETS / tokens reads.
 *   - No real import. No real 13_sales write. The queue store lives ONLY in a
 *     throwaway tmp directory created + removed by this test.
 *
 * Run:
 *   node --check tools/tests/lead_intake_approval_queue_d2b_standalone_test.mjs
 *   node tools/tests/lead_intake_approval_queue_d2b_standalone_test.mjs
 */

'use strict';

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

import {
  getApprovalQueueVersion,
  getDefaultApprovalQueuePath,
  hashText,
  generateImportId,
  buildApprovalCard,
  loadApprovalQueue,
  addApprovalCard,
  findCard,
  listCards,
  listPendingCards,
  approveCard,
  cancelCard,
  markCommitted,
  markFailed,
  canCommit,
  buildApprovalQueueSummary,
  CardStatus,
} from '../telegram_gateway/lead_intake_approval_queue.mjs';

// ---------------------------------------------------------------------------
// Tiny assertion harness (no external deps)
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function ok(condition, label) {
  if (condition) {
    passed += 1;
    console.log(`  PASS: ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  FAIL: ${label}`);
  }
}

function eq(actual, expected, label) {
  ok(actual === expected, `${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

async function run() {
  console.log('lead_intake_approval_queue D2b standalone test');
  console.log('==============================================');

  // Throwaway sandbox store — never touches real 13_sales data.
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'd2b_approval_queue_'));
  const storePath = path.join(tmpDir, 'lead_import_approvals.json');
  console.log(`  store (tmp): ${storePath}`);

  try {
    // --- Scenario 1: version + default path ------------------------------
    console.log('\n[1] version + default path');
    const version = getApprovalQueueVersion();
    ok(typeof version === 'string' && version.length > 0, `version is non-empty string: ${JSON.stringify(version)}`);
    const defPath = getDefaultApprovalQueuePath();
    ok(defPath.includes('approval_queue'), 'default path points at approval_queue');
    ok(defPath !== storePath, 'default real path is NOT the tmp store (no real write)');

    // --- Scenario 2: hashText + generateImportId -------------------------
    console.log('\n[2] hashText + generateImportId');
    const h1 = hashText('Acme | acme.ru');
    eq(hashText('Acme | acme.ru'), h1, 'hashText is deterministic');
    ok(/^[0-9a-f]{64}$/.test(h1), 'hashText is 64-hex');
    const id1 = generateImportId('Acme | acme.ru');
    const id2 = generateImportId('Acme | acme.ru');
    ok(/^IMP-\d{8}-\d{6}-[0-9a-f]{6}$/.test(id1), `import_id shape ok: ${id1}`);
    ok(id1 !== id2, 'two ids for same text are still unique');

    // --- Scenario 3: buildApprovalCard pure shape ------------------------
    console.log('\n[3] buildApprovalCard pure shape');
    const card = buildApprovalCard({
      text: 'Acme | acme.ru',
      source: 'test',
      parsed_count: 1,
      valid_count: 1,
      added_count: 1,
      qa_status: 'PASS',
    });
    eq(card.status, CardStatus.PENDING, 'new card is PENDING');
    eq(card.approved_by, null, 'new card has no approver');
    eq(card.safety.auto_send, 'BLOCKED', 'card safety auto_send BLOCKED');
    ok(Array.isArray(card.history) && card.history.length === 1, 'card has initial history entry');
    eq(buildApprovalCard({ qa_status: 'NONSENSE' }).qa_status, 'FAIL', 'invalid qa_status coerced to FAIL');

    // --- Scenario 4: empty store loads as empty --------------------------
    console.log('\n[4] empty store loads as empty');
    const empty = await loadApprovalQueue(storePath);
    eq(empty.exists, false, 'store does not exist yet');
    ok(Array.isArray(empty.cards) && empty.cards.length === 0, 'empty cards array');

    // --- Scenario 5: addApprovalCard persists PENDING --------------------
    console.log('\n[5] addApprovalCard persists PENDING');
    const add = await addApprovalCard(storePath, {
      text: 'Acme | acme.ru',
      source: 'test',
      parsed_count: 2,
      valid_count: 2,
      added_count: 2,
      qa_status: 'PASS',
    });
    ok(add.ok === true, 'add ok');
    eq(add.status, CardStatus.PENDING, 'added card PENDING');
    const importId = add.card.import_id;
    const afterAdd = await loadApprovalQueue(storePath);
    eq(afterAdd.exists, true, 'store now exists');
    eq(listCards(afterAdd).length, 1, 'one card persisted');
    eq(listPendingCards(afterAdd).length, 1, 'one PENDING card');
    ok(findCard(afterAdd, importId) !== null, 'findCard locates the card');

    // --- Scenario 6: duplicate import_id refused -------------------------
    console.log('\n[6] duplicate import_id refused');
    const dup = await addApprovalCard(storePath, { import_id: importId, added_count: 1 });
    ok(dup.ok === false, 'duplicate add not ok');
    eq(dup.status, 'DUPLICATE_IMPORT_ID', 'duplicate -> DUPLICATE_IMPORT_ID');

    // --- Scenario 7: canCommit refuses a PENDING card --------------------
    console.log('\n[7] canCommit refuses a PENDING card');
    const gatePending = canCommit(findCard(afterAdd, importId));
    ok(gatePending.ok === false, 'PENDING cannot commit');
    ok(gatePending.reasons.some((r) => r.includes('APPROVED_BY_DMITRY')), 'reason mentions approval requirement');

    // --- Scenario 8: approve requires Dmitry -----------------------------
    console.log('\n[8] approve requires Dmitry');
    const badApprove = await approveCard(storePath, importId, { approved_by: 'SomeoneElse' });
    ok(badApprove.ok === false, 'non-Dmitry approval refused');
    eq(badApprove.status, 'APPROVER_NOT_ALLOWED', 'non-Dmitry -> APPROVER_NOT_ALLOWED');

    const approve = await approveCard(storePath, importId);
    ok(approve.ok === true, 'Dmitry approval ok');
    eq(approve.status, CardStatus.APPROVED_BY_DMITRY, 'card APPROVED_BY_DMITRY');
    eq(approve.card.approved_by, 'Dmitry', 'approved_by = Dmitry');

    // --- Scenario 9: canCommit passes after approval ---------------------
    console.log('\n[9] canCommit passes after approval');
    const afterApprove = await loadApprovalQueue(storePath);
    const gateApproved = canCommit(findCard(afterApprove, importId));
    ok(gateApproved.ok === true, `approved card may commit (reasons: ${JSON.stringify(gateApproved.reasons)})`);

    // --- Scenario 10: markCommitted requires snapshot_id -----------------
    console.log('\n[10] markCommitted requires snapshot_id');
    const noSnap = await markCommitted(storePath, importId);
    ok(noSnap.ok === false, 'commit without snapshot refused');
    eq(noSnap.status, 'SNAPSHOT_REQUIRED', 'no snapshot -> SNAPSHOT_REQUIRED');

    const committed = await markCommitted(storePath, importId, { snapshot_id: 'SNAP-TEST-0001' });
    ok(committed.ok === true, 'commit with snapshot ok');
    eq(committed.status, CardStatus.COMMITTED, 'card COMMITTED');
    eq(committed.card.snapshot_id, 'SNAP-TEST-0001', 'snapshot recorded');

    // --- Scenario 11: cannot cancel a COMMITTED card ---------------------
    console.log('\n[11] cannot cancel a COMMITTED card');
    const cancelCommitted = await cancelCard(storePath, importId, { reason: 'oops' });
    ok(cancelCommitted.ok === false, 'cancel of COMMITTED refused');
    eq(cancelCommitted.status, 'INVALID_TRANSITION', 'cancel COMMITTED -> INVALID_TRANSITION');

    // --- Scenario 12: cancel a fresh PENDING card ------------------------
    console.log('\n[12] cancel a fresh PENDING card');
    const add2 = await addApprovalCard(storePath, { text: 'Beta | beta.ru', added_count: 1, qa_status: 'PASS' });
    const cancel = await cancelCard(storePath, add2.card.import_id, { reason: 'duplicate lead' });
    ok(cancel.ok === true, 'cancel PENDING ok');
    eq(cancel.status, CardStatus.CANCELLED, 'card CANCELLED');

    // --- Scenario 13: markFailed (rollback) of COMMITTED -----------------
    console.log('\n[13] markFailed (rollback) of COMMITTED');
    const failedRes = await markFailed(storePath, importId, { reason: 'rolled back' });
    ok(failedRes.ok === true, 'markFailed of COMMITTED ok (rollback)');
    eq(failedRes.status, CardStatus.FAILED, 'card FAILED');

    // --- Scenario 14: NOT_FOUND on unknown import_id ---------------------
    console.log('\n[14] NOT_FOUND on unknown import_id');
    const notFound = await approveCard(storePath, 'IMP-00000000-000000-deadbe');
    ok(notFound.ok === false, 'unknown id not ok');
    eq(notFound.status, 'NOT_FOUND', 'unknown id -> NOT_FOUND');

    // --- Scenario 15: summary counts + safety ----------------------------
    console.log('\n[15] summary counts + safety');
    const finalQueue = await loadApprovalQueue(storePath);
    const summary = buildApprovalQueueSummary(finalQueue);
    eq(summary.counts.total, 2, 'summary total = 2');
    eq(summary.counts.failed, 1, 'summary failed = 1');
    eq(summary.counts.cancelled, 1, 'summary cancelled = 1');
    eq(summary.real_data_changed, false, 'summary real_data_changed = false');
    eq(summary.writes_lead_data, 'NO', 'summary writes_lead_data = NO');
    eq(summary.runs_import, 'NO', 'summary runs_import = NO');
    eq(summary.safety.telegram_send, 'BLOCKED', 'safety telegram_send BLOCKED');
    eq(summary.safety.email_send, 'BLOCKED', 'safety email_send BLOCKED');
    eq(summary.safety.env_secrets, 'NO', 'safety env_secrets NO');
    eq(summary.safety.bot_integration, 'NO', 'safety bot_integration NO');

    // --- Scenario 16: canCommit rejects zero-write & FAIL qa -------------
    console.log('\n[16] canCommit rejects zero-write & FAIL qa');
    const zeroWrite = canCommit({
      status: CardStatus.APPROVED_BY_DMITRY,
      approved_by: 'Dmitry',
      qa_status: 'PASS',
      safety: { auto_send: 'BLOCKED' },
      added_count: 0,
      merged_count: 0,
    });
    ok(zeroWrite.ok === false, 'zero-write card cannot commit');
    const failQa = canCommit({
      status: CardStatus.APPROVED_BY_DMITRY,
      approved_by: 'Dmitry',
      qa_status: 'FAIL',
      safety: { auto_send: 'BLOCKED' },
      added_count: 5,
      merged_count: 0,
    });
    ok(failQa.ok === false, 'FAIL qa card cannot commit');
  } finally {
    // Clean up the throwaway tmp store.
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
      console.log(`\n  cleaned up tmp store: ${tmpDir}`);
    } catch (e) {
      console.log(`\n  WARN: could not remove tmp dir ${tmpDir}: ${e && e.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Final report
  // ---------------------------------------------------------------------------
  console.log('\n==============================================');
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('FAILED CHECKS:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log('safety: no network | no SMTP | no Telegram API | no .env/AI_SECRETS | no real 13_sales write | tmp store only | no import run');

  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('FATAL test harness error:', err && err.stack ? err.stack : err);
  process.exit(1);
});
