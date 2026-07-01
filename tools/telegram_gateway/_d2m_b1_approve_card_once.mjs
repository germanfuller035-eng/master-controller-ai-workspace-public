/**
 * _d2m_b1_approve_card_once.mjs
 * ---------------------------------------------------------------------------
 * ONE-TIME D2M-B1 runner — APPROVE (queue-only) the first real PENDING card.
 *
 * Approved by Dmitry (D2M-B1 approve queue-only):
 *   "разрешаю однократно перевести карточку IMP-20260606-100554-941263 из
 *    PENDING в APPROVED_BY_DMITRY. Без real import, без client contact,
 *    без live bot patch."
 *
 * Procedure (mirrors the D2K cleanup runner discipline):
 *   1) DRY-RUN (no confirm) -> load queue, locate the target card, verify it is
 *      the expected REAL PENDING card (dlf-zavod-atom), and show the planned
 *      PENDING -> APPROVED_BY_DMITRY transition via the D2G engine's own
 *      dry-run path. Nothing written.
 *   2) Confirmed APPROVE (--confirm-approve) -> single
 *      applyRealApprovalQueueWrite('APPROVE', ...) call with the triple gate
 *      (allowRealQueueWrite + confirmRealQueueWrite). The D2G engine takes its
 *      own pre-write .bak backup, then delegates the atomic transition to D2F/D2B.
 *
 * HARD SCOPE (always):
 *   - approve != real import. NEVER commits / imports / writes lead data.
 *   - Only transitions the ONE named import_id; refuses any other id.
 *   - Target MUST currently be PENDING and MUST be the d2l real card.
 *   - approver is HARD-LOCKED to "Dmitry" (engine rejects anything else).
 *   - NEVER writes lead data (leads_master / lead_contacts / 13_sales rows).
 *   - NEVER contacts a client; auto_send stays BLOCKED.
 *   - No network / Telegram API / SMTP / .env / AI_SECRETS / bot live-patch.
 * ---------------------------------------------------------------------------
 */

import {
  loadApprovalQueue,
  findCard,
  buildApprovalQueueSummary,
} from './lead_intake_approval_queue.mjs';

import {
  applyRealApprovalQueueWrite,
} from './lead_import_approval_queue_write_real.mjs';

const QUEUE_PATH =
  'D:\\AI_WORKSPACE\\13_sales\\approval_queue\\lead_import_approvals.json';

// The exact, single card we are authorized to approve — nothing else.
const TARGET_IMPORT_ID = 'IMP-20260606-100554-941263';
const EXPECTED_SOURCE = 'd2l_real_prepare_card__dlf-zavod-atom';
const EXPECTED_STATUS_BEFORE = 'PENDING';
const APPROVER = 'Dmitry';
const APPROVE_REASON =
  'D2M-B1: first real PENDING card approved by Dmitry (queue-only). ' +
  'No real import, no client contact, no live bot patch.';

// Flip to true ONLY for the confirmed write step.
// Accept either the CLI flag --confirm-approve or env D2M_CONFIRM_APPROVE=1.
const CONFIRM_APPROVE =
  process.argv.includes('--confirm-approve') ||
  process.env.D2M_CONFIRM_APPROVE === '1';

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
    is_expected_source: card.source === EXPECTED_SOURCE,
    no_prior_approval: card.approved_by === null && card.approved_at === null,
    not_committed: card.snapshot_id === null && card.commit_result === null,
    not_cancelled: card.cancelled_at === null,
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

async function main() {
  divider('STEP 1 — INSPECT / GUARD (nothing written)');
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
          ? `${EXPECTED_STATUS_BEFORE} -> APPROVED_BY_DMITRY`
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

  // STEP 2 — engine-level DRY-RUN (always run first; confirms transition + gates).
  divider('STEP 2 — ENGINE DRY-RUN (confirmRealQueueWrite NOT set; file untouched)');
  const dry = await applyRealApprovalQueueWrite('APPROVE', TARGET_IMPORT_ID, {
    queuePath: QUEUE_PATH,
    reason: APPROVE_REASON,
    approved_by: APPROVER,
    expectedCardStatus: EXPECTED_STATUS_BEFORE,
    allowRealQueueWrite: true,
    // confirmRealQueueWrite intentionally omitted -> dry-run
  });
  console.log(JSON.stringify(dry, null, 2));

  if (!dry.ok) {
    divider('ABORT — engine dry-run did not pass; nothing written');
    process.exitCode = 1;
    return;
  }

  if (!CONFIRM_APPROVE) {
    divider('DRY-RUN COMPLETE — pass --confirm-approve to perform the approve');
    console.log(
      JSON.stringify(
        {
          confirmed: false,
          queue_written: false,
          real_data_changed: false,
          note: 'Re-run with --confirm-approve (or D2M_CONFIRM_APPROVE=1) to execute the one-time approve.',
        },
        null,
        2
      )
    );
    return;
  }

  divider('STEP 3 — CONFIRMED APPROVE (single PENDING -> APPROVED_BY_DMITRY)');
  const result = await applyRealApprovalQueueWrite('APPROVE', TARGET_IMPORT_ID, {
    queuePath: QUEUE_PATH,
    reason: APPROVE_REASON,
    approved_by: APPROVER,
    expectedCardStatus: EXPECTED_STATUS_BEFORE,
    allowRealQueueWrite: true,
    confirmRealQueueWrite: true,
  });
  console.log(JSON.stringify(result, null, 2));

  divider('STEP 4 — VERIFY POST-STATE');
  const after = await loadApprovalQueue(QUEUE_PATH);
  const afterCard = findCard(after, TARGET_IMPORT_ID);
  console.log(
    JSON.stringify(
      {
        approve_ok: result.ok === true,
        card_status_after: afterCard ? afterCard.status : null,
        approved_by: afterCard ? afterCard.approved_by : null,
        approved_at: afterCard ? afterCard.approved_at : null,
        snapshot_id: afterCard ? afterCard.snapshot_id : null,
        commit_result: afterCard ? afterCard.commit_result : null,
        history_len:
          afterCard && Array.isArray(afterCard.history)
            ? afterCard.history.length
            : null,
        summary_after: buildApprovalQueueSummary(after).counts,
        backup_file: result.backup_path || null,
        queue_written: result.queue_write === true,
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
