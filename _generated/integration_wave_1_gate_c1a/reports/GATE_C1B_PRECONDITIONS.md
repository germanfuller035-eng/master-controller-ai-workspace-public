# Gate C1-B — Preconditions (NOT APPROVED)

date: 2026-06-18 · GATE_C1B_STATUS=NOT_APPROVED · COMMERCIAL_PAYMENT_COMMAND=OFF

Gate C1-B is the activation of the single payment command `recordPayment` (POST
/finance/payments/record). It records a financial FACT (invoice → PAID). It is OUT of the C1-A
approval and remains gated by `COMMERCIAL_PAYMENT_COMMAND=false` (verified: returns 403
FEATURE_DISABLED even for an authenticated owner).

## Required before C1-B activation (all)
1. Separate explicit owner approval bound to a captured baseline.
2. Double confirmation in the UI + required evidenceType AND evidenceReference (engine already
   enforces PAYMENT_EVIDENCE_REQUIRED).
3. A payment is a FACT: classification=FACT, confidence=OWNER_CONFIRMED, verified_by=owner. Never auto,
   never derived from text/email.
4. Corrections are reversing evidence entries under separate approval — never deletion.
5. Verified backup + rollback assets, as for C1-A.
6. A synthetic TEST_ONLY payment E2E on a byte-copy fixture proving: invoice→PAID, classification FACT,
   no send, idempotent, revision-guarded.
7. Send remains OFF and proven OFF after activation (ledger unchanged, SMTP calls 0).

## Mechanism (when approved — not now)
Flip `COMMERCIAL_PAYMENT_COMMAND=true` (only). `COMMERCIAL_SEND` stays false. Restart only API.
`recordPayment` then reachable for owner device with idempotency + expectedRevision.

```
GATE_C1B_APPROVED=NO  GATE_C1B_EXECUTED=NO  COMMERCIAL_PAYMENT_COMMAND=OFF
```
