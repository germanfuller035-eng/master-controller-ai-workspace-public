# Production Writer & Send-Path Audit — Integration Wave 1 (read-only)

date: 2026-06-18

## Result
CANONICAL_WRITER_COUNT=1 · ACTIVE_DIRECT_FILE_WRITERS=0 · ACTIVE_LEGACY_WRITERS=0
ACTIVE_PARALLEL_SEND_PATHS=0 · ACTIVE_PARALLEL_LEDGERS=0
TELEGRAM_API_ONLY=YES · LEAD_HUNTER_API_PROMOTION_ONLY=YES

## Running node processes
| PID | user | exec | role | canonical write? |
|---|---|---|---|---|
| 615 | masterctl | src/server/index.mjs | API (the single writer) | YES (sole) |
| 620 | mcworker | src/worker/index.mjs | worker, MATER_API_BASE 127.0.0.1:8787 | NO (API-only) |
| 7757 | mctelegram | telegram_gateway/api_only/index.mjs | telegram, MATER_API_BASE sslip.io | NO (API-only) |

## Isolation evidence
- Canonical dir /opt/master-controller/canonical = 0750 owner masterctl. Worker/telegram run as
  mcworker/mctelegram and their units have empty ReadWritePaths → cannot write the store directly.
- Discovery (master-controller-discovery.service, User=mcworker) promotes leads through
  MATER_API_BASE=http://127.0.0.1:8787/api/v1 — API path, not a direct file write.
- Worker types (MATER_WORKER_TYPES) = HEALTH_CHECK, METRICS_REFRESH, BACKUP_VERIFY, LEAD_DISCOVERY,
  LEAD_VERIFY, LEAD_SCORE, AUDIT_GENERATE, DRAFT_GENERATE, FOLLOWUP_PLAN, REPLY_DRAFT_GENERATE —
  NO SEND/EMAIL/SMTP worker type. worker.env contains no SEND/EMAIL/SMTP token.
- Send ledgers (outbound_send_ledger.jsonl, outbound_email_ledger.jsonl) frozen read-only mtime
  2026-06-16 07:10 → no active second ledger writer.
- No passwordless-cron writer to the store; lsof shows no stale open handle.

## Checks 1–10
1 single writer ✓ · 2 telegram no direct write ✓ · 3 telegram API-only ✓ · 4 worker via API ✓ ·
5 lead hunter via API ✓ · 6 no workstation writer ✓ · 7 legacy telegram/workers replaced by
api_only units ✓ · 8 no direct-write cron ✓ · 9 no emergency scripts in active units ✓ ·
10 no second send ledger ✓.
