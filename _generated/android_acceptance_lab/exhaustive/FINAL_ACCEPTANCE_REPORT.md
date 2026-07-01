# Exhaustive Control Acceptance — Final Report (0.8.0-rc5)

## Честный статус

**PARTIAL — фундамент построен, полное исполнение ledger отложено по решению владельца.**

Владелец выбрал «сначала инвентарь + testTag». Это и поставлено. Я НЕ заявляю
`COMPLETE_EXHAUSTIVE_CONTROL_BY_CONTROL_ACCEPTANCE`, потому что ledger ещё не показывает
индивидуальное PASS-исполнение каждого контрола в двух прогонах.

## Что сделано (доказано)

### Двойной инвентарь
- Static scan: **317 интерактивных контролов** (104 файла), программно, с file:line/type/testTag.
- Runtime semantic dump: **91 контрол** на 10 owner-экранах (UIAutomator).
- Reconciled registry с control_id, risk_class, selector. Артефакты:
  STATIC/RUNTIME/RECONCILED_CONTROL_INVENTORY.{json,md}.

### Селекторы (RC5)
- Добавлено 62 уникальных testTag (`screen.<route>.control.back|refresh`) + ранее push/theme/autopilot.
- **301/317 контролов селектируемы**. Оставшиеся 16 — НЕ genuine-interactive:
  определения переиспользуемых хелперов (тег в call-site), disabled статус-чипы, display-only карточки.
- `testTagsAsResourceId=true` в Compose-root → UIAutomator By.res видит каждый testTag.

### Движок ledger
- `ControlLedgerHarness` (androidTest): читает 301-строчный план (bundled asset),
  индивидуально проверяет каждый контрол, пишет ОДНУ строку на контрол в logcat (CTRL_LEDGER).
- Доказано: 301/301 строк эмитится. EXHAUSTIVE_RUN_1_LEDGER.jsonl — 301 запись.

## Что НЕ сделано (честно)

- Все 301 строки текущего ledger = `UNEXECUTED_NOT_ON_CURRENT_SCREEN`: harness ещё не делает
  per-screen навигацию и reinstall→re-pair (connectedAndroidTest переиспользовал rc4-install без
  testTagsAsResourceId). Это и есть «полное исполнение» — отдельный шаг.
- Комбинаторика (input×12, dialog-ветки, list-state×5, process-restart) ×2 прогона требует
  TEST_ONLY-фикстур для data-gated экранов и значительного машинного времени на хосте 7.8 GB RAM.
- EXHAUSTIVE_RUN_2 не выполнялся.

## Артефакты RC5
- versionCode 29 / 0.8.0-rc5, signer 11038fca… (без изменений).
- APK/AAB в dist (хеши — после финальной пересборки под HEAD).

## Production / safety
- Изменений backend/production в этой фазе НЕ было. Canonical rev 254 / 29 leads.
- CLIENT_MESSAGES_SENT=0, AUTOSEND=BLOCKED, SEND_ALLOWED_LIVE=OFF, CONTROLLED_SEND_GATE=DISABLED.

## Следующий шаг (для полного COMPLETE)
1. Доработать harness: reinstall RC5 → re-pair → для каждого контрола навигировать на его экран
   по screen_route, тапать, фиксировать HTTP/reread, писать PASS_* в ledger.
2. Создать TEST_ONLY-фикстуры для data-gated состояний.
3. Прогнать EXHAUSTIVE_RUN_1 и RUN_2 (force-stop между ними), добиться FAILED=0/UNEXECUTED=0.
