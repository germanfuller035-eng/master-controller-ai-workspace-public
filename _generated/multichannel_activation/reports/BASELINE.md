# BASELINE — Multichannel Activation & Acceptance Wave

**Захват:** 2026-06-18T19:10Z
**Метод:** read-only forensic production VPS `195.96.132.82` + чтение canonical store + вызовы API `/api/v1`
**Изменения в production:** не вносились (только чтение)

## Интегральные ворота (HARD STOP)

| Проверка | Ожидание | Факт | Статус |
|---|---|---|---|
| Historical sends | =7 | 7 (все SENT, 7 уникальных лидов) | PASS |
| Canonical writer count | =1 | 1 (`master-controller.env`) | PASS |
| Queue failed | =0 | 0 | PASS |
| Dead letters | =0 | 0 | PASS |
| Canonical integrity | OK | OK | PASS |
| Unexpected outbound | нет | нет | PASS |
| Payment facts created | нет | нет | PASS |

**HARD_STOP_TRIGGERED = NO** — можно продолжать безопасные фазы.

## Production состояние

- `PRODUCTION_REVISION` = **106** (store_revision)
- `CANONICAL_LEADS` = **62**
- Queue revision = 146, всего job = 41, все `COMPLETED`
- Send ledger (authoritative `outbound_send_ledger.jsonl`) = **7 строк**, статус `SENT`, 7 уникальных лидов:
  - email-ledger (`outbound_email_ledger.jsonl`) = 63 строки — это лог попыток/uncertain, НЕ авторитетный счётчик отправок.

## Коммерческий блок (ключевой дефект)

Canonical содержит **4 offer** и **4 opportunity**:

| Offer | Лид | Статус | send_capability |
|---|---|---|---|
| offer_dbbbf391d547 | STROYDVOR-UG_RU | READY_FOR_SEND_REVIEW | NONE |
| offer_ec64d56d08b4 | DKBI_RU | READY_FOR_SEND_REVIEW | NONE |
| offer_f1e0c4948965 | ZAVODATOM_RU | READY_FOR_SEND_REVIEW | NONE |
| offer_47a06f465083 | TEST_ONLY_GATE_C1A_ACCEPTANCE | APPROVED | NONE |

**ДЕФЕКТ ПОДТВЕРЖДЁН НА ИСТОЧНИКЕ:** API `/commercial/summary` возвращает
`open_opportunities=3`, `offers_awaiting_owner=0`,
хотя в canonical 3 реальных (не-test) offer в статусе `READY_FOR_SEND_REVIEW`.
То есть «коммерческая сводка показывает 0 готовых к проверке» — это серверный mapping-баг,
а не только Android-проблема. Требует исправления в API summary + Android UI.

## Агенты

- runtime = **ON**, mode = **SHADOW_NO_SEND**
- `provider_available` = **false** ← подтверждает дефект RC4 «AGENT_PROVIDER_AVAILABLE=NO»
- capabilities: canonical_direct_write=false, send=false, payment=false, deploy=false
- safety: agent_secret_exposure=0, direct_agent_writers=0, direct_smtp_paths=0
- профили: CHIEF_ORCHESTRATOR, LEAD_INTELLIGENCE, MINI_AUDIT, OFFER, QA_SAFETY (все SHADOW)

## Источники (sources/health)

ACTIVE: `osm_overpass`, `web_intake`
PENDING_CREDENTIAL: `vk_communities`, `vk_lead_forms`, `vk_inbound`, `two_gis`, `dataforseo`, `max_inbound`
DISABLED: `yandex_business`

## Каналы (channels/health)

| Канал | inbound | outbound |
|---|---|---|
| EMAIL | ON | GATED |
| WEB_FORM | ON | OFF |
| VK / MAX / TELEGRAM / WHATSAPP / SMS / PHONE / AVITO | PENDING_CREDENTIAL | OFF |

## Production флаги (все безопасны)

`MATER_NO_SEND=true`, `EMAIL_REAL_SEND_ENABLED=false`, `COMMERCIAL_SEND=false`,
`FOLLOWUP_AUTOSEND=false`, `AGENT_MODE=SHADOW_NO_SEND`, `AGENT_SEND=false`,
`AGENT_PAYMENT=false`, `VK_INBOUND=false`, `MAX_INBOUND=false`, `CLIENT_TELEGRAM_INBOUND=false`.

## Инфраструктура

- VPS: `195.96.132.82` (debian12), uptime ~1d20h
- API: `node src/server/index.mjs` на `127.0.0.1:8787`, base `/api/v1`, за Caddy → `195-96-132-82.sslip.io`
- Сервисы: `caddy`, `master-controller-api`, `master-controller-telegram`, `master-controller-worker`
- **ADB: НЕДОСТУПЕН** → физическая установка Android = PENDING (не блокирует прочие фазы)

## Вывод

Baseline целостен, все hard-gate пройдены. Подтверждены дефекты RC4 на стороне backend:
(1) commercial summary mapping `offers_awaiting_owner=0`; (2) `provider_available=false`.
Продолжаю фазы: Android defect closure, Claude provider forensic, official API gate, credential inventory.
