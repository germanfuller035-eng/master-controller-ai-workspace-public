# Integration Wave 1 — Local Deployment Rehearsal

date: 2026-06-18 · suite tools/commercial_core/tests/local_rehearsal.mjs (19/19 PASS) · result: data/local_rehearsal_result.json

## Environment
Synthetic store + in-memory feature flags. No production credentials, no canonical store, no outbound
network, no SMTP, no Telegram token, no IMAP. Temp only.

## Staged rehearsal R0–R10
- R0 baseline captured (checksum of prod-like store).
- R1 staging symbolic; R2 engine modules load (hash-verified by import).
- R3 migration applied to prod-like copy → 8 empty sections; existing leads + 7-line ledger untouched.
- R4 flags set COMMERCIAL_READ_API=ON, COMMAND=OFF, SEND=OFF.
- R5 command API confirmed disabled.
- R6 all 9 read endpoints return ok envelopes; commercial collections EMPTY; product catalog readable
  (Mini Audit); UNKNOWN money null + class UNKNOWN (never 0); finance confirmed revenue UNKNOWN.
- R7 all 7 command endpoints return FEATURE_DISABLED; zero mutations / events / sends / SMTP / queue
  writes; commercial store still empty.
- R8 read API disabled on rollback; R9 migration rollback removed 8 empty sections; R10 prod-like store
  restored byte-identical to baseline.

## Read endpoints verified (9)
/commercial/summary · /opportunities · /products · /offers · /deals · /delivery/handoffs ·
/delivery/projects · /finance/summary · /finance/invoices

## Command endpoints (7, all disabled)
/opportunities · prepare-offer · offers/:id/decision · deals/:id/delivery-handoff · create-project ·
finance/invoices · finance/payments/record

```
LOCAL_DEPLOYMENT_REHEARSAL=PASS
READ_ENDPOINTS_VERIFIED=9
COMMAND_ENDPOINTS_DISABLED=7
DISABLED_COMMAND_MUTATIONS=0
CANONICAL_WRITES_FROM_DISABLED_COMMANDS=0
QUEUE_WRITES=0
EVENTS_EMITTED_BY_DISABLED_COMMANDS=0
REHEARSAL_MESSAGES_SENT=0
REHEARSAL_SMTP_CALLS=0
```

Note: the real production Express app is NOT booted here (express not vendored in the worktree, and
Gate B forbids touching production API source). The rehearsal exercises the exact engine + flag +
migration logic that the production routes will call, with the same envelope shape.
