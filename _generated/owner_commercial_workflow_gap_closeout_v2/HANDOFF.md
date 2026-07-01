# Handoff

## What Is Ready

- Owner can open the app on Honor and follow the commercial path:
  Lead -> Review -> Draft -> QA -> Channel -> Send Packet -> Manual Result -> Reply -> Deal -> Product -> Document -> Invoice -> Payment Gate -> History.
- Each main screen has a clear owner action and no hidden live action.
- Auto-send, live payment, and production write remain OFF.

## Owner Hand Test

NEXT_STEP=OWNER_HAND_TEST_ON_PHONE

Recommended manual check:

1. Open Today and confirm stale-data explanation is visible if server summary is unavailable.
2. Open Leads and enter a company website.
3. Confirm weak facts are not invented.
4. Edit the draft if needed.
5. Run QA.
6. If QA requires override, enter a reason and confirm it.
7. Select a channel.
8. Create the send packet.
9. Review final text, package code, text hash, suppression/history reason, and not-sent status.
10. Do not mark sent unless the owner actually sends manually outside the app.

## Hard Gates Still Closed

AUTO_SEND_STATUS=OFF
PAYMENT_LIVE_STATUS=OFF
PAYMENT_LINK_STATUS=OFF
PRODUCTION_WRITE_STATUS=OFF
LIVE_SOCIAL_SEND_STATUS=OFF
