# CREDENTIAL INVENTORY

**Дата:** 2026-06-18
**Метод:** проверка только разрешённых защищённых locations (`D:\AI_SECRETS`, VPS `/etc/master-controller/*.env`, systemd EnvironmentFile). Значения секретов не раскрывались и не сохранялись.
**Правило отчёта:** только статусы `PRESENT | ABSENT | INVALID | SCOPE_INSUFFICIENT | PENDING_MODERATION`.

## Provider (Claude / Anthropic)

| Ключ | Статус | Примечание |
|---|---|---|
| `ANTHROPIC_API_KEY` | **ABSENT** | Нет ни локально (`D:\AI_SECRETS`), ни в VPS env агентского рантайма. Backend резолвит provider по `Boolean(process.env.ANTHROPIC_API_KEY)` — сейчас даёт `false`. |

> Примечание по безопасности: в каталоге карантина `D:\AI_SECRETS\99_archive\chatgpt_export_secrets_2026-05-28\` находятся скомпрометированные секреты из ChatGPT-экспорта (124 находки: seed phrases, telegram bot tokens, vless links). Рабочего Anthropic-ключа там нет; даже если бы был — README прямо запрещает использование и требует ротации. Этот контур НЕ используется как источник provider-секрета.

## Каналы

| Ключ | Статус |
|---|---|
| `VK_TOKEN` | **ABSENT** |
| `VK_COMMUNITY_ID` | **ABSENT** |
| `VK_CONFIRMATION_SECRET` | **ABSENT** |
| `MAX_TOKEN` | **ABSENT** |
| `MAX_WEBHOOK_SECRET` | **ABSENT** |
| `CLIENT_TELEGRAM_TOKEN` | **ABSENT** |

## Источники

| Ключ | Статус |
|---|---|
| `TWO_GIS_KEY` | **ABSENT** |
| `DATAFORSEO_LOGIN` | **ABSENT** |
| `DATAFORSEO_PASSWORD` | **ABSENT** |

## Web / Landing

| Ключ | Статус |
|---|---|
| `PUBLIC_DOMAIN` | **ABSENT** (используется только `195-96-132-82.sslip.io` через Caddy) |
| `LANDING_DOMAIN_APPROVED` | **ABSENT** |

## Присутствующие (инфраструктурные, не относятся к активации каналов)

- `MATER_API_SECRET` (локально) / `MATER_WORKER_TOKEN`, `MATER_TELEGRAM_TOKEN_API` (VPS) — PRESENT, рабочие, для внутренней auth API/worker/owner-telegram.
- `YANDEX_MAIL_*` — PRESENT (email-канал, readonly inbound; outbound остаётся GATED/OFF).
- `ROOT_PASSWORD` (VPS) — PRESENT.

## Вывод

Все credential, необходимые для **live-активации внешних каналов и Claude provider**, — **ABSENT**.
Следовательно (по правилам мега-промпта):

- `CLAUDE_PROVIDER` → `DEPLOYED_PENDING_SECRET`
- VK / MAX / CLIENT_TELEGRAM → остаются `DEPLOYED_DISABLED_PENDING_CREDENTIAL`
- 2GIS / DataForSEO → остаются `DEPLOYED_DISABLED_PENDING_CREDENTIAL`
- LANDING → `BUILT_NOT_PUBLISHED` (нет утверждённого домена)

Все независимые задачи (Android defect closure, RC2 build, web intake acceptance на sslip.io, source health, документация) выполняются в полном объёме. Активация внешних контуров заблокирована **только** отсутствием owner-предоставленных секретов.
