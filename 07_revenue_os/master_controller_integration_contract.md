---
type: integration_contract
status: proposed
related_project: revenue_os
updated: 2026-06-17
canonical_target: 07_revenue_os/master_controller_integration_contract.md
apply_status: PROPOSED_AFTER_SOAK
tags: [revenue_os, master_controller, integration, contract]
---

# Revenue OS ↔ Master Controller — Future Integration Contract

> **Future contract only.** Nothing here is implemented or deployed during the soak. Revenue OS
> never directly mutates Master Controller (MC) canonical state. All persistence flows through the
> MC API with owner approval.

## Direction of data

### Revenue OS CONSUMES (read-only) from MC API
| Field | Notes |
| --- | --- |
| canonical_lead_id | the only lead identity; Revenue OS never invents lead IDs |
| verified_identity | business identity verified by MC/Lead Hunter |
| digital_maturity | maturity signal (Revenue OS may re-derive from evidence) |
| evidence | verified evidence claims (provenance preserved) |
| score_v1 | base lead score |
| candidate_score_v2 | Lead Hunter discovery score |
| audit | canonical audit result |
| draft | canonical draft (owner-facing) |
| reply | canonical client reply |
| follow_up | canonical follow-up state |
| status | canonical lead/pipeline status |
| revision | optimistic-concurrency revision token |

### Revenue OS RETURNS (as recommendations only)
| Field | Notes |
| --- | --- |
| recommended_product | primary product id |
| secondary_product | secondary product id |
| reason_codes | explainability |
| price_proposal | from pricing engine (status-labeled) |
| scope_template | scope object |
| offer_draft | INTERNAL_REVIEW offer (never CLIENT_READY without owner) |
| commercial_risk_flags | blockers/risks |

## Hard prohibitions (Revenue OS must NOT directly mutate)
- lead status · approval · send state · reply state · follow-up state · ledgers.

## Mutation flow (future, owner-gated)
```
Revenue OS (recommendation)
  → Master Controller API (validation)
  → owner approval
  → canonical persistence (MC is the sole writer)
```

## Concurrency & idempotency
- Revenue OS includes the `revision` it read; MC API rejects stale writes.
- Recommendations are idempotent: same lead + same evidence revision → same recommendation id.
- No bidirectional sync; MC remains the single source of operational truth.

## API shape proposal (illustrative, not implemented)
```
GET  /api/v1/leads/{id}                      -> lead + evidence + audit + status + revision
POST /api/v1/leads/{id}/recommendation       -> { recommended_product, reason_codes, ... }  (advisory)
POST /api/v1/leads/{id}/offer-draft          -> { offer_draft (INTERNAL_REVIEW) }            (advisory)
# Any state change (status/approval/send) remains an MC-owned, owner-approved endpoint.
```

## Soak safety
- Implementation, wiring, and deployment are deferred until after the v0.4.0-rc1 soak closes and
  the owner explicitly approves. This document is the contract, not the code.

## Related
- [[00_MASTER_CONTEXT/AI_SYSTEM_MAP]]
- [[07_revenue_os/conversation_hub_architecture]]
- [[07_revenue_os/revenue_os_command_center]]
