# Integration Wave 1 — Runtime Boundary Audit

date: 2026-06-18 · scope: deployable backend files (tools/commercial_core/lib/*)

Static scan of every deployable backend file for forbidden patterns:

| Check | Result |
|-------|--------|
| direct canonical file write outside MC repository (writeFileSync/fs.write to store) | NONE |
| self JSON writer / second store | NONE |
| second lock / revision owner | NONE (revision bump only via the one commit seam / migration) |
| second ledger (send/approval/payment) | NONE (PROTECTED_KEYS names send_ledger only as untouchable) |
| SMTP import / nodemailer / createTransport | NONE |
| Telegram transport / sendMessage / bot token | NONE |
| email transport | NONE |
| IMAP mutation (APPEND/EXPUNGE/STORE) | NONE |
| production credentials / secrets | NONE |
| localhost / 127.0.0.1 fallback | NONE |
| hardcoded production paths | NONE (migration takes a store object; never opens a path) |
| OS module → direct production store | NONE (engines emit commands; one commit seam) |

```
DUPLICATE_CANONICAL_WRITERS=0
PARALLEL_LEDGERS=0
PARALLEL_APPROVAL_TRUTHS=0
DIRECT_SEND_PATHS_ADDED=0
DIRECT_OS_PRODUCTION_WRITES=0
TRACKED_SECRETS=0
```

Verified by `tools/commercial_core/tests/security.test.mjs` (15/15) plus a grep boundary sweep over
`tools/commercial_core/lib/` (no forbidden patterns). The migration module is path-free: it mutates a
caller-supplied store object only, so it cannot touch a production file by construction.
