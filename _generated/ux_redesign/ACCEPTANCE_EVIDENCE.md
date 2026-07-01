# Acceptance Evidence

Session: `ANDROID_OWNER_UX_REDESIGN_AND_APPLE_SAMSUNG_ERGONOMICS_V1`

Date: `2026-06-26`

Worktree: `D:\AI_WORKSPACE\.claude\worktrees\android-owner-ux-redesign-v1`

Branch: `feature/android-owner-ux-redesign-v1`

## APKs

- App APK: `apps/mater_controller_android/app/build/outputs/apk/debug/app-debug.apk`
- App APK SHA256: `E355BBAF09A7EECA1902C0D1EC814A801C028A67613A09BBF789398E51EB678F`
- App APK last write: `2026-06-26 08:10:55 +03:00`
- Final androidTest APK: `apps/mater_controller_android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk`
- Final androidTest APK SHA256: `D2B7B1ED2BD78619DA7F9FF820172CBFC570E92E86712F2E231632445E92B624`
- Final androidTest APK last write: `2026-06-26 08:59:25 +03:00`

Install result:

- `adb install -r` app APK: `Success`
- `adb install -r` androidTest APK: `Success`
- data cleared: `NO`
- signer match: `YES_INSTALL_R_SUCCEEDED`

## Device Route

- Device: `AMSKBB4914919475`
- ADB reverse: `UsbFfs tcp:18089 tcp:10809`
- Android global proxy: `127.0.0.1:18089`
- Device route health: `HONOR_HEALTH=200`
- Unauthenticated offers check: `HONOR_OFFERS=401`

## Owner-Visible Smoke

Screenshots:

- `_generated/ux_redesign/device_smoke/screenshots/today.png`
- `_generated/ux_redesign/device_smoke/screenshots/decisions.png`
- `_generated/ux_redesign/device_smoke/screenshots/commerce.png`
- `_generated/ux_redesign/device_smoke/screenshots/agents.png`
- `_generated/ux_redesign/device_smoke/screenshots/system.png`

UI hierarchy:

- `_generated/ux_redesign/device_smoke/ui_hierarchy/today.xml`
- `_generated/ux_redesign/device_smoke/ui_hierarchy/decisions.xml`
- `_generated/ux_redesign/device_smoke/ui_hierarchy/commerce.xml`
- `_generated/ux_redesign/device_smoke/ui_hierarchy/agents.xml`
- `_generated/ux_redesign/device_smoke/ui_hierarchy/system.xml`

Observed:

- Today rendered with `today_screen`, `API доступен`, and `Отправка заблокирована`.
- Decisions rendered via bottom navigation.
- Commerce rendered with `commercial_summary` and `cs_send_review`.
- Agents rendered via bottom navigation.
- System rendered via bottom navigation.
- Owner UI XML contains no literal `${...}` selector templates.

## Targeted Regressions

Evidence ledgers:

- `_generated/ux_redesign/device_acceptance_2026-06-26/logcat/ledger_agents_final.log`
- `_generated/ux_redesign/device_acceptance_2026-06-26/logcat/ledger_multichannel_final.log`
- `_generated/ux_redesign/device_acceptance_2026-06-26/logcat/ledger_offer_review_final.log`
- `_generated/ux_redesign/device_acceptance_2026-06-26/logcat/ledger_commercial_after_fix.log`
- `_generated/ux_redesign/device_acceptance_2026-06-26/logcat/ledger_conversations_after_final_fix.log`
- `_generated/ux_redesign/device_acceptance_2026-06-26/logcat/ledger_transport.log`
- `_generated/ux_redesign/device_acceptance_2026-06-26/logcat/ledger_approvals.log`
- `_generated/ux_redesign/device_acceptance_2026-06-26/logcat/ledger_operations.log`

Final runner summary:

- `agents`: `executed=11 passed=11 failed=0 unexecuted=0`
- `multichannel`: `executed=9 passed=9 failed=0 unexecuted=0`
- `offer_review`: `executed=1 passed=1 failed=0 unexecuted=0`
- `commercial`: `executed=31 passed=31 failed=0 unexecuted=0`
- `conversations`: `executed=3 passed=3 failed=0 unexecuted=0`
- `transport`: `executed=8 passed=8 failed=0 unexecuted=0`
- `approvals`: `executed=5 passed=5 failed=0 unexecuted=0`
- `operations`: `executed=22 passed=22 failed=0 unexecuted=0`

## Safety

- Full Run 1: not run.
- Full Run 2: not run.
- Production API/backend/VPS/HAPP/proxy: not changed.
- Outbound/send/payment/publication: not performed.
- Production DB mutations: not performed.
- Data clear: not performed.
