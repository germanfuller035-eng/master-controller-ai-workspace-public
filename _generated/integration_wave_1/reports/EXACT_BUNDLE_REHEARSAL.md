# Integration Wave 1 — Exact-Bundle Local Rehearsal

date: 2026-06-18 · suite tools/commercial_core/tests/route_security.test.mjs (20/20 PASS)
EXACT_DEPLOYABLE_BUNDLE_USED=YES (drives the real production registrar commercial/routes.mjs + adapter
commercial/service.mjs against a synthetic store via MATER_STORE_PATH — no mock wiring divergence).

## What was exercised
The actual `registerCommercialRoutes` from the deployable source registers onto a captured router; the
real `service.mjs` adapter resolves reads/commands through the real `updateStoreWithRevision` seam
pointed at a temp synthetic store. No express boot needed; no network, no send.

## Results (mapped to R0–R15 intent)
- 16 read endpoints + 7 command endpoints registered (RS1–RS2).
- Read flag OFF → FEATURE_DISABLED 403 (RS3); flag ON → ok envelope (RS4).
- Commercial collections empty; product catalog readable (Mini Audit); finance UNKNOWN not zero;
  unknown id → 404 (RS5–RS8).
- Command flag OFF → all 7 return FEATURE_DISABLED; store revision unchanged (66); no commercial
  sections created; existing leads untouched (RS9–RS12).
- Adapter boundary: uses single writer seam; no direct fs write / second store; no SMTP; no Telegram
  transport; no IMAP mutation; no localhost fallback; sendCapability NONE; error envelope matches MC
  (RS13–RS20).

```
EXACT_DEPLOYABLE_BUNDLE_USED=YES
READ_ENDPOINTS_VERIFIED=16
COMMAND_ENDPOINTS_DISABLED=7
COMMAND_MUTATIONS=0
QUEUE_WRITES=0
MESSAGES_SENT=0
SMTP_CALLS=0
ROLLBACK=PASS (migration reverse proven in MIGRATION_DRY_RUN; runtime files were absent → removable)
```

Note: the earlier local_rehearsal.mjs (engine-level R0–R10) remains green (19/19); this exact-bundle
rehearsal additionally proves the REAL route+adapter source behaves identically.
