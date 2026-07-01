/**
 * lead_import_approval_queue_write_real_d2g_tempcopy_test.mjs
 *
 * Daily Lead Factory — D2G — Standalone TEMP-COPY test for the REAL gated
 * queue-WRITE wrapper (lead_import_approval_queue_write_real.mjs).
 *
 * HARD SAFETY CONTRACT (mirrors the module under test):
 *   - NO real queue write. The production approval queue (13_sales/...) is
 *     NEVER touched. Every "real-path" assertion runs against a DISPOSABLE
 *     COPY in a scratch dir, never the live queue.
 *   - NO real import. A confirmed write only flips a card's status + history.
 *   - NO client contact / auto_send / external send.
 *   - NO live bot patch. NO Telegram API. NO bot import / touch.
 *   - NO SMTP / email / network / fetch.
 *   - NO .env / AI_SECRETS reads.
 *
 * WHY A NON-tmp SCRATCH DIR?
 *   The wrapper treats any path containing a `tmp` segment as SANDBOX (the D2G
 *   real-gate does not apply there). To exercise the REAL (gated) branch we
 *   need a NON-tmp path. We therefore copy a seeded queue into a throwaway
 *   scratch dir whose name has NO `tmp` segment. It is a COPY — disposable,
 *   recreated fresh each run, and never the production queue.
 *
 * Sandbox cases live under:
 *   tmp/lead_import_approval_queue_write_real_d2g_workspace/
 * Real-path (temp-copy) cases live under:
 *   tools/tests/_d2g_realwrite_scratch/      (non-tmp, disposable copy)
 *
 * Run:
 *   node --check tools/tests/lead_import_approval_queue_write_real_d2g_tempcopy_test.mjs
 *   node tools/tests/lead_import_approval_queue_write_real_d2g_tempcopy_test.mjs
 */

'use strict';

import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  getRealQueueWriteVersion,
  planTransition,
  applyRealApprovalQueueWrite,
  handleLeadImportApprovalRealQueueWriteCommand,
} from '../telegram_gateway/lead_import_approval_queue_write_real.mjs';

import {
  addApprovalCard,
  loadApprovalQueue,
  findCard,
} from '../telegram_gateway/lead_intake_approval_queue.mjs';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');

// Sandbox (tmp) — seeding ground + sandbox-path assertions.
const SANDBOX_DIR = path.join(
  WORKSPACE_ROOT,
  'tmp',
  'lead_import_approval_queue_write_real_d2g_workspace'
);
const SANDBOX_QUEUE_DIR = path.join(SANDBOX_DIR, 'approval_queue');
const SANDBOX_QUEUE_FILE = path.join(SANDBOX_QUEUE_DIR, 'lead_import_approvals.json');

// Non-tmp scratch — the disposable "real-like" COPY (never the live queue).
const SCRATCH_DIR = path.join(__dirname, '_d2g_realwrite_scratch');
const SCRATCH_QUEUE_FILE = path.join(SCRATCH_DIR, 'lead_import_approvals.json');

