# Integration Wave 1 — Storage Plan

date: 2026-06-18 · migration: _generated/integration_wave_1/migrations/iw1_commercial_sections_v1.json (PREPARED_NOT_APPLIED)

## Decision: additive namespaced sections, single MC writer
Priority order evaluated: (1) reuse existing MC repository abstraction — CHOSEN; (2) namespaced
canonical sections — CHOSEN as the shape; (3) API-managed additive repository; (4) separate physical
store — REJECTED (no proven need, would risk a second truth).

Seven additive sections, all owned by the one MC writer (`updateStoreWithRevision` in prod;
`store.commit` in the offline reference):
```
commercial.opportunities   commercial.offers   commercial.deals
delivery.handoffs          delivery.projects
finance.invoices           finance.payments
```

## Migration (NOT applied)
- additive · reversible · idempotent · backup-first · revision-guarded.
- Forward: create any absent section as `{}`; never overwrite; bump revision once if anything added.
- Reverse: drop the seven sections ONLY if all empty; refuse if any holds entities.
- Touches NO existing key (leads, store_revision, queue). No production file accessed in this branch.
- Execution gated to Gate B + owner approval AFTER the Telegram soak verdict.

## Why no schema bump on Android
The commercial views are read-only and use the existing `cache_kv` table (RC5 read-through). Room
schema stays v2; no Android migration. Pairing + existing cache survive any future install.
