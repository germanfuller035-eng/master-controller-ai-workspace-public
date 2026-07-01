/**
 * _d2k_cleanup_cancel_card_once.mjs
 * ---------------------------------------------------------------------------
 * ONE-TIME D2K-CLEANUP runner — cancel the synthetic PENDING card.
 *
 * Approved by Dmitry: "однократно перевести synthetic PENDING-карточку
 * IMP-20260606-093721-ef3dff в CANCELLED в production approval queue.
 * Без approve, без real import, без client contact, без live bot patch."
 *
 * Procedure (mirrors the D2K write runner discipline):
 *   1) DRY-RUN (no confirm) -> load queue, locate target card, verify it is the
 *      expected SYNTHETIC PENDING card, show the planned PENDING -> CANCELLED
 *      transition. Nothing written.
 *   2) Pre-write backup of the queue file (timestamped .cancel.bak).
 *   3) Confirmed cancel (confirmCancel: true) -> single cancelCard() call which
 *      atomically rewrites the queue with status CANCELLED + history entry.
 *
 * HARD SCOPE (always):
 *   - cancel != approve != real import. NEVER approves/commits.
 *   - Only transitions the ONE named import_id; refuses any other id.
 *   - Target MUST currently be PENDING and MUST be the synthetic d2k card.
 *   - NEVER writes lead data (leads_master / lead_contacts / 13_sales stores).
 *   - NEVER contacts a client; auto_send stays BLOCKED.
 *   - No network / Telegram API / SMTP / .env / AI_SECRETS / bot live-patch.
 * ---------------------------------------------------------------------------
 */

import path from 'node:path';
import fs from 'node:fs/promises';

import {
  loadApprovalQueue,
  findCard,
  cancelCard,
  buildApprovalQueueSummary,
} from './lead_intake_approval_queue.mjs';

const QUEUE_PATH =
  'D:\\AI_WORKSPACE\\13_sales\\approval_queue\\lead_import_approvals.json';

// The exact, single card we are authorized to cancel — nothing else.
const TARGET_IMPORT_ID = 'IMP-20260606-093721-ef3dff';
const EXPECTED_SOURCE = 'd2k_synthetic_prepare_card';
const EXPECTED_STATUS_BEFORE = 'PENDING';
const CANCEL_REASON =
  'D2K-cleanup: synthetic smoke card cancelled by Dmitry approval (no lead data involved).';

// Flip to true ONLY for the confirmed write step.
// Accept either the CLI flag --confirm-cancel or env D2K_CONFIRM_CANCEL=1
// (CLI flag is shell-agnostic and avoids cmd/PowerShell env quirks).
const CONFIRM_CANCEL =
  process.argv.includes('--confirm-cancel') ||
  process.env.D2K_CONFIRM_CANCEL === '1';

function nowIso() {
  return new Date().toISOString();
}

function divider(label) {
  console.log(`\n=== ${label} ===`);
}

/** Locate the target card and validate it is exactly what we expect. */
async function inspect() {
  const queue = await loadApprovalQueue(QUEUE_PATH);
  if (queue.error) {
    return { ok: false, status: 'FAIL_QUEUE_UNREADABLE', error: queue.error };
  }
  const card = findCard(queue, TARGET_IMPORT_ID);
  if (!card) {
    return { ok: false, status: 'FAIL_CARD_NOT_FOUND' };
  }

  const checks = {
    is_pending: card.status === EXPECTED_STATUS_BEFORE,
    is_synthetic_source: card.source === EXPECTED_SOURCE,
    no_approval: card.approved_by === null && card.approved_at === null,
    not_committed: card.snapshot_id === null && card.commit_result === null,
  };
  const guardOk = Object.values(checks).every(Boolean);

  return {
    ok: guardOk,
    status: guardOk ? 'INSPECT_OK' : 'FAIL_GUARD',
    checks,
    card,
    queue,
    summary_before: buildApprovalQueueSummary(queue).counts,
  };
}

/** Pre-write timestamped backup, mirroring D2J/D2I/D2K discipline. */
async function backupQueue() {
  const dir = path.dirname(QUEUE_PATH);
  const base = path.basename(QUEUE_PATH);
  const ts = nowIso().replace(/[:.]/g, '-');
  const backupFile = path.join(dir, `.${base}.${ts}.cancel.bak`);
  const prior = await fs.readFile(QUEUE_PATH, 'utf8');
  await fs.writeFile(backupFile, prior, 'utf8');
  return backupFile;
}

async function main() {
  divider('STEP 1 — INSPECT / DRY-RUN (nothing written)');
  const ins = await inspect();
  console.log(
    JSON.stringify(
      {
        status: ins.status,
        target_import_id: TARGET_IMPORT_ID,
        guard_checks: ins.checks || null,
        card_status_before: ins.card ? ins.card.status : null,
        card_source: ins.card ? ins.card.source : null,
        summary_before: ins.summary_before || null,
        planned_transition: ins.ok
          ? `${EXPECTED_STATUS_BEFORE} -> CANCELLED`
          : 'NONE (guard failed)',
      },
      null,
      2
    )
  );

  if (!ins.ok) {
    divider('ABORT — guard failed; refusing to touch the queue');
    process.exitCode = 1;
    return;
  }

  if (!CONFIRM_CANCEL) {
    divider('DRY-RUN COMPLETE — set D2K_CONFIRM_CANCEL=1 to perform the cancel');
    console.log(
      JSON.stringify(
        {
          confirmed: false,
          queue_written: false,
          real_data_changed: false,
          note: 'Re-run with D2K_CONFIRM_CANCEL=1 to execute the one-time cancel.',
        },
        null,
        2
      )
    );
    return;
  }

  divider('STEP 2 — PRE-WRITE BACKUP');
  const backupFile = await backupQueue();
  console.log(`Backup created: ${backupFile}`);

  divider('STEP 3 — CONFIRMED CANCEL (single PENDING -> CANCELLED)');
  const result = await cancelCard(QUEUE_PATH, TARGET_IMPORT_ID, {
    reason: CANCEL_REASON,
  });
  console.log(JSON.stringify(result, null, 2));

  divider('STEP 4 — VERIFY POST-STATE');
  const after = await loadApprovalQueue(QUEUE_PATH);
  const afterCard = findCard(after, TARGET_IMPORT_ID);
  console.log(
    JSON.stringify(
      {
        cancel_ok: result.ok === true,
        card_status_after: afterCard ? afterCard.status : null,
        cancelled_at: afterCard ? afterCard.cancelled_at : null,
        history_len: afterCard && Array.isArray(afterCard.history)
          ? afterCard.history.length
          : null,
        summary_after: buildApprovalQueueSummary(after).counts,
        backup_file: backupFile,
        queue_written: result.ok === true,
        real_lead_data_changed: false,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error('RUNNER ERROR:', err);
  process.exitCode = 1;
});
