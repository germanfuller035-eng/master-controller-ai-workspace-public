# MCP Gateway Evidence Index

SESSION_NAME=MASTER_CONTROLLER_MCP_GATEWAY_V1
FINAL_STATUS=PASS_COMMITTED
FINAL_HEAD=9cc1042d745ca1130626c0a4c72a1018d040ae7b
NEXT_STAGE=VOLTAGENT_RUNTIME_MODEL_ROUTER_AND_COST_GOVERNOR_V1
NEXT_STAGE_STARTED=NO

## Baseline

- _generated/mcp_gateway_v1/MCP_GATEWAY_SESSION_STATE.md
- _generated/mcp_gateway_v1/MCP_GATEWAY_BASELINE_READ.md
- _generated/mcp_gateway_v1/MCP_GATEWAY_SCOPE.md

## Architecture And Docs

- docs/mcp_gateway/MCP_GATEWAY_ARCHITECTURE_V1.md
- docs/mcp_gateway/MCP_GATEWAY_REQUEST_RESPONSE_CONTRACT_V1.md
- docs/mcp_gateway/MCP_GATEWAY_AUTHORIZATION_FLOW_V1.md
- docs/mcp_gateway/MCP_GATEWAY_ADAPTER_CONTRACT_V1.md
- docs/mcp_gateway/MCP_GATEWAY_TIMEOUT_CANCELLATION_V1.md
- docs/mcp_gateway/MCP_GATEWAY_AUDIT_TRAIL_V1.md
- docs/mcp_gateway/MCP_GATEWAY_SECURITY_BOUNDARIES_V1.md
- docs/mcp_gateway/MCP_GATEWAY_NOT_IMPLEMENTED_YET.md
- docs/mcp_gateway/FILESYSTEM_READ_ADAPTER_V1.md
- docs/mcp_gateway/GIT_READ_ADAPTER_V1.md
- docs/mcp_gateway/ARTIFACT_LOCAL_ADAPTER_V1.md
- docs/mcp_gateway/TEST_RUNNER_ADAPTER_V1.md
- docs/mcp_gateway/CONTRACT_ONLY_ADAPTERS_V1.md
- docs/mcp_gateway/MCP_GATEWAY_ROLLOUT_PLAN.md
- docs/mcp_gateway/MCP_GATEWAY_SECURITY_REVIEW.md

## Configs And Schemas

- config/mcp/GATEWAY_ADAPTERS.json
- config/mcp/GATEWAY_TOOL_SCOPES.json
- config/mcp/GATEWAY_TIMEOUTS.json
- config/mcp/GATEWAY_CANCELLATION_POLICY.json
- config/mcp/GATEWAY_AUDIT_POLICY.json
- config/mcp/GATEWAY_DENYLIST.json
- schemas/mcp_gateway/

## Tools And Tests

- tools/mcp_gateway/
- tests/mcp_gateway/
- tools/mcp_gateway/run_mcp_gateway_tests.py
- tools/mcp_gateway/validate_mcp_gateway.py

## Synthetic Evidence

- _generated/mcp_gateway_v1/MCP_GATEWAY_VALIDATION_RESULTS.md
- _generated/mcp_gateway_v1/MCP_GATEWAY_TEST_RESULTS.md
- _generated/mcp_gateway_v1/artifacts/
- _generated/mcp_gateway_v1/synthetic_audit/events.jsonl

## Commands

- python tools/mcp_gateway/run_mcp_gateway_tests.py
- python tools/mcp_gateway/validate_mcp_gateway.py
- python tools/foundation/validate_foundation.py
- python tools/policies/validate_policy_security.py
- python tools/policy_security/run_all_policy_security_tests.py
- git diff --check
- python tools/security/scan_changed_files.py

## Results

MCP_GATEWAY_VALIDATION_RESULT=PASS
MCP_GATEWAY_TEST_RESULT=PASS
FOUNDATION_VALIDATION_RESULT=PASS
POLICY_SECURITY_VALIDATION_RESULT=PASS
POLICY_SECURITY_TEST_RESULT=PASS
SECRET_SCAN_RESULT=PASS
DIFF_CHECK_RESULT=PASS
MCP_WRITE_STATUS=OFF
PRODUCTION_MCP_SERVERS_ENABLED=0
VOLTAGENT_STATUS=NOT_INSTALLED
QDRANT_STATUS=NOT_INSTALLED
OPA_STATUS=NOT_INSTALLED
PRODUCTION_CHANGES=NO
VPS_CHANGED=NO
OUTBOUND_COUNT=0
PAYMENT_COUNT=0
PRODUCTION_DB_WRITES=0
