# Build Pipeline Stabilization

Session: `ANDROID_OWNER_UX_REDESIGN_AND_APPLE_SAMSUNG_ERGONOMICS_V1`

Worktree: `D:\AI_WORKSPACE\.claude\worktrees\android-owner-ux-redesign-v1`

Branch: `feature/android-owner-ux-redesign-v1`

Base HEAD: `63a8fd9f14e04cc03d022c891af5d0baf46889f6`

## Root Cause

Direct Codex foreground Gradle runs and early watchdog attempts were unreliable in this session:

- direct `compileDebugKotlin` attempts stalled without task output;
- a first watchdog captured no Gradle output and was reclassified as infrastructure failure, not Kotlin failure;
- a first project-local harness preflight reached Gradle `PASS` but failed to write summary and release lock;
- the first guarded compile attempt exposed a harness bug: Gradle held the log file while the harness tried to append CPU status, causing `INFRA_ERROR` and leaving an orphaned compile tree.

## Local Cleanup

Deleted only worktree-local Gradle state:

- `D:\AI_WORKSPACE\.claude\worktrees\android-owner-ux-redesign-v1\apps\mater_controller_android\.gradle`

Skipped missing paths:

- `D:\AI_WORKSPACE\.claude\worktrees\android-owner-ux-redesign-v1\.gradle`
- `D:\AI_WORKSPACE\.claude\worktrees\android-owner-ux-redesign-v1\apps\mater_controller_android\app\build\tmp`

Deletion record:

- `C:\Users\dima-\Codex-Network-Recovery\ux_gradle_rootfix_deleted_files.txt`

## Processes Stopped

Earlier stale Gradle/process trees:

- `8368,12092,15204`
- `2588,11796,13840`
- `10664`

Stopped orphaned compile tree created by the first guarded compile attempt:

- `15576` cmd wrapper
- `14568` Gradle wrapper JVM
- `5604` single-use Gradle daemon child
- `9988` conhost child

No adb server, HAPP, Codex, node, unrelated Java, unrelated Gradle, proxy, VPN, VPS, backend, firewall, DNS, install, or instrumentation state was intentionally changed.

## Guarded Build Harness

Created and hardened:

- `tools/android/guarded_gradle.ps1`
- `tools/android/ANDROID_BUILD_GUARD.md`

The harness now:

- owns `.gradle/guarded_gradle.lock`;
- removes stale lock files only when the recorded PID is dead;
- writes per-run logs and summary JSON under `C:\Users\dima-\Codex-Network-Recovery\gradle_guard_logs`;
- uses one .NET-managed `cmd.exe` process for Gradle wrapper invocation;
- tails Gradle output from the log to console;
- buffers harness status lines while Gradle owns the log file;
- flushes harness status lines after the Gradle tree releases the log;
- kills only its own process tree on stall or infrastructure exception.

## Preflight

Latest verified preflight:

- Result: `PASS`
- Log: `C:\Users\dima-\Codex-Network-Recovery\gradle_guard_logs\preflight_20260626_063042.log`
- Summary: `C:\Users\dima-\Codex-Network-Recovery\gradle_guard_logs\preflight_20260626_063042.summary.json`
- Gradle: `8.7`
- Kotlin: `1.9.22`
- JVM: `17.0.19 (Microsoft 17.0.19+10-LTS)`

## Compile

One guarded compile was attempted:

- Result: `INFRA_ERROR`
- Log: `C:\Users\dima-\Codex-Network-Recovery\gradle_guard_logs\compileDebugKotlin_20260626_062648.log`
- Summary: `C:\Users\dima-\Codex-Network-Recovery\gradle_guard_logs\compileDebugKotlin_20260626_062648.summary.json`
- Kotlin errors captured: `NONE`
- Files with Kotlin errors: `NONE`
- Build stalled: `NO`
- Orphaned harness process tree stopped: `15576,14568,9988,5604`

The compile reached Gradle project configuration and did not report Kotlin compile errors before the harness infrastructure failure.

