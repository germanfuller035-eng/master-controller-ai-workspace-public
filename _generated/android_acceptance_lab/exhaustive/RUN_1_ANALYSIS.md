# EXHAUSTIVE RUN_1 — Honest Results & Analysis

## Итог RUN_1 (фактический, через am instrument на сопряжённом debug-приложении)

- LEDGER_BEGIN total=283, **LEDGER_END executed=283** — каждый из 283 контролов получил
  индивидуальную попытку и отдельную ledger-запись (06-21 05:16 → 05:44, ~28 мин).
- **PASS=74**, FAIL=10, UNEXECUTED=199.

| статус | кол-во |
|--------|--------|
| PASS_NAVIGATION | 27 |
| PASS_VISIBLE_ENABLED | 26 |
| PASS_LIVE_READ | 11 |
| PASS_UNSAFE_ACTION_BLOCKED | 8 |
| PASS_DISABLED_WITH_REASON | 2 |
| FAIL (StaleObjectException) | 10 |
| UNEXECUTED_NOT_FOUND_ON_SCREEN | 139 |
| UNEXECUTED_NAV_FAILED | 60 |

## 10 FAIL — это НЕ дефекты приложения

Все 10 — `StaleObjectException`: UiObject2-ссылка устарела между find и click (список
рекомпозировался). Это хрупкость харнесса (нужен re-find перед кликом), а не баг Master
Controller. Реальных дефектов приложения RUN_1 не выявил.

## Где PASS, где нет (по экранам)

Полностью/в основном пройдены прямые экраны: home 13/13, cost 3/3, ai 2/2, reservoir 2/2,
miniaudit 15/27, commercial 12/46, knowledge 7/14, operations 7/24.

Не пройдены (UNEXECUTED): settings 0/11, approvals 0/11, ownersettings 0/17, agents 0/18,
sources 0/8, multichannel 0/9, transport 0/13, automation 0/8, backup 0/4, replies 0/5.

## Честный диагноз причин UNEXECUTED

1. **UNEXECUTED_NAV_FAILED (60):** экраны через commercial-хаб и ops-detail достигаются
   текстовыми тапами («Агенты»/«Каталог»/«Доставка»), которые ненадёжны — текст не всегда
   совпадает или требует скролла хаба. Нужны стабильные testTag на карточках хабов
   (commercial summary, operations) — это ещё один RC-инкремент.
2. **UNEXECUTED_NOT_FOUND_ON_SCREEN (139):** контрол на достигнутом экране не найден, потому что
   (а) многие — это контролы списков/деталей, требующие конкретных данных (лид с аудитом,
   открытое решение, диалог), для которых нужны TEST_ONLY-фикстуры; (б) часть — внутри
   диалогов/expandable, не раскрытых навигатором.

## Вывод (без приукрашивания)

Навигатор и движок РЕАЛЬНО работают: 74 контрола индивидуально выполнены с корректной
классификацией (включая 8 dangerous-gate проверок open→cancel). Но spec-цель
`UNEXECUTED=0` НЕ достигнута: 199 контролов требуют (1) стабильных testTag на хаб-карточках,
(2) TEST_ONLY-фикстур для data-gated списков/диалогов, (3) re-find для устранения 10 Stale.

Это не «mostly passed» — это 74/283 = 26% фактического PASS. Я не заявляю COMPLETE.
