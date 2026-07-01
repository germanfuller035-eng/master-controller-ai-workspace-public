# Audit Hash Chain V1

SESSION=POLICY_SECRETS_AUDIT_EMERGENCY_CONTROL_V1
TOOL=tools/audit/audit_hash_chain.py

Hash rule:

CURRENT_HASH=SHA256(canonical_json(event_without_current_hash))

Validation rejects:

- missing required fields;
- missing payload_hash;
- sequence gaps;
- previous_hash mismatch;
- event tampering;
- reused approval_id;
- secret-looking values.

The first event uses previous_hash=GENESIS. This session validates synthetic fixtures only.
