# Master Controller v0.4.0-rc1 — Release Validation Report

- Date: 2026-06-17
- Branch: feature/master-controller-lead-hunter-integration
- Commit (at validation): a5b22c3
- Recovery context: previous session terminated (HTTP 502 + 100% context). State recovered
  from Git, files, build artifacts and live API — NOT from the old conversation.

## Final status

GATE RESULT: PASS for Android release + local safety. One non-Android blocker: VPS SSH
shell access unavailable (reboot-recovery test could not run). Live API verified healthy
read-only over HTTPS.

## Android release matrix (Phase 2)

Command: `./gradlew testDebugUnitTest lintDebug assembleDebug assembleRelease bundleRelease`
Result: BUILD SUCCESSFUL.

| Item | Result |
|------|--------|
| versionCode | 4 (verified in debug + release APK badging) |
| versionName | 0.4.0-rc1 (verified in debug + release APK badging) |
| Unit tests | 33 passed / 0 failed / 0 errors (7 suites incl. RepoLogicTest, RoomMigrationTest, ErrorMappingTest, OpsDtoMappingTest) |
| Lint (debug) | 0 errors, 120 warnings |
| Debug APK | app-debug.apk, 19,068,735 bytes (~19.07 MB), non-empty |
| Release APK | app-release.apk, 2,229,659 bytes, non-empty |
| Release AAB | app-release.aab, 4,946,918 bytes, non-empty |
| APK signature | VERIFIED (apksigner verify rc=0) |
| AAB signature | VERIFIED (jarsigner: jar verified) |
| Signing key | CN=Mater Controller, OU=Personal, O=Dmitry … C=RU (unchanged) |

### Artifacts (dist/master_controller_android/)

```
be572bc9b91bba7c954242c944e8ff0b6f4f0e03d854cdea75de2e16175d0025  MasterController-debug-v0.4.0-rc1.apk
898446492d430f9ba138bb08ba20d4c2bf02704057afe2b41625746ffc0d3cdd  MasterController-release-v0.4.0-rc1.apk
41f5ee9c2bdcac9646a17f89af24350d45a6148cc1a7f405d26564aba6691c6e  MasterController-release-v0.4.0-rc1.aab
```
SHA256 file: `SHA256SUMS-v0.4.0-rc1.txt`. BUILD_INFO.json updated to v0.4.0-rc1.

## Preserved existing work (Phase 1)

Uncommitted Android edits validated and kept (coherent refactor, no behavior change):
- build.gradle.kts: versionCode 3→4, versionName 0.3.0-rc1→0.4.0-rc1, + sqlite-jdbc test dep.
- NEW core/data/RepoLogic.kt — pure logic (decodeCounts, reduceMutation, shouldUseStaleCache).
- MaterRepository.kt + ApprovalDetailViewModel.kt delegate to RepoLogic.
- MaterDatabase.kt: MIGRATION_1_2 SQL extracted to MIGRATION_1_2_SQL (identical SQL, now testable).
- NEW tests: RepoLogicTest, RoomMigrationTest, ErrorMappingTest, OpsDtoMappingTest.
- No-send UI string preserved: "Решение сохранено. Письмо НЕ отправлено."

## Cross-client consistency (Phase 3)

- Queue names consistent Android ↔ API: `STAGING`, `verified_ready`, `manual_review_product_routing`.
- score_v1 = canonical score (`SCORE_VERSION='score_v1'`); score_v2/candidate_score stored
  SEPARATELY (candidate_score, candidate_score_version). Android shows both as labelled values.
- Android write surface = HTTPS API only (@POST approve/reject/postpone/prepare/check-proof).
  No direct canonical-store file writes in Android source.
- Telegram = API-only; canonical writer = VPS `writes/service.mjs::updateStoreWithRevision`
  (atomic temp+rename + lock + optimistic revision + operation_id idempotency). Single writer.
- Revision handling: 409 STORE_REVISION_CONFLICT surfaced as MutationPhase.Conflict (reload).

## Security & no-send regression (Phase 4) — PASS

- Autosend: BLOCKED (confirmed in telegram_master_bot.mjs and Android automation/ops screens).
- Live send: OFF. Real send requires `EMAIL_REAL_SEND_ENABLED==='true'` AND `MATER_NO_SEND!=='true'`.
  All local validation run with forced `MATER_NO_SEND=true, EMAIL_REAL_SEND_ENABLED=false`.
- No SMTP / no real email / no Telegram outreach sent during validation.
- Outbound send ledger: zero entries dated 2026-06-17. Latest entry 2026-06-16T08:09 (pre-session).
  The +6 lines in the working diff all predate this session (Jun 11–16).
- No local canonical writer or Telegram poller process was running (only Gradle JVM workers).
- API test suite "canonical store unchanged / send ledger unchanged / email ledger unchanged" PASS.
- No secret values printed (signing read from D:\AI_SECRETS, never echoed; status carries no secrets).

## Safe E2E (Phase 5) — PASS (in scope)

- Master Controller API offline suite: 47 passed / 0 failed (read-only + synthetic, no real send).
- Path verified read-only: Android/Telegram → HTTPS API → queue (STAGING/verified_ready/routing)
  → worker (backpressure gates) → canonical state (single writer) → client refresh on success/409.
- Broad legacy offline runner: 148/164 passed. The 16 failures are ALL pre-existing debt in
  telegram_gateway UX + verified_lead preview modules (already modified/RED at Phase 0). NONE touch
  Android or mater_controller_api. One ("expected READY_FOR_SEND_APPROVAL, got BLOCKED") is the
  no-send posture behaving correctly. Out of Android-release scope.

## VPS & service recovery (Phase 6) — PARTIAL / BLOCKER

- Live API HEALTHY over HTTPS: GET /api/v1/health → 200 `{ok:true, service:mater-controller-api}`.
- Auth enforced: system/status, automation/status, pipeline/counts → 401 (read-only, unauth).
- Unknown route → proper 404 envelope. TLS: Let's Encrypt, valid 2026-06-16 → 2026-09-14.
- SSH shell access UNAVAILABLE: masterctl@195.96.132.82 and root@ both "Permission denied
  (publickey)". The two local key files share one fingerprint (SHA256:uZ5hw9…) not authorized.
- Consequence: shell-level service/worker/scheduler/dead-letter inspection and the controlled
  reboot-recovery test COULD NOT be performed. Recorded as a blocker; no results fabricated.

## Tagging decision (Phase 7)

v0.4.0-rc1 tag NOT created in this session. Mandatory gate "required VPS recovery verified"
is unmet (SSH unavailable → reboot-recovery untested). Per release rules the tag is withheld
when required VPS recovery remains unverified. All Android + local safety gates pass and
artifacts are staged, signed and checksummed, ready to tag once SSH is restored OR the VPS
reboot-recovery requirement is explicitly waived.
