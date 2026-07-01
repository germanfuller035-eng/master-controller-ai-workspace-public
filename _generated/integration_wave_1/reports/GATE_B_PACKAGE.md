# Integration Wave 1 — Gate B Package

date: 2026-06-18 · branch feature/integration-wave-1-commercial-core-v1 · GATE_B_APPROVED=NO · DEPLOYMENT=NOT_EXECUTED

## REFREEZE after B0 halt (self-contained runtime) — SUPERSEDES the readiness block below
The first Gate B execution HALTED at B0: the deployable backend imported product_os/revenue_os libs +
data that were not in the manifest and absent on production (ERR_MODULE_NOT_FOUND risk) and used
process.cwd()-relative paths. FIXED this pass:
- commercial runtime is now self-contained: `product_catalog_runtime.mjs` + a deterministic
  `runtime_data/product_catalog.runtime.json` snapshot, resolved via import.meta.url (no cwd, no
  cross-OS import). lifecycle.mjs + service.mjs rewired.
- import-closure scanner (runtime_closure_scan.mjs): CLOSURE_OK — unresolved=0, crossOS=0, cwd=0, absWorkspace=0.
- clean-tree production-like rehearsal (12/12): isolated tree, full repo absent, no worktree fallback,
  ERR_MODULE_NOT_FOUND=0, cwd-path failures=0, read models + migration execute from the API cwd.
- DEPLOYMENT_MANIFEST v3 = 13 deployable entries (4 backend + 1 runtime adapter + 1 runtime data +
  3 wiring + 2 migration + 2 Android); FULL_IMPORT_CLOSURE_IN_MANIFEST=YES; EXECUTION_TIME_CODE_AUTHORING=NO.
- Commercial suite 193 assertions green; Product/Revenue OS parity intact.
Execution gates: OWNER_APPROVAL + SOURCE_HEAD_MATCH + WORKTREE_CLEAN + MANIFEST_HASH_MATCH +
FULL_IMPORT_CLOSURE + PRODUCTION_LIKE_REHEARSAL(PASS) + BACKUP_VERIFIED + COMMAND_API_OFF + SEND_OFF.
SOAK=OPTIONAL_OBSERVATION, DEPLOYMENT_BLOCKED_BY_SOAK=NO. See PRODUCTION_DELTA_REFROZEN.md +
PRODUCTION_LIKE_BUNDLE_REHEARSAL.md.

---
## TECHNICAL READINESS (2026-06-18 readiness pass) — COMPLETE
```
SOURCE_COMMIT=f27972a + readiness commits (this pass)
DEPLOYMENT_MANIFEST=_generated/integration_wave_1/data/deployment_manifest.json
BACKEND_RUNTIME_FILES=4 (commercial_core/lib: store, lifecycle, events, readmodels)
ROUTE_WIRING_FILES=3 (commercial/service.mjs, commercial/routes.mjs, server/index.mjs additive edit)
PRODUCTION_DELTA_FULLY_MATERIALIZED=YES (all wiring in Git; EXECUTION_TIME_CODE_AUTHORING=NO)
MIGRATION_FILES=2 (commercial_core/lib/migration.mjs + iw1_commercial_sections_v1.json)
CONFIG_KEYS=COMMERCIAL_READ_API, COMMERCIAL_COMMAND_API, COMMERCIAL_SEND
ANDROID_APK=dist/integration_wave_1_android/MasterController-release-v0.5.0-rc1.apk (sha 53f7b609…, signer 11038fca… == rc5)
ANDROID_AAB=dist/integration_wave_1_android/MasterController-release-v0.5.0-rc1.aab (sha 150e44d0…)
WHOLE_REPOSITORY_DEPLOYMENT=NO (0 telegram/imap/secret/test/report files in manifest)

MIGRATION_DRY_RUN=PASS (20/20; additive, idempotent, rollback restores baseline, real entities 0)
LOCAL_DEPLOYMENT_REHEARSAL=PASS (19/19; 9 reads ok+empty, 7 commands disabled, 0 mutation/send)
PRODUCTION_COMPATIBILITY_PREFLIGHT=PASS (Node v20.20.2, store rev 66, 5.7G disk, 1 API restart, no reboot)
RUNTIME_BOUNDARY_AUDIT=PASS (0 dup writers / parallel ledgers / send paths / secrets)
ROLLBACK_REHEARSAL=PASS (4 layers, preserves leads/ledger/pairing, no blind restore)

STAGE_ORDER=B0→B1→B2→B3→B4→B5→B6→B7
INITIAL_ACTIVATION_MODE=READ_ONLY_COMMERCIAL_INTEGRATION
COMMERCIAL_READ_API=ON_AFTER_APPROVAL · COMMERCIAL_COMMAND_API=OFF · COMMERCIAL_SEND=OFF
COMMAND_API_ACTIVATION=NOT_INCLUDED (separate future approval)
EXPECTED_SERVICE_RESTARTS=1 (master-controller-api) · REBOOT_REQUIRED=NO · EXPECTED_DOWNTIME=brief API reload
DATA_MIGRATION_REQUIRED=YES-ADDITIVE · CANONICAL_IMPACT=NONE (existing keys untouched; revision +1)

TELEGRAM_SOAK=OPTIONAL_OBSERVATION
DEPLOYMENT_BLOCKED_BY_SOAK=NO (owner decision: soak is not a release blocker)
OWNER_GATE_B_APPROVAL_REQUIRED=YES
GATE_B_TECHNICAL_READINESS=COMPLETE
DEPLOYMENT_EXECUTED=NO
```
Runbooks: GATE_B_EXECUTION_RUNBOOK.md (B0–B7), GATE_B_ROLLBACK_RUNBOOK.md (4 layers).

