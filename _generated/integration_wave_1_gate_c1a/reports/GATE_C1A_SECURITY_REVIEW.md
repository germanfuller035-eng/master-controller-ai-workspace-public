# Gate C1-A — Security Review

date: 2026-06-18 · scope: six internal commercial commands, no send, no payment.

## Authentication & authorization
- All 6 command routes use `requireAuth` (owner device token). Service tokens (worker/telegram) are
  rejected: verified live — opportunity POST with worker token → 401, no-auth → 401.
- Read routes use `requireAuthOrService`. Commands are owner-only.

## Granular feature gates (no single master switch enables payment)
```
COMMERCIAL_COMMAND_API=ON     (master switch — required for any command)
COMMERCIAL_COMMAND_C1A=ON      (the six internal commands)
COMMERCIAL_PAYMENT_COMMAND=OFF (payment — Gate C1-B, stays OFF)
COMMERCIAL_SEND=OFF
```
A command is reachable only when `command && COMMAND_GATE[fn]` is true. `recordPayment` maps to
`paymentCommand` (OFF) → returns 403 FEATURE_DISABLED even with C1-A enabled and a valid owner
(verified by in-process probe). Enabling C1-A can never enable payment.

## Single writer / revision / idempotency
- Every mutation goes through `commands._apply` → `updateStoreWithRevision` (the ONE canonical writer).
  No second store, no second ledger, no direct file write.
- `expectedRevision` enforced (409 REVISION_CONFLICT on stale).
- `Idempotency-Key` required (400 if missing); replay returns the prior result and does NOT bump the
  revision or create a duplicate (regression-tested in gate_c1a.test.mjs AS8–AS10).

## No send / no payment surface
- No SMTP import, no Telegram client send, no follow-up send in the C1-A path. `sendCapability: NONE`.
- Invoice command creates DRAFT only (`real_issuance: DISABLED`, `bank_integration: NONE`); no payment.
- Live invariants after E2E: send ledger unchanged (7), 0 payments, 0 SMTP calls, Telegram poller=1.

## TEST_ONLY isolation
- TEST_ONLY entities are excluded from all business KPI read models (commercial/finance/delivery
  summaries); a separate `technical-acceptance` endpoint surfaces them. Verified: KPI summary all-zero
  after the E2E while technical-acceptance shows the 6 ids.

## Two latent bugs found by the E2E (fixed before any real persistence)
1. `_apply` argument order was swapped — would have aborted/thrown on every real command. Fixed.
2. `_apply` bumped revision on idempotent replay. Fixed to abort the write on replay.
Both were on a path never executed before (commands OFF in Gate B). The gated writer aborted with zero
mutation both times — no corruption occurred.

## Residual notes
- TEST_ONLY canonical entities cannot be deleted (no deletion command by design); they are inert and
  KPI-excluded. Acceptable for a technical acceptance artifact.
- Lead-level "proven" send markers that lack a ledger row are flagged PROVEN_NO_LEDGER_MATCH for owner
  sync; they are not counted as successful sends.
