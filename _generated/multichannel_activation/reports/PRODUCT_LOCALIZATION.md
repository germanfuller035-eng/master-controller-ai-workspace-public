# PRODUCT & OWNER UI LOCALIZATION (Android 0.6.0-rc2)

**Дата:** 2026-06-18
**Дефект RC4:** `PRODUCT_DESCRIPTIONS_PARTIALLY_ENGLISH=YES` — частично английский owner-facing текст.

## Подход

Презентационный слой `core/ui/OwnerLocalization.kt` (object) переводит сырые backend-коды в русский
текст на этапе рендеринга. Canonical-данные (английские source-of-truth поля) НЕ меняются.

## Добавлено

Новые render-функции в `OwnerLocalization`:

| Функция | Назначение |
|---|---|
| `renderOfferStatusRu` | READY_FOR_SEND_REVIEW → «Ожидает проверки отправки» и т.д. |
| `renderOfferDecisionRu` | APPROVE / REQUEST_CHANGES / REJECT → русские формулировки |
| `renderSendCapabilityRu` | NONE → «Отправка недоступна» |
| `renderConfidenceRu` | SYSTEM_OBSERVED → «подтверждено системой» |
| `companyFromLeadId` | STROYDVOR-UG_RU → «СтройДвор-Юг», DKBI_RU → «ДКБИ», ZAVODATOM_RU → «Завод Атом» |
| `renderOfferActionTitleRu` / `renderOfferActionBodyRu` | тексты диалогов действий (с явным «не отправляет») |
| `normStatus` | публичная нормализация enum для фильтрации |

## Исправлен прямой английский

`feature/operations/OperationsScreens.kt`:
- `"1 runtime (keyless)"` → `«1 рантайм (без ключа)»`
- `"Manual CSV"` → `«Ручной CSV»`
- `"Overpass runtime"` → `«Рантайм Overpass»`

## Контроль

`OwnerUiRawCodeSafetyTest` (статический скан достижимых экранов) расширен на новые экраны
(`AgentsScreens`, `QueueDetailScreen`, `OfferReviewScreens`, `CommercialSummaryScreen`). Тест
гарантирует, что ни один сырой код (SCREAMING_SNAKE / snake_case) не попадает в видимые строки.
Действия offer вынесены в enum `OfferReviewAction` с `code = name`, чтобы не было строковых
литералов сырых кодов.

## Проверка

- `renderOfferStatusRu` для всех статусов не возвращает сырой код и не содержит `_` (тест `offerStatusLocalizedNeverRaw`).
- 117 unit-тестов passed.
- Canonical английские данные (scope_snapshot, acceptance) сохранены как source truth; перевод только presentation-слой.
