# Gate C1-C — Transport Prohibitions (PROHIBITED)

date: 2026-06-18 · GATE_C1C_STATUS=PROHIBITED

Gate C1-C is any client-facing transport. It is NOT part of C1-A or C1-B and is PROHIBITED until a
separate, explicit owner decision with its own gate, evidence, and safety review.

## Prohibited operations
- Email send to a client (SMTP).
- Telegram client message send.
- Follow-up send (any channel).
- Autosend / live send.

## Enforced controls (all currently active)
```
COMMERCIAL_SEND=false
AUTOSEND=BLOCKED
SEND_ALLOWED_LIVE=OFF
EMAIL_REAL_SEND_ENABLED=false
MATER_NO_SEND=true
```
- The commercial engine has `sendCapability: NONE`; no SMTP/Telegram transport import exists in the
  C1-A path.
- The Mini Audit send path (`performApprovedSend`) is unchanged and still requires owner approval +
  real_send_enabled, and uses a mock adapter under MATER_NO_SEND. It is NOT part of Gate C1.
- Android shows no send controls on C1-A screens; a persistent badge states "Клиенту ничего не
  отправляется".

## Verified this gate
real_messages_sent=0, smtp_calls=0, telegram_client_messages=0 across deploy + TEST_ONLY E2E.
Send ledger unchanged at 7. Email ledger unchanged at 63.

## To ever change this
A new explicit owner approval naming transport, with: per-recipient owner confirmation, opt-out/consent
checks (consent_opt_out_policy), proof capture into the single send ledger, rate limits, and a separate
runbook + rollback. Not in scope here.

```
GATE_C1C_STATUS=PROHIBITED
```
