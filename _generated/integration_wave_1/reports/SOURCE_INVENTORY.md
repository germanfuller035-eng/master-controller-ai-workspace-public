# Integration Wave 1 — Source Inventory

date: 2026-06-18 · branch feature/integration-wave-1-commercial-core-v1 · base 34a93d9

All required OS commits are linear ancestors of the base (verified via `git merge-base --is-ancestor`):
Revenue 2ff079d · Delivery 0f642d1 · Finance 9e8ec2f · Product c7300e3 · Integration cd7342d ·
Consolidation 7ea6993 · Launch/Android 34a93d9. LOST_REQUIRED_COMMITS=0, CHERRY_PICK_REQUIRED=NO,
DUPLICATE_IMPORTS_CREATED=0.

## Component classification

| Component | Path | Decision | Notes |
|-----------|------|----------|-------|
| Revenue OS — offer/deal/pricing/economics | tools/revenue_os/lib/{offer,deal,pricing,economics,scope}.mjs | REUSE_AS_IS | `buildOffer`, `buildHandoff`, `resolvePrice`, `economics`, `priceGuard`, `STAGE_META`, `canTransition` |
| Product OS — versioning/spec/catalog | tools/product_os/lib/{versioning,spec,catalog}.mjs | REUSE_AS_IS | `buildSpec`, `validateSpec`, `nextVersion`, `VERSION_TRIGGERS` |
| Delivery OS — creation/lifecycle/acceptance | tools/delivery_os/lib/{creation,lifecycle,acceptance,milestones}.mjs | REUSE_AS_IS | `validateCreation` + project factory |
| Finance OS — invoice/classification/economics | tools/finance_os/lib/{invoice,classification,economics,pnl}.mjs | REUSE_AS_IS | `buildInvoice`, `buildPaymentSchedule`, `canSetInvoiceStatus`, `checkKindConfusion`, `projectProfitability` |
| Integration OS — common/validators/e2e | tools/integration_os/lib/{common,validators,e2e}.mjs | REUSE_AS_IS | ID/event/checksum helpers, CONFIDENCE/EVIDENCE_STATUS vocab, production-mutation guards |
| Executive OS — read models | tools/executive_os/lib/* | KEEP_OFFLINE | read-model consumer only |
| Master Controller store_access | tools/mater_controller_api/src/shared/store_access.mjs | EXTEND_ADDITIVELY | single writer `updateStoreWithRevision`; commercial sections added namespaced |
| Master Controller writes/service | tools/mater_controller_api/src/writes/service.mjs | ADAPT | pattern for revision+idempotency commands; commercial commands follow it |
| Master Controller server routes | tools/mater_controller_api/src/server/index.mjs | EXTEND_ADDITIVELY | add feature-gated commercial read/command routes (contract-complete, production-disabled) |
| Android app | apps/mater_controller_android | EXTEND_ADDITIVELY | add read-only commercial views; reuse RC5 offline cache contract; no new root tab |

## What is what
- WHAT_ALREADY_EXISTS: all four domain engines + integration standard + MC single-writer store + Android shell.
- WHAT_IS_OFFLINE_ONLY: every OS engine (Integration OS hard-codes PRODUCTION_MUTATION_ALLOWED=false etc.).
- WHAT_CAN_BE_REUSED: offer/deal/pricing, product versioning/spec, delivery creation, finance invoice/classification/profitability, integration common.
- WHAT_REQUIRES_ADAPTER: a thin `commercial_core` orchestrator that composes the engines into one Lead→…→Profitability lifecycle over a single MC-writer abstraction.
- WHAT_REQUIRES_NEW_API: feature-gated `/api/v1/commercial|opportunities|offers|deals|delivery|finance` read + command contracts.
- WHAT_REQUIRES_NEW_ENTITY_STORAGE: additive namespaced sections (commercial.*, delivery.*, finance.*) — PREPARED_NOT_APPLIED migration.
- WHAT_MUST_REMAIN_READ_ONLY: Android views; all OS engines (no production transport); profitability/payment classification.

## Rule applied
No new engine is created where one exists. `commercial_core` is an orchestration/adapter layer only —
it calls the existing OS libs and routes every mutation through one MC-writer seam. No second canonical
writer, no parallel ledger, no parallel approval/deal/payment truth.
