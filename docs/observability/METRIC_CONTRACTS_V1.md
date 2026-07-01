# Metric Contracts V1

SESSION_NAME=AGENT_SANDBOX_OBSERVABILITY_AND_EVALS_V1
BASE_HEAD=933a6da9c309f9e6aa61cba0c85e1c08f6a8084f
BRANCH=feature/agent-sandbox-observability-evals-v1
STATUS=CONTRACT_ONLY_LOCAL_SYNTHETIC

## Purpose

Defines deterministic local metric records.

## Contract

- metric name is required
- metric kind is counter, gauge, or histogram
- numeric value is required
- task_id context is required

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
