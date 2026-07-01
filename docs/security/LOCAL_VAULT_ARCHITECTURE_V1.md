# Local Vault Architecture V1

SESSION=POLICY_SECRETS_AUDIT_EMERGENCY_CONTROL_V1
VAULT_STATUS=CONTRACT_ONLY_NOT_DEPLOYED

This session defines a local vault interface without installing Infisical, a production vault, or any vault server.

## Interface

- Secret values are represented by references, not raw values.
- Agents receive only task-scoped grants.
- Grants include actor, purpose, data class, expiry, secret reference, and audit event reference.
- STOP revokes active grants.
- Long-lived raw secrets are not passed to agents.

## Denied

- No secret value in Git.
- No secret value in prompts.
- No secret value in logs or reports.
- No full .env exposure.
- No raw production credential display.
- No direct secret read unless a task-scoped grant exists.
