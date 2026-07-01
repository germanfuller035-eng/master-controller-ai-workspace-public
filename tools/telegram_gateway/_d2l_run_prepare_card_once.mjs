/**
 * _d2l_run_prepare_card_once.mjs
 * ---------------------------------------------------------------------------
 * ONE-TIME D2L runner — FIRST controlled REAL prepare-card write.
 *
 * Approved by Dmitry (D2L-controlled-prepare): однократно создать ОДНУ real
 * PENDING approval-card для лида DLF-20260603-0001 (Завод АТОМ) в production
 * approval queue.
 *
 * HARD SCOPE for this run:
 *   - Creates exactly ONE PENDING card. No approve. No reject. No import.
 *   - NO raw PII in the card (no email / phone / @-handle / t.me).
 *       * The real lead is linked via a regex-safe, non-PII token
 *         ("dlf-zavod-atom") + a text_hash. The human-readable lead_id
 *         (DLF-20260603-0001) and the email/phone live ONLY in the D2L
 *         report / lead store, NEVER inside the queue card.
 *       * Note: the literal "DLF-20260603-0001" is intentionally NOT placed in
 *         any card field, because the prepare-card PII guard's phone regex
 *         would flag its 8-digit date run. The token + report cross-reference
 *         provides full traceability without putting PII in the card.
 *   - NO client contact (auto_send / client_contact stay BLOCKED).
 *   - NO live bot patch. NO network / Telegram API / SMTP / .env / secrets.
 *
 * Procedure (per D2J SOP §3):
 *   1) DRY-RUN (no confirm) -> review planned_card, confirm PENDING + no PII.
 *   2) Confirmed write (confirmRealPrepareCard: true) -> single atomic+backup
 *      append of ONE PENDING card to the real D2I-initialized queue.
 * ---------------------------------------------------------------------------
 */

import { prepareRealApprovalCard } from './lead_import_approval_prepare_card_real.mjs';

const QUEUE_PATH =
  'D:\\AI_WORKSPACE\\13_sales\\approval_queue\\lead_import_approvals.json';

// REAL lead reference, but NO raw PII in the card.
// Linkage to DLF-20260603-0001 is via the "dlf-zavod-atom" token + this card's
// text_hash; the email/phone are deliberately kept OUT of the card.
const cardInput = {
  text:
    'REAL D2L first real prepare-card. Lead: Zavod ATOM (token dlf-zavod-atom). ' +
    'Product: Mini Audit 10K. No raw PII (email/phone/handle) in this card; ' +
    'contact data is held outside the approval queue. ' +
    'auto_send=BLOCKED, client_contact=BLOCKED.',
  source: 'd2l_real_prepare_card__dlf-zavod-atom',
  parsed_count: 1,
  valid_count: 1,
  added_count: 1,
  merged_count: 0,
  needs_review_count: 1,
  qa_status: 'PASS_WITH_REVIEW',
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
  if (!dry.planned_card || dry.planned_card.status !== 'PENDING') {
    divider('ABORT — planned card is not PENDING');
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
        text_hash: real.prepared_card && real.prepared_card.text_hash,
        source: real.prepared_card && real.prepared_card.source,
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
