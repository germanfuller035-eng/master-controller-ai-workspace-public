# MCP Gateway Authorization Flow V1

## Policy Bridge

The gateway calls `tools/policies/policy_decision.py` through `tools/mcp_gateway/policy_bridge.py` before adapter execution.

Gateway adapter mapping:

- `filesystem_read` and `git_read` map to `read_evidence` and `read_search_analyze_classify`.
- `artifact_local` maps to `local_report` and `local_tests_drafts_reports`.
- `test_runner_local` maps to `local_policy_test` and `local_tests_drafts_reports`.
- contract-only browser/outbound/production classes map to their existing high-risk policy actions.

## Feature Flags

Production `MCP_READ` remains OFF and production read calls are denied unless a later stage promotes it to `PRODUCTION_READ_ONLY`. Local synthetic tests may pass a fixture state of `MCP_READ=LOCAL_SYNTHETIC`; that does not change production config.

`MCP_WRITE`, outbound, payment, browser, and production-write flags remain OFF.

## Denial Rules

- unknown adapter: deny;
- unknown action: deny;
- R4/R5 without required approval: deny or require owner approval;
- STOP active: block outbound, production, payment, and browser classes;
- direct shell, Docker socket, SSH, production DB, and production filesystem actions: deny.
