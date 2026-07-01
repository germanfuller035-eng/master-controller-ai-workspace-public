# Owner Acceptance Checklist — Master Controller v0.4.0-rc1

Server-side proof is already GREEN (tg_api_only 25/25, handler_routing 18/18, no send/SMTP/mutation
reachable from read handlers). The items below are the OWNER interactive confirmation. None send anything.

## A. Telegram owner smoke (in the Telegram app, as owner)

| # | Action | Expected | Result |
|---|--------|----------|--------|
| 1 | Tap `🏠 Меню` | Main menu opens, no unknown-command error | ☐ |
| 2 | Tap `📊 Сегодня` | Today view; operational vs canonical count explained | ☐ |
| 3 | Tap `🎯 Следующее действие` | Next action shows company + concrete action + lead_id | ☐ |
| 4 | Tap `Открыть лид` | Opens the lead (inline) | ☐ |
| 5 | Send `/lead` | Lead selector lists tappable `/lead <id>` commands | ☐ |
| 6 | Send `/health` | Readable Russian health summary (no raw object) | ☐ |
| 7 | Send `/automation` | Readable Russian automation status (writer/autosend/rev) | ☐ |
| 8 | Tap `💰 Mini Audit` | API-backed mini-audit queue opens | ☐ |
| 9 | Tap `❓ Help` | Help/menu opens | ☐ |

Acceptance: all 9 pass, no raw object output, no send occurs. Record PASS/FAIL per row (screenshots welcome).
Until performed: OWNER_TELEGRAM_SMOKE = BLOCKED_OWNER_INTERACTION (does NOT invalidate server-side proof).

## B. Android physical-device acceptance (when a device is connected)

Install (in-place; same signing key, so update works without uninstall unless downgrading):
```
adb install -r dist/master_controller_android/MasterController-release-v0.4.0-rc1.apk
```
Verify APK hash before install:
`sha256sum MasterController-release-v0.4.0-rc1.apk` → must equal
`467acccdf5a4acc4524458d1fce4737127a8126738b369edaf58c734bfe0eca2`

Device smoke (read-only; no sends): cold start; force-stop + relaunch (process recreation);
verify HTTPS API + pairing; offline cache then reconnect; all 5 tabs; the 22 screens
(Today, Leads, Product Routing, STAGING, VERIFIED_READY, Lead Detail, Audit Queue, Audit Detail,
Draft Queue, Draft Detail, Replies, Reply Thread, Reply Drafts, Reply Draft Detail, Follow-ups,
Follow-up Detail, Automation, Sources, Scheduler, Queue, Dead Letters, Settings); score_v1/v2 shown;
send-disabled / "Письмо НЕ отправлено" warnings present; no offline mutation; no crash.

Until performed: PHYSICAL_DEVICE_TEST = BLOCKED_DEVICE_NOT_CONNECTED.
