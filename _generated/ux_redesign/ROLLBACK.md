# Rollback

Date: `2026-06-26`

## Code

If the UX changes must be reverted, restore the changed UX files explicitly instead of using `git reset --hard`.

Example:

```powershell
git restore <changed UX files> if needed
```

Device acceptance changed only the androidTest runner:

```powershell
git restore apps/mater_controller_android/app/src/androidTest/java/ru/dmitry/matercontroller/ScreenByScreenRunner.kt
```

## Android Device Route

Only run these if the owner asks to remove the temporary device route:

```powershell
adb -s AMSKBB4914919475 shell settings put global http_proxy :0
adb -s AMSKBB4914919475 reverse --remove tcp:18089
```

## Gradle

Stop the isolated daemon if needed:

```powershell
.\gradlew.bat -g C:\Users\dima-\Codex-Network-Recovery\gradle_home_android_owner_ux_v2 --stop
```

Do not clean the global Gradle cache.
