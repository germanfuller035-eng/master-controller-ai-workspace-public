# Android RC9 — Live Acceptance vs Production (two green runs)

**Дата:** 2026-06-19 · сборка 0.6.0-rc9 (versionCode 21) · эмулятор `a56lab` (android-34, SDK 34).

## Версия и установка
- На устройстве: `ru.dmitry.matercontroller` versionName=0.6.0-rc9, versionCode=21 (release, signer `11038fca…1023f7`).
- Debug-вариант установлен поверх предыдущего (install-over, без удаления) — pairing/cache сохранены, краша нет.

## Два автономных прогона (connectedDebugAndroidTest, --rerun-tasks)
```
FULL_RUN_1 = PASS — 3/3 tests, 0 skipped, 0 failed, BUILD SUCCESSFUL, exit 0
FULL_RUN_2 = PASS — 3/3 tests, 0 skipped, 0 failed, BUILD SUCCESSFUL, exit 0
CRASHES = 0 · ANRS (приложения) = 0
```
Логи: `rc9_acceptance_run1.log`, `rc9_acceptance_run2.log`.

## Production read-only (обновлённый API)
RC9 работает против развёрнутого production API. Все 4 `/first-touch/*` эндпоинта возвращают `ok:true` с новыми честными метриками (`leads_considered=62, leads_scored=62, pilot_eligible=7`), recommended BETON-MASTERS_RU, send gate DISABLED, no_send=true. UI «Первое касание» показывает подбор, кандидатов, крючок, тему/тело, оценки, без кнопки отправки.

## Безопасность во время acceptance
```
PRODUCTION_MUTATING_REQUESTS = 0
PRODUCTION_OUTBOUND_REQUESTS = 0
PRODUCTION_PAYMENT_REQUESTS = 0
production store/ledger unchanged: 04c0160d / 04fda652 (rev 106, 62 leads, ledger 7) — до и после
services active: api, telegram, worker (не трогались)
```

## Дефекты
Android/backend дефектов в ходе acceptance не найдено. RC9 остаётся (RC10 не потребовался). versionName=0.6.0-rc9, versionCode=21.

## Verdict
**PASS** (два зелёных прогона, no-send, production не изменён).
