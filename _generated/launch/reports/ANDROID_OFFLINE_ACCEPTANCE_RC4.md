# Android Offline Acceptance — Release Candidate v0.4.0-rc4

date: 2026-06-18 · branch feature/controlled-production-launch-v1 · ANDROID_BUILD_STATUS=PASS ·
ANDROID_PHYSICAL_SMOKE=NOT_RUN_FOR_RC4 · COMMERCIAL_CYCLE_STATUS=NOT_STARTED

## Context
- Telegram owner smoke PASS; Telegram soak IN_PROGRESS since 2026-06-17T22:24:14Z — UNCHANGED (no VPS
  touch in this pass).
- Android pairing PASS; rc3 owner UI PASS. rc3 physical testing found: (1) offline relaunch showed a
  raw `connection closed` instead of cached data; (2) Settings showed hardcoded version 1.0.0;
  (3) Settings showed the technical device id `dev_…` instead of «Samsung A56».

## 1. Why offline cache did not open (root cause)
`NETWORK_EXCEPTION_ESCAPES_REPOSITORY` + `CACHE_NOT_READ_ON_NETWORK_FAILURE`. Today/System/Replies/
Automation reads went through `MaterRepository.read{}`, which on a transport exception returned
`DataResult.Error(NETWORK, e.message)` — the raw `connection closed` string — with NO cache fallback.
Only `pipelineByStatus`/`leads` cached. The ViewModels then rendered that error message on a full
error screen, replacing any content. Startup itself was fine (`restoreProfile()` never required
`/health`), so the defect was purely the missing read-through cache + un-localized transport error.

## 2. Cache fallback + mutation safety fix
- New `readCached(key, serializer, block)`: success → write-through to `cache_kv`; transport failure
  or retriable error (per `RepoLogic.shouldUseStaleCache`, which excludes 401/403) → return last
  cached snapshot flagged `fromCache`. A raw exception never escapes — it becomes a NETWORK error
  ONLY when there is no cache. Applied to status, nextAction, systemStatus, automationStatus2,
  replies, openReplies, replyCounts.
- `OwnerLocalization.renderNetworkErrorRu(throwable)`: maps connection closed / UnknownHost /
  ConnectException / SocketTimeout / SSL / 502-504 to owner-facing Russian; raw java.net.* /
  okhttp3.* / retrofit2.* never shown.
- ViewModels (Today/System/Replies/Operations) now carry `offline` + `cachedAt`; screens show the
  «Офлайн-режим: показаны сохранённые данные» banner and a localized empty-offline message; the
  health chip reads «Сервер недоступен» when cached.
- Mutation safety: approve/reject/defer/retry still reach Confirmed ONLY on backend `ok=true`. No
  offline mutation queue, no auto-replay on reconnect, no optimistic success, no Room write that
  fakes a server confirmation. Offline, mutation-hosting detail screens fail to load (uncached) and
  show a localized message instead of action buttons. OFFLINE_MUTATION_REQUESTS=0,
  DEFERRED_MUTATIONS=0, AUTOMATIC_MUTATION_RETRY_AFTER_RECONNECT=0, FALSE_SUCCESS=0.
- Reconnect: read-only refresh retry is allowed; tapping «Обновить» re-reads, writes through, clears
  the banner. No infinite retry loop.

## 3. Version + device fixes
- `buildConfig = true` enabled; SettingsScreen reads `BuildConfig.VERSION_NAME` (0.4.0-rc4) and
  `BuildConfig.VERSION_CODE` (7). Hardcoded `1.0.0` removed.
- `deviceName` from pairing is now persisted locally in the existing Keystore store (additive — no
  re-pair, no schema change). Settings shows «Устройство: Samsung A56» (fallback «Устройство
  Android»); technical id only as a shortened secondary line «ID устройства: dev_74c7…3c92». The
  permanent token is never shown.

## 4. Tests / build / signing
- Unit tests: 78 passed / 0 failed (was 66). Added OfflineAndMetadataTest ×12: network-error
  localization (no raw class names), cache eligibility (no stale on auth failures), mutation
  no-false-success, BuildConfig version is rc4 (not 1.0.0), cached-at formatting. OwnerLocalization
  + raw-code-safety + Room migration + upgrade-safety suites remain green.
- Lint 0 errors. Debug + signed release APK + AAB built. APK signature verified (v2, parity with
  rc1-rc3); signer SHA-256 `11038fca…` == rc1-rc3; AAB signer matches. applicationId unchanged;
  versionCode 6→7; Room schema unchanged (no migration). UPDATE_COMPATIBLE=YES,
  PAIRING_SURVIVES_RC3_TO_RC4=YES, CACHE_SURVIVES_RC3_TO_RC4=YES, DESTRUCTIVE_MIGRATION=NO.
- Static security: no secrets / device token in artifacts; HTTPS-only release config; allowBackup=false.

## 5. Artifacts + owner action
- APK: `dist/master_controller_android/MasterController-release-v0.4.0-rc4.apk`
  (SHA-256 e3c9487b842c8658bd484ceef27aefc13da5cd4a9a315fbb46e6646d4895e597)
- AAB: `dist/master_controller_android/MasterController-release-v0.4.0-rc4.aab`
  (SHA-256 d6f24819b03ba2a3e1be598827a968eabbe804434663eae449dc45a14a607eab)
- SHA256SUMS-v0.4.0-rc4.txt, BUILD_INFO.json, ANDROID_RELEASE_NOTES.md, ANDROID_OWNER_SMOKE_CHECKLIST.md.
- Owner install path (Windows):
  `D:\AI_WORKSPACE_WORKTREES\controlled-production-launch-v1\dist\master_controller_android\MasterController-release-v0.4.0-rc4.apk`
- Install rc4 over rc3 and run ANDROID_OWNER_SMOKE_CHECKLIST.md. Do NOT mark PASS without
  screenshots/reply. Do NOT proceed to Integration Wave 1 / Gate C / commercial cycle before rc4 PASS.

## Soak continuity
Android local source/build does NOT touch the VPS. TELEGRAM_SOAK_T0 remains 2026-06-17T22:24:14Z;
TELEGRAM_SOAK_INVALIDATED=NO. No Telegram restart, no timer change, no VPS connection.