// A simulated PRODUCTION queue path — used ONLY to assert the write is BLOCKED
// without a confirm. The file is NEVER created (the gate trips before any IO).
const FAKE_PROD_QUEUE = path.join(
  WORKSPACE_ROOT,
  '13_sales',
  'approval_queue',
  '__d2g_test_should_never_exist__.json'
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

async function listBackups() {
  try {
    const entries = await fs.readdir(SCRATCH_DIR);
    return entries.filter((e) => e.endsWith('.bak.json'));
  } catch {
    return [];
  }
}

async function seedPendingCard(importId) {
  return addApprovalCard(SANDBOX_QUEUE_FILE, {
    import_id: importId,
    source: 'lead_import_prepare',
    text: `d2g-${importId}`,
    parsed_count: 3,
    valid_count: 3,
    added_count: 2,
    merged_count: 1,
    needs_review_count: 0,
    qa_status: 'PASS',
  });
}

// Build a fresh "real-like" COPY of the sandbox queue into the non-tmp scratch
// dir. This is the temp-copy under test for the REAL gated branch.
async function refreshScratchCopy() {
  await fs.rm(SCRATCH_DIR, { recursive: true, force: true });
  await fs.mkdir(SCRATCH_DIR, { recursive: true });
  await fs.copyFile(SANDBOX_QUEUE_FILE, SCRATCH_QUEUE_FILE);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== D2G real gated queue-write — temp-copy test ===\n');

  // Fresh sandbox seed area.
  await fs.rm(SANDBOX_DIR, { recursive: true, force: true });
  await fs.mkdir(SANDBOX_QUEUE_DIR, { recursive: true });
  await fs.rm(SCRATCH_DIR, { recursive: true, force: true });

  // --- Group 0: module surface -------------------------------------------
  console.log('[group] module surface');
  check(
    'version is d2g',
    getRealQueueWriteVersion() === 'lead-import-approval-queue-write-real-d2g-v1',
    getRealQueueWriteVersion()
  );

  // --- Group 1: planTransition (pure) ------------------------------------
  console.log('\n[group] planTransition (pure)');
  const pA = planTransition('APPROVE', 'PENDING');
  check('APPROVE from PENDING ok', pA.ok === true && pA.to === 'APPROVED_BY_DMITRY', pA.to);
  check(
    'APPROVE from APPROVED_BY_DMITRY refused',
    planTransition('APPROVE', 'APPROVED_BY_DMITRY').ok === false
  );
  const pR = planTransition('REJECT', 'PENDING');
  check('REJECT from PENDING ok', pR.ok === true && pR.to === 'CANCELLED', pR.to);
  check(
    'REJECT from APPROVED_BY_DMITRY ok',
    planTransition('REJECT', 'APPROVED_BY_DMITRY').ok === true
  );
  check('REJECT from CANCELLED refused', planTransition('REJECT', 'CANCELLED').ok === false);

  // --- Group 2: input guards (no write) ----------------------------------
  console.log('\n[group] input guards (no write)');
  const noPath = await applyRealApprovalQueueWrite('APPROVE', 'IMP-X', {});
  check(
    'missing queuePath -> FAIL_QUEUE_PATH_REQUIRED',
    noPath.ok === false && noPath.status === 'FAIL_QUEUE_PATH_REQUIRED',
    noPath.status
  );

  const badDecision = await applyRealApprovalQueueWrite('MAYBE', 'IMP-X', {
    queuePath: SCRATCH_QUEUE_FILE,
  });
  check(
    'unknown decision -> FAIL_UNKNOWN_DECISION',
    badDecision.ok === false && badDecision.status === 'FAIL_UNKNOWN_DECISION',
    badDecision.status
  );

  // --- Group 3: sandbox path delegates to D2F (no real-gate) --------------
  console.log('\n[group] sandbox path delegation');
  const SANDBOX_ID = 'IMP-D2G-SANDBOX-1';
  await seedPendingCard(SANDBOX_ID);
  const sandboxWrite = await applyRealApprovalQueueWrite('APPROVE', SANDBOX_ID, {
    queuePath: SANDBOX_QUEUE_FILE,
  });
  check(
    'sandbox approve -> QUEUE_WRITTEN',
    sandboxWrite.ok === true && sandboxWrite.status === 'QUEUE_WRITTEN',
    sandboxWrite.status
  );
  check(
    'sandbox real_gate NOT_REQUIRED_SANDBOX',
    sandboxWrite.real_gate === 'NOT_REQUIRED_SANDBOX',
    sandboxWrite.real_gate
  );
  check('sandbox dry_run false', sandboxWrite.dry_run === false);
  check('sandbox queue_write true', sandboxWrite.queue_write === true);

  // Re-seed more cards for the real-copy tests below.
  const APPROVE_ID = 'IMP-D2G-APPROVE-1';
  const REJECT_ID = 'IMP-D2G-REJECT-1';
  const STALE_ID = 'IMP-D2G-STALE-1';
  const DONE_ID = 'IMP-D2G-DONE-1';
  await seedPendingCard(APPROVE_ID);
  await seedPendingCard(REJECT_ID);
  await seedPendingCard(STALE_ID);
  await seedPendingCard(DONE_ID);

  // --- Group 4: real path BLOCKED without allowRealQueueWrite -------------
  console.log('\n[group] real path blocked (no override)');
  await refreshScratchCopy();
  const blocked = await applyRealApprovalQueueWrite('APPROVE', APPROVE_ID, {
    queuePath: SCRATCH_QUEUE_FILE,
  });
  check(
    'no override -> FAIL_REAL_QUEUE_WRITE_BLOCKED',
    blocked.ok === false && blocked.status === 'FAIL_REAL_QUEUE_WRITE_BLOCKED',
    blocked.status
  );
  check('blocked: no backup', (await listBackups()).length === 0);

  // Also assert a fake PRODUCTION path is blocked and never created.
  const prodBlocked = await applyRealApprovalQueueWrite('APPROVE', 'IMP-X', {
    queuePath: FAKE_PROD_QUEUE,
  });
  check(
    'fake prod path blocked',
    prodBlocked.ok === false && prodBlocked.status === 'FAIL_REAL_QUEUE_WRITE_BLOCKED',
    prodBlocked.status
  );
  check('fake prod file never created', !(await fileExists(FAKE_PROD_QUEUE)));

  // --- Group 5: real path DRY-RUN (override but no confirm) ---------------
  console.log('\n[group] real path dry-run (no confirm)');
  await refreshScratchCopy();
  const beforeDry = await fs.readFile(SCRATCH_QUEUE_FILE, 'utf8');
  const dry = await applyRealApprovalQueueWrite('APPROVE', APPROVE_ID, {
    queuePath: SCRATCH_QUEUE_FILE,
    allowRealQueueWrite: true,
  });
  check('dry-run -> DRY_RUN', dry.ok === true && dry.status === 'DRY_RUN', dry.status);
  check('dry-run dry_run flag true', dry.dry_run === true);
  check('dry-run real_gate NOT_CONFIRMED', dry.real_gate === 'NOT_CONFIRMED', dry.real_gate);
  check('dry-run queue_write false', dry.queue_write === false);
  check(
    'dry-run planned transition PENDING->APPROVED_BY_DMITRY',
    dry.planned_transition &&
      dry.planned_transition.from === 'PENDING' &&
      dry.planned_transition.to === 'APPROVED_BY_DMITRY',
    JSON.stringify(dry.planned_transition)
  );
  check('dry-run no backup', (await listBackups()).length === 0);
  const afterDry = await fs.readFile(SCRATCH_QUEUE_FILE, 'utf8');
  check('dry-run did NOT modify the copy', beforeDry === afterDry);

  // --- Group 6: status mismatch (optimistic check) -----------------------
  console.log('\n[group] expectedCardStatus mismatch');
  const mismatch = await applyRealApprovalQueueWrite('APPROVE', STALE_ID, {
    queuePath: SCRATCH_QUEUE_FILE,
    allowRealQueueWrite: true,
    confirmRealQueueWrite: true,
    expectedCardStatus: 'APPROVED_BY_DMITRY', // actual is PENDING
  });
  check(
    'mismatch -> FAIL_STATUS_MISMATCH',
    mismatch.ok === false && mismatch.status === 'FAIL_STATUS_MISMATCH',
    mismatch.status
  );
  check('mismatch produced no backup', (await listBackups()).length === 0);

  // --- Group 7: invalid transition (no write, no backup) -----------------
  console.log('\n[group] invalid transition');
  // First confirm-approve DONE_ID, then try to approve again -> INVALID.
  const firstApprove = await applyRealApprovalQueueWrite('APPROVE', DONE_ID, {
    queuePath: SCRATCH_QUEUE_FILE,
    allowRealQueueWrite: true,
    confirmRealQueueWrite: true,
  });
  check(
    'confirm approve DONE -> QUEUE_WRITTEN',
    firstApprove.ok === true && firstApprove.status === 'QUEUE_WRITTEN',
    firstApprove.status
  );
  const reApprove = await applyRealApprovalQueueWrite('APPROVE', DONE_ID, {
    queuePath: SCRATCH_QUEUE_FILE,
    allowRealQueueWrite: true,
    confirmRealQueueWrite: true,
  });
  check(
    're-approve -> INVALID_TRANSITION',
    reApprove.ok === false && reApprove.status === 'INVALID_TRANSITION',
    reApprove.status
  );

  // --- Group 8: CONFIRMED real write (backup + write to the COPY) ---------
  console.log('\n[group] confirmed real write (temp-copy)');
  const confirmed = await applyRealApprovalQueueWrite('APPROVE', APPROVE_ID, {
    queuePath: SCRATCH_QUEUE_FILE,
    allowRealQueueWrite: true,
    confirmRealQueueWrite: true,
    expectedCardStatus: 'PENDING',
  });
  check(
    'confirmed -> QUEUE_WRITTEN',
    confirmed.ok === true && confirmed.status === 'QUEUE_WRITTEN',
    confirmed.status
  );
  check('confirmed real_gate CONFIRMED', confirmed.real_gate === 'CONFIRMED', confirmed.real_gate);
  check('confirmed dry_run false', confirmed.dry_run === false);
  check('confirmed is_sandbox false', confirmed.is_sandbox === false);
  check('confirmed queue_write true', confirmed.queue_write === true);
  check('confirmed real_data_changed false', confirmed.real_data_changed === false);
  check(
    'confirmed backup_path set + exists',
    typeof confirmed.backup_path === 'string' && (await fileExists(confirmed.backup_path)),
    confirmed.backup_path
  );

  // Verify the COPY on disk reflects the transition.
  const afterCopy = await loadApprovalQueue(SCRATCH_QUEUE_FILE);
  const cardA = findCard(afterCopy, APPROVE_ID);
  check(
    'copy card now APPROVED_BY_DMITRY',
    cardA && cardA.status === 'APPROVED_BY_DMITRY',
    cardA ? cardA.status : 'missing'
  );

  // Verify the backup is a PENDING snapshot (pre-write state).
  const backupSnap = await loadApprovalQueue(confirmed.backup_path);
  const cardBak = findCard(backupSnap, APPROVE_ID);
  check(
    'backup snapshot card was PENDING',
    cardBak && cardBak.status === 'PENDING',
    cardBak ? cardBak.status : 'missing'
  );

  // --- Group 9: confirmed REJECT via command handler ---------------------
  console.log('\n[group] confirmed reject via handler');
  const rejected = await handleLeadImportApprovalRealQueueWriteCommand('reject', {
    queuePath: SCRATCH_QUEUE_FILE,
    importId: REJECT_ID,
    reason: 'duplicate batch',
    allowRealQueueWrite: true,
    confirmRealQueueWrite: true,
  });
  check(
    'handler reject -> QUEUE_WRITTEN',
    rejected.ok === true && rejected.status === 'QUEUE_WRITTEN',
    rejected.status
  );
  check('handler echoes action reject', rejected.action === 'reject');
  const afterReject = await loadApprovalQueue(SCRATCH_QUEUE_FILE);
  const cardR = findCard(afterReject, REJECT_ID);
  check('copy card now CANCELLED', cardR && cardR.status === 'CANCELLED', cardR ? cardR.status : 'missing');

  const help = await handleLeadImportApprovalRealQueueWriteCommand('xyz', {});
  check('unknown action -> HELP', help.status === 'HELP', help.status);

  // --- Group 10: safety contract -----------------------------------------
  console.log('\n[group] safety contract');
  check('safety.real_import BLOCKED', confirmed.safety.real_import === 'BLOCKED');
  check('safety.committed_transition BLOCKED', confirmed.safety.committed_transition === 'BLOCKED');
  check('safety.client_contact BLOCKED', confirmed.safety.client_contact === 'BLOCKED');
  check('safety.live_bot_patch NO', confirmed.safety.live_bot_patch === 'NO');
  check('safety.writes_lead_data NO', confirmed.safety.writes_lead_data === 'NO');
  check('safety.queue_write REAL_GATED', confirmed.safety.queue_write === 'REAL_GATED');

  // --- Group 11: containment assertion -----------------------------------
  console.log('\n[group] containment');
  check('production queue file never created', !(await fileExists(FAKE_PROD_QUEUE)));
  check('scratch copy exists (disposable, non-tmp)', await fileExists(SCRATCH_QUEUE_FILE));

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
    console.log('\n  ALL GREEN — real writes contained to a disposable temp-copy.');
    console.log('  No production queue, no real import, no client/bot touched.');
  }
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exitCode = 1;
});
