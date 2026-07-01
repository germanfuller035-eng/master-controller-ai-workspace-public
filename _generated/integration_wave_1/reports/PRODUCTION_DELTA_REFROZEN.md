
## BASELINE V2 ADDENDUM (2026-06-18, post drift forensics)
The deployable bundle is UNCHANGED (SOURCE_HEAD=1286c1c, MANIFEST_VERSION=3,
MANIFEST_SHA256=1d8e7a77d1fe7e16a23147620e1d75c4a3e99c1da65cff9b6ca6524a2e280e11). Only the
expected production baseline at execution time moves from v1 to v2 after verified organic drift:
```
REVISION_BEFORE   66 → 90
LEADS_BEFORE      50 → 62
HISTORICAL_SENDS  7  → 7   (UNCHANGED; prior "8" was a metric error — ledger truth is 7)
QUEUE_BASELINE    "28 completed" → 41 jobs COMPLETED, queue_revision 146, failed 0, dead_letters 0
COMMERCIAL_SECTIONS_BEFORE = 0 · COMMERCIAL_ENTITIES_BEFORE = 0
```
After migration (additive contract, confirmed by dry-run from a synthetic rev90 fixture):
```
REVISION 90 → 91 · 8 empty commercial sections · 0 commercial entities
leads/send-ledger/queue UNCHANGED · idempotent · reverse restores rev90
```
Production target server/index.mjs verified live = 5853f84f… == manifest target_sha256_before (deploy
target unmodified since freeze). DRIFT_VERDICT=EXPECTED_ORGANIC_ACTIVITY. Deployment NOT executed —
awaits owner Gate B reapproval bound to baseline v2.
SOURCE_BUNDLE_CHANGED=NO · MANIFEST_CHANGED=NO · ONLY_BASELINE_EVIDENCE_CHANGED=YES · EXECUTION_TIME_CODE_AUTHORING=NO
