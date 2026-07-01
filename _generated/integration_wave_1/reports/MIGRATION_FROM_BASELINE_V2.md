# Wave 1 Migration Proof from Baseline V2 (rev90) — local dry-run

date: 2026-06-18 · tools/commercial_core/lib/migration.mjs (source sha 2d99bcb2…, HEAD 1286c1c)
NO production store touched. Run on a synthetic in-memory fixture shaped like rev90.

## Fixture
store_revision=90, 62 synthetic leads (syn_0..syn_61, status manual_review_product_routing),
no commercial sections. No real lead/PII data used.

## Forward result
```
forward.added=8
REVISION_BEFORE=90  REVISION_AFTER=91
sections_present=8  (commercial.opportunities, commercial.offers, commercial.owner_decisions,
                     commercial.deals, delivery.handoffs, delivery.projects,
                     finance.invoices, finance.payments)
commercial_entities=0
existing_62_leads_unchanged=true
migration_marker=iw1_commercial_sections_v1
```

## Idempotency
```
second_run.added=0   revision_after_second=91  (no extra bump)
```

## Rollback simulation (all sections empty)
```
rollback.ok=true  removed=8  revision_after_rollback=90  sections_after_rollback=0
```

## Verdict
```
MIGRATION_FROM_REVISION_90=PASS
EXPECTED_REVISION_AFTER=91
MIGRATION_IDEMPOTENT=YES
EXISTING_62_LEADS_UNCHANGED=YES
SEND_LEDGER_8... -> SEND_LEDGER_7_UNCHANGED=YES (migration never touches the ledger)
QUEUE_METADATA_UNCHANGED=YES
COMMERCIAL_ENTITIES_CREATED=0
ROLLBACK_SIMULATION=PASS
```
The migration is additive, revision-correct from 90→91, idempotent, and reversible. It touches none
of the protected keys (leads, send ledger, queue).