## Custom Harness Abandoned

- Custom harness abandoned.
- Reason: repeated self-inflicted infra failures.
- Gradle wrapper preflight was `PASS`.
- Further verification is performed with a one-shot build process.

CUSTOM_HARNESS=ABANDONED
ABANDON_REASON=REPEATED_SELF_INFLICTED_CAPTURE_LOCK_AND_ORPHAN_FAILURES
ENVIRONMENT_BINDING=CORRECT_UX_WORKTREE
ROOT_FIX=KNOWN_GOOD_JDK_PLUS_LOCAL_PROPERTIES_PLUS_ISOLATED_GRADLE_HOME_PLUS_EXPLICIT_PROXY_PLUS_NORMAL_DAEMON

## Cold Cache Rootfix

The earlier `help` timeout was reclassified as cold isolated dependency cache warmup, not a Gradle daemon stall:

- Root cause: `COLD_ISOLATED_GRADLE_DEPENDENCY_CACHE`
- Old classification: `OTHER_WITH_PROOF`
- New classification: `COLD_CACHE_WARMUP_INTERRUPTED`
- Daemon connection failure evidence: `NO_EVIDENCE`
- Kotlin failure status: `NOT_REACHED`
- Build configuration failure status: `NOT_PROVEN`

Cache rootfix used a new isolated Gradle user home:

- Source Gradle user home: `C:\Users\dima-\.gradle`
- New isolated Gradle user home: `C:\Users\dima-\Codex-Network-Recovery\gradle_home_android_owner_ux_v2`
- Dependency cache seeded: `YES`
- Wrapper distribution copied: `YES`
- Lock files copied: `NO`
- `gc.properties` copied: `NO`

Offline verification:

- Gradle version preflight: `PASS`
- Offline help: `PASS`
- Offline `:app:compileDebugKotlin`: `PASS`
- Compile duration: `46.551s`
- Kotlin errors: `NONE`
- Files with Kotlin errors: `NONE`

## Next Safe Action

`RUN_ASSEMBLE_DEBUG_IN_SEPARATE_STEP`

Do not run `assembleDebug`, install, instrumentation, Run 1, Run 2, or further UX implementation in this step.

## Device Acceptance Follow-Up

Date: `2026-06-26`

Device: `AMSKBB4914919475`

Gradle user home: `C:\Users\dima-\Codex-Network-Recovery\gradle_home_android_owner_ux_v2`

After the fresh APK install, targeted device acceptance found an androidTest runner navigation regression:

- failing selector before fix: `cs_send_review` on `commercial`
- root cause: historical control-plan order reached a promoted commercial card after the runner had scrolled deep into the screen
- follow-up failing selector before final fix: `cs_conversations`
- root cause: commercial-card scroll recovery was initially scoped only to intermediate nav steps

Minimal fix:

- changed only `apps/mater_controller_android/app/src/androidTest/java/ru/dmitry/matercontroller/ScreenByScreenRunner.kt`
- did not change production Kotlin during device acceptance
- rebuilt and reinstalled only `app-debug-androidTest.apk`

Build steps run during this follow-up:

- `:app:assembleDebugAndroidTest` via isolated Gradle Home v2, offline, daemon
- no `assembleDebug`
- no full Run 1
- no full Run 2

Final APK evidence:

- app APK unchanged: `E355BBAF09A7EECA1902C0D1EC814A801C028A67613A09BBF789398E51EB678F`
- final androidTest APK: `D2B7B1ED2BD78619DA7F9FF820172CBFC570E92E86712F2E231632445E92B624`

Final targeted runner result:

- `agents`: PASS
- `multichannel`: PASS
- `offer_review`: PASS
- `commercial`: PASS
- `conversations`: PASS
- `transport`: PASS
- `approvals`: PASS
- `operations`: PASS

NEXT_SAFE_ACTION=`PREPARE_FINAL_UX_REPORT_AND_COMMIT`
