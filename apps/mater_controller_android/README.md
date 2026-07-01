# Mater Controller — Android

Нативное Android-приложение (Kotlin + Jetpack Compose) — единый пульт управления
проектами Дмитрия. Первый активный модуль: **Mini Audit**. Приложение общается только
с **Mater Controller API**; оно не читает файлы Windows, не трогает JSON, не хранит
SMTP/Telegram-секреты и не реализует бизнес-логику Mini Audit на клиенте.

## Architecture

```
Compose Screen → ViewModel (StateFlow) → MaterRepository → Retrofit API / Room cache
```

- **UI:** Jetpack Compose + Material 3, нижняя навигация (Сегодня / Проекты / Система / Настройки).
- **State:** unidirectional, immutable UI state, lifecycle-aware сбор.
- **Data:** `MaterRepository` — единственный источник данных для UI. Сетевая правда всегда
  побеждает; Room — read-only офлайн-кэш списков лидов. Действия (send/approve) никогда не
  берутся из кэша и недоступны офлайн.
- **DI:** Hilt. **Networking:** OkHttp + Retrofit + kotlinx.serialization. **Background:** WorkManager (только read-only refresh).
- **Tokens:** access/refresh хранятся в EncryptedSharedPreferences (ключ в Android Keystore).
  Не-секретные настройки (URL, тема, refresh) — в DataStore.

Модульность реализована разделением пакетов `core/*` и `feature/*` в одном Gradle-модуле
(`:app`) — границы core/feature сохранены без накладных расходов multi-module.

## Requirements

- Android Studio / Android SDK с `platforms;android-34`, `build-tools;34.0.0`, `platform-tools`.
- JDK 17. `minSdk = 26`, `compileSdk/targetSdk = 34`.

## Build

```powershell
$env:JAVA_HOME="C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot"
$env:ANDROID_HOME="C:\Users\<user>\AppData\Local\Android\Sdk"

.\gradlew.bat clean
.\gradlew.bat test            # unit tests
.\gradlew.bat lint            # lint
.\gradlew.bat assembleDebug   # debug APK
.\gradlew.bat assembleRelease # signed release APK (needs AI_SECRETS signing.properties)
.\gradlew.bat bundleRelease   # signed AAB
```

Artifacts land in `app/build/outputs/`. A copy is published to
`D:\AI_WORKSPACE\dist\mater_controller_android\`.

## Install

```powershell
adb devices
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

## Connection / pairing

1. On the PC start the API (`tools/mater_controller_api/start_mater_controller_api.ps1 -Lan`).
2. `POST /api/v1/auth/pairing/start` → 6-digit code (valid 10 min).
3. In the app: choose **Локальный ПК**, enter base URL (`http://<pc-lan-ip>:8787`), the code,
   a device name → **Проверить соединение** → **Подключить устройство**.

## Release signing

Signing material lives in `D:\AI_SECRETS\09_android_signing\` and is never committed. The
build reads `mater_controller_signing.properties` by absolute path. See that folder's
`README_RECOVERY.md`.

## Troubleshooting

- **API недоступен:** verify the PC and phone are on the same private Wi-Fi, the firewall rule
  exists (Private/LocalSubnet), and the API is running (`check_mater_controller_api.ps1`).
- **Токен истёк / устройство отозвано:** re-pair from the connection screen.
- **Release build unsigned:** the signing.properties file was not found in AI_SECRETS.
- **Cleartext blocked:** release builds are HTTPS-only by design; use the LAN debug build for plain HTTP.
