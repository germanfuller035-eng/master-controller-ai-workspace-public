# COMMERCIAL SUMMARY FIX

**Дата:** 2026-06-18
**Дефект (подтверждён на источнике):** API `/commercial/summary` возвращал `offers_awaiting_owner=0` и `owner_decisions_required=0`, хотя canonical содержит 3 реальных offer в статусе `READY_FOR_SEND_REVIEW` (СтройДвор-Юг, ДКБИ, Завод Атом).

## Корень причины

Файл `tools/commercial_core/lib/readmodels.mjs`, функция `commercialSummary()`.

Жизненный цикл offer имеет ДВА состояния ожидания владельца (`lifecycle.mjs`, `pipeline_state.mjs`):

| Статус | Смысл |
|---|---|
| `READY_FOR_OWNER_REVIEW` | свежий черновик, владелец ещё не смотрел текст |
| `READY_FOR_SEND_REVIEW` | текст одобрен (`APPROVE_TEXT_ONLY`/`APPROVE_DRAFT_FOR_SEND_REVIEW`), ждёт решения владельца о проверке отправки. **Отправки на этом статусе НЕ происходит.** |

Старый код считал только первый статус:
```js
offers_awaiting_owner: offers.filter((o) => o.status === 'READY_FOR_OWNER_REVIEW').length,
owner_decisions_required: offers.filter((o) => o.status === 'READY_FOR_OWNER_REVIEW').length,
```
3 реальных offer находятся в `READY_FOR_SEND_REVIEW` → не попадали в счётчик → сводка показывала 0.

## Исправление

`commercialSummary()` теперь учитывает оба pending-статуса и добавляет явное поле:
```js
const OWNER_PENDING = ['READY_FOR_OWNER_REVIEW', 'READY_FOR_SEND_REVIEW'];
offers_awaiting_owner:        offers in OWNER_PENDING        // = 3
offers_ready_for_send_review: offers in READY_FOR_SEND_REVIEW // = 3 (новое поле)
owner_decisions_required:     offers in OWNER_PENDING        // = 3
```

TEST_ONLY по-прежнему исключается через `real()` — фильтр не затронут.

## Не хардкодим

Числа не зашиты — это живая проекция canonical. Test_only-сущности исключены. Логика согласована с `pipeline_read.mjs`, который уже корректно считал `offers_ready_for_send_review`.

## Верификация (локально)

- Симуляция с 3 реальными `READY_FOR_SEND_REVIEW` + 1 test `APPROVED`:
  `open_opportunities=3, offers_awaiting_owner=3, offers_ready_for_send_review=3, owner_decisions_required=3`.
- Регрессионные тесты RM7–RM10 добавлены в `commercial.test.mjs`.
- `commercial_core: 91 passed, 0 failed` (было 87, +4 новых).
- `gate_c1a: 63 passed, 0 failed` — без регрессий.

## Проброс в API

`/commercial/summary` → `routes.mjs` → `reads.commercialSummary()` → `readmodels.commercialSummary(projectView())`. Исправление автоматически попадает в API-ответ после деплоя. Android-сводка получит 3/3 после обновления контракта (новое поле `offers_ready_for_send_review`).
