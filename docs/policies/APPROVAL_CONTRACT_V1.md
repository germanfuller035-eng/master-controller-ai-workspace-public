# Approval Contract V1

SESSION=POLICY_SECRETS_AUDIT_EMERGENCY_CONTROL_V1
STATUS=CONTRACT_ONLY_LOCAL_SYNTHETIC

## Required Payload

Every R4/R5 approval request must contain:

- actor
- action
- target
- payload
- risk
- expiry
- task_id

The payload hash is calculated from those fields using canonical JSON and SHA-256. The approval grant binds to that exact hash.

## Grant Rules

- R4 requires OWNER_APPROVAL.
- R5 requires STRONG_OWNER_APPROVAL.
- Grants are single-use.
- Grants expire.
- Grants are invalid if the payload hash changes.
- Replayed approval ids or payload hashes are denied.
- STOP revokes active grants.

## Not Implemented

- No real approval UI is implemented in this session.
- No production enforcement is deployed.
- No runtime approval server is installed.