---
## (original offline package below)


```
TELEGRAM_SOAK=OPTIONAL_OBSERVATION
DEPLOYMENT_BLOCKED_BY_SOAK=NO
OWNER_GATE_B_APPROVAL=REQUIRED
```
Per owner decision, the Telegram soak is no longer a release blocker — it continues only as optional
observation. The single remaining gate is owner Gate B approval. The implementation and all production
wiring are fully materialized in Git and rehearsed; nothing is authored at execution time.

## Source
- Integration branch HEAD (this branch); base 34a93d9; production runtime baseline 9d346f3 + accepted
  Telegram hotfix runtime (views.mjs dd45b613…).

## What deployment would involve (when approved)
1. **Backend**: add commercial read endpoints + a `commercial/service.mjs` adapter over the single MC
   writer (`updateStoreWithRevision`). Files listed in PRODUCTION_DELTA.md. Commands remain
   feature-gated off; send capability NONE.
2. **Data migration**: apply `iw1_commercial_sections_v1` (additive, reversible, idempotent,
   backup-first, revision-guarded). Adds seven empty sections; touches no existing key.
3. **Android**: ship signed 0.5.0-rc1 (code 9) over rc5; owner installs and runs physical smoke.

## Before/after (to be filled at Gate B from live hashes)
- Backend file SHA256 before/after — captured at Gate B (read-only SSH).
- Store revision read + matched before migration (revision-guarded).

## Backup / migration dry-run / rollback
- Backup: canonical store + checksum manifest before migration (existing backup timer + manual snapshot).
- Dry-run: run migration forward against a copy; assert seven sections added, leads/queue/revision
  otherwise unchanged, integrity PASS.
- Rollback: reverse migration (drop empty sections) + redeploy prior backend; Android rollback = reinstall rc5.

## Affected services / downtime
- Services: master-controller-api (route add → reload), none others. Telegram/worker/scheduler/IMAP untouched.
- Expected downtime: brief API reload only. REBOOT_REQUIRED=NO.

## Post-deploy verification (read-only)
- CANONICAL_INTEGRITY=PASS; revision = baseline+1 (migration only); leads=50; queue 28/0; dead letters 0.
- New sections present and empty; GET commercial endpoints return well-formed envelopes.
- Telegram: 1 poller, 0 conflicts, views.mjs dd45b613…; send ledger=7 (no new send); autosend BLOCKED,
  live send OFF; 0 client messages.
- IMAP stage1_readonly; no flag mutation.

## Android
- APK: dist/integration_wave_1_android/MasterController-release-v0.5.0-rc1.apk
  (sha256 53f7b609008ea23bb3df243e1392e2e5677404ca59274a4801e0eb0d0ff55c4b)
- AAB: …-v0.5.0-rc1.aab (sha256 150e44d0eb028802997f813e07ab3d37f61f18719f77ccd86d8621e97a922352)
- Signer SHA-256 11038fca… == rc1–rc5; applicationId unchanged; update-compatible; Room schema unchanged.
- Owner physical smoke required after install (commercial summary read-only, offline cache, no mutation).

## Soak dependency
TELEGRAM_SOAK_T0=2026-06-17T22:24:14Z · status IN_PROGRESS as OPTIONAL_OBSERVATION (not a gate). This
branch made zero VPS changes and did not invalidate the soak.

## BASELINE V2 (2026-06-18) — supersedes the v1 baseline block above for execution
Verified live: revision 90, leads 62, historical sends 7 (corrected from 8 — metric error),
queue 41 COMPLETED / queue_revision 146 / 0 failed / 0 dead. Drift verdict EXPECTED_ORGANIC_ACTIVITY
(single Lead Hunter discovery cycle 2026-06-18T10:15Z; single writer; no send; integrity PASS).
Bundle unchanged: HEAD 1286c1c, manifest v3, sha256 1d8e7a77d1fe7e16a23147620e1d75c4a3e99c1da65cff9b6ca6524a2e280e11.
Migration expectation: revision 90→91, 8 empty sections. GATE_B_REAPPROVAL=NOT_YET_GIVEN.
Reapproval string (owner): APPROVE_GATE_B_INTEGRATION_WAVE_1_READ_ONLY_BASELINE_V2_REV90.
