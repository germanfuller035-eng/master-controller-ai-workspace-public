# Follow-up Control

date: 2026-06-18 · FOLLOWUP_AUTOSEND=OFF · FOLLOWUP_SEND=PROHIBITED

## Plan-only
Follow-up exists as plans/owner-tasks only. The existing follow-up read model
(mini_audit getFollowups/getFollowupPreview, buildFollowupDraft) computes due candidates and prepares a
draft; it NEVER sends. The worker FOLLOWUP_PLAN job only calls the planner. The env flag
FOLLOWUP_AUTOSEND=false is set on production.

## Pilot plan (STROYDVOR-UG_RU)
```
D0  initial send (gated; not executed)
D2  check reply
D5  follow-up candidate → owner task, NO autosend
D10 close / review
```

## Exclusion rule (enforced)
A lead with unconfirmed delivery is excluded from follow-up. The conversations follow-up read
(GET /conversations/:id/followups) returns `excluded_delivery_unconfirmed=true` and an empty item list
for such leads, with `followup_autosend=OFF`. Verified in code; the pilot lead is CONFIRMED_SENT so it
is NOT excluded, but any ATTEMPT_UNPROVEN/DELIVERY_UNCONFIRMED lead is.

```
FOLLOWUP_CONTROL_READY=YES  FOLLOWUP_AUTOSEND=OFF  FOLLOWUP_SEND=PROHIBITED
```
