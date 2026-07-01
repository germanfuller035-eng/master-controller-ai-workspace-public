# STOP State Machine V1

SESSION=POLICY_SECRETS_AUDIT_EMERGENCY_CONTROL_V1

States:

- INACTIVE
- ACTIVATING
- ACTIVE
- REVIEW
- CLEARED_BY_OWNER

ACTIVE blocks outbound, production writes, payments, browser actions, R4 approvals, R5 approvals, and direct secret grants. Clearing STOP requires a future owner action and is not implemented here.
