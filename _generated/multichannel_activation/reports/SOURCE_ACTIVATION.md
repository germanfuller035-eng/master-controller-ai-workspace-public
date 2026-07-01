# SOURCE ACTIVATION (2GIS / DataForSEO / прочие)

**Дата:** 2026-06-18

## Статус по источникам (`/sources/health`, live)

| Источник | Статус | Примечание |
|---|---|---|
| osm_overpass | ACTIVE | бесключевой, работает |
| web_intake | ACTIVE | приём заявок (см. WEB_INTAKE_ACCEPTANCE.md) |
| referral | ACTIVE | реферальный приём |
| vk_communities / vk_lead_forms / vk_inbound | PENDING_CREDENTIAL | нет токена |
| two_gis | PENDING_CREDENTIAL | TWO_GIS_KEY ABSENT |
| dataforseo | PENDING_CREDENTIAL | DATAFORSEO_LOGIN/PASSWORD ABSENT |
| max_inbound | PENDING_CREDENTIAL | нет токена |
| yandex_business | DISABLED | вне scope |

## 2GIS / DataForSEO (фаза 12)
Credentials ABSENT → bounded dry run не выполнялся (нечем аутентифицироваться). Адаптеры остаются
`DEPLOYED_DISABLED_PENDING_CREDENTIAL`. Лимиты первого live-цикла зафиксированы в коде/политике
(MAX_REQUESTS_PER_SOURCE=5, MAX_CANDIDATES=20, MAX_PROMOTIONS=5) и применятся при активации.

## Owner action required
Предоставить TWO_GIS_KEY и DATAFORSEO_LOGIN/PASSWORD для bounded dry run с проверкой scope, dedupe и guessed_email=0.
