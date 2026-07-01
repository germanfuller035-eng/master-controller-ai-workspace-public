# Integration Wave 1 — Ownership Matrix

date: 2026-06-18 · machine-readable: _generated/integration_wave_1/data/ownership_matrix.json

Master Controller is the single production mutation boundary. Every commercial entity's production
writer is `master_controller` (via the commit seam); the *domain* owner is the OS that owns the
business logic, but it never writes production truth directly.

| Entity | Authoritative domain | Production writer | Revision/Idempotency owner | Event producer |
|--------|----------------------|-------------------|----------------------------|----------------|
| Lead | Master Controller | master_controller | master_controller | master_controller |
| Opportunity | Revenue OS | master_controller | master_controller | commercial_core |
| Product spec | Product OS | product_os | product_os | product_os |
| Offer | Revenue OS | master_controller | master_controller | commercial_core |
| Owner decision | MC approval | master_controller | master_controller | master_controller |
| Deal | Revenue OS | master_controller | master_controller | commercial_core |
| Delivery handoff | Delivery OS | master_controller | master_controller | commercial_core |
| Project | Delivery OS | master_controller | master_controller | commercial_core |
| Invoice | Finance OS | master_controller | master_controller | commercial_core |
| Payment | Finance OS | master_controller | master_controller | commercial_core |
| Send ledger | Master Controller | master_controller | master_controller | master_controller |
| Approval truth | Master Controller | master_controller | master_controller | master_controller |

## Invariants (proven by tests SW1–SW3 + security scan SEC5–SEC7)
```
DUPLICATE_CANONICAL_WRITERS = 0   (exactly one commit() exporter: store.mjs)
PARALLEL_LEDGERS            = 0   (no *_ledger section/key; send ledger stays in MC)
PARALLEL_APPROVAL_TRUTHS    = 0   (owner decision + approval truth owned by MC)
PARALLEL_LEAD_TRUTH         = 0
PARALLEL_DEAL_TRUTH         = 0   (one commercial.deals section)
PARALLEL_PAYMENT_TRUTH      = 0   (one finance.payments section)
UNOWNED_ENTITIES           = 0
MULTI_OWNER_ENTITIES       = 0
```
