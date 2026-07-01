# Test Results

Commands run:

```text
git diff --check
./gradlew.bat :app:testDebugUnitTest --tests ru.dmitry.matercontroller.WorkingSalesMvpEngineTest --tests ru.dmitry.matercontroller.ControlledLiveCommercialMachineTest --tests ru.dmitry.matercontroller.ControlledCommercialDtoMappingTest --tests ru.dmitry.matercontroller.OwnerUiRawCodeSafetyTest --tests ru.dmitry.matercontroller.OutboundHistorySuppressionGateTest :app:assembleDebug --no-daemon
adb -s <HONOR_DEVICE> install -r apps/mater_controller_android/app/build/outputs/apk/debug/app-debug.apk
```

Results:
- DIFF_CHECK=PASS
- FOCUSED_UNIT_TESTS=PASS
- ANDROID_ASSEMBLE_DEBUG=PASS
- ANDROID_INSTALL_RESULT=PASS
- DEVICE=Honor ALT-LX1

Device smoke:
- Local mode opened after reinstall.
- Five-tab bottom navigation verified.
- Deals route verified after reinstall.
- Product, document, invoice, payment, history and safety route verified after reinstall.
- History CTA spacing defect verified fixed after final install.

No-send regression:
- AUTO_SEND_STATUS=OFF
- LIVE_EMAIL_SEND_STATUS=OFF
- LIVE_SOCIAL_SEND_STATUS=OFF
- OUTBOUND_COUNT=0
- PAYMENT_COUNT=0
- PRODUCTION_DB_WRITES=0
