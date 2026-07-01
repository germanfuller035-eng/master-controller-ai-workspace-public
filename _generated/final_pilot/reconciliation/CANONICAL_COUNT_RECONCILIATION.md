# Canonical Lead Count Reconciliation

**Дата:** 2026-06-19 · production rev 125.

## Инварианты
```
CANONICAL_LEADS_BEFORE_DISCOVERY=62
NEW_LEADS_PROMOTED=7
CANONICAL_LEADS_CURRENT=69
ALL_ORIGINAL_62_PRESENT=YES (LOST=0)
DELETED_LEADS=0 · DUPLICATE_CANONICAL_LEADS=0
PRIMARY_STAGE_SUM=69 = CANONICAL_LEADS_CURRENT · UNIQUE_IDS=69
```

## 7 новых лидов (все корректны, promotion не ошибочен)
Все из OSM Overpass (бесплатный источник), регион Krasnodar, niche car_repair, статус `manual_review_product_routing`, dedupe-ключ есть, контакт отсутствует (MISSING_CONTACT — корректно, они на стадии product routing). Ни один не имеет guessed email, ни один не продвинут к first-touch без evidence.

| lead_id | company | source | status |
|---|---|---|---|
| cand_17dfd512d3f1 | СТО | osm_overpass | manual_review_product_routing |
| cand_f1254b4d593a | Шиномонтаж | osm_overpass | manual_review_product_routing |
| cand_020d0a383429 | СТО "Японец" | osm_overpass | manual_review_product_routing |
| cand_88242d4f19d2 | Доктор Выхлоп | osm_overpass | manual_review_product_routing |
| cand_2ce95d41e8cf | Замена масла | osm_overpass | manual_review_product_routing |
| cand_8341376395d8 | H&K сервис | osm_overpass | manual_review_product_routing |
| cand_a2564c24d00f | Автоэлектрик | osm_overpass | manual_review_product_routing |

Промоушены корректны — reversible-коррекции не требуются.
