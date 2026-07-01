# Session 0 Rollback

UPDATED_AT=2026-06-26T01:47:01.2734436+03:00 Europe/Moscow

ROLLBACK_EXECUTED=NO

## Code Rollback

Revert only exact Session 0 Android acceptance files if rollback is required:

- `apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature/multichannel/MultichannelScreen.kt`
- `apps/mater_controller_android/app/src/androidTest/java/ru/dmitry/matercontroller/ScreenByScreenRunner.kt`

Do not revert unrelated local drift automatically.

## Android Route Rollback

Do not execute unless owner explicitly asks to remove the temporary Honor route:

```powershell
adb -s AMSKBB4914919475 shell settings put global http_proxy :0
adb -s AMSKBB4914919475 reverse --remove tcp:18089
```

Current preserved route:

- ANDROID_GLOBAL_PROXY=127.0.0.1:18089
- ADB_REVERSE=tcp:18089->tcp:10809

## Gradle Process Rule

- Do not use hidden `Start-Process` for Gradle.
- Use foreground/direct Gradle invocation with explicit process checks.
- If a build appears stalled, verify process tree, CPU delta, artifact mtime, and log mtime before killing.
- Kill only the exact stuck build tree; do not kill adb server, HAPP, Codex, node, or unrelated Java processes.
