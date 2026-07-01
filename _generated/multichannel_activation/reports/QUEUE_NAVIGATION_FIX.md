# QUEUE NAVIGATION FIX (Android 0.6.0-rc2)

**Дата:** 2026-06-18
**Дефект RC4:** все 7 карточек очередей показывали счётчики, но не открывались (`QUEUE_CARDS_OPEN=NO`).

## Корень причины

`feature/agents/AgentsScreens.kt :: OwnerQueuesScreen` — 7 карточек `SectionCard(...)`
вызывались **без `onClick`**. `SectionCard` имеет `onClick: (() -> Unit)? = null`, при null →
пустой no-op. Маршрутов `queue/*` не существовало, экранов-списков не было.

## Исправление

### Маршруты (зарегистрированы в `MaterControllerRoot.kt`)

| Карточка | route | Экран |
|---|---|---|
| Ожидают отправки (проверка) | `queue/send-review` | `OfferReviewListScreen` → реальные offer |
| Ожидают ответа | `queue/awaiting-reply` | `QueueDetailScreen` |
| Ответы получены | `queue/replies` | `QueueDetailScreen` (+ список из conversations) |
| Повторный контакт к рассмотрению | `queue/followup-review` | `QueueDetailScreen` |
| Требуют сверки доставки | `queue/delivery-reconciliation` | `QueueDetailScreen` (+ список из deliveryContainment) |
| Агентские результаты на проверку | `queue/agent-review` | `QueueDetailScreen` |
| Тестовые записи | `queue/test-records` | `QueueDetailScreen` |
| Предложение (детально) | `offer/{offerId}` | `OfferDetailScreen` |

> `queue/send-review` зарегистрирован как точный маршрут ПЕРЕД параметрическим `queue/{queueKey}` —
> Navigation Compose отдаёт приоритет точному совпадению, поэтому send-review открывает список
> предложений, а не общий экран.

### onClick

Каждая из 7 карточек получила рабочий `onClick`:
- `q_ready` → `onOpenSendReview` → `queue/send-review`
- остальные → `onOpenQueue("<key>")` → `queue/<key>`

### Состояния экранов

`QueueDetailScreen` и `OfferReviewListScreen` поддерживают loading / error / empty / content,
offline-баннер (Room KV-кеш `readCached`), back navigation, refresh.

### Новые файлы

- `feature/agents/QueueDetailViewModel.kt` — enum `QueueKind` (route↔title↔explanation), VM с обогащением списков из существующих read-models.
- `feature/agents/QueueDetailScreen.kt` — универсальный экран очереди.
- `feature/commercial/OfferReviewViewModel.kt` + `OfferReviewScreens.kt` — список и деталь предложения.

## Проверка

- `:app:compileDebugKotlin` — BUILD SUCCESSFUL.
- `:app:testDebugUnitTest` — 117 tests, 0 failed.
- `OwnerUiRawCodeSafetyTest` расширен на новые экраны — сырые коды не утекают.
- Навигация ведёт на реальные данные (offer review показывает 3 предложения из `/offers`).

## Без отправки

Ни одна карточка/экран не имеет активного outbound-действия. Действия offer — только текстовые.
