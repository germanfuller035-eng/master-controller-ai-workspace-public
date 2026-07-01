# Delivery OS — Backup & Restore

date: 2026-06-17

## Artifacts
- Source manifest: `_generated/delivery_os/backups/manifest_*.json` (tools/delivery_os, 0 secrets).
- Delivery source backup: `_generated/delivery_os/backups/delivery_src_20260617_140000/` + `*_manifest.sha256` (11 files, 11/11 verified).
- Git bundle (all refs): `_generated/delivery_os/backups/delivery_os_20260617_140000.gitbundle` (verified OK).

## Excluded from backup/git
Secrets/private keys (none present), bundle blobs + restore clones (gitignored), ephemeral test output.

## Restore procedure (verified)
1. `node tools/ai_hq/backup_verify.mjs verify-bundle --bundle <bundle>` → "verify OK".
2. `git clone <bundle> <dir>` → checkout `feature/delivery-os-client-project-factory-v1`.
3. `node tools/delivery_os/delivery.mjs validate-all` → ok=true.
4. `node tools/delivery_os/delivery.mjs simulate mini_audit --scenario success` → DELIVERED_ACCEPTED, send_allowed=false.
5. `node tools/delivery_os/delivery.mjs qa mini_audit` → client_ready=true.
6. `node tools/delivery_os/delivery.mjs acceptance mini_audit` → PASS.
7. `node tools/delivery_os/tests/run_all.mjs` → 2/2 suites pass.
8. Safety scan ok=true (no send / no production / no key).

## Restore test result (this run)
Clone OK; validate-all ok=true; Mini Audit simulated (DELIVERED_ACCEPTED, no-send); QA client_ready;
acceptance PASS; 2/2 test suites pass; safety scan clean.

## RPO/RTO
- RPO: 1 commit/push cycle. RTO: < 1 hour (bundle clone + validate).
- Knowledge docs apply post-soak via owner-gated `apply_canonical.mjs`.
