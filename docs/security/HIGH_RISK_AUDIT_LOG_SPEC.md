# High-Risk Audit Log Spec

SESSION=POLICY_SECRETS_AUDIT_EMERGENCY_CONTROL_V1
STATUS=SYNTHETIC_SCHEMA_AND_HASH_CHAIN

Each R4/R5 event records:

- sequence
- timestamp
- actor
- task_id
- action
- resource
- risk
- payload_hash
- approval_id when applicable
- result
- previous_hash
- current_hash

The log must not record secret values, full payloads, raw credentials, .env contents, private keys, or production data dumps.

Policy/security v1 validates synthetic JSONL fixtures only. It does not mutate a production ledger.
