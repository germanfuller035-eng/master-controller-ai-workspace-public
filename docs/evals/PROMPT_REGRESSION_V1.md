# Prompt Regression V1

SESSION_NAME=AGENT_SANDBOX_OBSERVABILITY_AND_EVALS_V1
BASE_HEAD=933a6da9c309f9e6aa61cba0c85e1c08f6a8084f
BRANCH=feature/agent-sandbox-observability-evals-v1
STATUS=CONTRACT_ONLY_LOCAL_SYNTHETIC

## Purpose

Defines deterministic prompt regression without live providers.

## Contract

- prompt_version is required
- expected_output is fixture-defined
- changed output is a regression unless accepted
- no external LLM call is attempted

## Stage Boundaries

- All capabilities remain OFF or LOCAL_SYNTHETIC only.
- Production sandbox execution remains OFF.
- No production credentials, direct production database access, direct production filesystem access, outbound sends, browser actions, or payments are granted.
- STOP blocks, pauses, cancels, or requires cleanup for sandbox and eval tasks.
- Evidence is local and synthetic only.

## Not Implemented

- no Promptfoo package
- no real LLM evals
- no external eval service
- no Qdrant, Docling, or memory stage
