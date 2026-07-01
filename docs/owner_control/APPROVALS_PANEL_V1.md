# Approvals Panel V1

The approvals panel displays synthetic R4/R5 cards. It does not execute real approvals.

Every R4/R5 card requires:

- exact payload hash
- actor, action, target, payload, risk, expiry, and task id
- human-readable risk explanation with what, who, why, cost, and rollback
- evidence references

R5 cards also require strong approval fields for future PIN or biometric confirmation, repeated description, short delay, and one-time approval.

STOP revokes active approvals and denies new R4/R5 approvals until cleared in a future stage.
