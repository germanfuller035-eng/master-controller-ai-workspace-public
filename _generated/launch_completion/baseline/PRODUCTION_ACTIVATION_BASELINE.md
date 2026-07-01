# Production Activation — Baseline (forensic)

**Дата:** 2026-06-19 · ветка `feature/production-activation-completion-v1` · base HEAD `c692e9e`.

## Production baseline (до волны)
- Canonical store: rev **106**, **62** лида, sha `04c0160d`. Writer count=1.
- Send ledger: 7 строк, sha `04fda652`, commercial sends=0, test/internal=7.
- Queue: 41 COMPLETED, 0 failed, 0 dead letters.
- Сервисы active: api, telegram, worker. discovery — был failed (исправлен, см. inventory).
- Гейты: autosend BLOCKED, sendAllowedLive OFF, commercial_send OFF, followup_autosend OFF. payment=0.
- First Touch API: 4 GET-роута (read-only), command API отсутствует, 0 пакетов/teaser.

## Изменения baseline в ходе forensic (честно зафиксировано)
- При подтверждении root cause создан 1 HEALTH_CHECK probe-job → worker его COMPLETED. Queue: 41→**42** COMPLETED. Canonical/ledger не затронуты (HEALTH_CHECK — no-op).
- Discovery validation run (bounded FREE_ONLY, OSM Overpass): промоутировано **7** новых лидов (car_repair). Canonical: rev 106→**120**, leads 62→**69**. Исходные 62 сохранены полностью (LOST=0). Новые — со статусом `manual_review_product_routing`, dedupe-ключи есть, guessed email нет, платных вызовов 0, AI-вызовов в raw discovery 0.

## Android baseline
0.6.0-rc9 (versionCode 21), signer `11038fca…1023f7`.
