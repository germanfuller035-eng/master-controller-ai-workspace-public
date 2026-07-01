# Known Limitations

Date: `2026-06-26`

## Accepted For This Stage

- Some production queues are empty on the live device. Empty-state verification is therefore accepted for offer review, conversations, and transport when the runner records `PASS_EMPTY_STATE_VERIFIED`.
- Internal androidTest ledger rows may contain selector templates such as `dr_${rec.leadId}` or `approvals_card_${q.key}` because those are test-plan selectors, not owner-visible UI text.
- Device screenshots are limited to the key top-level owner surfaces plus targeted runner ledgers for deeper screens.

## Fixed During Device Acceptance

- `commercial` runner initially missed `cs_send_review` after scrolling deep into the screen.
- `conversations` runner initially failed to navigate to `cs_conversations`.
- Both fixes were limited to `ScreenByScreenRunner.kt`; production UI files were not changed in this acceptance block.

## Not Done In This Block

- No full Run 1.
- No full Run 2.
- No install with data clear.
- No production/backend/VPS/HAPP/proxy changes.
- No new UX implementation batch.
