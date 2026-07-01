# Task Lifecycle V1

Status: foundation v1 architecture.

## Lifecycle

1. Owner request is captured.
2. Requirements, hard bans, allowlist, and data class are identified.
3. A plan is produced with scope, budget, risk, and evidence expectations.
4. Policy checks lifecycle, risk, approval need, STOP state, and denied capabilities.
5. Approved agent/tool selection occurs if a later stage has enabled runtime.
6. Execution happens only within the approved lifecycle state.
7. Independent verification checks outputs and safety boundaries.
8. Evidence is written to a local artifact or audit reference.
9. Checkpoint records status, files, flags, and next stage.
10. Final status is reported.

## Foundation Behavior

Foundation v1 executes only local docs, registry skeletons, schemas, and deterministic validation.

## Failure States

- WRONG_WORKTREE: stop before changes.
- POLICY_DENIED: do not execute requested action.
- VALIDATION_FAIL: stop before commit.
- STOP_ACTIVE: block new risky tasks and checkpoint.
