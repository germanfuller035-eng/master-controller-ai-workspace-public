# Android RC3 Owner Acceptance

date: 2026-06-18 · candidate MasterController-release-v0.5.0-rc3 (versionCode 11).
Backend transport-readiness is LIVE (read-only); commands C1-A on; send/payment OFF.

## Artifact validation (local, executed)
```
VERSION=0.5.0-rc3  VERSION_CODE=11  APPLICATION_ID=ru.dmitry.matercontroller
APK_SIGNATURE=PASS (v2)  AAB_SIGNATURE=PASS
SIGNER_MATCH=YES  cert 11038fca…1023f7 == rc1 == rc2 == rc5  → in-place upgrade preserves pairing
APK_SHA256=033ac7857cf2889ce87db8d6ae3c25cc982c82bb431ff514ebf6d5c4a6ed8f3d
AAB_SHA256=80026cea7ed2f9e7abc0390ef5c656fbb71a1b960990e93c82d1efc24b6c15d8
Room migration: additive (domain_cache reused; no schema bump needed for new read caches)
Unit tests: all pass (incl. 4 new TransportReadinessMappingTest). assembleRelease + bundleRelease OK.
```
APK: dist/transport_readiness_android/MasterController-release-v0.5.0-rc3.apk

## ADB
No device attached → owner installs manually over RC1/RC2 (no uninstall, no data clear). Pairing
preserved (identical signer).

## Owner checklist (RC3)
1. Версия 0.5.0-rc3 / code 11; pairing сохранён.
2. Каталог 18 (2 ACTIVE / 7 DRAFT / 9 PLANNED); Mini Audit 10 000 ₽.
3. Лиды: всего 62 / в Mini Audit 52 / не включены 10 — с пояснением.
4. «Записи с неуточнённым статусом доставки» + «Подтверждённых отправок: 7».
5. Новый экран «Статусы доставки требуют сверки»: авто-повтор запрещён, требуется владелец.
6. Новый экран «Диалоги»: лента событий, только просмотр, бейдж «Клиенту ничего не отправляется».
7. Реальное предложение STROYDVOR-UG_RU видно как возможность/черновик (READY_FOR_SEND_REVIEW);
   кнопка отправки отсутствует/недоступна.
8. «Тестовые коммерческие записи» — техэкран с TEST-бейджем; не в выручке.
9. Offline read работает; offline-мутация заблокирована; reconnect обновляет.
10. Платёж/отправка отсутствуют. Нет краша/повторного подключения.

```
ANDROID_RC3_BUILD=PASS  ANDROID_SIGNER_MATCH=YES  ANDROID_OWNER_INSTALL=PENDING
```
