# Production Baseline V2 — Integration Wave 1 (verified live)

BASELINE_CAPTURED_AT_UTC=2026-06-18T12:18:54Z · verified read-only · DRIFT_VERDICT=EXPECTED_ORGANIC_ACTIVITY

## Canonical / queue / sends
```
CANONICAL_REVISION=90
CANONICAL_LEADS=62
HISTORICAL_SUCCESSFUL_SENDS=7        # corrected: ledger truth = 7 (NOT 8)
QUEUE_TOTAL_JOBS=41
QUEUE_COMPLETED=41
QUEUE_REVISION=146                   # monotonic counter, not a job count
QUEUE_FAILED=0
DEAD_LETTERS=0
CANONICAL_WRITER_COUNT=1
COMMERCIAL_SECTIONS=0
COMMERCIAL_ENTITIES=0
```

## Feature flags (env presence; keys absent ⇒ default OFF)
```
COMMERCIAL_READ_API=OFF
COMMERCIAL_COMMAND_API=OFF
COMMERCIAL_SEND=OFF
AUTOSEND=BLOCKED
SEND_ALLOWED_LIVE=OFF
```

## Hashes (no secret values)
```
canonical_store_sha256 = 42bec108840ca9a0039ae913f5ce1259d09a0bf5e14ee0afd3ff3ac9b19a9e0f
job_queue_sha256       = c7a2ed596d6c753aef2bd66e2ec5cdbb51ca87f9450b5ebf60f63189fa4ec01f
send_ledger_sha256     = 04fda652a15b072bbc729419022c5486746677df3d1a1d6aa07ea0527bbe321e
email_ledger_sha256    = 0c44821fbc5526d3d6af04737cb4f2c122ea653a44c74f086fd5b7c887bfee9d
api_server_index.mjs   = 5853f84f11108c2df25509df08a9a9c69109751d8b79216276b0254f48e66bac  (== manifest target_sha256_before)
telegram_index.mjs     = b7b5eea04666dbcbdb38a2b10afbaa49b8412ae5d4f39c9ddf104b60a8822dec
```

## Do-not-conflate note
queue_revision (146) ≠ total jobs (41) ≠ completed (41) ≠ historical sends (7). The old package's
"queue 28" was a 1-job rounding over the actual frozen 27; live is 41. Soak-window sends = 0;
test-only ledger entries are included in the 7 historical (they are the real ledger rows).
