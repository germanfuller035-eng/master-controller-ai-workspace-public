# Integration Wave 1 — API Contract

date: 2026-06-18 · branch feature/integration-wave-1-commercial-core-v1 · status CONTRACT_COMPLETE / PRODUCTION_DISABLED

All endpoints are additive to the Master Controller API and **feature-gated off in production** until
Gate B (reads) / owner approval (commands). Uniform envelope `{ ok, data, error, requestId }`. Commands
require an authenticated device, authorization, an idempotency key, and (where applicable) a matching
`expectedRevision` → 409 on mismatch. No command sends a message or implies success without a committed
mutation.

## Feature gates
```
COMMERCIAL_READ_API     = false_in_production_until_deploy
COMMERCIAL_COMMAND_API  = false_in_production_until_owner_approval
COMMERCIAL_SEND         = false   (permanent for Wave 1)
```

## Read endpoints (9 core + detail variants = 16)
| Method | Path | Returns |
|--------|------|---------|
| GET | /api/v1/commercial/summary | owner commercial summary read model |
| GET | /api/v1/opportunities | opportunity list (paginated) |
| GET | /api/v1/opportunities/:id | opportunity detail (lead, product, offer, decision, deal, next action) |
| GET | /api/v1/products | versioned product catalog (18 total; 2 ACTIVE) |
| GET | /api/v1/products/:id | product spec + version |
| GET | /api/v1/offers | offer list |
| GET | /api/v1/offers/:id | offer snapshot detail |
| GET | /api/v1/deals | deal list |
| GET | /api/v1/deals/:id | deal detail |
| GET | /api/v1/delivery/handoffs | handoff list |
| GET | /api/v1/delivery/projects | project list |
| GET | /api/v1/delivery/projects/:id | project detail |
| GET | /api/v1/finance/summary | finance summary (FACT/TARGET/ESTIMATE/UNKNOWN) |
| GET | /api/v1/finance/invoices | invoice list |
| GET | /api/v1/finance/invoices/:id | invoice detail |
| GET | /api/v1/commercial/integration-status | engine/contract health (read-only) |

## Command endpoints (7) — contract-complete, production-disabled
| Method | Path | Engine fn | Gating |
|--------|------|-----------|--------|
| POST | /api/v1/opportunities | createOpportunity | lead verified; product exists |
| POST | /api/v1/opportunities/:id/prepare-offer | prepareOffer | product ACTIVE + versioned |
| POST | /api/v1/offers/:id/decision | recordOwnerDecision | owner-only; APPROVE/REJECT/… |
| POST | /api/v1/deals/:id/delivery-handoff | createHandoff | deal WON + version |
| POST | /api/v1/delivery/handoffs/:id/create-project | createProject | idempotent (one project) |
| POST | /api/v1/finance/invoices | createInvoice | deal exists; classification TARGET |
| POST | /api/v1/finance/payments/record | recordPayment | evidence required → FACT |

## Error taxonomy (subset)
LEAD_NOT_VERIFIED, PRODUCT_NOT_FOUND, PRODUCT_NOT_ACTIVE, PRODUCT_VERSION_REQUIRED,
OWNER_APPROVAL_REQUIRED, DEAL_WON_REQUIRED, PAYMENT_EVIDENCE_REQUIRED, MISSING_IDEMPOTENCY,
REVISION_CONFLICT (HTTP 409), INVALID_DECISION. Each maps to an owner-facing Russian message in Android.

## Invariants
Every command routes through the single MC writer seam (commercial_core/store.commit, mirroring
updateStoreWithRevision). No endpoint performs a direct store write, opens a transport, or returns an
optimistic success.
