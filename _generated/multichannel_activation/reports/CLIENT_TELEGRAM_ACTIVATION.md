# CLIENT TELEGRAM ACTIVATION

**Дата:** 2026-06-18
**Статус:** `DEPLOYED_DISABLED_PENDING_TOKEN`

## Разделение с owner-ботом
Клиентский Telegram — ОТДЕЛЬНАЯ service identity, отдельный токен, API-only, inbound-режим. Существующий owner Telegram poller (`master-controller-telegram.service`) НЕ затрагивается.

## Условия (фаза 11) — не выполнены
| Условие | Статус |
|---|---|
| Separate token (CLIENT_TELEGRAM_TOKEN) | ABSENT |
| Webhook secret (CLIENT_TELEGRAM_SECRET) | ABSENT |

## Проверено
- `POST /webhooks/telegram-client` — при `CLIENT_TELEGRAM_INBOUND=false` возвращает **HTTP 403 FEATURE_DISABLED** (live).
- Owner Telegram bot работает независимо, не нарушен.

## Режимы
```
CLIENT_TELEGRAM_INBOUND=OFF (PENDING_TOKEN)
CLIENT_TELEGRAM_OUTBOUND=OFF
```
