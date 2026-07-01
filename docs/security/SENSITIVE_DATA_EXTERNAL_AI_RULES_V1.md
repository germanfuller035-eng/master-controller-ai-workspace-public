# Sensitive Data External AI Rules V1

SESSION=POLICY_SECRETS_AUDIT_EMERGENCY_CONTROL_V1

External AI processing rules:

- PUBLIC: allowed.
- BUSINESS_INTERNAL: allowed when task-scoped and useful.
- CLIENT_CONFIDENTIAL: owner approval required unless minimized to non-sensitive summary.
- PERSONAL_CONFIDENTIAL: owner approval required and minimized.
- MILITARY_MEDICAL: explicit owner approval required; deny by default.
- SECRETS: denied.

Prompt/log/report output must redact secrets and minimize confidential data.
