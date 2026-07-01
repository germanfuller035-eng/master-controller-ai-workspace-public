# QA / Red-Team Checklist

Run this manually before any owner-approved manual send.

```text
LEAD_ID=
QA_REVIEWER=
DATE=
OVERALL_DECISION=PASS/BLOCK
BLOCK_REASON=
```

## Blocking Checks

Block the draft if any answer is YES:

- Unsupported claims are present.
- Fake revenue numbers are present.
- Fake case studies are present.
- Fake deadlines are present.
- Aggressive guarantees are present.
- Hidden auto-send behavior is involved.
- Payment request is present.
- Production write is required.
- Sensitive personal, military, medical, or protected data is used.
- Real lead/contact data would be committed to git.
- The owner cannot explain the product fit in plain language.

## Pass Checks

All must be YES before manual send:

- Facts are owner-verified.
- Assumptions are labeled.
- Risks are visible.
- What is not promised is visible.
- No-send status is PASS.
- No-payment status is PASS.
- No-production-write status is PASS.
- Owner approval is explicit.
