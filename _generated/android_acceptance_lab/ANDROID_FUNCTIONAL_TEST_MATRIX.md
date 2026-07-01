# Android Functional Test Matrix — 0.8.0 (acceptance lab)

Источник: полный авто-скан Compose-кода (см. `ANDROID_UI_CONTROL_INVENTORY.md`) +
on-device проверка на видимом эмуляторе, сопряжённом с production
(`https://195-96-132-82.sslip.io`). Статусы без UNKNOWN/NOT_TESTED.

## Сводка контролов (release runtime, без @Preview/test)

| action_kind | назначение | риск |
|-------------|-----------|------|
| NAVIGATION | переход на реальный экран | SAFE_NAVIGATION |
| API_READ / REFRESH | чтение production | SAFE_READ |
| API_WRITE | TEST_ONLY запись с server reread | TEST_ONLY_WRITE |
| LOCAL_TOGGLE | тема/настройки локально | NONE |
| EXTERNAL_LINK | открыть первоисточник | SAFE |
| DECORATIVE_DISABLED | статус-метки enabled=false | NONE |
| DANGEROUS | 23 контрола, 22 гейтятся; 1 (unpair) — исправлен диалогом | GATED |

## Дефекты, найденные сканом и исправленные (→ RC4)

| Класс | Где | Было | Фикс |
|-------|-----|------|------|
| FAKE_STATUS | SettingsScreen.kt:29 | «Статус подключения: подключено» хардкод | реальный health-probe (connected: true/false/проверка), цвет ошибки |
| DANGEROUS_NO_CONFIRM | SettingsScreen.kt:53 btn_unpair | необратимая отвязка с одного тапа | AlertDialog подтверждения (btn_unpair_confirm/cancel) |
| MISSING_TESTTAG | PushSettingsScreen | весь экран Push без testTag (слепая зона) | push_switch_*/push_severity_* + theme_chip_* в Settings |

## Матрица по экранам (ключевые)

| Screen | Control | action | expected API | server reread | status |
|--------|---------|--------|--------------|---------------|--------|
| Today | card_command_center | NAV | — | — | PASS (reachable, рендерит live) |
| Today | card_campaigns | NAV | — | — | PASS (reachable) |
| Today | api chip | DECORATIVE | health | — | PASS (из реального ui.apiOk) |
| CommandCenter | весь экран | API_READ | GET /next-actions,/command-brief | — | PASS (live: HEALTH_RECHECK/recovered виден) |
| Reliability | autopilot OBSERVE/PREPARE/MANAGED | API_WRITE | POST /autopilot/mode | GET /autopilot | PASS (instrumented) |
| Reliability | обзор | API_READ | GET /reliability | — | PASS (live HEALTHY) |
| Cost | обзор | API_READ | GET /costs | — | PASS (live units, UNKNOWN≠0) |
| Backup | обзор + drill | API_READ | GET /backups/status,/restore-drill | — | PASS (live) |
| Push | status + switches | API_READ/WRITE | GET/POST /push/* | GET /push/preferences | PASS (CREDENTIAL_REQUIRED честно) |
| Incidents | btn ack | API_WRITE | POST /incidents/{id}/acknowledge | GET /incidents | PASS |
| Notifications | mark read | API_WRITE | POST /notifications/{id}/read | GET /notifications | PASS (live verify) |
| Settings | btn_unpair | LOCAL (destructive) | — | — | PASS (теперь с подтверждением) |
| Settings | conn status | API_READ | GET /health | — | PASS (теперь live) |
| Knowledge | owner actions | LOCAL | — | — | PASS (честно помечены локальными) |
| LeadDetail | btn_send_email | DANGEROUS | — | — | GATED (2-step + server no-send) |

Полные машиночитаемые данные: `ANDROID_UI_CONTROL_INVENTORY.md`,
`ANDROID_FUNCTIONAL_TEST_MATRIX.json`.
