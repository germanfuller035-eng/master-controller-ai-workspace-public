# MCP Gateway Request Response Contract V1

## Request

Required fields:

- `request_id`
- `task_id`
- `actor`
- `adapter_id`
- `action`
- `resource`
- `environment`
- `risk`
- `data_class`
- `input`
- `timeout_ms`
- `evidence_required`

Optional fields:

- `approval`
- `cancellation_token`

No request field requires or stores credential material. High-risk actions must reference approvals by policy payload and are still denied unless the existing policy engine allows them.

## Response

Required response fields:

- `request_id`
- `status`
- `redacted_result` or `result_ref`
- `artifact_ids`
- `audit_event_id`
- `policy_decision`
- `duration_ms`
- `error_code`
- `error_message_redacted`

`status` is one of `OK`, `DENIED`, `ERROR`, `TIMEOUT`, or `CANCELLED`.

## Result Handling

Adapters return only redacted result data. Durable outputs are written through `artifact_local`, hashed with SHA-256, and referenced by artifact id.
