# Android Owner UX — Release Candidate v0.4.0-rc3

date: 2026-06-18 · branch feature/controlled-production-launch-v1 · ANDROID_BUILD_STATUS=PASS ·
ANDROID_PHYSICAL_SMOKE=NOT_RUN_FOR_RC3 · COMMERCIAL_CYCLE_STATUS=NOT_STARTED

## Context
- Telegram owner smoke PASS; Telegram soak IN_PROGRESS since 2026-06-17T22:24:14Z — UNCHANGED (no VPS
  touch in this pass).
- Android pairing PASS. rc2 cleared root-screen raw values; physical testing then found internal codes
  still leaking on NESTED screens. rc3 closes the whole owner-facing presentation layer.

## Raw codes found (nested screens) and how they are handled
| Where | Was (raw) | Now |
|-------|-----------|-----|
| Lead card | `Источник: manual_verified_csv` | `Источник: Ручная проверка из CSV` |
| Lead card / queues | `Блокеры: ALREADY_WAITING_REPLY` | hidden when redundant with `ожидает ответа`; else «Уже ожидает ответа»; empty → «отсутствуют» |
| Неопределённые отправки | `SEND_UNCERTAIN` | localized status + action «Проверьте результат отправки вручную» |
| Готовят аудит / audit tab | `MISSING_PREVIEW` / `audit_not_generated` | «Предпросмотр аудита ещё не сформирован» |
| Today / Mini Audit / Decisions / lead card | `Follow-up` | «Повторный контакт» |
| Lead card | raw ISO `sentAt` | locale «12 июня 2026, 21:43» (timestamp not mutated) |

Semantics of `ALREADY_WAITING_REPLY`: it is a defensive guard pushed by `computeLeadEligibility`
whenever `status==waiting_reply` — NOT an independent blocker. So it is suppressed when it would merely
restate the localized status (Phase 4 redundancy rule); the ДКБИ card therefore shows «Блокеры: отсутствуют».

## Architecture (presentation-only)
Extended `core/ui/OwnerLocalization.kt`:
- `renderLeadSourceRu(value): String?` — null when absent (row hidden); unknown → «Источник не определён».
- `renderBlockerRu(value): OwnerBlockerPresentation?` — `{ text, severity, recommendedAction,
  hideWhenRedundant, redundantWithStatus }`.
- `renderBlockerLinesRu(blockers, status)` — applies redundancy, drops raw/unknown to a safe label,
  never emits a raw code.
- `renderAuditMissingReasonRu`, `renderDateRu` (locale, source timestamp untouched), `FOLLOWUP_TERM`.
Applied in: LeadDetail (overview/audit/email tabs), ApprovalDetail (lead/audit/email-preview),
MiniAuditList (row + bucket title), MiniAuditHome, Today, ApprovalsHome, ApprovalQueue title.
No backend/API/canonical/worker/scheduler/Telegram/IMAP change; no new mutations.

## Tests / build / signing
- Unit tests: 66 passed / 0 failed (was 52). Added blocker/source/date/redundancy cases and a static
  `OwnerUiRawCodeSafetyTest` that scans reachable Compose screens and fails on any displayed
  SCREAMING_SNAKE/snake_case literal (mapping keys, testTags, routes, callbacks, comments excluded).
  RAW_INTERNAL_CODES_IN_OWNER_UI = 0.
- Lint: 0 errors. Debug + signed release APK + signed AAB built.
- APK signature verified (v2, parity with rc1/rc2); signer SHA-256 `11038fca…` == rc1/rc2; AAB signer
  matches. applicationId unchanged; versionCode 5→6. UPDATE_COMPATIBLE=YES.
- Static security: no secrets / device token in artifacts; HTTPS-only release config; allowBackup=false.

## Versioning
PREVIOUS 0.4.0-rc2 / code 5 → TARGET 0.4.0-rc3 / code 6 (+1). applicationId unchanged. Room schema
unchanged (v2), no migration. Tag v0.4.0-rc1 NOT moved; no new tag.

## Pairing persistence (upgrade safety)
Credential is in EncryptedSharedPreferences (Keystore AES256), separate from Room/DataStore; Room
schema unchanged → in-place over-install preserves pairing. Locked by UpgradeSafetyTest; physically
owner-verified in the smoke (step 1).

## Artifacts
- APK: `dist/master_controller_android/MasterController-release-v0.4.0-rc3.apk`
  (SHA-256 0b1c26f4e2ba9422d5f2fa1459a4de3eb186dfe957083ec53be112e0b34be126)
- AAB: `dist/master_controller_android/MasterController-release-v0.4.0-rc3.aab`
  (SHA-256 e0ecae37d2b4b6b9da13e1db37130b9fecefc4826a7a604881ba87d312f47818)
- SHA256SUMS-v0.4.0-rc3.txt, BUILD_INFO.json, ANDROID_RELEASE_NOTES.md, ANDROID_OWNER_SMOKE_CHECKLIST.md.
- Owner install path (Windows):
  `D:\AI_WORKSPACE_WORKTREES\controlled-production-launch-v1\dist\master_controller_android\MasterController-release-v0.4.0-rc3.apk`

## Soak continuity
Android local source/build does NOT touch the VPS. TELEGRAM_SOAK_T0 remains 2026-06-17T22:24:14Z;
TELEGRAM_SOAK_INVALIDATED=NO. No Telegram restart, no timer change, no VPS connection.

## Owner action
Install rc3 over the current app on the Samsung A56 and run
ANDROID_OWNER_SMOKE_CHECKLIST.md. Do NOT mark PASS without screenshots/reply. Do NOT proceed to
Integration Wave 1 / Gate C / commercial cycle before rc3 smoke PASS.
