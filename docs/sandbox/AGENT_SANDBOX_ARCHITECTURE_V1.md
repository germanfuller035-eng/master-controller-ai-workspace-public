# Agent Sandbox Architecture V1

SESSION_NAME=AGENT_SANDBOX_OBSERVABILITY_AND_EVALS_V1
BASE_HEAD=933a6da9c309f9e6aa61cba0c85e1c08f6a8084f
BRANCH=feature/agent-sandbox-observability-evals-v1
STATUS=CONTRACT_ONLY_LOCAL_SYNTHETIC

## Purpose

Defines future agent isolation without activating real sandbox execution.

## Contract

- future runs use a separate assigned worktree
- future container runtime must be non-root
- future root filesystem must be read-only
- direct Docker socket access is denied
- host root filesystem access is denied
- CPU, RAM, and timeout limits are mandatory
- egress is deny by default with synthetic allowlist fixtures only
- raw credential values are not exposed
- direct production database and production filesystem access are denied
- cleanup is required after pause, cancel, completion, or STOP

## Stage Boundaries

- All capabilities remain OFF or LOCAL_SYNTHETIC only.
- Production sandbox execution remains OFF.
- No production credentials, direct production database access, direct production filesystem access, outbound sends, browser actions, or payments are granted.
- STOP blocks, pauses, cancels, or requires cleanup for sandbox and eval tasks.
- Evidence is local and synthetic only.

## Not Implemented

- no Docker runtime
- no real container execution
- no production sandbox
- no OPA runtime
