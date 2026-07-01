# Android System Cache Consistency — Release Candidate v0.4.0-rc5

date: 2026-06-18 · branch feature/controlled-production-launch-v1 · ANDROID_BUILD_STATUS=PASS ·
ANDROID_PHYSICAL_SMOKE=NOT_RUN_FOR_RC5 · COMMERCIAL_CYCLE_STATUS=NOT_STARTED

## Context
- Telegram owner smoke PASS; Telegram soak IN_PROGRESS since 2026-06-17T22:24:14Z — UNCHANGED (no VPS
  touch in this pass).
- Android pairing PASS; rc4 physical smoke PARTIAL_PASS (offline Today/banner/recovery all worked).
- One residual blocker: the «Система» screen showed false zeros offline (Очередь задач 0 / Выполнено 0)
  instead of the last online 28.

## 1. System cache root cause
`SPLIT_SNAPSHOT_COMPLETENESS` — automation cached, counts not. rc4 added a read-through cache to
`automationStatus2()` (so revision 66 survived offline) but `jobsCounts()` was left with NO cache
fallback. Offline `jobsCounts()` returned `DataResult.Error`; OperationsViewModel coerced it with
`?: emptyMap()`, and the screen rendered `0` for «Выполнено» and `queueCounts.values.sum()` = 0. The
missing value was being converted to a false zero (`NULL_TO_ZERO`), exactly the masking the spec forbids.

## 2. System cache contract fix
- `jobsCounts()` is now read-through cached (cache_kv, key `rc:jobs_counts`): success writes the
  decoded `CountsData` through; a transport/retriable failure (never 401/403, per
  `RepoLogic.shouldUseStaleCache`) returns the last cached counts flagged `fromCache`. A partial/empty
  successful response replaces the cache only on a real success — a failure never overwrites it.
- OperationsViewModel carries `queueCountsKnown`: true only when counts came from a real response or
  cache. The System UI renders «—» when unknown, a real `0` when the backend genuinely returned 0, and
  the cached value (28) when offline. Empty snapshot (no cache) → «Нет сохранённых данных о состоянии
  системы».
- `offline` is set if automation OR jobs OR counts is cached; `cachedAt` is the max across all three.
- Mutation safety unchanged: no offline queue, no auto-replay, no false success
  (OFFLINE_MUTATION_REQUESTS=0, DEFERRED_MUTATIONS=0, AUTO_REPLAY=0).

Regression fixture (last online state preserved offline): revision=66, queueCompleted=28,
queueRunning=0, queuePending=0, deadLetters=0, writer=true, autosend=BLOCKED.

## 3. Owner terminology
- «Канонический writer» → «Каноническое хранилище» (hub card + automation detail).
- Owner-facing «follow-up» → «повторное обращение» (next-action reason) / «повторный контакт» (status
  labels, Mini Audit subtitle); Decisions send-disabled warning reworded. Internal enum values, API
  routes, and DTO field names are unchanged.

## 4. Tests / build / signing
- Unit tests: 84 passed / 0 failed (was 78). Added: CountsData round-trip (28 survives), AutomationStatusDto
  round-trip (revision 66 survives), unknown-counts-render-dash-not-zero, writer terminology Russian,
  follow-up reason uses «повторное обращение», BuildConfig version is rc5. OwnerLocalization +
  raw-code-safety + Room migration + upgrade-safety suites remain green.
- Lint 0 errors. Debug + signed release APK + AAB. APK signature verified (v2, parity rc1-rc4); signer
  SHA-256 `11038fca…` == rc1-rc4; AAB signer matches. applicationId unchanged; versionCode 7→8; Room
  schema unchanged (no migration). UPDATE_COMPATIBLE=YES, PAIRING_SURVIVES_UPGRADE=YES,
  CACHE_SURVIVES_UPGRADE=YES, DESTRUCTIVE_MIGRATION=NO.
- Static security: no secrets / device token in artifacts; HTTPS-only release config; allowBackup=false.

## 5. Artifacts + owner action
- APK: `dist/master_controller_android/MasterController-release-v0.4.0-rc5.apk`
  (SHA-256 844a6194161edd5685a31321c695438561fe93c9b435a425ce0273b600a35b42)
- AAB: `dist/master_controller_android/MasterController-release-v0.4.0-rc5.aab`
  (SHA-256 aaab9250d36f5776a135ec252d2962acf6974042853d56b6b9a1635d298d4358)
- SHA256SUMS-v0.4.0-rc5.txt, BUILD_INFO.json, ANDROID_RELEASE_NOTES.md, ANDROID_OWNER_SMOKE_CHECKLIST.md.
- Owner install path (Windows):
  `D:\AI_WORKSPACE_WORKTREES\controlled-production-launch-v1\dist\master_controller_android\MasterController-release-v0.4.0-rc5.apk`
- Install rc5 over rc4 and run ANDROID_OWNER_SMOKE_CHECKLIST.md. Do NOT mark PASS without
  screenshots/reply. Do NOT proceed to Integration Wave 1 / Gate C / commercial cycle before rc5 PASS.

## Soak continuity
Android local source/build does NOT touch the VPS. TELEGRAM_SOAK_T0 remains 2026-06-17T22:24:14Z;
TELEGRAM_SOAK_INVALIDATED=NO. No Telegram restart, no timer change, no VPS connection.
