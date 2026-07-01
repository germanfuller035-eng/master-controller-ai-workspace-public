# Revenue OS Command Center — Backup & Restore

date: 2026-06-17

## Artifacts
- Source manifest: `_generated/revenue_os/backups/manifest_*.json` (tools/revenue_os md/code/json, 0 secrets).
- Commercial source backup: `_generated/revenue_os/backups/revenue_src_20260617_120000/` + `*_manifest.sha256` (17 files, 17/17 verified).
- Git bundle (all refs): `_generated/revenue_os/backups/revenue_os_20260617_120000.gitbundle` (verified OK).

## Excluded from backup/git
- Secrets / private keys (none present; manifest excludes secret-like files).
- Bundle blobs + restore clones (gitignored).
- Ephemeral test output.

## Restore procedure (verified)
1. Verify bundle: `node tools/ai_hq/backup_verify.mjs verify-bundle --bundle <bundle>` → "is okay".
2. Clone: `git clone <bundle> <dir>`.
3. Checkout: `git -C <dir> checkout feature/revenue-os-command-center-v1`.
4. Validate: `node tools/revenue_os/revenue.mjs validate-all` → ok=true.
5. Smoke: `node tools/revenue_os/revenue.mjs recommend --profile TEST_weak_site` → mini_audit.
6. No-send check: `create-offer ...` → send_allowed=false.
7. Tests: `node tools/revenue_os/tests/run_all.mjs` → all suites pass.

## Restore test result (this run)
- Clone OK; validators ok=true; recommendation generated; offer send_allowed=false; 2/2 test suites pass.

## RPO/RTO (Revenue OS code/data)
- RPO: 1 commit/push cycle. RTO: < 1 hour (bundle clone + validate).
- Knowledge docs apply post-soak via owner-gated `apply_canonical.mjs`.
