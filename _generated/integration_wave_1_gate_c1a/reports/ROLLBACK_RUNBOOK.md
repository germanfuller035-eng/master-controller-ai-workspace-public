# Gate C1-A — Rollback Runbook

date: 2026-06-18 · non-destructive · never deletes canonical entities or payment facts.

## Triggers
API unhealthy; canonical integrity failure; writer count != 1; send ledger change; unexpected send;
payment command enabled or payment fact created; a C1-A command bypassed owner auth; duplicate entity
from idempotency replay; TEST_ONLY appears in a real KPI; Android/backend contract incompatible.

## Steps (config + runtime; data preserved)
1. Set `COMMERCIAL_COMMAND_C1A=false`.
2. Set `COMMERCIAL_COMMAND_API=false`.
3. Keep `COMMERCIAL_SEND=false` (unchanged).
4. Restore the 6 modified runtime files from backup; remove the new reconciliation.mjs (was ABSENT).
5. Restart ONLY master-controller-api.
6. Preserve canonical entities; do NOT manually delete. TEST_ONLY artifacts stay (they are excluded
   from KPIs by readmodels); record their ids in evidence.
7. Verify read API still available; commands return FEATURE_DISABLED again (7/7).
8. Verify send ledger unchanged (=7), writer=1, queue failed=0, dead letters=0.
9. Record exact failure + before/after revision, ledger lines, queue counts, flags.

## Never
- Never delete a non-empty commercial/delivery/finance section.
- Never delete a payment fact (none exist in C1-A anyway).
- Never restart Telegram/worker/scheduler/IMAP or reboot the VPS.
- Never blind-restore the canonical store unless corruption is proven.

## Backend-only quick revert (if data is untouched)
If gated commands never mutated (e.g. activation itself failed), flipping the flags off + API restart
is sufficient; the store is unchanged because gated commands short-circuit before the writer.
