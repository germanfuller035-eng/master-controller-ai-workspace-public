# Master Controller — Android Release v0.3.0-rc1 (2026-06-16)

## Theme
Phase 5 — inbound replies are now visible in Android (read-only), plus the cold-start fix
from rc2. No autosend, no auto-reply, no lead-state mutation.

## What's new vs v0.2.0-rc2
1. **Replies pipeline (backend, read-only).** Reused the existing read-only IMAP connector
   (`communication_monitor/yandex_mail_imap_read.mjs` — headers-only, allowlist,
   server-enforced read-only) and the existing classifier/state (`reply_monitor.mjs`). New,
   non-duplicating glue:
   - `reply_correlation.mjs` — matches inbound headers to leads via canonical ledgers
     (In-Reply-To/References → our sent Message-ID; sender → recipient). Pure, no network.
   - `reply_ingest.mjs` — correlate → `logReply` (append-only, dedup-guarded). UNMATCHED
     replies recorded as observations with a reserved `UNMATCHED:` id, never touching a real lead.
   - `reply_inbox_sync_cli.mjs` — consumes the connector's read-only headers snapshot
     (`data/yandex_mail_stage1_headers.json`) and ingests. Dry if no snapshot.
   - API: `GET /replies`, `/replies/open`, `/replies/counts`, `/replies/:id`
     (`src/replies/service.mjs`) — read-only, never sends, never mutates leads.
2. **Android Replies tab.** New `RepliesScreen` + `RepliesViewModel`, DTOs, API methods.
   Filter chips with counts (Новые / Все / Интерес / Отказ / Bounce), per-reply cards with
   category, company/sender, subject, received time; UNMATCHED chip for uncorrelated replies.
3. **Cold-start fix carried forward** (rc2): profile restored behind a RESTORING gate before any
   API call; no 127.0.0.1 fallback; URL normalization for host or host/api/v1.

## Verification
- Backend offline tests: reply_correlation 10/10, reply_ingest 7/7, replies_api_service 6/6;
  full API suite 47/47.
- Live HTTPS (deployed to VPS): `/replies/counts` `/replies/open` `/replies` → 200 clean
  envelopes; `/replies/:id` missing → 404; unauthenticated → 401.
- Android: `:app:testDebugUnitTest` + `:app:assembleDebug/assembleRelease/bundleRelease`
  BUILD SUCCESSFUL. Release APK signed (CN=Mater Controller, same key → in-place upgrade).
- ON-DEVICE: NOT verified (no device/emulator attached).
- LIVE IMAP fetch: NOT yet run with creds — replies list is empty until one read-only
  connector run populates `data/yandex_mail_stage1_headers.json`.

## Artifacts (dist/master_controller_android/)
- MasterController-debug-v0.3.0-rc1.apk
  SHA256 f2658584cd06101400209bb080bf467cb40299627c5185c25b44d97771dfbcfa
- MasterController-release-v0.3.0-rc1.apk
  SHA256 afd790c6872336f7995fd5eb75b06c3be167b1b85e2a9a89445e57ba950a0a7f
- MasterController-release-v0.3.0-rc1.aab
  SHA256 40d6c95b79d1b60846672068818c52cbff68dc569e56e1f671083a35fef029aa
- versionCode 3, versionName 0.3.0-rc1. rc1/rc2 artifacts retained.

## To populate real replies (owner action, read-only)
Run the audited read-only connector once with creds present:
`YANDEX_MAIL_STAGE1_LIVE_READ=true node tools/communication_monitor/yandex_mail_imap_read.mjs`
then `node tools/telegram_gateway/reply_inbox_sync_cli.mjs`. This only reads headers
(no body, no flag change, allowlist-only) and appends classified replies. The Android Replies
tab then shows them. Nothing is ever sent.

## Not in this release
Phases 3/4 (24/7 leadgen + auto-audit/draft workers), Phase 6 (follow-up automation UI),
Phase 8 (worker queue), Phase 9 (observability/backup), full Phase 10 E2E. Phase 2
VPS single-writer is APPROVED by owner and scheduled for controlled cutover (Release 2).
