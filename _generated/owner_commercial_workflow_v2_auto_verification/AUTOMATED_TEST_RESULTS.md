# Automated Test Results

## Commands

```text
./gradlew.bat :app:testDebugUnitTest --tests "ru.dmitry.matercontroller.WorkingSalesMvpEngineTest" --tests "ru.dmitry.matercontroller.ControlledLiveCommercialMachineTest" --tests "ru.dmitry.matercontroller.ControlledCommercialDtoMappingTest" --tests "ru.dmitry.matercontroller.OwnerUiRawCodeSafetyTest" --tests "ru.dmitry.matercontroller.OutboundHistorySuppressionGateTest" :app:assembleDebug --no-daemon --max-workers=1 "-Dkotlin.compiler.execution.strategy=in-process"
```

## Result

- FOCUSED_UNIT_TESTS=PASS
- OWNER_VISIBLE_WORDING_SCAN_TEST=PASS
- NO_SEND_REGRESSION_TEST=PASS
- ANDROID_BUILD_RESULT=PASS
- APK=apps/mater_controller_android/app/build/outputs/apk/debug/app-debug.apk

## Coverage

- Lead queue/manual site input route.
- Weak source does not become a fake product fact without owner correction.
- First-touch draft and quality gate.
- Owner override for manual packet.
- Channel selection and local packet route.
- Outbound history/contact restriction gate.
- Owner-visible raw code and forbidden wording scan.
