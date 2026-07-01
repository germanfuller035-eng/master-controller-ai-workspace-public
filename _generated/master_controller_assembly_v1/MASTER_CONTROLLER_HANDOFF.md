# Master Controller Handoff

SESSION_NAME=MASTER_CONTROLLER_SYSTEM_ASSEMBLY_V1
STATUS=PASS_COMMITTED

## Current Product State

Master Controller now has a working owner-visible local sales MVP path in Android:

manual/demo lead -> qualification -> digital presence draft -> product strategy -> offer preview -> ROI assumptions -> QA/red-team -> manual approval packet.

The path is draft-only. It does not send, charge, scrape, write production or call browser/social automation.

## First Manual Sales Pilot

1. Open Android debug app.
2. Go to `Коммерция` or `Лиды`.
3. Open `Working Sales MVP`.
4. Replace the synthetic sample with one real manually verified lead.
5. Tap `Build local draft`.
6. Review all facts, assumptions, QA checks and blocked actions.
7. Use the approval packet for manual owner decision only.

## Do Not Do Next Automatically

- Do not start controlled-send.
- Do not connect payment or mail.
- Do not write production DB.
- Do not deploy.
- Do not merge/tag.
- Do not run Full Run 1/2 unless explicitly requested.

## Recommended Next Step

NEXT_RECOMMENDED_STEP=FIRST_MANUAL_SALES_PILOT

Run one owner-controlled manual pilot using a real manually verified lead, then decide whether to create a separate controlled-send gate.
