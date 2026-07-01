# Policy Security Rollback

SESSION_NAME=POLICY_SECRETS_AUDIT_EMERGENCY_CONTROL_V1

Rollback path:

1. Revert the policy/security commit:
   git revert <policy-security-commit>
2. Remove synthetic artifacts only if needed:
   _generated/policy_security_v1/**
3. Re-run foundation validation.

No production rollback is required.
No VPS rollback is required.
No secret rotation is required if no secrets were introduced.
No vault, OPA, MCP, VoltAgent, Qdrant, telemetry, browser automation, or production adapter uninstall is required because none were installed.
