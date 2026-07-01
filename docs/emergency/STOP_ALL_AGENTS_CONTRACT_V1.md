# STOP All Agents Contract V1

SESSION=POLICY_SECRETS_AUDIT_EMERGENCY_CONTROL_V1
STOP_STATUS=SYNTHETIC_VALIDATED_NOT_DEPLOYED

STOP_ALL_AGENTS must:

- checkpoint or pause R0/R1 local analysis;
- cancel or block R4/R5 actions;
- disable outbound queues;
- disable production write queues;
- disable payment queues;
- disable browser action queues;
- revoke active approvals;
- generate a local checkpoint/report.

No production STOP runtime is deployed in this session.
