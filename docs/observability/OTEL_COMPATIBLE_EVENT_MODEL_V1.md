# OTel Compatible Event Model V1

SESSION_NAME=AGENT_SANDBOX_OBSERVABILITY_AND_EVALS_V1
BASE_HEAD=933a6da9c309f9e6aa61cba0c85e1c08f6a8084f
BRANCH=feature/agent-sandbox-observability-evals-v1
STATUS=CONTRACT_ONLY_LOCAL_SYNTHETIC

## Purpose

Maps local events to an OTel-compatible shape without deploying OTel.

## Contract

- trace_id, task_id, workflow_id, and agent_id are required for traces
- run records require model, provider, prompt_version, tool_calls, policy_decisions, approvals, tokens, calculated_cost, duration, retry_count, artifacts, verification, and final_status
- OpenTelemetry compatibility is represented as local JSON contracts only
- logs must redact sensitive-looking values before persistence
- metrics are local synthetic counters, gauges, or histograms
- incident events link policy decision, verification, and final_status

## Stage Boundaries

- All capabilities remain OFF or LOCAL_SYNTHETIC only.
- Production sandbox execution remains OFF.
- No production credentials, direct production database access, direct production filesystem access, outbound sends, browser actions, or payments are granted.
- STOP blocks, pauses, cancels, or requires cleanup for sandbox and eval tasks.
- Evidence is local and synthetic only.

## Not Implemented

- no OTel Collector
- no Grafana stack
- no production telemetry shipping
- no sensitive values in traces, logs, or reports
