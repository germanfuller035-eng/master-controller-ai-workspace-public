# ADR-0003: Agent Runtime Boundaries

## Status

Accepted for foundation v1.

## Context

Future system, commercial, engineering, and personal agents need clear boundaries before any runtime is installed.

## Decision

Agents are registry entries only in foundation v1. They are stateless by default, runtime disabled, production capabilities zero, and memory disabled. Non-current agents stay `current_lifecycle=OFF`.

## Consequences

- No agent can execute tools unless a later session enables a lifecycle state and passes policy tests.
- No agent has unrestricted shell, direct Docker socket, direct production DB write, outbound send, payment, or secret-read capability.
- R3+ tasks require policy gates; R4/R5 tasks require owner or strong owner approval.

## What Is Explicitly Not Implemented

- No VoltAgent runtime.
- No community agent install.
- No autonomous outbound system.

## Rollback / Supersession Rule

Remove agent registry entries or supersede this ADR with a later runtime ADR that includes tests, flags, STOP behavior, and rollback.

## Related Files

- `.claude/agents/AGENTS_LOCK.json`
- `config/feature_flags/AI_SYSTEM_FEATURE_FLAGS.json`
- `docs/release/FOUNDATION_ROLLOUT_PLAN.md`
