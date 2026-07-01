# Provider Failure Restart Recovery V1

SESSION_NAME=AI_SYSTEM_HARDENING_DISASTER_RECOVERY_AND_RELEASE_V1
SCOPE=SYNTHETIC_ONLY
EXTERNAL_PROVIDER_CALLED=NO

## Provider Failure

The provider failure simulation uses `tests/fixtures/hardening/synthetic_provider_failure.json`. It models an unavailable primary provider and confirms local synthetic fallback without external requests or paid provider calls.

Expected output:

```text
PROVIDER_FAILURE_RESULT=PASS
FALLBACK_PROVIDER_STATUS=LOCAL_SYNTHETIC_AVAILABLE
EXTERNAL_REQUEST_SENT=NO
PAID_PROVIDER_CALLED=NO
```

## Restart Recovery

The restart recovery simulation uses `tests/fixtures/hardening/synthetic_restart_state.json`. It verifies that blocked pending actions survive restart without replaying approvals, outbound sends, payments, or production writes.

Expected output:

```text
RESTART_RECOVERY_RESULT=PASS
OUTBOUND_REPLAYED=NO
PAYMENTS_REPLAYED=NO
PRODUCTION_WRITES_REPLAYED=NO
```

## Owner Control

Provider recovery and restart recovery may surface status to the owner. They may not promote a blocked action to executed state without a separate owner gate.
