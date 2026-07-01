# Test Results

## Local Checks

PASS:

```text
./gradlew.bat :app:testDebugUnitTest \
  --tests "ru.dmitry.matercontroller.OwnerUiRawCodeSafetyTest" \
  --tests "ru.dmitry.matercontroller.WorkingSalesMvpEngineTest" \
  :app:assembleDebug --no-daemon
```

PASS:

```text
./gradlew.bat :app:testDebugUnitTest \
  --tests "ru.dmitry.matercontroller.WorkingSalesMvpEngineTest" \
  --tests "ru.dmitry.matercontroller.ControlledLiveCommercialMachineTest" \
  --tests "ru.dmitry.matercontroller.ControlledCommercialDtoMappingTest" \
  --tests "ru.dmitry.matercontroller.OwnerUiRawCodeSafetyTest" \
  --tests "ru.dmitry.matercontroller.OutboundHistorySuppressionGateTest" \
  :app:assembleDebug --no-daemon
```

PASS:

```text
git diff --check
```

## Android Install

PASS:

```text
adb install -r app-debug.apk
```

## Device Smoke

PASS on Honor:

- Today
- LeadQueue
- LeadReview
- FirstTouchDraft
- QAGate
- ChannelSelect
- SendPacket
- ManualSendResult
- ReplyInbox
- ReplyDetail
- CRMWriteGate
- DealOverview
- ProductSelect
- ProductDraft
- DocumentReview
- InvoiceDraft
- PaymentGate
- History
- Safety

## Safety Counters

OUTBOUND_COUNT=0
PAYMENT_COUNT=0
PRODUCTION_DB_WRITES=0
AUTO_SEND_STATUS=OFF
PAYMENT_LIVE_STATUS=OFF
PRODUCTION_WRITE_STATUS=OFF
