# Telegram Master Controller — README_RUN

> **Reliability Sprint enabled.** Бот не молчит: каждая команда получает
> ответ — либо результат, либо fallback, либо сообщение об ошибке с
> route_id. См. раздел **«Автовосстановление»** в конце файла.


## Как запускать без ошибок

### Вариант 1 — двойной клик (самый простой):
```
start_master_bot.cmd
```
Дважды кликни по файлу `start_master_bot.cmd` в папке `D:\AI_WORKSPACE\tools\telegram_gateway`.

---

### Вариант 2 — PowerShell:
```powershell
cd D:\AI_WORKSPACE\tools\telegram_gateway
powershell -ExecutionPolicy Bypass -File .\start_master_bot.ps1
```

---

### Вариант 3 — ручной запуск:
```powershell
cd D:\AI_WORKSPACE\tools\telegram_gateway
node .\telegram_master_bot.mjs
```

---

## ⚠️ ВАЖНОЕ ПРЕДУПРЕЖДЕНИЕ

**Не вводить** в терминал строку вида:
```
PS D:\AI_WORKSPACE\tools\telegram_gateway>
```
Это **не команда**, а **приглашение PowerShell** (prompt). Оно показывает текущую папку.
Вводи только команды ПОСЛЕ знака `>`.

---

## Остановка бота

```powershell
cd D:\AI_WORKSPACE\tools\telegram_gateway
powershell -ExecutionPolicy Bypass -File .\stop_master_bot.ps1
```

---

## Проверка статуса

```powershell
cd D:\AI_WORKSPACE\tools\telegram_gateway
powershell -ExecutionPolicy Bypass -File .\check_master_bot.ps1
```

Показывает:
- запущен ли node-процесс бота
- есть ли lock-файл и жив ли его PID
- есть ли .env и токен
- все нужные файлы (daily_report.json, leads_test.csv, events_log.json)
- последние строки лога

---

## Первоначальная настройка

1. Скопируй `.env.example` в `.env`:
   ```powershell
   Copy-Item .env.example .env
   ```
