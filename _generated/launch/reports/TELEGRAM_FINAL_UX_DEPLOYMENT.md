# Telegram FINAL UX Deployment (Gate B executed — APPROVED)

date: 2026-06-17T22:24Z · branch feature/controlled-production-launch-v1 · GATE_B_APPROVED=YES · DEPLOYMENT=PASS

Owner approval token: APPROVE_GATE_B_EXACT_PRODUCTION_CHANGE. Scope limited to the package
`_generated/launch/reports/GATE_B_TELEGRAM_FINAL_UX.md` and the single runtime file
`tools/telegram_gateway/api_only/views.mjs`. No other runtime file touched.

## 1. File deployed
| file | hash before | hash after | match |
|------|-------------|-----------|-------|
| tools/telegram_gateway/api_only/views.mjs | 99071ffa…2a4f8a (prod) | dd45b613…21dbc (target) | YES |

index.mjs / api_client.mjs / mc_service.mjs UNCHANGED (verified — DTO `{ kind, reason, lead }`
already routed straight to renderNextAction). APPROVED_RUNTIME_FILES=1 · ACTUAL_FILES_CHANGED=1.

ACTIVATION = atomic `mv` within the runtime dir; owner/group/mode preserved (masterctl:masterctl 644).
Staging file removed after activation.

## 2. Backup / rollback
BACKUP_PATH=/opt/master-controller/backups/telegram_finalux_20260617_221903/views.mjs
BACKUP_SHA=99071ffa…2a4f8a · BACKUP_HASH_VERIFY=PASS · ROLLBACK_READY=YES · ROLLBACK_EXECUTED=NO
Rollback (one file + one restart):
`cp -p /opt/master-controller/backups/telegram_finalux_20260617_221903/views.mjs /opt/master-controller/tools/telegram_gateway/api_only/views.mjs && sudo systemctl restart master-controller-telegram.service`

## 3. Restart evidence (single service)
SERVICE=master-controller-telegram.service · restarted ONCE (API/worker/scheduler/IMAP/Caddy/VPS untouched).
PID_BEFORE=7080 → PID_AFTER=7757 (changed once) · NRestarts=0 · ActiveState=active/running ·
UnitFileState=enabled · SERVICE_USER=mctelegram · POLLER_COUNT=1 · GETUPDATES_CONFLICTS=0 ·
RESTART_LOOP=NO (PID stable, >60s elapsed) · API_RECONNECT=PASS (GET /health → 200).

## 4. Post-deployment safety (read-only)
CANONICAL_REVISION 66 → 66 (unchanged) · CANONICAL_LEADS 50 → 50 (unchanged) ·
HISTORICAL_SENDS 7 → 7 (unchanged) · DEPLOYMENT_WINDOW_SENDS=0 · QUEUE jobs 28 all COMPLETED ·
QUEUE_FAILED=0 · DEAD_LETTERS=0 · AUTOSEND=BLOCKED · SEND_ALLOWED_LIVE=OFF ·
MESSAGES_SENT=0 · SMTP_CALLS=0 · TELEGRAM_API_CALLS=0.
Deployed views.mjs forbidden-pattern scan (fs/smtp/localhost/canonical/queue) = 0 hits → API-only intact.
DIRECT_CANONICAL_FILE_ACCESS=NO · QUEUE_FILE_ACCESS=NO · SMTP_PATH=NO · LOCAL_OUTBOUND=NO · LOCALHOST_FALLBACK=NO.

## 5. Server-side FINAL UX verification (deployed runtime; NO Telegram API, NO send)
Imported the DEPLOYED views.mjs + index.mjs on the VPS, drove the exact DKBI payload
`{ kind:'followup', reason:'proven SMTP 250 and >48h since send', lead:DKBI_RU }` with a mocked svc
and captured send(). 33 checks PASS / 0 FAIL. Harness removed after run.

/next render (deployed):
```
🎯 Следующее действие
Доставка письма подтверждена. Прошло более 48 часов — пора проверить ответ и подготовить follow-up.

Лид: ДКБИ
lead_id: DKBI_RU
Команда: /lead DKBI_RU
```
inline button: 📂 Открыть лид → callback_data=lead:DKBI_RU.

Lead card render (deployed) — exact target layout:
```
🏢 ДКБИ

ID: DKBI_RU
Статус: ожидает ответа
Маршрут: ожидание ответа

Сайт: dkbi.ru
Email: info@dkbi.ru
Блокеры: отсутствуют
```
GENERIC_FALLBACK_NOT_USED=PASS · RAW_ENGLISH_REASON_REMOVED=PASS · DKBI_SPECIFIC_REASON=PASS ·
LEAD_STATUS_LOCALIZED=PASS · LEAD_ROUTE_LOCALIZED=PASS · RAW_WAITING_REPLY_REMOVED=PASS ·
RAW_SCORE_KEYS_REMOVED=PASS · revision/null/undefined/"—" absent=PASS · EMPTY_TECH_FIELDS_HIDDEN=PASS.
Regression: HEALTH/MENU(+alias меню/🏠 Меню)/LEADS/LEAD/TODAY/AUTOMATION/HELP all PASS ·
INLINE_BUTTON_REGRESSION=PASS · CALLBACK read-only (no mutation)=PASS · unauthorized callback blocked=PASS ·
NO_FALSE_SUCCESS=PASS · NO_SEND method reachable=PASS.

## 6. Soak
PREVIOUS_SOAK_T0=2026-06-17T20:57:18Z → archived as historical PARTIAL soak (evidence retained, NOT deleted;
invalidated by this deploy+restart).
NEW_SOAK_T0_UTC=2026-06-17T22:24:14Z · HOTFIX_COMMIT=f8cc379 · DEPLOYED_VIEWS_HASH=dd45b613… ·
TELEGRAM_PID=7757 · CANONICAL_REVISION=66 · CANONICAL_LEADS=50 · SEND_LEDGER=7 ·
DEPLOYMENT_WINDOW_SENDS=0 · DEAD_LETTERS=0 · POLLER_COUNT=1.
SOAK_TIMER_COUNT=1 (no second timer created) · SOAK_STATUS=T0_ONLY_NOT_FINAL.

## 7. Owner retest (pending — owner performs on real device; NOT marked PASS until owner confirms)
1. Tap 🎯 Следующее действие → specific Russian reason about delivery + 48h.
2. Tap 📂 Открыть лид → ДКБИ card: Russian status + Russian route; no waiting_reply / candidate_score_v2 /
   canonical_score_v1 / empty revision.
3. /health → Russian, no raw keys.
4. Confirm NO send occurred.
TELEGRAM_OWNER_SMOKE=NOT_RUN until owner screenshot/reply received.

## Safety totals
VPS_CHANGES=1 (single file replace) · SERVICES_RESTARTED=1 (telegram only) · REBOOT_EXECUTED=NO ·
DATA_MIGRATION_EXECUTED=NO · PRODUCTION_CANONICAL_WRITES=0 · MESSAGES_SENT=0 · SMTP_CALLS=0 ·
TELEGRAM_API_CALLS=0 · TAG_UNMOVED (v0.4.0-rc1) · NO_REMOTE · NO_PUSH.
