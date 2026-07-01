# FCM Push — пакет активации (LIVE PUSH = OFF, credentials ABSENT)

Статус: **бэкенд, маршруты, тесты и Android-UI готовы. Live-доставка ВЫКЛЮЧЕНА.**
Push не отправляется: `delivery_state = CREDENTIAL_REQUIRED`, пока владелец не предоставит реальный
Firebase service-account. Никакие credentials не выдуманы и не хранятся в Git.

Это **служебный** push для владельца (инциденты, решения, сводка), а НЕ клиентские отправки.
Он никогда не пишет лиду/клиенту, не открывает send-gate, не трогает canonical store или ledger.

## Что уже готово без credentials

Backend (`tools/mater_controller_api/src/owner_center/fcm_push.mjs`):
- Реестр токенов устройств с ротацией и хешированием для логов (`PUSH_STORE_PATH`).
- Предпочтения по устройству: `enabled`, `min_severity`, `decisions`, `incidents`, `daily_brief`.
- Решение маршрутизации `shouldDeliver(event, prefs)` поверх severity-роутинга owner-center.
- `deliver()` — DISABLED by default. LIVE только при `MATER_FCM_ENABLED=true` И наличии реального
  credential-файла И подключённом sender. Иначе — запись SUPPRESSED, fail-closed, без фейкового успеха.
- Эндпоинты: `GET /push/status`, `GET /push/preferences`, `POST /push/register`,
  `POST /push/unregister`, `POST /push/preferences`, внутренний `POST /push/deliver` (service-token).
- Тест: `tools/tests/fcm_push_v1_test.mjs` — 29/0 PASS (credentials ABSENT, доставка подавлена).

Android:
- `feature/push/PushSettingsScreen.kt` — честное состояние доставки + предпочтения (RU,
  offline/error/loading), подключён в навигацию из Система-хаба.
- DTOs, эндпоинты (`MaterApi`), методы репозитория (`pushRegister`/`pushUnregister`/`pushSetPreferences`/
  `pushStatus`/`pushPreferences`).
- **Firebase SDK НАМЕРЕННО НЕ добавлен** в сборку: это потребовало бы `google-services.json`
  (credentials) и дестабилизировало бы проверенную emulator-сборку. Шаблон активации ниже.

## Чего не хватает для live-push (credential-gated)

1. **Firebase project + service-account JSON** (владелец создаёт в Firebase Console). Файл кладётся
   ВНЕ репозитория/Git, путь задаётся `MATER_FCM_CREDENTIALS_PATH` (по умолчанию
   `D:/AI_SECRETS/01_env/fcm_service_account.json` или `MATER_API_SECRETS_DIR/fcm_service_account.json`).
2. **`google-services.json`** для Android-приложения (из того же Firebase-проекта). Кладётся в
   `apps/mater_controller_android/app/` и в `.gitignore` (не коммитить).
3. **Gradle-плагин и зависимости** — см. шаблон `ACTIVATION: Gradle` ниже.
4. **`FirebaseMessagingService`** — см. шаблон `FcmService.kt.template` рядом с этим файлом
   (`apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/push/`).
5. **Backend sender** — HTTP v1 FCM-клиент, построенный из service-account, передаётся в
   `fcmPush.deliver({ event, sender })`. Сейчас sender не подключён → fail-closed (live:false).

## Шаги активации (выполняет владелец)

1. Создать Firebase-проект, добавить Android-приложение с applicationId
   `ru.dmitry.matercontroller`, скачать `google-services.json` → `app/`.
2. Скачать service-account JSON → `MATER_FCM_CREDENTIALS_PATH` (вне Git).
3. В `app/build.gradle.kts` подключить плагин и зависимости (шаблон ниже), в корневом
   `build.gradle.kts` — `id("com.google.gms.google-services") version "4.4.2" apply false`.
4. Переименовать `FcmService.kt.template` → `FcmService.kt`, зарегистрировать сервис в
   `AndroidManifest.xml` (шаблон ниже), запросить разрешение `POST_NOTIFICATIONS` (Android 13+).
5. Реализовать backend sender (HTTP v1) и передать его в `deliver()`.
6. Включить флаг `MATER_FCM_ENABLED=true` на сервере ТОЛЬКО после проверки. До этого момента
   `delivery_state` остаётся `CREDENTIAL_REQUIRED`/`DISABLED_BY_CONFIG`.
7. Проверить: токен регистрируется (`POST /push/register`), `GET /push/status` показывает
   `registered_tokens >= 1`, тестовое P0-событие доставляется только на согласившиеся устройства.

### ACTIVATION: Gradle (app/build.gradle.kts)

```kotlin
plugins {
    // ...существующие плагины
    id("com.google.gms.google-services")
}
dependencies {
    // ...
    implementation(platform("com.google.firebase:firebase-bom:33.1.0"))
    implementation("com.google.firebase:firebase-messaging-ktx")
}
```

### ACTIVATION: AndroidManifest.xml (внутри <application>)

```xml
<service
    android:name="ru.dmitry.matercontroller.push.FcmService"
    android:exported="false">
    <intent-filter>
        <action android:name="com.google.firebase.MESSAGING_EVENT" />
    </intent-filter>
</service>
```

## Жёсткие инварианты (не ослаблять)

- Push НИКОГДА не отправляет клиентских сообщений. `sends_client_messages = false` всегда.
- Без реального credential-файла доставка невозможна (`CREDENTIAL_REQUIRED`); fail-closed.
- Firebase server secret НЕ хранится в Android и НЕ коммитится в Git.
- `MATER_FCM_ENABLED` по умолчанию не установлен → push отключён.
- Текущие счётчики live-доставок = 0; клиентских отправок = 0.
