# Android RC2 — Owner Acceptance

date: 2026-06-18 · candidate MasterController-release-v0.5.0-rc2 (versionCode 10).
Backend Gate C1-A is LIVE (read + 6 commands, no send/payment), so the app has real data + commands.

## Artifact validation (local, executed)
```
VERSION=0.5.0-rc2  VERSION_CODE=10  APPLICATION_ID=ru.dmitry.matercontroller
APK_SIGNATURE=PASS (v2)  AAB_SIGNATURE=PASS
SIGNER_MATCH=YES  cert 11038fca…1023f7 == rc1 == rc5  → in-place upgrade preserves pairing
APK_SHA256=569306f8cf0e21773d02d9f9642594755713fd0e812c58caf5587226cbdcfc6d
AAB_SHA256=83d34c85f791a0da627e98a18c8dc1f00f651f44f342bbeff6c4ee0feae0b8fc
hardcoded_product_catalog=0  hardcoded_lead_totals=0  tracked_secrets=0
Unit tests: 100 passed.  assembleRelease + bundleRelease SUCCESSFUL.
```
APK: dist/integration_wave_1_gate_c1a_android/MasterController-release-v0.5.0-rc2.apk

## ADB install
Not performed here (no device attached to this environment). Owner installs manually over rc1.
Do NOT uninstall; do NOT clear data — pairing is preserved by the identical signer.

## Owner checklist (17)
1. Версия 0.5.0-rc2 / code 10.
2. Pairing сохранён (нет повторного подключения).
3. Каталог показывает 18 продуктов.
4. Фильтры: 2 ACTIVE / 7 DRAFT / 9 PLANNED.
5. Mini Audit: Активен, 10 000 ₽.
6. Лиды: «Всего в системе: 62 · В контуре Mini Audit: 52 · Не включены: 10» + пояснение раскрывается.
7. Нет надписи «неопределённые отправки»; вместо неё «Записи с неуточнённым статусом доставки» (3) +
   «Подтверждённых успешных отправок в реестре: 7».
8. Все 3 legacy/status-записи классифицированы (не как успешные отправки).
9. Команды C1-A видны владельцу (карточка «Коммерческие действия» в сводке).
10. Перед каждым действием — preview с подтверждением.
11. Постоянная надпись «Клиенту ничего не отправляется».
12. Платёжных действий нет.
13. Действий отправки нет.
14. Каталог читается офлайн (кеш).
15. Офлайн-мутация заблокирована (команда требует соединения).
16. Reconnect обновляет данные.
17. Нет краша / повторного подключения.

```
ANDROID_RC2_BUILD=PASS
ANDROID_RC2_OWNER_INSTALL=PENDING
```
