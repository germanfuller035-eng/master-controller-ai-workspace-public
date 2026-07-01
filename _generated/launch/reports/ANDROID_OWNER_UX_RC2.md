# Android Owner UX — Release Candidate v0.4.0-rc2

date: 2026-06-18 · branch feature/controlled-production-launch-v1 · ANDROID_BUILD_STATUS=PASS ·
ANDROID_PHYSICAL_SMOKE=NOT_RUN_FOR_NEW_BUILD · COMMERCIAL_CYCLE_STATUS=NOT_STARTED

## Context
- Telegram owner smoke PASS; Telegram soak IN_PROGRESS since 2026-06-17T22:24:14Z (UNCHANGED — no VPS
  touch in this pass).
- Android pairing PASS (Samsung A56, production device pairing).
- Previous physical smoke PARTIAL: raw backend values were visible on screen. This RC fixes them.

## Raw owner-facing values found (physical screenshots) and localized
| Screen | Was (raw) | Now (owner-facing) |
|--------|-----------|--------------------|
| Сегодня | `ДКБИ · proven SMTP 250 and >48h since send` | `ДКБИ · Доставка письма подтверждена. Прошло более 48 часов — пора проверить ответ и подготовить follow-up.` |
| Лиды (hub) | `Product Routing` / `STAGING` / `VERIFIED_READY` | `Продуктовый маршрут` / `Новые кандидаты` / `Проверенные лиды` |
| Лиды (row) | raw `status`, `score_v2:`, `score_v1:`, `маршрут:` | `Статус: …`, `Предварительная оценка`, `Каноническая оценка` (hidden if absent), `Маршрут` (hidden if empty) |
| Решения | `Черновики писем — approval pending` | `Черновики писем — ожидают подтверждения` |
| Ответы | tab `Bounce`, chip `UNMATCHED` | `Недоставка`, `Не определено` (+ new `Не определено` tab) |
| Система | `writer:да · autosend:BLOCKED · rev:66`, `Dead Letters`, `running/queued` | `Канонический writer: работает · Автоотправка: заблокирована · Ревизия: 66`, `Ошибки обработки`, `Выполнено/В работе/В очереди/Ошибок` |

Canonical identifiers (lead_id, deviceId) and the `Mini Audit` brand name are NOT translated.
Raw backend `reason` is kept in the DTO but never rendered.

## Architecture of the fix (presentation-only)
- New `core/ui/OwnerLocalization.kt`: single localization layer — `renderLeadStatusRu`,
  `renderRouteRu`, `renderNextActionReasonRu` (priority: kind → legacy reason allowlist → safe
  fallback; never fuzzy-parses free text), `renderQueueNameRu`, `renderApprovalStatusRu`,
  `renderReplyClassRu`, `renderAutomationStateRu`, `renderWriterStateRu`, `renderLiveSendRu`,
  `renderSourceHealthRu`, `renderSchedulerStateRu`, `renderJobStatusRu`, `renderErrorCodeRu`.
- Unknown → safe Russian label; null/blank/`—`/`null`/`undefined` never shown; optional fields hidden.
- No backend / API / canonical / worker / scheduler / Telegram / IMAP change. No new mutations.

## Screens & states covered
5 root tabs (Сегодня, Лиды, Решения, Ответы, Система) + nested: pipeline queue, lead detail,
mini-audit home/list/lead detail, approvals home/list/detail, operations
(automation/queue/dead-letters/sources/scheduler/connection), replies, connection/settings.
Existing Loading / Content / Empty / OfflineCached / Error states preserved; reply empty states
made per-category; Today gained an explicit "Следующих действий сейчас нет" empty.

## Versioning
PREVIOUS 0.4.0-rc1 / code 4 → TARGET 0.4.0-rc2 / code 5 (+1). applicationId unchanged. Tag
v0.4.0-rc1 NOT moved; no new tag created.

## Tests / build / signing
- Unit tests: 52 passed / 0 failed (was 33; +OwnerLocalizationTest 18, +UpgradeSafetyTest 1).
- Lint: 0 errors. Debug + signed release APK + signed AAB all built.
- APK signature verified (v2 scheme, parity with rc1); signer SHA-256 `11038fca…` == rc1; AAB signer
  matches. UPDATE_COMPATIBLE=YES.
- Static security: no secrets / no device token in artifacts; cleartext disabled (HTTPS-only release
  network config); allowBackup=false.

## Pairing persistence (upgrade safety)
Pairing credential is stored in EncryptedSharedPreferences (`mater_secure_tokens`, Android
Keystore AES256) — separate from Room and DataStore. Room schema is unchanged (v2); the only
migration (v1→v2) is additive + idempotent. An over-install with the same signer/applicationId
preserves the credential. UpgradeSafetyTest locks the additive-migration invariant; the physical
over-install is owner-verified in the smoke (step 4).

## Repo hygiene fix (build-blocking)
`SecureTokenStore.kt` + `TokenRefresher.kt` (secret-free — Keystore APIs + refresh logic, no token
values) were excluded by an over-broad `*token*` .gitignore rule, so a clean branch checkout did
not compile. Added explicit `!…SecureTokenStore.kt` / `!…TokenRefresher.kt` negations and tracked
the files. No secrets added to the repo.

## Artifacts
- APK: `dist/master_controller_android/MasterController-release-v0.4.0-rc2.apk`
  (SHA-256 01defb7a78e97312387697c9200a668755ebeb3e2ebca85a48de577d1aa53d03)
- AAB: `dist/master_controller_android/MasterController-release-v0.4.0-rc2.aab`
  (SHA-256 5ed2e5a83f6393abc766a0d93b8a88252420f58152b88c216edd9578b39a9080)
- SHA256SUMS-v0.4.0-rc2.txt, BUILD_INFO.json updated.
- Owner install path (Windows):
  `D:\AI_WORKSPACE_WORKTREES\controlled-production-launch-v1\dist\master_controller_android\MasterController-release-v0.4.0-rc2.apk`

## Soak continuity
Android local source/build does NOT touch the VPS. TELEGRAM_SOAK_T0 remains 2026-06-17T22:24:14Z;
TELEGRAM_SOAK_INVALIDATED=NO. No Telegram restart, no timer change.

## Owner action
Install rc2 over the current app on the Samsung A56 and run
ANDROID_PHYSICAL_SMOKE_CHECKLIST.md (rc2 section). Do NOT mark PASS without screenshots/reply.
