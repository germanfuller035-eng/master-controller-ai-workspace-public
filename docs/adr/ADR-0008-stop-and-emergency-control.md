# ADR-0008: STOP And Emergency Control

## Status

Accepted for foundation v1.

## Context

STOP must be coherent across owner interfaces before any future autonomous capability exists.

## Decision

STOP is a control-plane command that must revoke active approvals and pause unsafe actions. Conceptual STOP actions are `STOP_ALL_AGENTS`, `OUTBOUND_OFF`, `PRODUCTION_WRITE_OFF`, `PAYMENTS_OFF`, `BROWSER_ACTIONS_OFF`, and `REVOKE_ACTIVE_APPROVALS`.

## Consequences

- STOP blocks new risky tasks.
- STOP cancels or pauses active tool calls where possible.
- STOP revokes temporary credentials, blocks sends, checkpoints workflows, and reports what was stopped.
- STOP must be available conceptually via Android, Web, Telegram, and a local emergency command.

## What Is Explicitly Not Implemented

- No production STOP runtime.
- No credential revocation implementation.
- No live process controller.

## Rollback / Supersession Rule

Supersede only with an implementation ADR that proves STOP behavior in tests and keeps emergency access owner-controlled.

## Related Files

- `docs/policies/STOP_ALL_AGENTS_CONTRACT.md`
- `docs/owner_interfaces/APPROVALS_AND_STOP_UX_V1.md`
- `docs/architecture/RECOVERY_AND_CHECKPOINTING_V1.md`
