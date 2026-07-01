# Continuous Operations Acceptance

date: 2026-06-18 · proves the pipeline is not blocked by any single client.

## Async per-lead state model
`commercial_core/lib/pipeline_state.mjs` (pure, 33 tests): each lead advances independently. States that
block only their own lead: AWAITING_REPLY, OWNER_REVIEW, DELIVERY_UNCONFIRMED. `pipelineView` returns
actionable vs blocked_self vs terminal with `pipeline_global_blocked=false` by construction. Verified
live: GET /pipeline/state-model → pipeline_global_blocked=false, per_lead_isolation=true.

## Scenario coverage (tests + live)
- Lead ready-for-send-review, lead awaiting reply, lead QA-approved, lead offer-draft-ready, lead
  rejected — all coexist; actionable leads remain actionable while blocked ones are isolated.
- Shadow wave processes new eligible leads regardless of any one lead's reply status.
- Agent failure on one lead does not block others (failure isolation test FI1–FI4).
- Follow-up due creates an owner task, never a send.

```
PIPELINE_GLOBAL_BLOCKED=NO
PER_LEAD_STATE_ISOLATION=PASS
NEW_LEAD_PROCESSING_CONTINUES=YES
AGENT_FAILURE_ISOLATED=YES
AWAITING_REPLY_BLOCKS_ONLY_ONE_LEAD=YES
```

# Recovery Verification

- API restart recovery: PID 18164→18471, NRestarts 0, health 200, revision 106 + ledger 7 intact.
- Idempotent task/command replay: re-running a pilot opportunity command returned ok with NO revision
  bump and NO duplicate entity.
- Single canonical writer preserved (3 node procs: api/worker/telegram).
- No VPS reboot (no new service unit added — agent runtime is in-process to the API).
- Backup verified before deploy; rollback runbook prepared; no rollback required.

```
RESTART_RECOVERY=PASS  QUEUE_LEASE_RECOVERY=engines-tested  CHECKPOINT_RESUME=engines-tested
DUPLICATE_TASK_GUARD=PASS  ROLLBACK_REQUIRED=NO
```
