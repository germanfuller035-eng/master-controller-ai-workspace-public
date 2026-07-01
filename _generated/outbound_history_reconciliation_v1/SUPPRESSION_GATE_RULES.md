# Suppression Gate Rules

SESSION_NAME=OUTBOUND_HISTORY_RECONCILIATION_AND_SUPPRESSION_GATE_V1

## Required Before Any Future SEND_MANUALLY_NOW Recommendation

- `OUTBOUND_HISTORY_CHECK=PASS`
- `SUPPRESSION_CHECK=PASS`
- `DUPLICATE_CONTACT_CHECK=PASS`
- `PRIOR_REPLY_CHECK=PASS`
- `OWNER_RECONTACT_APPROVAL=YES` when prior outreach exists

## Required Outcome If Checks Are Missing

The system must not recommend `SEND_MANUALLY_NOW`. It must use one of:

- `HOLD_FOR_LATER`
- `EDIT_BEFORE_SEND`
- `NEEDS_OWNER_HISTORY_REVIEW`
- `NEEDS_OWNER_OVERRIDE`
- `FOLLOW_UP_ONLY_EXISTING_THREAD`
- `SUPPRESSED_DUPLICATE_OR_NO_REPLY`

## Suppression Classification Rules

1. Same email/domain already received real outreach and no reply: `HOLD_NO_NEW_COLD_SEND`.
2. Same email/domain received repeated sends: `DO_NOT_SEND_WITHOUT_OWNER_OVERRIDE`.
3. Prior reply exists: `DO_NOT_COLD_SEND_USE_REPLY_THREAD_ONLY`.
4. Self-test/test email: `NOT_A_REAL_LEAD`.
5. Preview-only/not sent: `CAN_REVIEW_AS_NEW_IF_OWNER_APPROVES`.
6. History data unavailable or incomplete: `NEEDS_OWNER_HISTORY_REVIEW`.

## Implementation Points

- Android Sales MVP engine now has an outbound history gate and focused suppression tests.
- First Touch candidate scorer now excludes missing history, suppression, duplicate, reply, repeated-contact, self-test, and owner-override cases.
- Owner-visible Android labels are Russian; raw gate constants are kept in evidence/rules only.

NO_SEND_STATUS=PASS
NO_PAYMENT_STATUS=PASS
NO_PRODUCTION_WRITE_STATUS=PASS
