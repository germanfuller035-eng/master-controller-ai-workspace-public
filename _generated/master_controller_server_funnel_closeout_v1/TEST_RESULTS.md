# Test Results

## Server

Command:

`node tools/mater_controller_api/tests/server_connected_commercial_funnel.test.mjs`

Result:

- SERVER_FUNNEL_TESTS=PASS
- Passed: 17
- Failed: 0

Covered:

- feature flags keep live actions gated
- email classification
- dedupe
- private/local CRM records and audit events
- live snapshot apply path
- safe mail list and raw header lookup separation
- reply draft no-send behavior
- Telegram approval payload and callback
- SMTP guard behavior
- status snapshot Android visibility
- Yandex readiness private env fallback

## API Regression

Command:

`node tools/mater_controller_api/tests/run_all.mjs`

Result:

- API_REGRESSION=PASS
- Passed: 50
- Failed: 0

## Android Focused Unit Tests

Command:

`./gradlew.bat --no-daemon --offline :app:testDebugUnitTest --tests ru.dmitry.matercontroller.OwnerUiRawCodeSafetyTest --tests ru.dmitry.matercontroller.DtoMappingTest --console=plain`

Result:

- ANDROID_TESTS=PASS
- BUILD_RESULT=PASS

## Android Build

Command:

`./gradlew.bat --no-daemon --offline :app:compileDebugKotlin :app:assembleDebug --console=plain`

Result:

- ANDROID_BUILD_RESULT=PASS
