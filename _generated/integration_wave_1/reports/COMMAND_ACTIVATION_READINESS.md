# Command Activation Readiness — Integration Wave 1 (PREP ONLY, NOT APPROVED)

date: 2026-06-18 · ALL commands PRODUCTION_STATUS=OFF · this document activates nothing.

Gate B activates READ-ONLY only. The 7 command endpoints stay disabled (COMMERCIAL_COMMAND_API=OFF).
Command activation is a SEPARATE future gate requiring its own owner approval.

## Per-command classification
| command | business_effect | entities_changed | revision | idempotency | owner_confirm | double_confirm | rollback | send_capable | status |
|---|---|---|---|---|---|---|---|---|---|
| POST /opportunities | create opportunity | commercial.opportunities | required | required | required | no | reverse-empty/delete entity | no | OFF |
| POST /opportunities/:id/prepare-offer | draft offer | commercial.offers | required | required | required | no | delete draft offer | no | OFF |
| POST /offers/:id/decision | record owner decision | commercial.owner_decisions | required | required | required | yes | mark superseded | no | OFF |
| POST /deals/:id/delivery-handoff | open handoff | commercial.deals, delivery.handoffs | required | required | required | yes | reverse handoff | no | OFF |
| POST /delivery/handoffs/:id/create-project | create project | delivery.projects | required | required | required | no | delete project | no | OFF |
| POST /finance/invoices | invoice DRAFT | finance.invoices | required | required | required | yes | void draft | no | OFF |
| POST /finance/payments/record | record payment FACT | finance.payments | required | required | required | yes (proof) | reverse entry | no | OFF |

## Staged future gates (NOT this Wave)
- Gate C1 (internal-safe, no send): opportunity, offer draft, owner decision, handoff, project,
  invoice draft. All OWNER_CONFIRM_REQUIRED; none send-capable.
- Gate C2 (financial facts): payment evidence / payment FACT — DOUBLE_CONFIRM + proof, separate approval.
- Gate C3 (transport): email/Telegram sends — NOT in this Wave; double confirmation; autosend stays
  PROHIBITED; SEND_ALLOWED_LIVE stays OFF.

## Current invariants (must hold before any C gate)
COMMERCIAL_COMMAND_API=OFF · COMMERCIAL_SEND=OFF · AUTOSEND=BLOCKED · SEND_ALLOWED_LIVE=OFF ·
single writer · read-only API only.
