# Exhaustive Control Acceptance — Control Inventory & Selector Coverage (0.8.0-rc5)

## Двойной инвентарь (что существует)

| Источник | Метод | Контролов |
|----------|-------|-----------|
| Static | программный скан Compose-исходников (104 файла) | 317 интерактивных контролов |
| Runtime | UIAutomator semantic dump, 10 owner-экранов | 91 живых контролов |
| Reconciled | объединение static ∪ runtime, по control_id | 317 |

(Static — авторитет для «что есть в коде»; runtime подтверждает «что реально отрисовано».
317 < 326 из первого скана: исключены ложные срабатывания — определения sealed-class `Tab`,
сигнатуры функций-хелперов, строки `import`.)

## Покрытие селекторами (что можно автоматизировать)

| Метрика | До | После RC5 |
|---------|-----|-----------|
| Selectable (testTag или стабильный текст) | 252 | **301** |
| Need selector | 74 | 16 |

RC5 добавил уникальные testTag на 62 nav/refresh-контрола формата
`screen.<route>.control.back` / `screen.<route>.control.refresh` + ранее (rc4)
push/theme/autopilot/incident-ack контролы.

## Оставшиеся 16 без статического testTag — все легитимны

| Категория | Примеры | Почему не тегируется |
|-----------|---------|----------------------|
| Определения переиспользуемых хелперов | SectionCard, ApprovalRow, OfferRow, LeadRow, ReplyCard, StepButton, ActionButton, SwitchRow | Селектор задаётся в call-site через `tag=`/`testTag` параметр; тег на определении создал бы дубли |
| Отключённые статус-чипы | AssistChip(enabled=false) в Today/Catalog/Projects | Не интерактивны (enabled=false) — корректно неселектируемы |
| Display-only карточки | transport SectionCard "(тест)" без onClick | Не кликабельны |

Вывод: **0 genuinely-interactive контролов без селектора**. Все 16 — корректные
не-цели для индивидуального клика.

## Risk-классы (reconciled)

NAVIGATION 83 · ACTION 134 · REFRESH 34 · DANGEROUS 28 · SELECT 13 · DECORATIVE_OR_STATUS 12 ·
INPUT 7 · TOGGLE 6.

## Execution engine

`ControlLedgerHarness` (androidTest) читает `/sdcard/control_plan.jsonl` (одна строка на контрол
из reconciled-инвентаря, 301 selectable), индивидуально проверяет каждый и пишет ОДНУ строку в
`/sdcard/control_ledger.jsonl` со статусом PASS_*/UNEXECUTED_*. Это движок «одна запись на контрол»,
не screen-rollup.

## Честное ограничение

Полное индивидуальное исполнение всех 301 + комбинаторика (input×12, dialog-ветки, list-state×5,
process-restart) ×2 прогона требует TEST_ONLY-фикстур для data-gated экранов и существенного
машинного времени на хосте 7.8 GB RAM. Текущая поставка: полный двойной инвентарь + стабильные
селекторы на каждом интерактивном контроле + движок ledger + демонстрационный прогон. Полное
исполнение ledger по всем 301 — следующий подтверждённый шаг (per owner decision «сначала
инвентарь+testTag»).
