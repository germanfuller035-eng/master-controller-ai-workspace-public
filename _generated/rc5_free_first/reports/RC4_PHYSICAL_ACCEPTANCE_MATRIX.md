# RC4 PHYSICAL ACCEPTANCE MATRIX

## Прошло (физически)
RC4_INSTALL, PAIRING, API, COMMERCIAL_SUMMARY, OFFER_PREVIEW, FALSE_AWAITING_REPLY (FIXED),
AGENT_SCREEN, AI_USAGE_SCREEN, KNOWLEDGE_RADAR_UI, SOURCE_REGISTRY, OFFLINE_CACHE, NO_SEND.

## Не закрыто (цель RC5)
| # | Дефект | Root cause | Fix |
|---|---|---|---|
| A | offer/product локализация PARTIAL (англ. поля) | presentation layer не покрывает scope/exclusions/criteria | единый presentation layer product_*_ru + offer criteria_ru + regression test |
| B | preview next_step «нет данных» | next_step не сохраняется в draft/artifact | authoritative next_step + source + backfill 3 offers |
| C | AI usage противоречив (2643 vs 196554) | 3×881=failed estimated calls; 196554=pre-ledger confirmed | reconciliation read model с periods + provenance (см. AI_USAGE_FORENSIC) |
| D | Radar недоказателен (нет CVE id/severity/versions/law id/effective date) | нет evidence contract + urgent gate | grounded evidence contract + security/legal urgent gates + fixture marking |
| E | source telemetry «нет данных» | нет нормализованных состояний | HEALTHY/IDLE/DISABLED/CREDENTIAL_REQUIRED/... + disabled_reason |
| F | владелец не управляет интенсивностью | нет owner automation settings | backend settings + Android «Лимиты и автоматизация» |
