# Gate C1-A — Deployment Result

date: 2026-06-18 · branch feature/integration-wave-1-gate-c1a-v1 · base evidence HEAD f03e572
OWNER_APPROVAL=APPROVE_GATE_C1A_INTERNAL_COMMANDS_NO_SEND · FINAL: C1-A ACTIVE (no send, no payment)

## Preflight (read-only)
revision=91, leads=62, send ledger=7, queue 41/0/0, writer=1, commercial sections=8.
COMMERCIAL_READ_API=ON, COMMERCIAL_COMMAND_API=OFF before deploy. No STOP condition.

## Backup (verified)
/opt/master-controller/backups/integration_wave_1_gate_c1a_20260618T145034Z — canonical store, queue,
both ledgers, 6 modified runtime targets, env, before-hashes. Readback sha256sum -c OK (12 files).

## Deploy
- 7 backend files staged; staged sha256 == manifest; node --check OK; atomic install; target sha256
  == manifest; import closure PASS.
- Initial activation restart: API PID 13717→15536, NRestarts 0, health 200.
- TWO latent bugs in commands._apply found by the production E2E (arg order; replay revision bump);
  fixed; service.mjs redeployed (target 66733aca); API PID 15536→16053, NRestarts 0, health 200.
- Restarted ONLY master-controller-api each time. Telegram(7757)/worker(620)/caddy untouched. No reboot.

## Flags after activation
```
COMMERCIAL_READ_API=ON  COMMERCIAL_COMMAND_API=ON  COMMERCIAL_COMMAND_C1A=ON
COMMERCIAL_PAYMENT_COMMAND=OFF  COMMERCIAL_SEND=OFF  AUTOSEND=BLOCKED  SEND_ALLOWED_LIVE=OFF
```

## Read verification
16 commercial GET valid, HTTP_500=0. products 18 (2/7/9), Mini Audit ACTIVE 10000 ₽.
lead-count: 62/52/10 (rejected 9 + waiting_reply 1). send-recon: authoritative 7, unauthorized 0,
unknown 0. integration-status: c1aCommandsEnabled=true, paymentCommandEnabled=false, sendCapability NONE.

## Command safety
no-auth 401; service token 401; payment 403 FEATURE_DISABLED (paymentCommand OFF).
C1A_COMMANDS_ENABLED=6, PAYMENT_COMMANDS_ENABLED=0, SEND_COMMANDS_ENABLED=0.

## TEST_ONLY no-send E2E
rev 91→97 (6 entities); idempotent replay no bump; TEST_ONLY excluded from KPIs; send ledger
unchanged (7); 0 payments; 0 SMTP; Telegram poller 1; IMAP read-only. PASS.

## Result
```
GATE_C1A_EXECUTION=PASS  ROLLBACK_REQUIRED=NO  ROLLBACK_EXECUTED=NO
PRODUCTION_REVISION_BEFORE=91  PRODUCTION_REVISION_AFTER=97 (6 TEST_ONLY entities only)
REAL_COMMERCIAL_ENTITIES_CREATED=0  REAL_MESSAGES_SENT=0  PAYMENT_FACTS_CREATED=0
```
