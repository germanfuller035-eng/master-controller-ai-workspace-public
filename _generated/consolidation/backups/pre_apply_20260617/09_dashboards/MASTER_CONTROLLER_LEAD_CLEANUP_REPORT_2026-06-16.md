# Lead Cleanup Report — Master Controller (2026-06-16)

## Method
- Read-only classification first (`classify_leads.mjs`), then **additive** quarantine
  (`apply_quarantine.mjs`) via the canonical atomic accessor. **No lead deleted.**
- Fresh backup before write: `backups/master_controller_lead_cleanup_20260616_1054/`
  and `13_sales/lead_pipeline_store.json.bak_quarantine_20260616_0815`.
- Ledger-linked, waiting_reply, send_uncertain, opt-out, and replied leads are preserved and never quarantined.

## Counts (total 50)
| Category | Count |
|---|---|
| VERIFIED_READY | 0 |
| HISTORICAL_KEEP (ledger-linked / replied) | 2 |
| WAITING_REPLY_KEEP | 3 |
| SEND_UNCERTAIN_REVIEW | 3 |
| CONTACT_FORM_ONLY | 22 |
| MANUAL_REVIEW | 10 |
| DEAD_DOMAIN (quarantined) | 9 |
| WRONG_IDENTITY (quarantined) | 1 |
| DO_NOT_CONTACT / opt-out | 0 |

## Quarantined (additive flag `quarantine_status=quarantined`, history kept) — 10
Dead/guessed domains: JBI-KUBAN_RU, JBI-KUBAN-YUG_RU, JBI-DINSKAYA_RU, JBI-USTLABINSK_RU,
BETONSTROY-YUG_RU, KUBAN-BETON_RU, BETONMIX-KUBAN_RU, BETON-KUBANI_RU, TBETON-KRD_RU.
Wrong identity: KZ-JBI_RU.

These are exactly the guessed-domain artifacts that motivate the Phase 5 lead-gen fixes.

## Integrity
- Total leads before: 50. Total after: 50 (0 deleted; 10 flagged in place).
- New production store: NO. New ledger: NO. Ledgers untouched.
- store_revision introduced (now 1). Optimistic concurrency helper
  `updateStoreWithRevision` added to canonical accessor (409 STORE_REVISION_CONFLICT on stale write).

## Note on concurrency
The live Telegram bot (PID 6036) writes the same store. Quarantine flags are additive and
re-runnable; persistence was re-verified after write. A maintenance stop of the production bot
was intentionally NOT performed (high-risk shared-system action, not required for additive flags).
