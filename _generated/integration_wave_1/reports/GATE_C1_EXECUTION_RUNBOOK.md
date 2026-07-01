# Gate C1 — Execution Runbook (PREPARED — NOT EXECUTED)

date: 2026-06-18 · GATE_C1_APPROVED=NO · run ONLY under a future separate owner gate.
All steps below are for the operator AT Gate C1; nothing here is executed in this pass.

## Preconditions (abort if any fails)
- Fresh owner approval token bound to a captured baseline (revision/leads/ledger/queue).
- Gate B read API is live and healthy; 8 commercial sections present and EMPTY.
- Verified backup created (same procedure as Gate B BLOCK C); rollback assets complete.
- Synthetic E2E on a byte-copy fixture passes the full chain.

## C1-A activation (safe internal commands; payment stays gated)
1. Capture live baseline: revision, leads, send ledger lines (=7), queue total/failed/dead.
2. Backup canonical store + queue + ledgers → before_hashes.sha256; verify readback.
3. Set in /etc/master-controller/master-controller.env:
   ```
   COMMERCIAL_READ_API=true
   COMMERCIAL_COMMAND_API=true   # C1-A
   COMMERCIAL_SEND=false         # unchanged
   ```
   Keep EMAIL_REAL_SEND_ENABLED=false, MATER_NO_SEND=true.
4. `sudo systemctl restart master-controller-api` (ONLY service). No reboot.
5. Verify: read endpoints still 200; commands 1–6 now reachable with owner token; command 7
   (payment) MUST still be refused until C1-B (gate it in code/flag, not just convention).
6. Owner-driven synthetic-but-real single opportunity→offer→decision on a TEST lead; verify
   revision bumps by exactly the number of commits, idempotent replays add nothing, leads/ledger
   unchanged, queue unchanged, SMTP calls 0.

## C1-B activation (financial FACT — separate confirmation)
7. Only after C1-A observation. Add the payment-evidence gate (double confirmation + evidenceType +
   evidenceReference required). Activate payment route.
8. Verify recordPayment writes finance.payments + flips invoice→PAID with classification=FACT,
   confidence=OWNER_CONFIRMED; no send; ledger unchanged.

## Hard invariants throughout
```
SEND_CAPABILITY=NONE  AUTOSEND=BLOCKED  COMMERCIAL_SEND=false  SMTP_CALLS=0
CANONICAL_WRITER_COUNT=1  TELEGRAM_POLLER_COUNT=1  HISTORICAL_SENDS=7 (unchanged)
QUEUE_FAILED=0  DEAD_LETTERS=0  UNKNOWN_NEVER_COERCED_TO_ZERO=YES
```

## Restart scope
ONLY master-controller-api. Telegram/worker/scheduler/IMAP/Caddy untouched. No reboot.
