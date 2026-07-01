# Test Results

## Server

Command:

```text
node tools/mater_controller_api/tests/server_connected_commercial_funnel.test.mjs
```

Result:

```text
14 passed
```

Covered:

- feature flags keep live actions gated;
- email classification;
- dedupe by message id;
- private/local CRM funnel write;
- audit event writing;
- reply draft and quality block;
- Telegram approval card payload;
- SMTP blocked without owner approval;
- exact approved packet allowed in dry-run only;
- changed text blocks;
- expired packet blocks;
- duplicate packet blocks;
- stop request and bounce block;
- status snapshot keeps live counters at zero.
- Yandex readiness uses communication monitor fallback env files.

Command:

```text
node tools/mater_controller_api/tests/run_all.mjs
```

Result:

```text
50 passed, 0 failed
```

Store integrity:

```text
lead store unchanged
send ledger unchanged
email ledger unchanged
```

## Android

Command:

```text
.\gradlew.bat :app:testDebugUnitTest --tests ru.dmitry.matercontroller.DtoMappingTest --offline --no-daemon --console=plain
```

Result:

```text
BUILD SUCCESSFUL
```

Command:

```text
.\gradlew.bat :app:assembleDebug --offline --no-daemon --console=plain
```

Result:

```text
BUILD SUCCESSFUL
```

Install:

```text
adb -s AMSKBB4914919475 install -r app-debug.apk
```

Result:

```text
Success
```

Launch smoke:

```text
MainActivity focused, process alive, no fresh FATAL EXCEPTION in checked logcat slice.
```

## Readiness Recheck

Command:

```text
node --input-type=module -e "<safe statusSnapshot fields only>"
```

Result:

```text
smtp_configured=true
missing_keys=[]
auto_reply=OFF
mass_send=OFF
payment_live=OFF
production_db_write=OFF
outbound_count=0
```
