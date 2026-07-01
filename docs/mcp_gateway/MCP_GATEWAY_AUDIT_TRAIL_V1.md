# MCP Gateway Audit Trail V1

Every gateway call emits a synthetic audit event under `_generated/mcp_gateway_v1/synthetic_audit/events.jsonl`.

## Fields

- sequence
- timestamp
- request_id
- task_id
- actor
- adapter_id
- action
- resource
- risk
- policy_decision
- result
- artifact_ids
- payload_hash
- previous_hash
- current_hash

Inputs and outputs are redacted before hashing and logging. The chain is verified by `tools/mcp_gateway/audit.py`.
