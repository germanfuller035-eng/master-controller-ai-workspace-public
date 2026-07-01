# REGRESSION — FIRSTTOUCH FIX INTACT (2026-06-22, начало сессии CONTINUE_4_BATCHES)

Проверка сохранности firsttouch-фикса ДО оставшихся 4 экранов.

## Локальные тесты (изолированный стор, prod не тронут)
- first_touch_includetest: 46/46 PASS
- first_touch_commands: 16/16 PASS
- mater_controller_api/run_all: 50/50 PASS (включая canonical store integrity: lead store / send ledger / email ledger unchanged)

## Android wiring (HEAD 21a4b55)
- MaterApi.firstTouchSummary/firstTouchCandidates: default includeTest=false (release чист)
- MaterRepository: debug шлёт includeTest=BuildConfig.DEBUG
- Комментарий в коде: «includeTest is an ACCEPTANCE-ONLY switch»

## Live prod через debug-приложение (includeTest=true)
Экран firsttouch (cs_first_touch):
- Лидов проверено = 40 (== baseline, не изменено тестами)
- Подходят для пилота = 5
- Рекомендованный пилот = cand_04066fcfaa00 (РЕАЛЬНЫЙ, не синтетик)
- Кандидаты топ-5: Арт-строй (98), Югметаллпром (98), … — все cand_* реальные
- Синтетик TEST_ONLY_FT_ACCEPT_V3 ОТСУТСТВУЕТ в top-5 даже при includeTest=true → fixture после cleanup удалён
- «Отправка отключена. Сообщение клиенту не отправляется. Шлюз отправки: выключен.»

ВЫВОД:
- release TEST_ONLY=0 (default false) — OK
- debug includeTest работает — OK
- firsttouch fixture после cleanup отсутствует — OK
- real leads count не изменён тестами (40) — OK
- send ledger не изменён (run_all canonical integrity PASS) — OK
- firsttouch fixture повторно НЕ создавался
