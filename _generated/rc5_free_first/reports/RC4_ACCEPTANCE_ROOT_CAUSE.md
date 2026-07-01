# RC4 ACCEPTANCE ROOT CAUSE + FIX
| Дефект | Root cause | Fix | Live verify |
|---|---|---|---|
| A loc PARTIAL | presentation не покрывал scope/criteria | product_presentation.mjs (*_ru) + offer criteria_ru | /products/mini_audit/presentation RU |
| B next_step нет | не сохранялся в preview | offer_preview next_step+source+created_at+fallback | preview next_step present |
| C usage 2643 vs 196554 | 3×881=failed estimated; 196554=pre-ledger | reconciliation: since/pre/total, raw UNKNOWN | /ai/usage/reconciliation total=199197 |
| D radar недоказателен | нет evidence contract/urgent gate | grounded contract + security/legal gates + fixture TEST_ONLY | grounded→URGENT, ungrounded→NEEDS_VERIFICATION, fixtures 0 urgent |
| E telemetry «нет данных» | нет нормализ. состояний | sourceTelemetry HEALTHY/IDLE/DISABLED/CREDENTIAL_REQUIRED + reason + cost_class | osm IDLE/FREE, 2gis CREDENTIAL_REQUIRED/PAID |
| F нет управления | нет owner settings | owner_settings + Android раздел | /owner/settings FREE_ONLY |
