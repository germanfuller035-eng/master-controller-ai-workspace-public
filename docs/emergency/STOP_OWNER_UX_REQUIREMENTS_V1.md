# STOP Owner UX Requirements V1

SESSION=POLICY_SECRETS_AUDIT_EMERGENCY_CONTROL_V1

STOP UI must show:

- what was stopped;
- approvals revoked;
- queues disabled;
- actions still running, if any;
- checkpoint location;
- next safe action.

The UI must avoid secret values and raw payloads. It may show payload hashes, action labels, and redacted targets.
