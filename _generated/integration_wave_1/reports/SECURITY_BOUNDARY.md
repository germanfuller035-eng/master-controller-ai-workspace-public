# Integration Wave 1 — Security Boundary

date: 2026-06-18 · suite tools/commercial_core/tests/security.test.mjs (15 checks, all PASS)

## Static + behavioral boundary proofs
| Check | Result |
|-------|--------|
| no nodemailer/SMTP import | SEC1 PASS |
| no Telegram outbound send | SEC2 PASS |
| no fetch/http/network | SEC3 PASS |
| no IMAP flag mutation (APPEND/EXPUNGE/STORE) | SEC4 PASS |
| no direct fs write to prod store / ledger | SEC5 PASS |
| no parallel ledger naming | SEC6 PASS |
| exactly one commit() writer (store.mjs) | SEC7 PASS |
| no bank/credential/secret literals | SEC8 PASS |
| fixtures synthetic only (example.invalid) | SEC9 PASS |
| no real ДКБИ/DKBI/prod ids in fixture values | SEC10 PASS |
| fixtures carry SYNTHETIC marker | SEC11 PASS |
| offers send_capability NONE | SEC12 PASS |
| invoices real_issuance DISABLED | SEC13 PASS |
| bank_integration NONE | SEC14 PASS |
| missing idempotency blocked at writer | SEC15 PASS |

## Boundary summary
```
UNAUTHENTICATED_COMMAND=BLOCKED (API contract: authenticated device required)
MISSING_REVISION / STALE_REVISION=409 (commit() revision guard; NEG6)
MISSING_IDEMPOTENCY=BLOCKED (commit() guard; NEG7/SEC15)
DIRECT_OS_WRITE=BLOCKED (no fs write in lib; one commit seam)
SEND_TRANSPORT=UNAVAILABLE · SMTP=UNAVAILABLE · TELEGRAM_CLIENT_SEND=UNAVAILABLE
SECRET_ACCESS=UNAVAILABLE · BANK_CREDENTIAL_ACCESS=UNAVAILABLE
REAL_DATA_FIXTURE=BLOCKED · PRODUCTION_QUEUE_ACCESS=BLOCKED · CANONICAL_FILE_DIRECT_ACCESS=BLOCKED
SECOND_WRITER_PATHS=0 · PARALLEL_LEDGER_PATHS=0 · DIRECT_SEND_PATHS_ADDED=0
```
