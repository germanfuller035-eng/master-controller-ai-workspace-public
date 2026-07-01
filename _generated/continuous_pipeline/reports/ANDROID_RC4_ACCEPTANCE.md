# Android RC4 Owner Acceptance

date: 2026-06-18 · candidate MasterController-release-v0.5.0-rc4 (versionCode 12).

## Artifact validation (local, executed)
```
VERSION=0.5.0-rc4  VERSION_CODE=12  APPLICATION_ID=ru.dmitry.matercontroller
APK_SIGNATURE=PASS (v2)  AAB_SIGNATURE=PASS
SIGNER_MATCH=YES  cert 11038fca…1023f7 == rc1 == rc2 == rc3 == rc5 → in-place upgrade preserves pairing
APK_SHA256=bf4df49ee87e99a314df81a6f32a86f0029faecf9fc79b3b5ebc074cd171b863
AAB_SHA256=586749a12c714d9c87ccc2aec6a25778fef4f775ec9403b85258e60677e28d55
Room: additive (domain_cache reused; no schema bump). Unit tests pass (incl. 4 new AgentPipelineMappingTest).
```
APK: dist/continuous_pipeline_android/MasterController-release-v0.5.0-rc4.apk

## ADB
No device attached → owner installs manually over RC1/RC2/RC3 (no uninstall/clear). Pairing preserved.

## Owner checklist (RC4)
1. Версия 0.5.0-rc4 / code 12; pairing сохранён.
2. Каталог 18 (2/7/9); Mini Audit 10 000 ₽; лиды 62/52/10 объяснены.
3. Новый экран «Агенты»: 5 профилей в SHADOW, кнопка shadow-анализа, ключ не показан.
4. Новый экран «Очереди и сводка»: готовые предложения (3), сверка доставки (7), тестовые записи.
5. Пилотная волна: STROYDVOR/DKBI/ZAVODATOM как возможности+черновики READY_FOR_SEND_REVIEW.
6. Диалоги, delivery review, TEST_ONLY techview — из RC3.
7. Кнопки отправки/оплаты отсутствуют/недоступны; «Клиенту ничего не отправляется».
8. Offline read; offline mutation blocked; reconnect; нет краша/re-pair.

ANDROID_RC4_BUILD=PASS  ANDROID_RC4_OWNER_INSTALL=PENDING
