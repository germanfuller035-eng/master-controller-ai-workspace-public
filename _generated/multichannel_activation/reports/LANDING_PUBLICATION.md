# LANDING PUBLICATION

**Дата:** 2026-06-18
**Статус:** `BUILT_NOT_PUBLISHED`

## Причина
`PUBLIC_DOMAIN` / `LANDING_DOMAIN_APPROVED` = ABSENT (см. CREDENTIAL_INVENTORY.md). Утверждённого
домена нет; используется только технический `195-96-132-82.sslip.io` (Caddy + TLS).

По правилу фазы 14: при отсутствии утверждённого домена landing не публикуется, остальные блоки не
блокируются. Web intake уже доступен на sslip.io и проверен (WEB_INTAKE_ACCEPTANCE.md).

## Owner action required
Утвердить публичный домен; после этого — деплой landing (product data из API, Mini Audit 10 000 ₽,
privacy notice, consent, UTM, secure intake, без внешних трекеров без отдельного approval).
