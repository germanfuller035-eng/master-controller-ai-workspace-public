# Gate C1-A — Deployment Runbook

date: 2026-06-18 · base evidence HEAD f03e572 · branch feature/integration-wave-1-gate-c1a-v1
OWNER_APPROVAL=APPROVE_GATE_C1A_INTERNAL_COMMANDS_NO_SEND

## Scope
Additive backend change + granular command activation. 7 backend files (1 new + 6 modified),
config flags. Restart ONLY master-controller-api. No Telegram/worker/scheduler/IMAP/Caddy restart,
no reboot. Android RC2 is owner-installed manually.

## Preflight (read-only; STOP conditions)
- revision=91 (or safely reconciled organic Lead Hunter drift), leads>=62, send ledger=7,
  queue failed=0, dead letters=0, writer count=1.
- COMMERCIAL_READ_API=ON, COMMERCIAL_COMMAND_API=OFF before deploy.
- STOP if: send ledger>7, unknown writer, direct file write, failed/dead-letter jobs,
  commercial entities unexpectedly present, canonical integrity fail.

## Backup (timestamped)
Backup canonical store, the 8 commercial sections, queue, both send ledgers, the 6 runtime targets
being modified, API config + env, current Android artifact metadata, before-hashes, rollback commands.
Verify readback (sha256sum -c) before continuing.

## Stage + install (exact, atomic)
- Stage the 7 backend files to a staging dir; verify sha256 == manifest after-hashes.
- node --check each .mjs; import-closure + snapshot check.
- Atomic install (tmp+rename) into the exact target paths.

## Migration
None. The 8 commercial sections already exist (Gate B, revision 91). No schema change.

## Activate flags (granular; payment + send stay OFF)
```
COMMERCIAL_READ_API=true
COMMERCIAL_COMMAND_API=true
COMMERCIAL_COMMAND_C1A=true
COMMERCIAL_PAYMENT_COMMAND=false
COMMERCIAL_SEND=false
AUTOSEND=BLOCKED  SEND_ALLOWED_LIVE=OFF  (EMAIL_REAL_SEND_ENABLED=false, MATER_NO_SEND=true)
```
Restart ONLY master-controller-api. Record API PID before/after, NRestarts, downtime.

## Post-deploy verification
- 16 commercial GET endpoints valid; product catalog (18, 2/7/9, Mini Audit 10000 ₽);
  lead-count + send reconciliation read models; integration-status shows c1aCommandsEnabled=true,
  paymentCommandEnabled=false, sendCapability NONE.
- Negative command checks: no-auth blocked (401); payment → FEATURE_DISABLED; stale revision → 409;
  duplicate idempotency → no duplicate.
- TEST_ONLY no-send E2E (opportunity→offer→decision→handoff→project→invoice draft); verify
  revision increments, idempotency, no send, no payment, Mini Audit price 10000.
- Invariants: writer=1, sends=7, queue failed=0, dead letters=0, Telegram poller=1, IMAP read-only.
