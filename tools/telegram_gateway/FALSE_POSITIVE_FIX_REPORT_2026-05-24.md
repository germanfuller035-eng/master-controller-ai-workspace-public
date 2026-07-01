# False Positive Fix Report — Telegram Master Controller
**Date:** 2026-05-24  
**Engineer:** Cline (Senior PowerShell + Node.js Reliability)  
**Status:** ✅ FIXED & VERIFIED

---

## 1. Причина false positive

**Старое поведение:** `start_master_bot.ps1` на шаге `[2/9] Preflight: checking for conflicting Telegram pollers...` запускал `find_telegram_pollers.ps1` и парсил его **человекочитаемый вывод** (text capturing).  

**Конкретная ошибка:** Скрипт искал наличие текстовой строки `"BLOCK 1"` или аналогичных заголовков блоков в stdout. Когда `find_telegram_pollers.ps1` выводил:

```
[ BLOCK 1: Suspicious Telegram/Bot/Polling node.exe processes ]
  (none found)
```

— наличие строки `BLOCK 1` в stdout интерпретировалось as *"найден подозрительный процесс"*, хотя реальных процессов не было. Это классический **false positive на заголовке**.

---

## 2. Что изменено в find_telegram_pollers.ps1

- **Добавлен параметр `-Json`**
- При вызове с `-Json` скрипт возвращает **только валидный JSON**, без заголовков, таблиц и human-readable текста
- Токены (bot token regex) **маскируются** в `command_line` поле
- Human-readable режим сохранён для вызова без `-Json`

**Формат JSON:**
```json
{
  "timestamp": "2026-05-24T18:00:00+03:00",
  "suspicious_count": 0,
  "all_node_count": 0,
  "suspicious": [],
  "all_node": []
}
```

При наличии процессов:
```json
{
  "pid": 1234,
  "command_line": "node ...masked_token...",
  "creation_date": "2026-05-24T...",
  "working_set": 123456
}
```

---

## 3. Что изменено в start_master_bot.ps1

**Preflight [2/9] переписан:**

**Было (ошибочно):**
```powershell
$output = & powershell -File .\find_telegram_pollers.ps1
if ($output -match "BLOCK 1") { # FALSE POSITIVE! }
```

**Стало (правильно):**
```powershell
$raw = & powershell -NoProfile -ExecutionPolicy Bypass -File .\find_telegram_pollers.ps1 -Json
$pollers = $raw | ConvertFrom-Json
if ($pollers.suspicious_count -gt 0) {
    # RED — реальные PID показываются из $pollers.suspicious
} else {
    # GREEN — OK suspicious_count=0
}
```

**Запрещённые паттерны удалены:**
- ❌ Поиск строки `"BLOCK"` в stdout
- ❌ Считать `"(none found)"` ошибкой
- ❌ Парсить человекочитаемый вывод как наличие процессов

---

## 4. Что изменено в stop/check/watch

### stop_master_bot.ps1
- **Deep-mode** теперь использует JSON-режим: `find_telegram_pollers.ps1 -Json`
- Останавливает **только реальные PID** из `$pollers.suspicious`
- Не реагирует на текстовые заголовки
- **После остановки** обновляет `data/bot_heartbeat.json`:
  - `status = "stopped"`
  - `polling = false`
  - `stopped_at = now`
  - `stop_reason = "stop_master_bot.ps1"`
- Heartbeat **не удаляется**, а маркируется `stopped`

### check_master_bot.ps1
- **Новая секция `[ Telegram Network ]`**:
  - DNS resolve `api.telegram.org` → IP
  - TCP connect `api.telegram.org:443`
  - GREEN / YELLOW / RED вывод
  - Не падает если сеть недоступна
- **STOPPED / STALE HEARTBEAT логика:**
  - Если `status = "stopped"` → `[STOPPED] Bot not running. Heartbeat is marked stopped.`
  - Если процессов 0, lock нет, heartbeat age > 90 сек → `[STALE HEARTBEAT]`
  - Старый heartbeat **не показывается как active running**

---

## 5. Как теперь выглядит stopped/stale heartbeat

