# FREE_ONLY Discovery — Validation Run

**Дата:** 2026-06-19 · production. Owner: `master-controller-discovery.service` (единственный).

## Конфигурация (по unit + env)
```
SOURCE_STRATEGY=FREE_ONLY (только OSM/Overpass; платных адаптеров не импортируется)
DAILY_CANDIDATE_LIMIT=20 · MAX_PENDING_STAGING=50 (backpressure)
region=Krasnodar bbox=44.95,38.85,45.15,39.10 · niches rotated by day
PAID_SOURCE_CALLS=0 · RAW_DISCOVERY_AI_CALLS=0
```

## Validation run (один bounded прогон)
- Enqueue 1 LEAD_DISCOVERY (idempotent per day) → worker (OverpassAdapter) → promotion через API.
- Промоутировано **7** новых лидов (niche car_repair), все `osm_overpass`, со статусом `manual_review_product_routing`.
- Все 7 имеют dedupe_key, guessed email = 0 (контакт CONTACT_PENDING), platных вызовов 0.
- Canonical: rev 106→120, leads 62→69. **LOST оригинальных = 0.** Промоушены ≤ лимита.

## Новые лиды
cand_17dfd512d3f1 (СТО), cand_f1254b4d593a (Шиномонтаж), cand_020d0a383429 (СТО "Японец"),
cand_88242d4f19d2 (Доктор Выхлоп), cand_2ce95d41e8cf (Замена масла), cand_8341376395d8 (H&K сервис),
cand_a2564c24d00f (Автоэлектрик).

## Инварианты
```
ACTIVE_DISCOVERY_SCHEDULER_OWNERS=1 · DUPLICATE_RUNS=0 · DIRECT_WRITERS=0 · PROMOTION_PATH=API_ONLY
queue failed=0 · dead letters=0 · send ledger unchanged · commercial sends=0 · SMTP=0
```
