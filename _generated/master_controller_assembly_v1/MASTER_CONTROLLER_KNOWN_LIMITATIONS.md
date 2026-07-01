# Master Controller Known Limitations

SESSION_NAME=MASTER_CONTROLLER_SYSTEM_ASSEMBLY_V1

## Limitations

- Sales MVP is local deterministic Android logic, not a backend production pipeline.
- Manual lead endpoint `POST /leads/manual` is not connected from this screen.
- The safe example is synthetic. Owner must replace it with a real manual lead before a real pilot.
- Digital presence draft uses manual/synthetic facts only. No scraping, browser automation or external verification is performed.
- ROI section contains assumptions only and does not promise revenue.
- Approval packet is owner-visible only; it does not write an approval decision to backend.
- Existing commercial/offer review screens remain repository/API-backed and can be offline cached independently of the local sales MVP.
- Full Run 1/2 and broad Android acceptance were not run by design.
- Device smoke was focused, not exhaustive.

## Manual Action Still Required

- Owner must verify real lead facts.
- Owner must edit offer text before any real contact.
- Any future send must be a separate controlled-send gate.
- Payment/CRM/mail/Telegram/social/browser automation require separate owner approval and implementation.
