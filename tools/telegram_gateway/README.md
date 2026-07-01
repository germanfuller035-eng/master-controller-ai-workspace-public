# TELEGRAM MASTER CONTROLLER GATEWAY v0.5

## Назначение

Позволяет Дмитрию отправлять команды Master Controller через Telegram — **текстом и голосом**, в свободной форме на русском языке.

**NL Router**: бот понимает команды без строгого синтаксиса. Достаточно написать "Завод АТОМ: подготовить follow-up" или "КЖБИ статус".

**Voice**: голосовые сообщения сохраняются. Если Whisper CLI настроен — автоматически транскрибируются и распознаются в команду.

---

## Как настроить

1. Создать бота через BotFather.
2. Скопировать токен.
3. Скопировать `.env.example` в `.env`.
4. Вставить `TELEGRAM_BOT_TOKEN`.
5. Запустить бот.
6. Отправить `/start`.
7. Посмотреть user id в логе.
8. Добавить user id в `ALLOWED_TELEGRAM_USER_IDS`.
9. Перезапустить бот.

---

## Команда запуска

```
node "D:\AI_WORKSPACE\tools\telegram_gateway\telegram_master_bot.mjs"
```

Или через PowerShell-скрипты:

```
.\tools\telegram_gateway\start_telegram_gateway.ps1
.\tools\telegram_gateway\stop_telegram_gateway.ps1
.\tools\telegram_gateway\restart_telegram_gateway.ps1
.\tools\telegram_gateway\status_telegram_gateway.ps1
```

## Self-test (без подключения к Telegram)

```
node "D:\AI_WORKSPACE\tools\telegram_gateway\telegram_master_bot.mjs" --self-test
```

Проверяет 11 NL-команд: все должны пройти.

---

## Стандартные команды (slash)

```
/ping               — проверить бота
/health             — статус системы
/next               — следующее действие
/status             — общий статус
/status ATOM        — статус конкретного проекта
/followup ATOM draft      — подготовить follow-up (draft, не отправляет)
/lead GSK first_message draft  — первое сообщение (draft)
/approval show      — список согласований
/report money       — отчёт по деньгам
/reply drafts       — черновики ответов
/execute dashboard  — обновить dashboard
/execute next       — выполнить следующее действие
/gateway status     — состояние gateway
/inbox              — входящие сообщения (read-only)
```

---

## Natural Language — как работает NL Router

Бот понимает команды в свободной форме. Не нужно соблюдать точный синтаксис.

### Проекты (распознаются автоматически)

| Что написать | Проект |
|---|---|
| "Завод АТОМ", "атом", "ATOM", "заводу атом" | ATOM |
| "КЖБИ", "kgbi", "к жби", "краснодар жби" | KGBI |
| "ГСК", "gsk", "гбк", "gbk завод" | GSK |
| "EDERA", "едера", "эдера", "edera rest" | EDERA |

### Команды в свободной форме (примеры)

| Что написать | Команда |
|---|---|
| "Завод АТОМ: подготовить follow-up" | `/followup ATOM draft` |
| "АТОМ подготовить фоллоуап" | `/followup ATOM draft` |
| "подготовь follow-up по заводу атом" | `/followup ATOM draft` |
| "ГСК подготовить первое сообщение" | `/lead GSK first_message draft` |
| "КЖБИ статус" | `/status KGBI` |
| "EDERA что дальше" | `/status EDERA` |
| "отчёт по деньгам" | `/report money` |
| "обнови дашборд" | `/execute dashboard` |
| "покажи черновики ответов" | `/reply drafts` |
| "что одобрить" / "согласования" | `/approval show` |
| "что делать сейчас" | `/next` |
| "бот жив?" / "пинг" | `/ping` |

### Логика NL Router

**Формат с двоеточием:**
"Завод АТОМ: подготовить follow-up" → project_part="Завод АТОМ", intent_part="подготовить follow-up"

**Обратный порядок:**
"подготовь follow-up по заводу атом" → project через alias, intent через pattern matching

**Если проект не найден при intent requires_project:**
> "Понял действие, но не понял проект. Укажите проект: EDERA, КЖБИ, ГСК или Завод АТОМ."

**Если проект найден, но intent не распознан:**
> "Понял проект: Завод АТОМ. Уточните действие: статус, подготовить follow-up, отчёт, approval."

### Опасные команды

| Что написать | Результат |
|---|---|
| "отправь письмо клиенту" | ⛔ Needs Approval |
| "ответь клиенту" | ⛔ Needs Approval |
| "удали файл" | 🚫 BLOCKED |
| "пароль" / "токен" / "банк" | 🚫 BLOCKED |

---

## Голосовые сообщения

**Маршрут:**
```
Голосовое сообщение Telegram
  ↓
Сохранить .ogg → tools/telegram_gateway/voice/
  ↓ (если Whisper настроен)
transcribe_voice.mjs → transcript text
  ↓
normalizeNaturalCommand(text)
  ↓
Команда → run_command.mjs
  ↓
Ответ Дмитрию
```

**Если Whisper настроен:**
> "Голос распознан: [текст]
> Команда: /followup ATOM draft
> Обрабатываю..."

**Если Whisper не настроен:**
> "Голос получил и сохранил, но локальная транскрибация не настроена. Нужно установить Whisper CLI или указать VOICE_TRANSCRIPTION_COMMAND."

**Установка Whisper:** см. `tools/voice_transcription/WHISPER_LOCAL_SETUP.md`

**Healthcheck:**
```
node "D:\AI_WORKSPACE\tools\voice_transcription\voice_transcription_healthcheck.mjs"
```

---

## Файлы NL Router

- `tools/nl_router/project_aliases.json` — 4 проекта и их алиасы
- `tools/nl_router/intent_patterns.json` — 12 намерений + danger gate
- `tools/nl_router/nl_router_test_report.md` — отчёт тестов NL Router
- `tools/voice_transcription/voice_command_test_report.md` — отчёт voice тестов
- `tools/voice_transcription/WHISPER_LOCAL_SETUP.md` — инструкция Whisper
- `03_sop/telegram_voice_command_sop.md` — SOP голосовых команд

---

## Stability & Watchdog

- **Single-instance lock** — одновременно работает только один экземпляр бота
- **Heartbeat** — каждые 60 секунд обновляет `state/telegram_gateway_state.json`
- **is_processing auto-reset** — если зависло > 120 секунд — автосброс
- **Command timeout** — 60 секунд, потом fallback сообщение
- **Watchdog** — `watchdog_telegram_gateway.mjs` проверяет каждые 30 секунд, авторестарт при зависании

```
node "D:\AI_WORKSPACE\tools\telegram_gateway\watchdog_telegram_gateway.mjs"
```

---

## Безопасность

- Бот принимает команды **только от Дмитрия** (по ALLOWED_TELEGRAM_USER_IDS)
- **Не отправляет** сообщения клиентам
- **Не логирует** токен
- `/followup` и `/lead` создают только **draft** — ничего не отправляется автоматически
- Опасные команды (send, delete, bank) → BLOCKED или Needs Approval
- Голосовая транскрибация **только локальная** — облачные API не используются

---

## SOP

`03_sop/telegram_gateway_stability_sop.md` — стабильность и управление процессом  
`03_sop/telegram_voice_command_sop.md` — голосовые команды и NL Router  
`03_sop/telegram_master_controller_gateway_sop.md` — общий SOP gateway
