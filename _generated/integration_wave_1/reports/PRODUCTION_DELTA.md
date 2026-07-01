# Integration Wave 1 — Production Delta

date: 2026-06-18 · base 34a93d9 → integration HEAD (this branch)

## Classification
```
BACKEND_RUNTIME_CHANGE_REQUIRED = YES (only if owner activates commercial API; contracts are local/offline now)
ANDROID_CHANGE_REQUIRED         = YES (0.5.0-rc1 adds read-only commercial views)
DATA_MIGRATION_REQUIRED         = YES-ADDITIVE (PREPARED_NOT_APPLIED; seven empty namespaced sections)
CONFIG_CHANGE_REQUIRED          = YES (feature flags to enable read API at Gate B)
```
This Wave delivers an OFFLINE implementation. Nothing here is wired into the production backend yet —
the new API routes/engine are local and feature-gated off. So the *minimum* production delta to run
the commercial read views is: deploy backend commercial read endpoints + apply the additive migration
+ ship Android 0.5.0-rc1. Commands and send stay off.

## Exact local changes (13 paths)
Backend/engine (new, offline): `tools/commercial_core/**` (store, lifecycle, events, readmodels, fixtures, tests).
Android (modified): build.gradle.kts (v9/0.5.0-rc1, buildConfig already on), MaterApi.kt (3 read endpoints),
MaterRepository.kt (3 cached reads), OwnerLocalization.kt (renderMoneyRu/renderValueClassRu),
MaterControllerRoot.kt (commercial route), TodayScreen.kt (entry card), OfflineAndMetadataTest.kt (version).
Android (new): core/model/CommercialDtos.kt, feature/commercial/**, test/CommercialMappingTest.kt.
Docs/migration/artifacts: `_generated/integration_wave_1/**`, `dist/integration_wave_1_android/**`.

## NOT changed
No production VPS file, no canonical store, no queue, no scheduler, no Telegram runtime, no IMAP, no
send ledger. Telegram soak untouched. Release tag v0.4.0-rc1 not moved.

## Backend production runtime files that WOULD change at Gate B (when owner activates)
`tools/mater_controller_api/src/server/index.mjs` (+commercial routes), a new
`tools/mater_controller_api/src/commercial/service.mjs` (production adapter over store_access), and the
additive store migration. These are specified in API_CONTRACT.md but NOT yet added to the production
API source in this branch — Wave 1 keeps the engine standalone to avoid touching the live API surface
before owner activation.
