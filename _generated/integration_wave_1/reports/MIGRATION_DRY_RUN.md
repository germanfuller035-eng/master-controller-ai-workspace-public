# Integration Wave 1 — Migration Dry-Run

date: 2026-06-18 · migration iw1_commercial_sections_v1 · executable ref tools/commercial_core/lib/migration.mjs
suite: tools/commercial_core/tests/migration_dryrun.mjs (20/20 PASS) · result: data/migration_dry_run_result.json

## Environment
Synthetic production-like store ONLY (in-memory + temp dir). No production canonical path, no network,
no credentials. Seed: revision 66, 2 leads, 7 send-ledger lines, 1 reply, 1 followup, queue 28/0/0.

## Run 1 (forward)
- DR1 added all 8 sections (commercial.opportunities/offers/owner_decisions/deals,
  delivery.handoffs/projects, finance.invoices/payments).
- DR3 every commercial section empty after migration.
- DR4 store_revision bumped exactly once (66 → 67).
- DR5–DR8 existing leads / send ledger (7) / replies / queue byte-identical (checksum match).
- DR9 migration marker recorded.

## Run 2 (idempotency)
- DR10 added 0 sections; DR11 store byte-identical to post-run-1; DR12 revision NOT bumped again;
  DR13 no duplicate namespaces.

## Rollback simulation
- DR14 reverse removed all 8 empty sections; DR15–DR17 leads/ledger/queue restored to baseline
  (revision decremented back to 66); DR18 no commercial sections remain.
- DR19 reverse REFUSES when a section holds an entity (REFUSE_NONEMPTY_SECTIONS); DR20 refusal
  preserves existing leads.

```
MIGRATION_ADDITIVE_ONLY=YES
MIGRATION_IDEMPOTENT=YES
SECOND_RUN_CHANGED_DATA=NO
DUPLICATE_NAMESPACES=0
EXISTING_LEADS_UNCHANGED=YES
EXISTING_SEND_LEDGER_UNCHANGED=YES
EXISTING_QUEUE_UNCHANGED=YES
REVISION_RULES_PRESERVED=YES
ROLLBACK_SIMULATION=PASS
BLIND_FULL_STORE_RESTORE_REQUIRED=NO
REAL_ENTITIES_CREATED=0
UNRELATED_DATA_LOSS=0
```
