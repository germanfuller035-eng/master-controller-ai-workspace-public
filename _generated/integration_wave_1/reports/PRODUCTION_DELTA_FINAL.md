# Integration Wave 1 — Production Delta (FINAL / FROZEN)

date: 2026-06-18 · PRODUCTION_DELTA_FULLY_MATERIALIZED=YES · EXECUTION_TIME_SOURCE_EDITING=NO
manifest: _generated/integration_wave_1/data/deployment_manifest.json (11 deployable entries)

Every production change exists in Git and passed exact-bundle rehearsal. Nothing is authored at
deployment time. No `TBD` / `approx` / `and others` / `create at deployment`.

## BACKEND_RUNTIME (4 files — new, were ABSENT)
- tools/commercial_core/lib/store.mjs (7933b997…) — single-writer seam mirror.
- tools/commercial_core/lib/lifecycle.mjs (70c3db7b…) — lifecycle orchestration.
- tools/commercial_core/lib/events.mjs (fa70765f…) — event envelope.
- tools/commercial_core/lib/readmodels.mjs (47efb17b…) — owner read models.

## ROUTE_WIRING (3 files — materialized this pass)
- tools/mater_controller_api/src/commercial/service.mjs (98ae0dfa…, NEW) — production adapter over the
  single canonical writer `updateStoreWithRevision`; reads project namespaced sections; commands run
  inside the one writer with revision+idempotency; no send/SMTP/Telegram/IMAP/localhost path.
- tools/mater_controller_api/src/commercial/routes.mjs (95a1e5a2…, NEW) — 16 read + 7 command routes,
  feature-gated; read OFF → FEATURE_DISABLED, command OFF → FEATURE_DISABLED with zero mutation.
- tools/mater_controller_api/src/server/index.mjs (5853f84f… → 5e8c9e26…) — ADDITIVE: 1 import +
  `registerCommercialRoutes(r, {...})` before `app.use(API_BASE, r)`. Reason: register the routes on
  the existing router using existing auth/envelope. Rollback = restore the backed-up index (5853f84f).

## MIGRATION (2 files)
- tools/commercial_core/lib/migration.mjs (2d99bcb2…) — executable additive/idempotent/reversible ref.
- _generated/integration_wave_1/migrations/iw1_commercial_sections_v1.json — spec (8 sections).
Reason: create the 8 empty namespaced sections; revision +1; existing keys untouched.

## CONFIG (3 keys — no values committed)
COMMERCIAL_READ_API, COMMERCIAL_COMMAND_API, COMMERCIAL_SEND. Initial at Gate B: read ON (after
approval), command OFF, send OFF. Reason: gate the new surface; default all OFF until explicitly set.

## ANDROID (2 artifacts)
MasterController-release-v0.5.0-rc1.apk (53f7b609…) + .aab (150e44d0…), signer 11038fca… == rc5.
Reason: ship the read-only commercial owner views; installed over rc5 after backend read API verified.

## NO_DEPLOY (excluded from the bundle)
All tests, reports, fixtures, dry-run/rehearsal harnesses, the offline OS engines beyond the 4 runtime
files, Telegram/IMAP runtime, secrets. Counts: unrelated=0, telegram=0, imap=0, secret=0, test=0, report=0.
