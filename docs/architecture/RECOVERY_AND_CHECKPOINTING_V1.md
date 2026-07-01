# Recovery And Checkpointing V1

Status: foundation v1 architecture.

## Checkpoint Purpose

Checkpoints let later sessions resume from evidence instead of guessing. They must record branch, base head, scope, files changed, validation result, safety counters, and next stage.

## Recovery Rules

- Prefer isolated worktree evidence over noisy root checkout state.
- Treat old worktrees as read-only evidence unless a later request says otherwise.
- Do not repeat broad acceptance or production activity unless explicitly needed.
- If validation fails, stop before commit and report exact reason.

## STOP Recovery

STOP checkpoints must record revoked approvals, paused/cancelled workflows, disabled action classes, and what remains manual or unknown.

## Foundation Rollback

Revert the foundation commit. Remove registry skeletons, schemas, docs, and generated foundation evidence. No production rollback is required.

## Not Implemented

No scheduler, retry worker, process controller, or production recovery service is implemented in foundation v1.
