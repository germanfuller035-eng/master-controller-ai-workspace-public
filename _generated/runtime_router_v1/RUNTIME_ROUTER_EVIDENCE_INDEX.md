# Runtime Router Evidence Index

SESSION_NAME=VOLTAGENT_RUNTIME_MODEL_ROUTER_AND_COST_GOVERNOR_V1
FINAL_STATUS=PASS_PENDING_COMMIT
BASE_HEAD=9cc1042d745ca1130626c0a4c72a1018d040ae7b
START_HEAD=aeab755524f895523cad023955e80de78e35bce9
RUNTIME_BASE_RECONCILIATION=APPLIED
ORIGINAL_REPORTED_BASE_HEAD=9cc1042d745ca1130626c0a4c72a1018d040ae7b
REQUIRED_MCP_CLOSEOUT_HEAD=aeab755524f895523cad023955e80de78e35bce9
MCP_CLOSEOUT_INCLUDED=YES
RUNTIME_IMPLEMENTATION_HEAD=d5a1fc8a1d70f26bd83e9044592659d04a23a856
FINAL_RECONCILED_HEAD=reported_after_reconciliation_commit
AGENTS_ACTION=QUARANTINED_AND_REMOVED_FROM_WORKTREE
AGENTS_QUARANTINE_PATH=C:\Users\dima-\Codex-Network-Recovery\runtime_closeout_agents_quarantine_20260626_125127
AGENTS_COMMITTED=NO
AGENTS_INVENTORY=C:\Users\dima-\Codex-Network-Recovery\runtime_closeout_agents_quarantine_20260626_125127\AGENTS_INVENTORY.md
NEXT_STAGE=AGENT_SANDBOX_OBSERVABILITY_AND_EVALS_V1
NEXT_STAGE_STARTED=NO

## Baseline

- _generated/runtime_router_v1/RUNTIME_SESSION_STATE.md
- _generated/runtime_router_v1/RUNTIME_BASELINE_READ.md
- _generated/runtime_router_v1/RUNTIME_SCOPE.md
- _generated/runtime_router_v1/VOLTAGENT_DEPENDENCY_AUDIT.md

## Architecture And Docs

- docs/runtime/VOLTAGENT_RUNTIME_ARCHITECTURE_V1.md
- docs/runtime/RUNTIME_ADAPTER_CONTRACT_V1.md
- docs/runtime/STATELESS_AGENT_EXECUTION_V1.md
- docs/runtime/AGENT_TASK_LIFECYCLE_V1.md
- docs/runtime/SUSPEND_RESUME_CONTRACT_V1.md
- docs/runtime/RUNTIME_STOP_INTEGRATION_V1.md
- docs/runtime/RUNTIME_TOOL_CALL_BOUNDARIES_V1.md
- docs/runtime/RUNTIME_NOT_IMPLEMENTED_YET.md
- docs/runtime/VOLTAGENT_PINNING_AND_INSTALL_REVIEW_PLAN.md
- docs/model_router/MODEL_ROUTER_V1.md
- docs/cost_governor/COST_GOVERNOR_V1.md

## Configs And Schemas

- config/runtime/
- config/models/MODEL_REGISTRY.json
- config/models/MODEL_ROUTING_RULES.json
- config/models/PROVIDER_REGISTRY.json
- config/models/MODEL_COST_LIMITS.json
- config/models/MODEL_FALLBACK_POLICY.json
- config/costs/
- schemas/runtime/
- schemas/models/
- schemas/costs/

## Tools And Tests

- tools/runtime/
- tools/model_router/
- tools/cost_governor/
- tests/runtime/
- tests/model_router/
- tests/cost_governor/
- tools/runtime/run_runtime_router_tests.py

## Results

- _generated/runtime_router_v1/RUNTIME_VALIDATION_RESULTS.md
- _generated/runtime_router_v1/MODEL_ROUTER_VALIDATION_RESULTS.md
- _generated/runtime_router_v1/COST_GOVERNOR_VALIDATION_RESULTS.md
- _generated/runtime_router_v1/RUNTIME_ROUTER_TEST_RESULTS.md

## Commands

- python tools/runtime/run_runtime_router_tests.py
- python tools/runtime/validate_runtime.py
- python tools/model_router/validate_model_router.py
- python tools/cost_governor/validate_cost_governor.py
- python tools/mcp_gateway/run_mcp_gateway_tests.py
- python tools/mcp_gateway/validate_mcp_gateway.py
- python tools/policies/validate_policy_security.py
- python tools/policy_security/run_all_policy_security_tests.py
- python tools/foundation/validate_foundation.py
- git diff --check
- python tools/security/scan_changed_files.py
