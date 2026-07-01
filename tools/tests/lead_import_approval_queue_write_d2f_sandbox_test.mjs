/**
 * lead_import_approval_queue_write_d2f_sandbox_test.mjs
 *
 * Daily Lead Factory — D2F — Standalone SANDBOX test for the queue-WRITE module.
 *
 * HARD SAFETY CONTRACT (mirrors the module under test):
 *   - NO real import. Approving only flips a queue card state.
 *   - NO client contact / auto_send / external send.
 *   - NO live bot patch. NO Telegram API. NO bot import / touch.
 *   - NO SMTP / email / network / fetch.
 *   - NO .env / AI_SECRETS reads.
 *   - NO writes to real 13_sales lead data.
 *   - Queue writes happen ONLY inside the tmp sandbox.
 *
 * Everything happens inside an isolated sandbox under:
 *   tmp/lead_import_approval_queue_write_d2f_workspace/
 *
 * This file is the ONLY artifact produced by the task. It creates no probe
 * files and touches nothing outside its own sandbox.
 *
 * Run:
 *   node --check tools/tests/lead_import_approval_queue_write_d2f_sandbox_test.mjs
 *   node tools/tests/lead_import_approval_queue_write_d2f_sandbox_test.mjs
 */

'use strict';

import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  getQueueWriteVersion,
  isSandboxQueuePath,
  applyApprovalDecision,
  handleLeadImportApprovalQueueWriteCommand,
} from '../telegram_gateway/lead_import_approval_queue_write.mjs';

import {
  addApprovalCard,
  loadApprovalQueue,
  findCard,
} from '../telegram_gateway/lead_intake_approval_queue.mjs';

// ---------------------------------------------------------------------------
// Paths (all sandbox lives under tmp/, never touches real data)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');

const SANDBOX_DIR = path.join(
  WORKSPACE_ROOT,
  'tmp',
  'lead_import_approval_queue_write_d2f_workspace'
);
const QUEUE_DIR = path.join(SANDBOX_DIR, 'approval_queue');
const QUEUE_FILE = path.join(QUEUE_DIR, 'lead_import_approvals.json');

// A simulated REAL (non-tmp) queue path — used only to assert the write is
// BLOCKED. The file is NEVER created because the block trips before any IO.
const FAKE_REAL_QUEUE = path.join(
  WORKSPACE_ROOT,
  '13_sales',
  'approval_queue',
  '__d2f_test_should_never_exist__.json'
);

