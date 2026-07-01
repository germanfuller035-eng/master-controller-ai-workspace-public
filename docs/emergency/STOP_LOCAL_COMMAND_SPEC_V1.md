# STOP Local Command Spec V1

SESSION=POLICY_SECRETS_AUDIT_EMERGENCY_CONTROL_V1
TOOL=tools/emergency/simulate_stop.py

The local command accepts a synthetic state containing workflows, approvals, feature flags, and queues. It outputs:

- workflows checkpointed or cancelled;
- approvals revoked;
- queues disabled;
- checkpoint generated;
- stopped-action report.

The command is deterministic and idempotent. It does not contact production systems.
