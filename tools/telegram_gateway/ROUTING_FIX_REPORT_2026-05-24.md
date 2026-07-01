# Telegram Master Controller — Routing & Voice Fix Report
**Date:** 2026-05-24  
**Engineer:** Cline (Senior Telegram Bot Reliability Engineer)  
**Status:** ✅ Code fixed, smoke tests passed. ⏳ Live restart requires Dmitry approval.

---

## 1. Почему /ping отвечал общим "Telegram Master Controller v0.7 активен"

**Причина:**  
В предыдущей версии бота команда `/ping` попадала в catch-all блок `handleDLFCommand`, который возвращал общий статус-текст из `getStatusReport()`. Этот блок проверял `/ping` *после* обработки других команд, и поскольку обработчик вернул строку "Telegram Master Controller v0.7 активен", пользователь видел именно её.

Конкретнее: в `handleText` → `handleDLFCommand` блок `else { reply = getStatusReport() }` перехватывал `/ping` как неизвестную команду.

---

## 2. Что исправлено в direct routes

Все следующие команды теперь имеют **жёсткий direct-route ДО любого NL-роутера**:

| Команда | Route | Ответ |
|---------|-------|-------|
| `/ping` | direct, первым в handleDLFCommand | pong + Bot/PID/Uptime/Polling/Heartbeat age/Auto-send: BLOCKED |
| `/probe` | direct | bot_username/chat_id/user_id/PID/uptime/heartbeat_age/polling/last_update_at/last_error_at/update_id/auto_send |
| `/start` | direct | Список всех 8+ команд с emoji |
| `/health` | direct | statuses всех подсистем |
| `/voice_status` | direct | voice handler status/transcriber configured/provider/last_voice_at/last_voice_status/last_voice_error/timeout_sec |

Порядок в `handleDLFCommand`:
1. `/ping` — первым (до всего)
2. `/probe` — вторым
3. `/start` — третьим
4. остальные команды
5. NL-router / fallback — последним

---

## 3. Что исправлено в voice-handler

**Было:** `handleVoice` отправлял "🎙 Голос получен. Запускаю транскрибацию..." и не давал финального ответа.

**Стало:**
1. Получение voice → логирование `update_received` → ответ "Запускаю транскрибацию..."
2. Проверка: настроен ли транскрайбер (`VOICE_TRANSCRIPT_SCRIPT`)?
   - **Нет** → немедленный финальный ответ: "⚠️ Транскрибация пока не настроена. Голосовое сообщение получено, но не обработано. Используй текстовую команду." + лог `voice_transcription_unavailable`
   - **Да** → `spawnSync` с **timeout = 60 сек**
     - **isTimeout** → финальный ответ: "⏱ Транскрибация не завершилась за 60 сек. Событие записано в лог." + лог `voice_transcription_timeout`
     - **Ошибка** → финальный ответ: "⚠️ Ошибка транскрибации. Событие записано в лог." + лог в `telegram_errors.log`
     - **Успех** → текст транскрипции + передача в command router

Бот **больше не молчит** после "Запускаю транскрибацию...".

---

## 4. Добавлена /voice_status

Команда `/voice_status` добавлена как direct-route. Отвечает:
```
Voice Handler Status
voice handler: enabled
transcriber configured: no
provider: none
last_voice_at: N/A
last_voice_status: N/A
last_voice_error: N/A
timeout_sec: 60

transcriber configured: no
```

---

## 5. Обновлённые файлы

| Файл | Изменение |
|------|-----------|
| `tools/telegram_gateway/telegram_master_bot.mjs` | /ping direct-route, /probe, /start (список команд), /voice_status, voice-handler с timeout + unavailable path, empty message fallback, heartbeat fields |
| `tools/telegram_gateway/reliability.mjs` | sanitize(), logUpdate() с last_route/last_update_type/last_voice_at/last_ping_at |
| `tools/telegram_gateway/data/bot_heartbeat.json` | Автообновление: last_route, last_update_type, last_voice_at, last_voice_status, last_ping_at, polling |
| `tools/telegram_gateway/telegram_live_silent_failure_test.mjs` | **СОЗДАН** — 26 статических проверок |

---

## 6. Результаты smoke tests

```
telegram_live_silent_failure_test.mjs  : 26/26 ✅ ALL PASS
telegram_reliability_smoke_test.mjs    : 36 OK / 1 WARN (ложное срабатывание на логгер) / 0 FAIL
telegram_gateway_smoke_test.mjs        : 34/34 ✅ ALL OK
telegram_newleads_shape_test.mjs       : 14/14 ✅ ALL PASSED
```

**WARN в reliability smoke test:** детектирует строку `token` в логгере sanitize-функции (она как раз *затирает* токен). Не является реальной уязвимостью — токен не логируется.

---

## 7. Как проверить в Telegram после рестарта

```
/ping      → pong + PID/Uptime/Polling/Auto-send: BLOCKED
/probe     → bot_username/chat_id/user_id/PID/uptime/heartbeat_age/polling/...
/health    → статус всех подсистем
/voice_status → voice handler status / transcriber configured: no
/start     → список всех 8 команд с emoji
Voice msg  → "⚠️ Транскрибация пока не настроена..." (без зависания)
```

---

## 8. Подтверждения безопасности

| Проверка | Статус |
|----------|--------|
| auto-send BLOCKED | ✅ BLOCKED — нет sendMessage клиентам |
| email-send BLOCKED | ✅ нет sendEmail() вызовов |
| n8n/webhook | ✅ не запускались |
| реальные парсеры | ✅ не подключались |
| токены | ✅ не логируются (sanitize() активен) |
| второй polling | ✅ не создавался (setInterval=0) |
| второй бот | ✅ не создавался |

---

## 9. Задача 10: Live Restart

⚠️ **Требуется одобрение Дмитрия**

Бот сейчас работает на **старом коде** (PID=3460, запущен 2026-05-24 11:45 UTC).  
Для применения исправлений нужен рестарт.

**Команда для Дмитрия:**
```powershell
cd D:\AI_WORKSPACE\tools\telegram_gateway
powershell -ExecutionPolicy Bypass -File .\stop_master_bot.ps1 -Deep
powershell -ExecutionPolicy Bypass -File .\start_master_bot.ps1
```

Или одной строкой:
```powershell
cd D:\AI_WORKSPACE\tools\telegram_gateway; powershell -ExecutionPolicy Bypass -File .\stop_master_bot.ps1 -Deep; Start-Sleep 3; powershell -ExecutionPolicy Bypass -File .\start_master_bot.ps1
```

После рестарта проверить:
```powershell
Get-Content .\data\bot_heartbeat.json -Raw
```

**Ожидаемо:** новый PID, `polling: true`, `started_at` = текущее время.
