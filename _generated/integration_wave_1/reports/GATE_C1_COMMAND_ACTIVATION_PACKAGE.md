# Gate C1 — Command Activation Package (TECHNICAL — NOT APPROVED, NOT EXECUTED)

date: 2026-06-18 · COMMERCIAL_COMMAND_API=OFF · GATE_C1_APPROVED=NO · GATE_C1_EXECUTED=NO
This package describes how the seven commercial commands WOULD be activated. Nothing here is run.
Activation is a SEPARATE future owner gate. Wave 1 ships read-only.

## What already exists (verified live at Gate B)
- All 7 command routes are registered and reachable, but gated: command flag OFF →
  HTTP 403 FEATURE_DISABLED, and the command engine is provably never reached
  (in-process probe: ENGINE_REACHED=false; 7/7 disabled).
- The single-writer commit seam (commercial_core/store.mjs commit()) enforces expectedRevision
  (409) + idempotency (replay returns prior result, no second mutation).
- Eight namespaced sections exist and are EMPTY (migration iw1_commercial_sections_v1, revision 91).
- No send path exists anywhere in the engine (send_capability: NONE on every entity).

## The seven commands (see gate_c1_command_matrix.json for the full matrix)
| # | Route | Effect | Entities | Owner conf | Send | Stage |
|---|---|---|---|---|---|---|
| 1 | POST /opportunities | create opportunity | commercial.opportunities | single | NONE | C1-A |
| 2 | POST /opportunities/:id/prepare-offer | snapshot offer | commercial.offers | single | NONE | C1-A |
| 3 | POST /offers/:id/decision | record owner decision | commercial.offers | single (authority) | NONE | C1-A |
| 4 | POST /deals/:id/delivery-handoff | handoff from WON deal | delivery.handoffs | single | NONE | C1-A |
| 5 | POST /delivery/handoffs/:id/create-project | create project | delivery.projects | single | NONE | C1-A |
| 6 | POST /finance/invoices | DRAFT invoice (TARGET) | finance.invoices | single | NONE | C1-A |
| 7 | POST /finance/payments/record | payment FACT → invoice PAID | finance.payments, finance.invoices | **double** | NONE | **C1-B** |

Note: `winDeal` (Opportunity→Deal WON) exists in the engine but is NOT exposed as a Wave-1 route;
it is reached indirectly only after an APPROVED owner decision. Expose explicitly under C1 design.

## Stage split
- **C1-A — safe internal commands (no send, no financial FACT):** opportunity, prepare-offer,
  owner-decision, handoff, create-project, invoice-draft. All additive, revision-guarded, idempotent,
  reversible while downstream-empty. Lowest risk → first activation candidate.
- **C1-B — financial FACT:** payment-evidence (recordPayment). Writes a FACT (invoice→PAID).
  Requires a SEPARATE evidence gate: owner double confirmation + evidenceType + evidenceReference.
  Never auto, never from text. Corrections are reversing evidence entries, not deletions.
- **C1-C — transport (FORBIDDEN):** email send, Telegram client send, follow-up send. NOT part of
  any C1 stage. Stays OFF: COMMERCIAL_SEND=false, EMAIL_REAL_SEND_ENABLED=false, MATER_NO_SEND=true.

## Activation preconditions (ALL required before any C1 execution)
1. Fresh owner approval bound to a captured baseline (revision/leads/ledger/queue).
2. Verified backup + rollback assets (as in Gate B).
3. Synthetic E2E of the full chain on a byte-copy fixture (opportunity→…→payment) PASS.
4. C1-A and C1-B activated SEPARATELY (A first, observe, then B).
5. Send remains OFF and is proven OFF after activation (ledger unchanged, SMTP calls 0).

## Activation mechanism (when approved — NOT now)
- Flip `COMMERCIAL_COMMAND_API=true` in /etc/master-controller/master-controller.env (C1-A only first).
- Keep `COMMERCIAL_SEND=false`. Restart only master-controller-api.
- Owner device token (requireAuth) is mandatory; service tokens cannot invoke commands.

GATE_C1_APPROVED=NO · GATE_C1_EXECUTED=NO · COMMERCIAL_COMMAND_API=OFF
