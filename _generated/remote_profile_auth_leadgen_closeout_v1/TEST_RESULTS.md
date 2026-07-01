# Test Results

Local checks:
- `git diff --check`: PASS
- `tools/mater_controller_api/tests/outreach_queue.test.mjs`: PASS, 10/10
- `tools/mater_controller_api/tests/owner_safe_autonomy_runtime.test.mjs`: PASS, 3/3
- Android focused unit tests:
  - `OwnerUiRawCodeSafetyTest`: PASS
  - `DtoMappingTest`: PASS
- Android debug build: PASS

Server/API checks:
- `GET /api/v1/health`: PASS
- Unauthenticated commercial queue returns authorization error, not missing route: PASS
- Authenticated commercial queue read: PASS
- Authenticated lead discovery start: PASS
- Authenticated draft save: PASS

Safety checks:
- Live send without separate approval: BLOCKED
- Payment execution: OFF
- Production database write: OFF
- Mass send: OFF
