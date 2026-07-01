# ADR-0006: Feature Flag Lifecycle

## Status

Accepted for foundation v1.

## Context

Every future AI capability needs staged rollout and fast rollback without hidden activation.

## Decision

All new capabilities start `OFF`. Allowed lifecycle states are `OFF`, `LOCAL_SYNTHETIC`, `SHADOW`, `PRODUCTION_READ_ONLY`, `DRAFT_ONLY`, `OWNER_APPROVAL_REQUIRED`, and `LIMITED_AUTONOMY`.

## Consequences

- Feature flags must include owner, purpose, initial state, promotion criteria, rollback, evidence required, risk max, and approval level.
- Production or outbound flags cannot be promoted in foundation v1.
- STOP can force outbound, production write, payment, and browser action flags off.

## What Is Explicitly Not Implemented

- No feature flag runtime service.
- No production rollout.
- No limited autonomy.

## Rollback / Supersession Rule

Set affected flags to `OFF`, revert registry changes, or supersede with a later rollout ADR.

## Related Files

- `config/feature_flags/AI_SYSTEM_FEATURE_FLAGS.json`
- `docs/feature_flags/AI_SYSTEM_FEATURE_FLAGS_V1.md`
- `docs/release/FOUNDATION_ROLLOUT_PLAN.md`
