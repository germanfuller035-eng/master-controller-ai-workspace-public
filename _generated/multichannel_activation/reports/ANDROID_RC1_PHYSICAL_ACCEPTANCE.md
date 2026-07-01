# ANDROID RC1 PHYSICAL ACCEPTANCE

**Дата:** 2026-06-18
**Статус:** `PENDING` (ADB недоступен в среде сборки)

## Найденный APK
- RC1 (versionCode 13) собран ранее в той же среде; артефакты в базовой ветке
  (`dist/multichannel_android/MasterController-release-v0.6.0-rc1.apk`).
- Подпись RC1 SHA-256 = `11038fca…` (== все прошлые сборки).

## ADB
`which adb` → НЕ найден. Физическая установка поверх RC4 не выполнялась.
Это НЕ блокирует прочие фазы (по правилу мега-промпта).

## Решение
Вместо физической установки RC1 выпущен RC2 (versionCode 14) с устранёнными дефектами RC4.
Точный путь APK для владельца:
`dist/multichannel_activation_android/MasterController-release-v0.6.0-rc2.apk`.
Совпадение подписи гарантирует upgrade-install поверх RC4 без re-pair.
