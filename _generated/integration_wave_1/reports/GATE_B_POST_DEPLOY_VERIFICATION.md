# Gate B — Post-Deploy Verification (read-only, live)

date: 2026-06-18T12:52Z · executed against production after read API activation.

## Runtime health
```
API_PID=13717  NRestarts=0  ActiveState=running  health=200 ok:true
ERR_MODULE_NOT_FOUND_COUNT=0  CWD_PATH_FAILURES=0  API_CRASH_LOOP=NO
REBOOT_REQUIRED=NO  SERVICES_RESTARTED=1 (api only)  ACTUAL_DOWNTIME≈2s
```

## 16 read endpoints (worker service token)
| endpoint | HTTP |
|---|---|
| /commercial/summary | 200 |
| /commercial/integration-status | 200 |
| /opportunities | 200 |
| /opportunities/:id (absent) | 404 NOT_FOUND |
| /products | 200 |
| /products/:id (absent) | 404 NOT_FOUND |
| /offers | 200 |
| /offers/:id (absent) | 404 NOT_FOUND |
| /deals | 200 |
| /deals/:id (absent) | 404 NOT_FOUND |
| /delivery/handoffs | 200 |
| /delivery/projects | 200 |
| /delivery/projects/:id (absent) | 404 NOT_FOUND |
| /finance/summary | 200 |
| /finance/invoices | 200 |
| /finance/invoices/:id (absent) | 404 NOT_FOUND |

```
READ_ENDPOINTS_VALID=16/16  HTTP_500_COUNT=0
COMMERCIAL_COLLECTIONS_EMPTY=YES (opportunities/offers/deals/handoffs/projects/invoices = 0)
PRODUCTS_TOTAL=18  ACTIVE=2  DRAFT=7  PLANNED=9  MINI_AUDIT_PRICE=10000
UNKNOWN_RENDERED_AS_ZERO=NO (commercial/summary: confirmed_payments=null class UNKNOWN; profit class UNKNOWN)
integration-status: commercialApiEnabled=true, commercialCommandsEnabled=false, sendCapability=NONE, singleWriter=true
```

## 7 command endpoints (must be disabled, zero mutation)
- Without owner device token → HTTP 401 UNAUTHORIZED (requireAuth) — outer guard.
- In-process probe with auth bypassed (synthetic owner), command flag OFF →
  403 FEATURE_DISABLED on all 7; ENGINE_REACHED=false.
```
COMMAND_ENDPOINTS_DISABLED=7/7  COMMAND_MUTATIONS=0  COMMAND_REVISION_CHANGES=0
QUEUE_WRITES=0  EVENTS_EMITTED=0  COMMERCIAL_ENTITIES_CREATED=0  MESSAGES_SENT=0  SMTP_CALLS=0
```
14 synthetic POSTs total (7 malformed-JSON rejected pre-gate by express.json + 7 valid → 401);
store revision stayed 91, store/queue/ledger sha256 unchanged, send ledger 7 lines.

## Cross-system invariants
```
CANONICAL_WRITER_COUNT=1  CANONICAL_LEADS=62  HISTORICAL_SENDS=7
QUEUE_COMPLETED=41  QUEUE_FAILED=0  DEAD_LETTERS=0
TELEGRAM_RESTARTED=NO  TELEGRAM_POLLER_COUNT=1  GETUPDATES_CONFLICTS=0
IMAP_MODE=stage1_readonly  IMAP_FLAG_MUTATIONS=0
AUTOSEND=BLOCKED  SEND_ALLOWED_LIVE=OFF  EMAIL_REAL_SEND_ENABLED=false  MATER_NO_SEND=true
COMMERCIAL_READ_API=ON  COMMERCIAL_COMMAND_API=OFF  COMMERCIAL_SEND=OFF
```

ROLLBACK_REQUIRED=NO. All invariants hold.
