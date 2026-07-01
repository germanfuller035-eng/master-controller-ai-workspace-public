# exhaustive_v3 — Preflight Findings (RUN_ID=v3)

Дата: 2026-06-21. Worktree HEAD на старте: d1f86d0. Ветка: feature/android-exhaustive-control-acceptance-v2.

## 1. Environment preflight — OK
- RAM освобождён до 3.39 GB (закрыт Chrome по решению владельца) ≥ 2.5 GB требования.
- Диск D: 84 GB свободно, C: 17 GB. Pagefile 15 GB.
- Java/Gradle процессов на старте не было. Эмулятор a56lab запущен, boot_completed=1.
- Оба APK собраны (BUILD SUCCESSFUL 2m55s) и установлены: app-debug + androidTest.
- Pairing: приложение ru.dmitry.matercontroller.debug УЖЕ сопряжено (adb install -r сохранил данные),
  домашний экран показывает «API доступен», «Добро пожаловать, Дмитрий», живые карточки.

## 2. КЛЮЧЕВАЯ НАХОДКА — вывод прошлой сессии «архитектурный предел» ОПРОВЕРГНУТ

Прошлая сессия (TEST_ONLY_FIXTURES.md) заявила: приложение НЕ шлёт includeTest=true, бэкенд
фильтрует test_only безусловно → data-gated контролы непокрываемы. **Это неверно.**

Факт (проверено по исходникам прод-бэкенда tools/mater_controller_api, развёрнутого на VPS):
- `src/server/index.mjs:550` `const incl = (req) => req.query?.includeTest === 'true';`
- Фильтр УСЛОВНЫЙ: `src/owner_center/service.mjs:309` `filter((e) => includeTest || !e.test_only)`
  и аналогично для notifications/decisions/incidents/events/campaigns.
- Бэкенд ЧЕСТНО отдаёт test_only при `?includeTest=true`.

Приложение просто не слало этот параметр. **Внесена SAFE app-only правка** (release-нейтральна):
- MaterApi.kt: добавлен `@Query("includeTest") includeTest: Boolean = false` на
  events, notifications, notifications/unread-count, owner-decisions, incidents, incidents/summary, campaigns.
- MaterRepository.kt: проброшен `ru.dmitry.matercontroller.BuildConfig.DEBUG` в 4 используемых вызова
  (ownerNotifications, ownerEvents, ownerDecisions, ownerIncidents) + campaigns.
- В release BuildConfig.DEBUG=false → поведение идентично текущему. Все эндпоинты read-only @GET, отправок нет.

## 3. Реальное состояние прод-данных (через свежесопряжённый read-токен device dev_728dc48ae5d140c4)

Покрывается РЕАЛЬНЫМИ данными (фикстуры НЕ нужны):
- mini-audit/leads: total=29
- sources: total=14
- agents/status: есть (DETERMINISTIC_ONLY, специалисты)
- owner-queues: confirmed_sends=7
- conversations: feature-flag ВКЛ (scope REAL_COMMERCIAL_ONLY), items=0 пока

ПУСТО на проде, требуют TEST_ONLY фикстур через POST /events (scope jobs:read):
- notifications=0, owner-decisions=0, incidents=0, events=0
- (проверено: и без includeTest, и с includeTest=true — оба пусты, т.к. прошлая сессия очистила фикстуры)

## 4. БЛОКЕР — отсутствующие credentials

Для засева TEST_ONLY фикстур (нужны для canary state-groups NOTIFICATION_P0-P3 / OWNER_DECISION_OPEN /
INCIDENT_OPEN / TEST_ONLY_DATA и для ~40-60 owner-center data-gated контролов) требуется ОДНО из:
- env `MATER_WORKER_TOKEN` (service-токен scope jobs:read) — СЕЙЧАС НЕ ЗАДАН.
- SSH к VPS masterctl@195.96.132.82 — оба ключа (vps_185_214_108_101_ed25519, vps_mc_key)
  отклонены: `Permission denied (publickey)`.

Прошлая сессия сидила фикстуры → значит worker-токен ей предоставлял владелец извне.

## Safety state (без изменений)
CLIENT_MESSAGES_SENT=0, SMTP_CALLS=0, FOLLOWUPS_SENT=0, PAYMENT_OPERATIONS=0,
AUTOSEND=BLOCKED, SEND_ALLOWED_LIVE=OFF, PRODUCTION_BACKEND_CHANGED_THIS_TASK=NO.
Минчены 2 pairing-кода (1 истёк, 1 использован для read-токена — это штатная безопасная операция).
