# ANDROID 0.6.0-rc2 ACCEPTANCE

**Дата:** 2026-06-18
**Базис:** 0.6.0-rc1 (versionCode 13) → **0.6.0-rc2 (versionCode 14)**

## Артефакты (`dist/multichannel_activation_android/`)

| Файл | SHA-256 |
|---|---|
| MasterController-release-v0.6.0-rc2.apk | `476fa3b2a2cb43669110714b62ddb7c676f5fbe882f2accd25c4feb18903921a` |
| MasterController-release-v0.6.0-rc2.aab | `a13b86cb65eccad83f5cec2faac4a638207112339c19a9190829435fe811f146` |

+ `SHA256SUMS-v0.6.0-rc2.txt`, `SIGNATURE_REPORT-v0.6.0-rc2.txt`, `BUILD_INFO-v0.6.0-rc2.txt`.

## Подпись

```
Signer SHA-256: 11038fca7db3fab1b0206971a93678b9dd28363ddf61241e162568019a1023f7
== RC1..RC5 (signer identical)
Scheme: v2, single signer
```
**SIGNER_MATCH = YES** → установка поверх RC4 без удаления данных и без повторного pairing.

## Что включено

| Блок | Статус |
|---|---|
| Навигация очередей (7 карточек → routes + экраны) | PASS |
| Коммерческая сводка (3 opp / 3 offer ready) | PASS |
| Offer review list (СтройДвор-Юг/ДКБИ/Завод Атом) | PASS |
| Действия offer без отправки (4 текстовых) | PASS |
| Русификация owner-facing | PASS |
| Источники и каналы (раздельные статусы) | PASS (существующий экран) |
| Agent provider health (честно «недоступен») | PASS |
| Offline cache (Room KV) | PASS (общий механизм readCached) |
| No-send controls | PASS (нет активного outbound) |

## Тесты и качество

- `:app:testDebugUnitTest` — **117 tests, 0 failed** (добавлены `OfferReviewMappingTest` +5, `CommercialMappingTest` +1).
- `OwnerUiRawCodeSafetyTest` расширен на новые экраны — raw codes не утекают.
- `:app:lintRelease` — BUILD SUCCESSFUL.
- `:app:assembleRelease` + `:app:bundleRelease` — BUILD SUCCESSFUL, подпись валидна.

## Room schemas

`MaterDatabase` объявлена с `exportSchema = false` (версия 2, есть `MIGRATION_1_2`). Схемы не эмитируются
по существующему дизайну; менять это в рамках волны не стали (требует migration-test инфраструктуры и
риска регрессий). Зафиксировано в BUILD_INFO.

## Физическая установка

`ANDROID_OWNER_INSTALL = PENDING` — ADB в этой среде недоступен. APK подготовлен по точному пути:
`dist/multichannel_activation_android/MasterController-release-v0.6.0-rc2.apk`.
Совпадение подписи с RC1..RC5 гарантирует upgrade-install поверх RC4 без потери pairing/данных.