// ---------------------------------------------------------------------------
// Tiny test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push({ name, detail: detail || null });
    console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`);
  }
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function seedPendingCard(importId) {
  const res = await addApprovalCard(QUEUE_FILE, {
    import_id: importId,
    source: 'lead_import_prepare',
    text: `sandbox-${importId}`,
    parsed_count: 3,
    valid_count: 3,
    added_count: 2,
    merged_count: 1,
    needs_review_count: 0,
    qa_status: 'PASS',
  });
  return res;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== D2F queue-write sandbox test ===\n');

  // Fresh sandbox.
  await fs.rm(SANDBOX_DIR, { recursive: true, force: true });
  await fs.mkdir(QUEUE_DIR, { recursive: true });

  // --- Group 0: module surface -------------------------------------------
  console.log('[group] module surface');
  check(
    'version is d2f',
    getQueueWriteVersion() === 'lead-import-approval-queue-write-d2f-v1',
    getQueueWriteVersion()
  );

  // --- Group 1: sandbox path detection -----------------------------------
  console.log('\n[group] sandbox path gate');
  check('tmp path is sandbox', isSandboxQueuePath(QUEUE_FILE) === true);
  check(
    'non-tmp path is NOT sandbox',
    isSandboxQueuePath(FAKE_REAL_QUEUE) === false
  );
  check('empty path is NOT sandbox', isSandboxQueuePath('') === false);

  // --- Group 2: missing queuePath / bad decision -------------------------
  console.log('\n[group] input guards (no write)');
  const noPath = await applyApprovalDecision('APPROVE', 'IMP-X', {});
  check(
    'missing queuePath -> FAIL_QUEUE_PATH_REQUIRED',
    noPath.ok === false && noPath.status === 'FAIL_QUEUE_PATH_REQUIRED',
    noPath.status
  );
  check('missing queuePath did not write', noPath.queue_written === false);

  const badDecision = await applyApprovalDecision('MAYBE', 'IMP-X', {
    queuePath: QUEUE_FILE,
  });
  check(
    'unknown decision -> FAIL_UNKNOWN_DECISION',
    badDecision.ok === false && badDecision.status === 'FAIL_UNKNOWN_DECISION',
    badDecision.status
  );

  const noId = await applyApprovalDecision('APPROVE', '', {
    queuePath: QUEUE_FILE,
  });
  check(
    'missing importId -> FAIL_IMPORT_ID_REQUIRED',
    noId.ok === false && noId.status === 'FAIL_IMPORT_ID_REQUIRED',
    noId.status
  );

  // --- Group 3: real (non-tmp) queue write is BLOCKED --------------------
  console.log('\n[group] real queue write blocked');
  const blocked = await applyApprovalDecision('APPROVE', 'IMP-X', {
    queuePath: FAKE_REAL_QUEUE,
  });
  check(
    'real queue write -> FAIL_REAL_QUEUE_WRITE_BLOCKED',
    blocked.ok === false && blocked.status === 'FAIL_REAL_QUEUE_WRITE_BLOCKED',
    blocked.status
  );
  check('blocked write produced no file', !(await fileExists(FAKE_REAL_QUEUE)));

  // --- Group 4: card not found in sandbox queue --------------------------
  console.log('\n[group] card not found');
  const notFound = await applyApprovalDecision('APPROVE', 'IMP-NOPE', {
    queuePath: QUEUE_FILE,
  });
  check(
    'unknown card -> FAIL_CARD_NOT_FOUND',
    notFound.ok === false && notFound.status === 'FAIL_CARD_NOT_FOUND',
    notFound.status
  );

  // --- Group 5: APPROVE happy path (sandbox write) -----------------------
  console.log('\n[group] approve happy path');
  const APPROVE_ID = 'IMP-D2F-APPROVE-1';
  const seedA = await seedPendingCard(APPROVE_ID);
  check('seed pending card ok', seedA.ok === true && seedA.status === 'PENDING');

  const approve = await applyApprovalDecision('approve', APPROVE_ID, {
    queuePath: QUEUE_FILE,
  });
  check(
    'approve -> QUEUE_WRITTEN',
    approve.ok === true && approve.status === 'QUEUE_WRITTEN',
    approve.status
  );
  check('approve marks is_sandbox', approve.is_sandbox === true);
  check('approve queue_written true', approve.queue_written === true);
  check(
    'approve card_status APPROVED_BY_DMITRY',
    approve.card_status === 'APPROVED_BY_DMITRY',
    approve.card_status
  );
  check('approve real_data_changed false', approve.real_data_changed === false);

  // Verify the on-disk queue actually reflects the transition.
  const afterApprove = await loadApprovalQueue(QUEUE_FILE);
  const cardA = findCard(afterApprove, APPROVE_ID);
  check(
    'persisted card is APPROVED_BY_DMITRY',
    cardA && cardA.status === 'APPROVED_BY_DMITRY',
    cardA ? cardA.status : 'missing'
  );
  check('persisted card approved_by Dmitry', cardA && cardA.approved_by === 'Dmitry');

  // Re-approving an already-approved card must be refused (no double write).
  const reApprove = await applyApprovalDecision('APPROVE', APPROVE_ID, {
    queuePath: QUEUE_FILE,
  });
  check(
    're-approve refused (INVALID_TRANSITION)',
    reApprove.ok === false && reApprove.status === 'INVALID_TRANSITION',
    reApprove.status
  );

  // --- Group 6: REJECT happy path (sandbox write) ------------------------
  console.log('\n[group] reject happy path');
  const REJECT_ID = 'IMP-D2F-REJECT-1';
  await seedPendingCard(REJECT_ID);
  const reject = await applyApprovalDecision('reject', REJECT_ID, {
    queuePath: QUEUE_FILE,
    reason: 'duplicate batch',
  });
  check(
    'reject -> QUEUE_WRITTEN',
    reject.ok === true && reject.status === 'QUEUE_WRITTEN',
    reject.status
  );
  check(
    'reject card_status CANCELLED',
    reject.card_status === 'CANCELLED',
    reject.card_status
  );

  const afterReject = await loadApprovalQueue(QUEUE_FILE);
  const cardR = findCard(afterReject, REJECT_ID);
  check(
    'persisted card is CANCELLED',
    cardR && cardR.status === 'CANCELLED',
    cardR ? cardR.status : 'missing'
  );

  // --- Group 7: command handler routing ----------------------------------
  console.log('\n[group] command handler');
  const HANDLER_ID = 'IMP-D2F-HANDLER-1';
  await seedPendingCard(HANDLER_ID);
  const viaHandler = await handleLeadImportApprovalQueueWriteCommand('approve', {
    queuePath: QUEUE_FILE,
    importId: HANDLER_ID,
  });
  check(
    'handler approve -> QUEUE_WRITTEN',
    viaHandler.ok === true && viaHandler.status === 'QUEUE_WRITTEN',
    viaHandler.status
  );
  check('handler echoes action', viaHandler.action === 'approve');

  const help = await handleLeadImportApprovalQueueWriteCommand('xyz', {});
  check('unknown action -> HELP', help.status === 'HELP', help.status);

  // --- Group 8: safety contract ------------------------------------------
  console.log('\n[group] safety contract');
  check('safety.real_import BLOCKED', approve.safety.real_import === 'BLOCKED');
  check('safety.client_contact BLOCKED', approve.safety.client_contact === 'BLOCKED');
  check('safety.auto_send BLOCKED', approve.safety.auto_send === 'BLOCKED');
  check('safety.live_bot_patch NO', approve.safety.live_bot_patch === 'NO');
  check('safety.writes_lead_data NO', approve.safety.writes_lead_data === 'NO');
  check('safety.queue_write SANDBOX_ONLY', approve.safety.queue_write === 'SANDBOX_ONLY');

  // --- Group 9: containment assertion ------------------------------------
  console.log('\n[group] containment');
  check('no real queue file created', !(await fileExists(FAKE_REAL_QUEUE)));
  check('sandbox queue file exists', await fileExists(QUEUE_FILE));

  // ---------------------------------------------------------------------
  console.log('\n=== summary ===');
  console.log(`  passed: ${passed}`);
  console.log(`  failed: ${failed}`);
  if (failed > 0) {
    console.log('\n  failures:');
    for (const f of failures) {
      console.log(`   - ${f.name}${f.detail ? `  (${f.detail})` : ''}`);
    }
    process.exitCode = 1;
  } else {
    console.log('\n  ALL GREEN — queue writes contained to tmp sandbox.');
  }
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exitCode = 1;
});
