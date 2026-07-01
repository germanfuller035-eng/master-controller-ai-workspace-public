# Owner Controlled Manual Send V1 — Handoff

## Current State

The Android app is installed on the connected Honor device and reaches the full owner-controlled manual send workflow:

1. Load real leads from app private storage.
2. Review lead card and required source/contact/history/suppression fields.
3. Edit the first-touch draft.
4. Run QA gate and see blockers.
5. Resolve suppression/history through owner override with reason and confirmation.
6. Review send readiness with blocking reasons and fix actions.
7. Create a manual send packet after owner decision.
8. Mark post-send result locally.

## Gates

- Auto-send is still OFF.
- Payment is still OFF.
- Production DB write is still OFF.
- Live email/social/browser send is not implemented in this stage.
- VPS/DNS/HAPP/proxy were not changed.

## Next Safe Step

Owner reviews the send packet on Honor. If a real send is desired, open a separate live-send gate with explicit approval, logging, rate limit, unsubscribe/stop, suppression, and rollback.
