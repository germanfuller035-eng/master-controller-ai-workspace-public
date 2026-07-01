# Draft opt-out save fix

Date: 2026-07-01

Scope:
- Android owner app draft save path.
- Server outreach queue draft save path.
- Focused outreach queue regression test.

Problem:
- Older server drafts could miss a simple opt-out line.
- The owner app saved the draft, but the quality section still showed a blocker asking to add an opt-out line.

Fix:
- Android now adds the opt-out footer before saving a draft when the footer is missing.
- Server outreach queue now normalizes saved drafts the same way.
- Focused test verifies old drafts are saved with the opt-out footer and quality becomes PASS.

Samsung smoke:
- Device: Samsung, package `ru.dmitry.matercontroller.debug`.
- Remote profile: working VPS.
- Today refresh: PASS.
- Start search: PASS, lead discovery job queued, no send.
- Lead screen refresh: PASS.
- Lead screen find: PASS, job queued, no send.
- Open letter: PASS.
- Save draft: PASS.
- Quality blocker for missing opt-out after save: cleared.
- Send action after save: still blocked pending explicit one-message approval.
- Payments: OFF.
- Production write: OFF.

Private evidence:
- `D:\AI_FILE_VAULT\sales_pilot_private\samsung_remote_smoke\20260701_draft_optout_fix\`

Safety:
- No emails sent.
- No mass send enabled.
- No payment action.
- No production database write.
- No private screenshots committed.
- No real contacts committed.
