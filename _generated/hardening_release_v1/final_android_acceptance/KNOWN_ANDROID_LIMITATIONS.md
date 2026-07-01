# Final Android Acceptance Known Limitations

FINAL_ANDROID_ACCEPTANCE_STATUS=BLOCKED

- Physical device was reachable by ADB but remained locked behind keyguard with PIN required.
- Owner-visible Android smoke was not executed because the app activity was hidden behind keyguard.
- Route was healthy after restoring only `adb reverse tcp:18089 tcp:10809`; Android global proxy was already set to `127.0.0.1:18089`.
- Android source, androidTest runner files, and control/exec plan assets did not change after UX/device validation, so no build or APK install was required.
- Contract-only AI-system layers after UX are not Android APK failures.
- No app data was cleared.
- No PIN was guessed or entered.
- No screenshots were captured to avoid unnecessary lock-screen evidence.

NEXT_OWNER_ACTION=UNLOCK_DEVICE_AND_RERUN_FINAL_ANDROID_ACCEPTANCE
