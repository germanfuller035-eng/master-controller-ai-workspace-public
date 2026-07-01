# Gate C1-A — Production TEST_ONLY No-Send E2E

date: 2026-06-18 · marker TEST_ONLY_GATE_C1A_ACCEPTANCE · real canonical store · no client involved.

## Outcome: PASS
A single TEST_ONLY internal commercial cycle was driven through the REAL command seam
(`commands._apply` → `updateStoreWithRevision`, the one canonical writer). No real client, no real
email, no send, no payment.

## Chain (revision 91 → 97, exactly 6 bumps)
| step | entity id | revision |
|---|---|---|
| createOpportunity (testOnly) | opp_cbdb073cd628 | 92 |
| prepareOffer | offer_47a06f465083 | 93 |
| recordOwnerDecision APPROVE (wins deal) | deal_e1ca9ea0820c | 94 |
| createHandoff | handoff_5be519c2acbd | 95 |
| createProject | proj_81ae52b3536d | 96 |
| createInvoice (DRAFT) | inv_e1ec8a036f41 | 97 |

- Idempotent replay of createOpportunity (same key) → revision stayed 97, no duplicate entity.
- Mini Audit price snapshot = 10000 RUB on the opportunity/offer.

## Two latent bugs found and fixed BEFORE the cycle persisted
The E2E (not unit tests) caught them; the gated writer aborted with zero mutation each time:
1. `commands._apply` called the lifecycle fn with swapped args `(args, store)` — actual signature is
   `(store, args)`. First production-path execution surfaced it. Fixed.
2. `_apply` treated an idempotent replay (`engineResult.replayed`) as a write, bumping the global
   revision. Fixed to abort the write on replay (no revision bump, no duplicate).
A regression test (`gate_c1a.test.mjs` AS1–AS13) now exercises the real `_apply` seam end-to-end.

## Invariants after E2E
```
CANONICAL_WRITER_COUNT=1  store_revision=97
HISTORICAL_SENDS=7 (send ledger unchanged)  email ledger unchanged (63)
QUEUE_TOTAL=41 FAILED=0 DEAD_LETTERS=0
TEST_ONLY_ENTITIES=6  REAL_ENTITIES=0  PAYMENTS=0
KPI summary (open_opportunities/deals_won/invoices_due/owner_decisions_required) = 0,0,0,0
  → TEST_ONLY excluded from business KPIs
technical-acceptance endpoint surfaces the 6 TEST_ONLY ids separately (excluded_from_business_kpi=true)
TELEGRAM_PID=7757 unchanged  POLLER=1  IMAP timer active (read-only)
REAL_MESSAGES_SENT=0  SMTP_CALLS=0  PAYMENT_FACTS_CREATED=0
```

## Command safety (production)
```
no-auth opportunity POST          → 401
service-token opportunity POST    → 401 (commands require owner device)
payment route no-auth POST        → 401
payment gate (in-process, owner)  → 403 FEATURE_DISABLED (paymentCommand OFF)
C1A_COMMANDS_ENABLED=6  PAYMENT_COMMANDS_ENABLED=0  SEND_COMMANDS_ENABLED=0
```

## TEST_ONLY cleanup
No safe compensating cleanup command exists in C1-A (deletion is intentionally not a command). Per the
runbook, canonical TEST_ONLY entities are NOT manually deleted. They are proven excluded from KPIs and
their ids are recorded above and in production_post_activation_snapshot.json. They remain visible only
in the technical-acceptance view.
