# ADR-0005: Risk-Based Approvals R0-R5

## Status

Accepted for foundation v1.

## Context

Owner control requires a shared vocabulary for automatic work, gated work, and owner-approved high-risk actions.

## Decision

Risk levels are:

- R0: read, search, analyze, classify. Automatic.
- R1: local tests, drafts, reports. Automatic.
- R2: worktree, commit, PR, internal tasks. Automatic with journal.
- R3: low-risk internal changes. Policy gate.
- R4: send, publish, production deploy, production DB write. Owner approval.
- R5: payment, deletion, permissions, secrets, irreversible actions. Strong owner approval.

## Consequences

- Approval payloads must include action, actor, target, payload hash, expiry, retries, revocation, owner identity, risk explanation, and rollback or cancel option where possible.
- STOP revokes active approvals and blocks new risky tasks.

## What Is Explicitly Not Implemented

- No production approval runtime.
- No payment, send, deploy, or DB-write execution.

## Rollback / Supersession Rule

Supersede only with a new risk model ADR and migration notes for all registries.

## Related Files

- `config/policies/RISK_MODEL_R0_R5.json`
- `docs/policies/RISK_APPROVAL_MODEL_R0_R5.md`
- `docs/policies/OWNER_APPROVAL_CONTRACT.md`
