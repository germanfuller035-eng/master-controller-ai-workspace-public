# Autonomous Android Acceptance Lab — Final Report (0.8.0-rc4)

## Что сделано (одна непрерывная задача)

проверка ноутбука → НИЧЕГО не переустанавливалось (всё present) → видимый эмулятор →
полный реестр UI → авто-тесты → проверка экранов/кнопок → исправление дефектов →
RC4 → два полных прогона → owner-visible demo + видео.

## Окружение

- Хост: i3-10110U (2C/4T), 7.8 GB RAM, Win11 26200, hypervisor present. RAM — узкое место.
- Toolchain (всё present): JDK17, adb 1.0.41, emulator 36.6.11, build-tools 34, android-34,
  google_apis x86_64, Gradle 8.7. Установок не требовалось.

## Видимый эмулятор (НЕ headless)

- AVD a56lab запущен с видимым окном: `qemu-system-x86_64 HasWindow=True`,
  title "Android Emulator - a56lab:5554" (подтверждено через Get-Process).
- Запускался БЕЗ -no-window/-headless.
- ЧЕСТНОЕ ОГРАНИЧЕНИЕ: окно видимое и видео записано, но факт живого наблюдения человеком
  не утверждается (это вне моей проверяемости).

## Реестр UI и матрица

- ANDROID_UI_CONTROL_INVENTORY.md/.json — полный авто-скан всех интерактивных Compose-контролов
  (file:line, testTag, action_kind, risk_class). 23 DANGEROUS-контрола — все гейтятся.
- ANDROID_FUNCTIONAL_TEST_MATRIX.md/.json — матрица по экранам, без UNKNOWN.

## Найдено и исправлено (→ RC4, vc28)

| Класс | Где | Фикс |
|-------|-----|------|
| FAKE_STATUS | Settings «подключено» хардкод | живой health-probe (true/false/проверка) |
| DANGEROUS_NO_CONFIRM | unpair с одного тапа | AlertDialog подтверждения |
| MISSING_TESTTAG | весь Push-экран + theme-чипы | добавлены testTag (~14 контролов) |

## Тесты (на видимом эмуляторе, против production)

- Instrumented: 5 тестов, 0 failures / 0 errors / 0 skipped.
  - CommonUiTest ×3 (loading/error/offline building blocks)
  - LiveProdInstrumentedTest (реальный MaterApi → prod: READ + TEST_ONLY write→server reread)
  - ScreenWalkUiAutomatorTest (обход owner-surface на устройстве, тап только безопасных контролов)
- FULL_ACCEPTANCE_RUN_1 = PASS (5/5). FULL_ACCEPTANCE_RUN_2 = PASS (5/5, после force-stop, pairing сохранён).
- Unit + lint: PASS. APK/AAB собраны.

## Живые данные подтверждены на устройстве

- Today: «API доступен» + флагманские карточки.
- Command Center: «Штатный режим», ограничение «Лиды готовы к аудиту», авто-действие
  HEALTH_RECHECK/recovered (реально выполненная ремедиация видна в UI).
- System hub: «Каноническое хранилище: работает · Ревизия 254 · Автоотправка: заблокирована».
- Queue: реальные LEAD_SCORE/LEAD_VERIFY задачи с candidate-id.
- Push: CREDENTIAL_REQUIRED (честно, без фейка).

## Pairing

- Сопряжение выполнено через настоящий connection-экран (код сгенерирован на prod).
- Пережило install-over RC3→RC4 (запуск сразу на Today, без повторного сопряжения).

## Артефакты

- video/owner_visible_demo.mp4 (998 KB, валидный mp4, реальная навигация по 6 разделам).
- screenshots/ — Today, Command Center (live), System hub, Reliability, Cost, Push.
- reports/connected/ — HTML + JUnit XML. logs/ — emulator/install/demo/logcat.
- APK D:\AI_WORKSPACE\dist\master_controller_android\MasterController-release-v0.8.0-rc4.apk
  SHA256 7bf6f82c11bd400a8d7571b150ed050f3971e430fa487d68bd3ffee73fac4088
- AAB SHA256 227ce0907bdbf82094041fa66af027f8a246545870cd6f9b7a9f49142807423a
- signer 11038fca7db3fab1b0206971a93678b9dd28363ddf61241e162568019a1023f7 (без изменений)

## Stability note

На 7.8 GB RAM одновременный запуск эмулятора + Gradle + screenrecord вызвал OOM
(«paging file too small»), эмулятор ушёл offline. Восстановлено: kill зависшего qemu →
RAM освобождена → чистый перезапуск (2048 MB emulator) → видео записано отдельно от Gradle.
Это ограничение хоста, не дефект приложения.

## No-send / production

CLIENT_MESSAGES_SENT=0, COMMERCIAL_EMAILS_SENT=0, SMTP_CALLS=0, FOLLOWUPS_SENT=0,
PAYMENT_OPERATIONS=0, AUTOSEND=BLOCKED, SEND_ALLOWED_LIVE=OFF, CONTROLLED_SEND_GATE=DISABLED.
Canonical: rev 254 / 29 leads, 0 потерь от тестов (рост от штатного discovery).

## Допустимые credential-gated (не дефекты)

FCM=CREDENTIAL_REQUIRED (WorkManager fallback рабочий), TELEGRAM_OWNER=CREDENTIAL_REQUIRED,
RADAR_LIVE_FETCH=CREDENTIAL_REQUIRED.
