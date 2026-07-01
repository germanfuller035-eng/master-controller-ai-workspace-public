# Approvals And STOP UX V1

SESSION=POLICY_SECRETS_AUDIT_EMERGENCY_CONTROL_V1
STATUS=OWNER_UX_CONTRACT_ONLY

Approval UI must show:

- what will happen;
- actor and target;
- why the action is requested;
- amount or scope;
- risk level;
- payload hash;
- expiry;
- cancel or rollback possibility;
- data changed;
- exact owner action required.

R5 UI must require future PIN or biometric confirmation, repeated human description, a short delay, and one-time approval. Approval reuse is forbidden.

STOP UI must show what was stopped, approvals revoked, queues disabled, remaining running actions, checkpoint location, and next safe action.