2. Открой `.env` и замени `PASTE_YOUR_BOTFATHER_TOKEN_HERE` на токен от [@BotFather](https://t.me/BotFather).
3. Запускай через `start_master_bot.cmd`.

---

## Ожидаемый вывод при успешном запуске

```
=========================================
  Telegram Master Controller — Запуск
  2026-05-23 08:30:00
=========================================

[1/5] Останавливаем старые экземпляры бота...
      Нет активных процессов.
[2/5] Удаляем старый lock-файл...
      Lock не найден (ок).
[3/5] Переходим в папку бота...
      OK: D:\AI_WORKSPACE\tools\telegram_gateway
[4/5] Проверяем .env...
      OK: .env найден.
[5/6] Запускаем smoke test...
      Smoke test PASSED.
[6/6] Запускаем бот...
      node .\telegram_master_bot.mjs

[Telegram Command Center v0.7] Starting polling...
[DLF] Daily Lead Factory integration loaded.
[DLF] Commands: /ping /start /status /today /newleads /emergency_stop
[DLF] Safety: auto-send to clients = BLOCKED
```

---

## Команды бота в Telegram

| Команда | Действие |
|---|---|
| `/ping` | Проверка связи |
| `/start` | Приветствие |
| `/status` | Статус системы |
| `/today` | Сводка за сегодня |
| `/newleads` | Новые лиды |
| `Покажи новые лиды` | То же что /newleads |
| `Сводка за сегодня` | То же что /today |

---

## Файлы управления

| Файл | Назначение |
|---|---|
| `start_master_bot.cmd` | Запуск (двойной клик) |
| `start_master_bot.ps1` | Запуск (PowerShell) |
| `stop_master_bot.ps1` | Остановка |
| `check_master_bot.ps1` | Статус |
| `.env` | Токен бота (не публиковать!) |
| `.env.example` | Шаблон .env |
| `logs/telegram_master_bot.log` | Лог запусков |

---

## Защита от двойного запуска

### Нормальное состояние системы

Ровно **1 процесс** `node.exe` с аргументом `telegram_master_bot.mjs` + lock-файл существует с PID, который совпадает с живым процессом.

### Как проверить статус

```powershell
cd D:\AI_WORKSPACE\tools\telegram_gateway
powershell -ExecutionPolicy Bypass -File .\check_master_bot.ps1
```

Вывод покажет:
- количество найденных процессов `telegram_master_bot.mjs`
- PID каждого процесса
- статус совпадения lock-файла с PID
- присутствие токена (значение скрыто)

**Расшифровка статусов:**

| Статус | Что означает |
|---|---|
| `[OK]` | 1 процесс, lock PID совпадает — всё штатно |
| `[WARNING]` | 1 процесс, lock отсутствует — нужна проверка |
| `[RED]` | 2+ процесса — нарушение, нужна остановка |
| `[OK]` (нет проц.) | 0 процессов, lock отсутствует — бот остановлен штатно |
| `[STALE LOCK]` | 0 процессов, но lock остался — нужна очистка |

### Как остановить бот

```powershell
cd D:\AI_WORKSPACE\tools\telegram_gateway
powershell -ExecutionPolicy Bypass -File .\stop_master_bot.ps1
```

Скрипт остановит **только** процессы `telegram_master_bot.mjs`, не трогая другие node.exe процессы.

### Как запустить бот

```powershell
cd D:\AI_WORKSPACE\tools\telegram_gateway
powershell -ExecutionPolicy Bypass -File .\start_master_bot.ps1
```

Или двойным кликом по `start_master_bot.cmd`.

### Что делать, если найдено 2 node-процесса

Это состояние `[RED]` — `check_master_bot.ps1` укажет PID обоих процессов.

**Порядок действий:**
1. Запусти `stop_master_bot.ps1` — он остановит оба процесса и удалит lock.
2. Запусти `check_master_bot.ps1` — убедись, что процессов нет.
3. Запусти `start_master_bot.ps1` — стартует чистый единственный экземпляр.

`start_master_bot.ps1` **блокирует** запуск, если:
- lock PID живой — процесс уже работает
- найден живой процесс без lock — WARNING
- найдено 2+ процессов — RED, отказ запуска

---

## Безопасность

- Токен **не хранится в коде** и **не выводится в консоль**.
- AutoSend клиентам **заблокирован** (`approve_send` только меняет статус и пишет лог).
- Второй polling **не создаётся** — lock-файл + проверка CommandLine защищают от дублей.
- Бот отвечает **только** авторизованному chat_id (задаётся в `.env` через `TELEGRAM_CHAT_ID`).

---

## Автовосстановление (Reliability Sprint)

### Команды бота для диагностики

| Команда | Что показывает |
|---|---|
| `/ping` | Бот жив, проверка связи |
| `/status` | PID, uptime, heartbeat, last_update, last_command, last_error, lock PID, DLF loaded, emergency_stop, auto_send_to_clients = BLOCKED |
| `/health` | Self-check (lock, env, token hidden, daily_report, queue, events_log, logs writable, heartbeat fresh, one polling). Ответ: ✅ OK / ⚠️ WARNING / 🔴 RED |
| `/debug_last` | Последние 5 обработанных команд: время, текст, route, статус, ошибка (без токенов) |
| `/keepalive` | Подтверждение, что heartbeat обновляется (выводит PID) |
| `/contact GSK resolve` | Подтвердить контакт ГСК в локальной матрице (email клиенту НЕ отправляется) |
| `подтверди email ГСК` | То же, текстовая форма |

### Файлы Reliability

| Файл | Назначение |
|---|---|
| `data/bot_heartbeat.json` | pid, started_at, last_heartbeat_at (обновляется каждые 30 сек), last_update_at, last_command, last_error_at, status |
| `logs/telegram_updates.log` | Все входящие updates: timestamp, update_id, chat_id, user_id, username, text, detected_route, status (received/routed/failed/ignored), error_message |
| `logs/telegram_errors.log` | Все ошибки handlers + polling_error: route, text, error_name, error_message, stack_short |
| `logs/watchdog.log` | Действия watchdog: restart, stale lock cleanup, multi-process kill |
| `D:\AI_WORKSPACE\tools\contact_resolution\contact_resolution.json` | Матрица контактов (display_name, email, status, allowlist_active, send_allowed=false, approval_required=true) |
| `D:\AI_WORKSPACE\tools\contact_resolution\contact_events.json` | События: contact_resolve_requested / contact_confirmed / contact_not_found / contact_status_shown |

### Как диагностировать, почему бот молчит

1. **Сначала** — проверь, что процесс жив:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\check_master_bot.ps1
   ```
   Смотри секцию `[ Reliability ]`:
   - `[HEARTBEAT] age=Xs` — если `>90s`, бот завис.
   - `[ROUTE RELIABILITY] GREEN/YELLOW/RED` — общий вердикт.

2. **Если процесс жив, но не отвечает**:
   - Открой `logs/telegram_updates.log` — приходят ли updates вообще?
   - Открой `logs/telegram_errors.log` — есть ли свежие ошибки?
   - В Telegram отправь `/health` — увидишь конкретный сломанный компонент.
   - В Telegram отправь `/debug_last` — увидишь, что бот понял в последних 5 командах.

3. **Если процесс умер**:
   - `start_master_bot.ps1` — перезапуск.
   - Либо запусти watchdog (см. ниже) — он перезапустит сам.

4. **Если в логах `409 Conflict`** — запущен второй polling-процесс:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\stop_master_bot.ps1
   powershell -ExecutionPolicy Bypass -File .\start_master_bot.ps1
   ```

### Heartbeat — как проверить вручную

```powershell
Get-Content D:\AI_WORKSPACE\tools\telegram_gateway\data\bot_heartbeat.json -Raw
```

Свежий heartbeat = `last_heartbeat_at` отстаёт от текущего времени не более чем на 60 секунд.

### Watchdog — ручной запуск

```powershell
cd D:\AI_WORKSPACE\tools\telegram_gateway
powershell -ExecutionPolicy Bypass -File .\watch_master_bot.ps1
```

Что делает watchdog:
- читает `data/bot_heartbeat.json`;
- если процесса нет — запускает `start_master_bot.ps1`;
- если heartbeat старше 90 секунд — `stop`, потом `start`;
- если lock stale (PID не живой) — удаляет lock и запускает заново;
- если найдено больше одного процесса — `stop`, потом `start`;
- пишет лог в `logs/watchdog.log`.

### Reliability smoke test

```powershell
cd D:\AI_WORKSPACE\tools\telegram_gateway
node .\telegram_reliability_smoke_test.mjs
```

Проверяет 30+ инвариантов: наличие команд, отсутствие токенов в коде, `auto_send_to_clients = BLOCKED`, наличие fallback, contact_resolution файлы, один polling и т.д.
Должен вывести: `PASS: 30/30`.

### Windows Task Scheduler (автозапуск watchdog каждую минуту)

> **НЕ запускай без подтверждения Дмитрия.** Ниже только инструкции.

#### Создать задачу (запуск каждые 1 минуту)

```powershell
$action  = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File D:\AI_WORKSPACE\tools\telegram_gateway\watch_master_bot.ps1"

$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes 1) `
    -RepetitionDuration (New-TimeSpan -Days 3650)

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

Register-ScheduledTask `
    -TaskName "AI_WORKSPACE_TelegramWatchdog" `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Watchdog Telegram Master Controller (AI_WORKSPACE)"
```

#### Проверить, что задача создана

```powershell
Get-ScheduledTask -TaskName "AI_WORKSPACE_TelegramWatchdog"
Get-ScheduledTaskInfo -TaskName "AI_WORKSPACE_TelegramWatchdog"
```

#### Удалить задачу

```powershell
Unregister-ScheduledTask -TaskName "AI_WORKSPACE_TelegramWatchdog" -Confirm:$false
```

### Гарантии безопасности Reliability Sprint

- ❌ Второй бот **НЕ создан**.
- ❌ Второй polling **НЕ запущен**.
- ❌ Автоотправка клиентам **ЗАБЛОКИРОВАНА** (`auto_send_to_clients = BLOCKED`).
- ❌ Подтверждение `подтверди email ГСК` **НЕ отправляет письмо** — только меняет статус в `contact_resolution.json` и пишет event.
- ❌ Токены **не выводятся** в логи и **не появляются** в коде.
- ❌ Webhook **не запущен**.
- ❌ Реальные парсеры почты/соцсетей **не подключены**.
- ✅ Любая команда **получает ответ** — результат, fallback или ошибку с route_id.
- ✅ Unknown command получает **полезный fallback** со списком доступных команд.

---

## Ошибка 409 Conflict

### Что означает

Telegram API возвращает `409 Conflict: another polling process is active` когда:
- уже запущен другой `node` процесс с тем же токеном (дубль бота),
- активен webhook через BotFather/n8n/сервер — polling и webhook несовместимы,
- предыдущий процесс завис и не освободил сессию.

Бот **НЕ спамит 409 бесконечно** — при первом получении 409 он останавливает polling, записывает ошибку в `logs/telegram_errors.log`, обновляет heartbeat (`status: conflict_409`) и завершается с `exit code 1`.

### Шаг 1 — Найти все подозрительные polling-процессы

```powershell
cd D:\AI_WORKSPACE\tools\telegram_gateway
powershell -ExecutionPolicy Bypass -File .\find_telegram_pollers.ps1
```

Скрипт покажет все `node.exe` процессы с ключевыми словами telegram/bot/polling/gateway/daily_lead.  
Токены маскируются автоматически (`[TOKEN_HIDDEN]`).

### Шаг 2 — Остановить все подозрительные процессы (Deep Stop)

```powershell
powershell -ExecutionPolicy Bypass -File .\stop_master_bot.ps1 -Deep
```

Режим `-Deep`:
- останавливает `telegram_master_bot.mjs`,
- останавливает старый `daily_lead_factory` бот,
- останавливает старый gateway бот,
- удаляет `.telegram_master_bot.lock`,
- логирует в `logs/stop_master_bot.log`.

### Шаг 3 — Проверить состояние webhook

```powershell
node .\telegram_api_diagnostics.mjs
```

Покажет:
- bot username,
- webhook url: yes/no,
- pending_update_count,
- last_error если есть,
- рекомендацию если webhook активен.

### Шаг 4 — Удалить webhook (только с одобрения Дмитрия)

Если шаг 3 показал `webhook active: YES`:

```powershell
node .\telegram_api_diagnostics.mjs --delete-webhook
```

⚠️ **Требует одобрения Дмитрия перед выполнением.**

### Шаг 5 — Запустить бота заново

```powershell
powershell -ExecutionPolicy Bypass -File .\start_master_bot.ps1
```

`start_master_bot.ps1` автоматически:
1. Запускает `find_telegram_pollers.ps1` — если есть подозрительные процессы, **не запускает** бота.
2. Запускает `telegram_api_diagnostics.mjs` — если webhook активен, **не запускает** бота.
3. Проходит smoke tests.
4. Только при чистом состоянии запускает polling.

### Быстрая шпаргалка 409

```
1. powershell -ExecutionPolicy Bypass -File .\stop_master_bot.ps1 -Deep
2. node .\telegram_api_diagnostics.mjs
3. (если webhook) node .\telegram_api_diagnostics.mjs --delete-webhook  ← approval required
4. powershell -ExecutionPolicy Bypass -File .\start_master_bot.ps1
```


