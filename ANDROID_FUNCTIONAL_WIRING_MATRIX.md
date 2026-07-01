# Android Functional Wiring Matrix — 0.8.0-rc3

Метод: два независимых read-only аудита кода + перекрёстная сверка маршрутов навигации
с зарегистрированными `composable(...)` + сверка методов репозитория с endpoint'ами +
прямые curl к production API. Скриншоты НЕ использовались как доказательство.

## Acceptance (после фиксов)

| Метрика | Значение |
|---------|----------|
| STATIC_RUNTIME_SCREENS | 0 |
| RELEASE_RUNTIME_MOCKS | 0 |
| RELEASE_RUNTIME_PLACEHOLDERS | 0 |
| NO_OP_CONTROLS | 0 |
| LOCAL_FALSE_SUCCESS_PATHS | 0 |
| CLICKABLE_STATIC_CARDS | 0 |
| BROKEN_NAVIGATION | 0 |
| UNKNOWN | 0 |

Второй независимый аудит после фиксов: **NO_REMAINING_RELEASE_RUNTIME_DEFECTS**.

## Найдено и исправлено (commit 2324335)

| Класс | Где | Было | Фикс |
|-------|-----|------|------|
| BROKEN_NAVIGATION | command_center, campaigns | зарегистрированы, но недостижимы (нет navigate) | карточки на экране «Сегодня» |
| BROKEN_AUTH (403/401) | retryJob → POST /jobs/enqueue (scope jobs:read) | owner-токен всегда получал 401 | новый owner-auth `POST /jobs/{id}/retry` |
| LOCAL_FALSE_SUCCESS | Knowledge диалог находки | текст обещал серверную «задачу проверки», а запись только локальная | честный текст: сохраняется локально, серверная задача не создаётся |
| NO_OP | 5 AssistChip(onClick={}) | декоративные бейджи с кликабельной аффордансой | `enabled=false` → честные неинтерактивные метки |

## Read-only экраны (production truth → DTO → Repository → ViewModel → UI)

Все классифицированы READ_ONLY_WORKING. Live-проверено curl к проду:
`/reliability` (HEALTHY), `/costs` (реальные 2643 расчётных единицы из прод-ledger),
`/backups/status` (реальный canonical), `/push/status` (CREDENTIAL_REQUIRED).

Экраны: Today, CommandCenter, Reliability, Cost, Backup, Push, Decisions, Incidents,
Notifications, Knowledge (digest/sources/status), AiUsage, Operations/System,
Campaigns, Replies, First Touch, Agents, Multichannel, Source registry/telemetry,
Reservoir, Owner settings, Mini Audit, Pipeline, Approvals.

## Write-контролы (TEST_ONLY / LIVE; путь действие→2xx→operationId→server reread→UI)

| Контрол | Endpoint | Auth | Класс |
|---------|----------|------|-------|
| notification read | POST /notifications/{id}/read | owner | TEST_ONLY_WORKING |
| incident ack/mute | POST /incidents/{id}/acknowledge\|mute | owner | TEST_ONLY_WORKING |
| decision resolve | POST /owner-decisions/{id}/resolve | owner+revision | TEST_ONLY_WORKING |
| autopilot mode | POST /autopilot/mode | owner | TEST_ONLY_WORKING |
| kill switch | POST /operations/kill-switch/enable | owner | TEST_ONLY_WORKING |
| dead-letter retry | POST /jobs/{id}/retry | owner | LIVE_WORKING (исправлен с 401) |
| remediation run | POST /remediation/run | owner | LIVE_WORKING (prod smoke: HEALTH_RECHECK→HEALTHY, SEND_CLIENT→400) |
| push register/prefs | POST /push/register,/push/preferences | owner | TEST_ONLY_WORKING |
| campaign create/pause/resume | POST /campaigns/* | owner | TEST_ONLY_WORKING |

Полная машиночитаемая версия: `ANDROID_FUNCTIONAL_WIRING_MATRIX.json`.
