# Foundation Rollout Plan

Status: foundation v1 plan.

## Goal

Create a stable architecture foundation without changing production behavior.

## Current Stage

- ADRs: foundation-only.
- Registries: local JSON skeletons.
- Schemas: local validation schemas.
- Validator: deterministic standard-library script.
- Runtime: not installed.
- Production: unchanged.

## Promotion Order For Later Sessions

1. Policy, secrets, audit, and emergency-control hardening.
2. Read-only MCP gateway prototype in local synthetic mode.
3. Model routing and cost governance in local synthetic mode.
4. Agent runtime dry run in shadow/local synthetic mode.
5. Commercial drafts with no-send ledger.
6. Owner approval runtime for R4.
7. Strong owner approval and STOP tests for R5.

## Non-Negotiable Gates

- All new flags start OFF.
- STOP must revoke approvals and block risky tasks.
- No production write without owner approval.
- No outbound without owner approval.
- No payment without strong owner approval.
- No secrets in prompts, logs, reports, or Git.

## Rollback

For foundation v1, revert the foundation commit. No production rollback is needed because production is unchanged.
