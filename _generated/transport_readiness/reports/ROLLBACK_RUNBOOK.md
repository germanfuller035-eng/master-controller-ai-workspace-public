# Transport-Readiness — Rollback Runbook

date: 2026-06-18 · non-destructive. Never deletes canonical entities; never touches the send ledger.

## Triggers
API unhealthy; canonical integrity failure; writer count != 1; send ledger change; any unexpected
send/payment; transport flag flipped on unexpectedly; Android/backend contract incompatible.

## Steps (config + runtime; data preserved)
1. Set CONVERSATION_READ_API=false, CUSTOMER_SUCCESS_READ_API=false (read features off).
2. Keep COMMERCIAL_SEND=false, SEND_ALLOWED_LIVE=OFF, COMMERCIAL_PAYMENT_COMMAND=false (unchanged).
3. Restore the 7 modified runtime files from backup; remove the 3 new files
   (transport_approval.mjs, conversation_read.mjs, conversations.mjs — were ABSENT).
4. Restore reply_correlation.mjs from backup (afe2f25b) if the subject-fallback change must be reverted.
5. `sudo systemctl restart master-controller-api` (ONLY).
6. Preserve canonical entities (incl. the real STROYDVOR-UG_RU opportunity/offer and the TEST_ONLY run);
   do NOT delete. The real offer stays READY_FOR_SEND_REVIEW (no deal, no send).
7. Verify read API health, send ledger unchanged (7), writer=1, queue failed 0, dead letters 0.
8. Record exact failure + before/after revision, ledger lines, flags.

## Never
- Never delete a non-empty section or any commercial entity.
- Never restart Telegram/worker/scheduler/IMAP or reboot.
- Never blind-restore the canonical store unless corruption is proven.
- The real opportunity/offer is legitimate pre-sale data — it is preserved on rollback.
