# Payload Hashing V1

SESSION=POLICY_SECRETS_AUDIT_EMERGENCY_CONTROL_V1
STATUS=IMPLEMENTED_LOCAL_TOOL
TOOL=tools/policies/payload_hash.py

## Algorithm

PAYLOAD_HASH=SHA256(canonical_json(required_payload_fields))

Canonical JSON uses:

- UTF-8 encoding;
- sorted object keys;
- compact separators;
- no volatile fields unless explicitly allowlisted for exclusion.

Required fields:

- actor
- action
- target
- payload
- risk
- expiry
- task_id

Allowlisted volatile exclusions:

- requested_at
- request_id
- display_nonce

Unknown exclusions fail closed. Missing required fields fail closed. The tool prints only the hash and never prints payload values in errors.
