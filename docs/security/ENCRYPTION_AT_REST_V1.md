# Encryption At Rest V1

SESSION=POLICY_SECRETS_AUDIT_EMERGENCY_CONTROL_V1
STATUS=RULES_ONLY_NOT_DEPLOYED

Rules:

- Secrets are not stored in Git.
- Confidential operational data must be minimized before storage.
- Future vault material must be encrypted at rest by the vault provider.
- Local synthetic fixtures must not contain real secrets.
- Audit logs store payload hashes and references, not raw secret values.

No new encrypted store is deployed in this session.
