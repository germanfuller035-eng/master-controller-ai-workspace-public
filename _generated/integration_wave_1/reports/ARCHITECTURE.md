# Integration Wave 1 — Architecture

date: 2026-06-18 · branch feature/integration-wave-1-commercial-core-v1 · base 34a93d9

## Shape
```
OS engines (reused, offline)         Single mutation boundary            Read side
─────────────────────────────       ────────────────────────           ──────────────
revenue_os  (offer/deal/pricing)  ┐
product_os  (versioning/spec)     ├─► commercial_core/lifecycle.mjs ─► commercial_core/store.commit ─► sections{}  ─► read models ─► API reads ─► Android
delivery_os (creation/lifecycle)  │        (orchestrator/adapter)         (revision + idempotency,        (projections)   (feature-gated)   (RC5 cache)
finance_os  (invoice/classify)    ┘         NO new engine                  one writer, one ledger)         events
```

`commercial_core` is an **orchestration/adapter layer**, not a new engine. It calls existing OS libs
and routes every state change through ONE writer seam (`store.commit`, mirroring Master Controller's
`updateStoreWithRevision`). Mirrors the production rule: Master Controller is the single mutation
boundary; OS modules emit command objects, never write production truth directly.

## Allowed vs forbidden flow
- Allowed: OS engine → command object → commit() validation (revision/idempotency) → section mutation → event/read-model.
- Forbidden (and statically scanned): OS → direct JSON write · OS → own DB writer · OS → direct send · OS → duplicate ledger.

## Production posture
Everything in this branch is offline. Commercial read API is feature-gated off until Gate B; commands
off until owner approval; send capability permanently NONE for Wave 1. Migration is PREPARED_NOT_APPLIED.
The Telegram soak and production runtime are untouched (no VPS access in this branch).
