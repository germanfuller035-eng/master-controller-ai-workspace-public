# Official API Research — fetch limitation notice

date_checked: 2026-06-18
ENVIRONMENT_FETCH: dev.vk.com BLOCKED (host not fetchable); dev.max.ru TLS certificate error.

Because official VK and MAX documentation could not be retrieved from this build environment, and the
prompt forbids using model memory as the source of truth for current external APIs, every external
channel that depends on VK/MAX/Telegram-client/WhatsApp is implemented as a provider-interface adapter
in DEPLOYED_DISABLED state. The owner credential/moderation packages list the exact official steps the
owner must verify against the live docs before any activation.

| platform | docs verified here | decision |
|---|---|---|
| OSM / Overpass | already in use (existing) | ACTIVE (existing) |
| VK discovery | NO (blocked) | adapter implemented, DISABLED_PENDING_CREDENTIAL; owner verifies scopes |
| VK inbound / lead forms | NO (blocked) | webhook contract implemented, DISABLED_PENDING_CREDENTIAL |
| MAX bot / mini app | NO (TLS error) | adapter + scaffold implemented, DISABLED_PENDING_TOKEN/MODERATION |
| Telegram client inbound | known bot model (separate token) | adapter implemented, DISABLED_PENDING_TOKEN |
| Yandex Business | NO | provider interface, DISABLED |
| 2GIS | existing scaffold | source-registry integrated, DISABLED_PENDING_CREDENTIAL |
| DataForSEO | existing scaffold | source-registry integrated, DISABLED_PENDING_CREDENTIAL |
| Avito | NO | provider interface only, DISABLED (official API required) |
| WhatsApp/SMS | NO | interface only, DISABLED |

No unofficial automation, browser-login scraping, or restriction bypass is implemented for any platform.
