/**
 * _d2k_run_prepare_card_once.mjs
 * ---------------------------------------------------------------------------
 * ONE-TIME D2K runner — controlled synthetic prepare-card write.
 *
 * Approved by Dmitry: однократно записать ОДНУ synthetic PENDING-карточку
 * без PII в production approval queue. Без real import, без client contact,
 * без live bot patch.
 *
 * Procedure (per D2J SOP §3):
 *   1) DRY-RUN (no confirm) -> review planned_card.
 *   2) Confirmed write (confirmRealPrepareCard: true) -> single atomic+backup
 *      append of one PENDING card to the real D2I-initialized queue.
 *
 * This runner uses ONLY synthetic, no-PII input. The helper additionally
 * hard-blocks any email/phone/@-handle/t.me content.
 * ---------------------------------------------------------------------------
 */

import { prepareRealApprovalCard } from './lead_import_approval_prepare_card_real.mjs';

const QUEUE_PATH = 'D:\\AI_WORKSPACE\\13_sales\\approval_queue\\lead_import_approvals.json';

// SYNTHETIC, NO-PII card input. No email / phone / handle / t.me anywhere.
const cardInput = {
  text: 'SYNTHETIC D2K controlled prepare-card row. No real lead data. No contact info.',
  source: 'd2k_synthetic_prepare_card',
  synthetic: true,
  parsed_count: 1,
  valid_count: 1,
  added_count: 1,
  merged_count: 0,
  needs_review_count: 0,
  qa_status: 'PASS',
};

function divider(label) {
  console.log(`\n=== ${label} ===`);
}

async function main() {
  divider('STEP 1 — DRY-RUN (nothing written)');
  const dry = await prepareRealApprovalCard({
    queuePath: QUEUE_PATH,
    cardInput,
    // no confirmRealPrepareCard => DRY-RUN
  });
  console.log(JSON.stringify(dry, null, 2));

  if (!dry.ok || dry.status !== 'DRY_RUN') {
    divider('ABORT — dry-run did not return a clean DRY_RUN');
    process.exitCode = 1;
    return;
  }

  divider('STEP 2 — CONFIRMED WRITE (single atomic+backup append)');
  const real = await prepareRealApprovalCard({
    queuePath: QUEUE_PATH,
    cardInput,
    confirmRealPrepareCard: true,
  });
  console.log(JSON.stringify(real, null, 2));

  divider('RESULT SUMMARY');
  console.log(
    JSON.stringify(
      {
        status: real.status,
        queue_written: real.queue_written,
        real_data_changed: real.real_data_changed,
        card_prepared: real.card_prepared,
        cards_before: real.cards_before,
        cards_after: real.cards_after,
        import_id: real.prepared_card && real.prepared_card.import_id,
        card_status: real.prepared_card && real.prepared_card.status,
        backup_file: real.backup_file,
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
