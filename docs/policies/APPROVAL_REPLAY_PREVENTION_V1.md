# Approval Replay Prevention V1

SESSION=POLICY_SECRETS_AUDIT_EMERGENCY_CONTROL_V1
STATUS=SYNTHETIC_MODEL_VALIDATED

Replay is blocked by combining:

- a unique approval_id;
- an exact payload_hash;
- single_use=true;
- expiry;
- synthetic ledger tracking used approval ids and hashes;
- STOP revocation for active approvals.

An approval is invalid when the same approval_id or payload_hash is seen again. The synthetic policy decision tests cover valid first use and denied second use.

## Future Runtime Requirements

A future gateway must persist the used-approval ledger in an append-only store before executing R4/R5 actions. Policy/security v1 only defines and tests the local model.
