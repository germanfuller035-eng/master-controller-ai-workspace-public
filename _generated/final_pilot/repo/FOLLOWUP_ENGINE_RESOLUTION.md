# Repository Integrity — followup_engine.mjs

**Дата:** 2026-06-19. Решение: **ВАРИАНТ A — актуальный runtime-компонент, не был закоммичен.**

## Findings
- Файл `tools/telegram_gateway/followup_engine.mjs` (15024 байт, 79d5066…) был untracked в основном репозитории.
- Импортируется `reply_monitor.mjs` (tracked), который грузится production API через `replies/service.mjs` (`await import(reply_monitor.mjs)` → `import {markOptedOut, FOLLOWUP_STATE_FILE} from followup_engine.mjs`).
- Развёрнут на production (идентичный хэш 79d5066 на prod и в main). Это живой компонент.
- Send capability: 0 (явный контракт «NEVER sends email and NEVER calls Telegram/SMTP/network»; grep по createTransport/nodemailer/sendMail/smtp = 0). Secrets: 0.

## Действие
- Файл внесён в source control в worktree (точная копия prod/main, 79d5066).
- Dangling import устранён: `reply_ingest_offline_test` теперь проходит (был ERR_MODULE_NOT_FOUND).
- Manifest не требует изменений на prod: файл уже там идентичен (деплоя не требуется).

## Acceptance
```
UNTRACKED_RUNTIME_FILES (after) = 0
DANGLING_IMPORTS = 0
FOLLOWUP_IMPLEMENTATIONS_ACTIVE = 1
FOLLOWUP_SEND_CAPABILITY = OFF
FOLLOWUP_E2E = PASS (reply_correlation 10/0, reply_ingest 7/0, pipeline_followup_reply 20/0)
```
