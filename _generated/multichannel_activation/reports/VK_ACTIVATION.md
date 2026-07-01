# VK ACTIVATION

**Дата:** 2026-06-18
**Статус:** `DEPLOYED_DISABLED_PENDING_CREDENTIAL`

## Условия активации (фаза 9) — не выполнены

| Условие | Статус |
|---|---|
| Официальная документация верифицирована | НЕТ (dev.vk.com недоступен из среды — см. OFFICIAL_API_REVERIFICATION.md) |
| Credential valid (VK_TOKEN/COMMUNITY_ID/CONFIRMATION_SECRET) | ABSENT (см. CREDENTIAL_INVENTORY.md) |
| Webhook secret настроен | ABSENT |

## Что развёрнуто и проверено (без активации)

- `POST /webhooks/vk` — feature-gated, при `VK_INBOUND=false` возвращает **HTTP 403 FEATURE_DISABLED** (проверено live).
- `verifyWebhook` реализует проверку подписи, timestamp, replay-protection (event_id dedupe), quarantine unknown — никогда не диспатчит.
- Источники `vk_communities`, `vk_lead_forms`, `vk_inbound` → `PENDING_CREDENTIAL` в `/sources/health`.

## Режимы (целевые, не активированы)

```
VK_DISCOVERY=OFF (PENDING_CREDENTIAL)
VK_INBOUND=OFF (PENDING_CREDENTIAL)
VK_LEAD_FORMS=OFF (PENDING_CREDENTIAL)
VK_OUTBOUND=OFF (вне scope волны, всегда выключен)
```

## Owner action required
Предоставить валидный VK community token + confirmation/secret и подтвердить параметры официального API в среде с доступом к dev.vk.com. До этого адаптер остаётся DEPLOYED_DISABLED.
