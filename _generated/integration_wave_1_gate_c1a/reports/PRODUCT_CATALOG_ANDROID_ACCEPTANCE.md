# Product Catalog — Android Acceptance (Gate C1-A)

date: 2026-06-18 · verified on production.

## Backend contract
`GET /api/v1/products` → standardized list DTO (product_id, name, status, price, price_display,
currency, short_description, readiness, version, category) + total + counts + count_definitions.
`GET /api/v1/products/:id` → detail DTO (scope_included, scope_excluded, inputs_required, deliverables,
acceptance_criteria, claims, description, readiness, version). Maps existing Product OS snapshot fields;
no Android-side product data, no new truth, unknown price never coerced to 0.

```
PRODUCTS_TOTAL=18  ACTIVE=2  DRAFT=7  PLANNED=9
ACTIVE: express_review (free) · mini_audit (10 000 ₽)
MINI_AUDIT: status ACTIVE, price 10000 RUB, scope_included 8, scope_excluded 9, inputs 3, acceptance 6
HTTP_500_COUNT=0
```

## Android
- `feature/catalog/CatalogListScreen.kt`: 18 cards, search, ACTIVE/DRAFT/PLANNED filter chips,
  ACTIVE-first sort, counts header, offline cache (read-through), refresh, loading/error/empty states.
- `feature/catalog/ProductDetailScreen.kt`: status chip, price, version, scope/exclusions/inputs/
  result/acceptance/claims, "Только просмотр. Клиенту ничего не отправляется."
- Navigation: Коммерческая сводка → Каталог продуктов → карточка продукта.
- `OwnerLocalization.renderProductPriceRu`: null → "цена не определена", free → "бесплатно", grouped
  thousands + ₽. Never "0 ₽" for unknown.
- Cache: reuses the generic `domain_cache` Room table (v2) via read-through; no schema migration needed,
  pairing/profile preserved.

## Tests
`GateC1aMappingTest` (9): catalog parses 18 with 2/7/9; Mini Audit 10000 renders with ₽; unknown price
"цена не определена" (no 0); free → "бесплатно"; product status RU; detail scope fields; lead-count
62/52/10; send recon authoritative=7/unauthorized=0; catalog filter+sort. All Android unit tests: 100 passed.

```
PRODUCT_CATALOG_UI = PASS
MINI_AUDIT_PRICE_UI = 10 000 ₽ (ACTIVE)
UNKNOWN_PRICE_NOT_ZERO = YES
```
