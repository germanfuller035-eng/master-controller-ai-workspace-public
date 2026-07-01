# Transport-Readiness — Deployment Runbook

date: 2026-06-18 · additive, read-only + gated. Restart ONLY master-controller-api.

## Preflight (STOP conditions)
historical sends != 7; unknown writer; failed/dead-letter jobs; canonical integrity failure;
unexpected real commercial entities; unexpected payment; unexpected send. Safe organic Lead Hunter
drift may be auto-reconciled under the prior strict criteria.

## Backup
canonical store, queue, both send ledgers, the 7 modified runtime targets, env → before_hashes.sha256;
verify readback before continuing.

## Stage + install (10 files: 3 new + 7 modified)
Stage to /opt/master-controller/staging_tr; verify sha256 == manifest after-hashes; node --check each
.mjs; import closure (service + routes + conversations + mini_audit). Atomic install (tmp+rename).

## Activate read flags
```
CONVERSATION_READ_API=true
CUSTOMER_SUCCESS_READ_API=true
FOLLOWUP_AUTOSEND=false
# unchanged: COMMERCIAL_READ_API=true, COMMERCIAL_COMMAND_API=true, COMMERCIAL_COMMAND_C1A=true,
#            COMMERCIAL_PAYMENT_COMMAND=false, COMMERCIAL_SEND=false, SEND_ALLOWED_LIVE=OFF, AUTOSEND=BLOCKED
```
`sudo systemctl restart master-controller-api` (ONLY). No Telegram/worker/scheduler/IMAP/Caddy. No reboot.

## Verify
16 existing GET + products + lead-count + send-reconciliation + delivery-containment + conversations +
presale-health. Commands: C1-A 6 enabled, payment 403, transport absent. HTTP_500=0. send ledger 7.
