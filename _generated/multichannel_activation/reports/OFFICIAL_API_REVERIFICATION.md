# OFFICIAL API RE-VERIFICATION GATE

**Дата:** 2026-06-18
**Правило:** до live-активации VK/MAX необходима свежая проверка официальной документации. Нельзя активировать на основе памяти модели или непроверенных примеров.

## Результат проверки доступа к документации

| Источник | Попытка | Результат |
|---|---|---|
| `dev.vk.com` (VK Callback API) | WebFetch | НЕДОСТУПНО — среда не может получить страницу |
| VK docs через поиск | WebSearch | контент не возвращён |
| MAX official docs | research-док | `OFFICIAL_DOCS_VERIFIED=NO` (среда не смогла получить) |

## Итог по каждому каналу

### VK
```
OFFICIAL_DOMAIN=dev.vk.com (не доступен из среды)
DOCS_ACCESSED_AT=НЕ ПОЛУЧЕНО
AUTH_MODEL=owner-verify-required (не подтверждено в этой сессии)
WEBHOOK_SIGNATURE=owner-verify-required
TOKEN_SCOPE=owner-verify-required
RATE_LIMIT=owner-verify-required
MODERATION_REQUIRED=owner-verify-required
OUTBOUND_RESTRICTIONS=OUTBOUND вне scope этой волны (остаётся OFF)
IMPLEMENTATION_MATCH=не верифицировано
LIVE_ACTIVATION=BLOCKED
VK_ADAPTER=DEPLOYED_DISABLED
```

### MAX
```
OFFICIAL_DOCS_VERIFIED=NO
LIVE_ACTIVATION=BLOCKED
MAX_ADAPTER=DEPLOYED_DISABLED
```

## Двойная блокировка

Live-активация VK и MAX заблокирована **двумя независимыми причинами**:
1. **Credentials ABSENT** (нет токенов/секретов — см. CREDENTIAL_INVENTORY.md).
2. **Официальная документация недоступна** из текущей среды для свежей верификации.

Любой из этих факторов сам по себе достаточен, чтобы оставить адаптеры в `DEPLOYED_DISABLED`. Это соответствует hard-stop правилу «при невозможности проверить официальный API перед live-активацией».

## Owner action required

Для будущей активации владельцу необходимо:
1. Предоставить валидные credentials (VK community token + confirmation/secret; MAX bot token + webhook secret).
2. Подтвердить актуальные параметры официального API (auth model, webhook signature, rate limit, moderation) — в среде с доступом к `dev.vk.com` и docs MAX.

Outbound по обоим каналам остаётся `OFF` независимо от активации inbound.
