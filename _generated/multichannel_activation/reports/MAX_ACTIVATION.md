# MAX ACTIVATION

**Дата:** 2026-06-18
**Статус:** `DEPLOYED_DISABLED_PENDING_TOKEN`

## Условия активации (фаза 10) — не выполнены

| Условие | Статус |
|---|---|
| Официальная документация верифицирована | НЕТ (OFFICIAL_DOCS_VERIFIED=NO) |
| Bot approved / token valid (MAX_TOKEN) | ABSENT |
| Webhook secret valid (MAX_WEBHOOK_SECRET) | ABSENT |

## Что развёрнуто и проверено

- `POST /webhooks/max` — при `MAX_INBOUND=false` возвращает **HTTP 403 FEATURE_DISABLED** (проверено live).
- `max_inbound` источник → `PENDING_CREDENTIAL`.

## MAX Mini App
`IMPLEMENTED_TESTED_NOT_PUBLISHED` — каталог 18, Mini Audit 10 000 ₽, submission form, init-data signature проверка. Публикация требует модерации (не выполнялась).

## Режимы
```
MAX_INBOUND=OFF (PENDING_TOKEN)
MAX_REPLY_DRAFTS=OFF (PENDING_TOKEN)
MAX_MINI_APP=IMPLEMENTED_TESTED_NOT_PUBLISHED
MAX_OUTBOUND=OFF
```

## Owner action required
Предоставить MAX bot token + webhook secret, провести модерацию бота и Mini App, подтвердить официальный API.
