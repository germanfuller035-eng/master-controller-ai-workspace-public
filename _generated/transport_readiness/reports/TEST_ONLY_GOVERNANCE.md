# TEST_ONLY Governance

date: 2026-06-18 · 6 TEST_ONLY entities from the Gate C1-A acceptance E2E.

## The 6 entities (from prod technical-acceptance)
opportunity opp_cbdb073cd628, offer offer_47a06f465083, deal deal_e1ca9ea0820c,
handoff handoff_5be519c2acbd, project proj_81ae52b3536d, invoice inv_e1ec8a036f41.
All carry `test_only=true`.

## Exclusion proofs (verified)
```
TEST_ONLY_EXCLUDED_FROM_REVENUE=YES        (commercialSummary/financeSummary filter test_only)
TEST_ONLY_EXCLUDED_FROM_DEALS=YES          (deals_won counts real only)
TEST_ONLY_EXCLUDED_FROM_INVOICES_DUE=YES   (unpaid/due exclude test_only)
TEST_ONLY_EXCLUDED_FROM_OWNER_ACTIONS=YES  (owner_decisions_required real only)
TEST_ONLY_SEND_ELIGIBLE=NO                 (no send path at all)
TEST_ONLY_PAYMENT_ELIGIBLE=NO              (payment command OFF; no payment entity)
VISIBLE_IN_TECHNICAL_VIEW=YES              (GET /commercial/technical-acceptance)
```
After the real-lead prep, KPI shows open_opps=1 (the REAL opportunity only) — confirming TEST_ONLY
stays excluded even alongside a real entity.

## Lifecycle: ARCHIVE_TEST_ONLY_ACCEPTANCE_RUN (no deletion)
`commands.archiveTestOnly` (route POST /commercial/test-only/archive, C1-A gated, owner-only,
idempotency + revision). Marks each test_only entity `archived_status=TEST_ONLY_ARCHIVED`. Refuses if
ANY real entity (`REAL_ENTITIES_PRESENT`) or any payment (`PAYMENTS_PRESENT`) exists; idempotent
(archived=0 → no revision bump). Never deletes — archives only, preserving auditability.

IMPORTANT: because a REAL opportunity/offer now exists in the store (pilot prep), the archive command
would correctly REFUSE (`REAL_ENTITIES_PRESENT`). So archiving was NOT run on production in this pass —
that is the safe behaviour. The command is verified by unit tests (gate refuse + idempotent) and is
available for a future window when only test entities exist.

## Android
TEST_ONLY hidden from normal views; «Тестовые коммерческие записи» technical screen with a TEST badge
and per-type counts, reachable from the commercial summary "Техническое" section.

```
TEST_ONLY_ENTITIES_TOTAL=6  TEST_ONLY_ARCHIVED=NO (refused: real entity present — correct)
TEST_ONLY_EXCLUDED_FROM_KPI=YES  TEST_ONLY_EXCLUDED_FROM_OWNER_QUEUES=YES
TEST_ONLY_SEND_ELIGIBLE=NO  TEST_ONLY_PAYMENT_ELIGIBLE=NO
```
