# ANDROID RC4 DEFECT FORENSIC

**Дата:** 2026-06-18
**Контекст:** физический smoke RC4 выявил дефекты. Цель — найти корни и устранить в RC2.

## Дефекты RC4 и их корни

### 1. QUEUE_CARDS_OPEN=NO (карточки не открываются)
**Корень:** `OwnerQueuesScreen` рендерил 7 `SectionCard` без `onClick`; маршрутов `queue/*` и
экранов-списков не существовало. → Карточки давали ripple, но не навигировали.
**Фикс:** см. QUEUE_NAVIGATION_FIX.md — добавлены routes, onClick, экраны.

### 2. COMMERCIAL_SUMMARY_SHOWS_ZERO=YES (а реально 3 opp / 3 offer)
**Двойной корень:**
- **Backend:** `commercialSummary()` считал только `READY_FOR_OWNER_REVIEW`, тогда как 3 реальных
  offer в `READY_FOR_SEND_REVIEW`. → API возвращал `offers_awaiting_owner=0`. (COMMERCIAL_SUMMARY_FIX.md)
- **Android:** DTO `CommercialSummary` использовал camelCase-имена полей (`openOpportunities`), а API
  отдаёт snake_case (`open_opportunities`). Без `@SerialName` поля молча → 0. Существующий тест
  использовал фиктивный camelCase-payload, поэтому «проходил», маскируя дефект.
**Фикс:** `@SerialName` snake_case на всех полях `CommercialSummary`/`FinanceSummaryDto` + новое поле
`offers_ready_for_send_review`; тесты переписаны на реальные snake_case payload.

### 3. AGENT_PROVIDER_AVAILABLE=NO при AGENT_RUNTIME=ON
**Корень:** `provider_available = Boolean(ANTHROPIC_API_KEY)`; ключ ABSENT. HTTP-клиента Claude в
кодовой базе нет (детерминированный shadow-путь авторитетен). → Это не баг рантайма, а отсутствие
секрета. (CLAUDE_PROVIDER_FORENSIC.md)
**Фикс UI:** экран агентов честно показывает «Провайдер доступен: нет»; добавлена локализация состояний.

### 4. PRODUCT_DESCRIPTIONS_PARTIALLY_ENGLISH=YES
**Корень:** прямые английские литералы в `OperationsScreens.kt` + отсутствие локализации offer-статусов.
**Фикс:** см. PRODUCT_LOCALIZATION.md.

## Подтверждение на источнике (production read-only)

- canonical: 3 offer `READY_FOR_SEND_REVIEW` (СтройДвор-Юг/ДКБИ/Завод Атом) + 1 test APPROVED.
- `/commercial/summary` (до фикса): `offers_awaiting_owner=0` ← дефект воспроизведён.
- `/offers`: возвращает 4 offer; `/owner-queues`: `ready_for_send_review=[3 id]`, `delivery_review=7`, `test_records=1`.

Все дефекты устранены и закрыты тестами; см. ANDROID_RC2_ACCEPTANCE.md.
