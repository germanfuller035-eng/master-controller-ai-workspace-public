# Test results

## Focused unit/static tests

Command:

`apps/mater_controller_android/gradlew.bat :app:testDebugUnitTest --tests "ru.dmitry.matercontroller.WorkingSalesMvpEngineTest" --tests "ru.dmitry.matercontroller.ControlledLiveCommercialMachineTest" --tests "ru.dmitry.matercontroller.ControlledCommercialDtoMappingTest" --tests "ru.dmitry.matercontroller.OwnerUiRawCodeSafetyTest" --tests "ru.dmitry.matercontroller.OutboundHistorySuppressionGateTest"`

Result:

`BUILD SUCCESSFUL`

Coverage intent:

- site analysis does not fabricate facts;
- controlled commercial DTO mapping;
- send approval, transport, CRM, payment and autonomy gates;
- outbound suppression/history gate;
- owner-visible raw-code and commercial jargon guard.

## Android build

Command:

`apps/mater_controller_android/gradlew.bat :app:assembleDebug --no-daemon`

Result:

`BUILD SUCCESSFUL`

## Install and launch

Device:

`Honor ALT-LX1 AMSKBB4914919475`

Install:

`adb -s AMSKBB4914919475 install -r app\build\outputs\apk\debug\app-debug.apk`

Result:

`Success`

Launch:

`adb -s AMSKBB4914919475 shell monkey -p ru.dmitry.matercontroller.debug -c android.intent.category.LAUNCHER 1`

Result:

`Events injected: 1`

## Safety counters

OUTBOUND_COUNT=0
PAYMENT_COUNT=0
PRODUCTION_DB_WRITES=0
EMAIL_CLIENT_OPENED_DURING_SMOKE=NO
AUTO_SEND_STATUS=OFF
PAYMENT_STATUS=OFF
PRODUCTION_WRITE_STATUS=OFF