```
[ Heartbeat: bot_heartbeat.json ]
  [STOPPED] Bot not running. Heartbeat is marked stopped.
  status    = stopped
  polling   = false
  stopped_at = 2026-05-24T18:02:28+03:00
  stop_reason = stop_master_bot.ps1

  Resolution:
    powershell -ExecutionPolicy Bypass -File .\start_master_bot.ps1
```

При STALE (процессов нет, хартбит устарел > 90 сек):
```
  [STALE HEARTBEAT] Old heartbeat from previous run (age: Xs).
  polling = false
  status = stopped/stale
```

---

## 6. Результат JSON-проверки find_telegram_pollers.ps1 -Json

```powershell
powershell -ExecutionPolicy Bypass -File .\find_telegram_pollers.ps1 -Json
```

Пример вывода (нет процессов):
```json
{
  "timestamp": "2026-05-24T18:02:27+03:00",
  "suspicious_count": 0,
  "all_node_count": 0,
  "suspicious": [],
  "all_node": []
}
```

**ТОЛЬКО JSON — никаких заголовков, никакого BLOCK 1.**

---

## 7. Результаты smoke tests

| Тест | Результат |
|------|-----------|
| `telegram_pollers_parser_test.mjs` | ✅ 9/9 passed |
| `telegram_reliability_smoke_test.mjs` | ✅ 36 OK, 1 WARN (статический regex), 0 FAIL |
| `telegram_gateway_smoke_test.mjs` | ✅ passed |
| `telegram_live_silent_failure_test.mjs` | ✅ 26/26 passed |
| `telegram_newleads_shape_test.mjs` | ✅ 14/14 passed |

**WARN** в `telegram_reliability_smoke_test.mjs`: статический false positive на regex `token` в коде маскировки — реального логирования токена нет, `sanitize()` подтверждён.

---

## 8. Команда правильного запуска

После выполненных изменений последовательность запуска:

```powershell
cd D:\AI_WORKSPACE\tools\telegram_gateway

# 1. Остановить всё (если было запущено)
powershell -ExecutionPolicy Bypass -File .\stop_master_bot.ps1 -Deep

# 2. Проверить состояние
powershell -ExecutionPolicy Bypass -File .\check_master_bot.ps1

# 3. Запустить бота (требует одобрения Дмитрия — long-running process)
powershell -ExecutionPolicy Bypass -File .\start_master_bot.ps1
```

**Ожидаемый preflight вывод:**
```
[2/9] Preflight: checking for conflicting Telegram pollers...
  [OK] suspicious_count=0, all_node=0
  [OK] No conflicting pollers found.
```

---

## 9. Подтверждение safety

| Правило | Статус |
|---------|--------|
| auto-send BLOCKED | ✅ Не изменялось |
| contact email send BLOCKED | ✅ Не изменялось |
| n8n/webhook не запускается | ✅ Webhook inactive (verified) |
| Реальные парсеры не подключены | ✅ |
| Токены не логируются | ✅ sanitize() активен |
| Второй бот не создан | ✅ |
| Второй polling не создан | ✅ Single lock enforced |
| Зависимости не устанавливались | ✅ |
| Команды с внешними POST не выполнялись | ✅ |

---

## Новые файлы

| Файл | Описание |
|------|----------|
| `telegram_pollers_parser_test.mjs` | Новый smoke test: 9 проверок JSON-режима полеров |

## Изменённые файлы

| Файл | Ключевое изменение |
|------|--------------------|
| `find_telegram_pollers.ps1` | Добавлен `-Json` режим, токены маскируются |
| `start_master_bot.ps1` | Preflight использует JSON, проверяет `suspicious_count` |
| `stop_master_bot.ps1` | Deep-mode использует JSON, маркирует heartbeat `stopped` |
| `check_master_bot.ps1` | STOPPED/STALE heartbeat, сетевая диагностика |
| `telegram_reliability_smoke_test.mjs` | Добавлены проверки JSON-mode, stopped heartbeat handling |
| `telegram_gateway_smoke_test.mjs` | Добавлены проверки JSON preflight, stop marks heartbeat |
| `telegram_live_silent_failure_test.mjs` | Добавлены проверки no token logging, auto-send BLOCKED |
