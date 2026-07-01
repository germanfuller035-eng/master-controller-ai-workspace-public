# Integration Wave 1 — Gate B Execution Runbook (PREPARED — NOT EXECUTED)

date: 2026-06-18 · DEPLOYMENT_EXECUTED=NO · requires owner Gate B approval at execution time.
TELEGRAM_SOAK=OPTIONAL_OBSERVATION · DEPLOYMENT_BLOCKED_BY_SOAK=NO (owner decision).
All commands below are for the owner/operator to run AT Gate B; nothing here is run in this pass.

## B0 — Preflight & backup
- Confirm owner Gate B approval present. (Telegram soak is optional observation, NOT a gate.)
- Confirm AUTOSEND=BLOCKED, SEND_ALLOWED_LIVE=OFF, COMMERCIAL_COMMAND_API=OFF, COMMERCIAL_SEND=OFF.
- Verify exact manifest hashes (deployment_manifest.json after-hashes) before staging.
- Record baselines: canonical revision (66) + lead count (50); send ledger (7); queue 28/0/0;
  service PIDs + NRestarts; Telegram poller=1; views.mjs dd45b613….
- Timestamped backups: runtime dir, canonical store, queue metadata → SHA256 manifest; VERIFY before continuing.

## B1 — Stage runtime
- Copy the 4 backend files + 2 migration files (deployment_manifest.json) to a staging dir.
  `scp <files> masterctl@host:/opt/master-controller/staging_iw1/`
- Verify owner masterctl:masterctl, mode 644; verify target SHA256 == manifest after-hash.
- `node --check` each .mjs (syntax/import); no route activation yet.

## B2 — Runtime activation
- All wiring is ALREADY in Git (commercial/service.mjs + commercial/routes.mjs + the additive
  index.mjs edit), plus the SELF-CONTAINED runtime (commercial_core/lib/* + runtime_data snapshot) —
  no product_os/revenue_os runtime import, no process.cwd() paths (verified by runtime_closure_scan
  + clean-tree rehearsal). NO code is authored at execution. Atomically move the exact manifest files into
  place (no whole-repo sync). Commands feature flag OFF; send absent.
- `sudo systemctl restart master-controller-api` (the ONLY service restarted). No reboot. Telegram/
  worker/scheduler/IMAP/Caddy untouched.

## B3 — Migration (exactly once)
- Backup verified (B0). Run migration forward once via the API's migration tool against the canonical
  store (revision-guarded). Verify 8 commercial namespaces exist and are EMPTY; leads/ledger/queue
  unchanged; revision = 66 → 67 only.
- Re-run guarded (idempotent): a second invocation adds nothing.

## B4 — Read-only feature activation
```
COMMERCIAL_READ_API=ON   COMMERCIAL_COMMAND_API=OFF   COMMERCIAL_SEND=OFF
```

## B5 — Post-deploy checks (read-only)
```
CANONICAL_LEADS=50 · HISTORICAL_SENDS=7 · COMMERCIAL_ENTITIES=0 · QUEUE_FAILED=0 · DEAD_LETTERS=0
AUTOSEND=BLOCKED · SEND_ALLOWED_LIVE=OFF · TELEGRAM_POLLER_COUNT=1 · GETUPDATES_CONFLICTS=0 · IMAP_READ_ONLY=PASS
```
- GET all 9 commercial read endpoints → ok envelope, empty collections, products readable, UNKNOWN≠0.
- POST every command endpoint → FEATURE_DISABLED, zero mutation.

## B6 — Android candidate (after backend PASS)
- Owner installs MasterController-release-v0.5.0-rc1.apk over rc5 (no uninstall). Pairing preserved.
- Commercial summary opens; collections empty/synthetic-free; owner localization correct; UNKNOWN≠0;
  offline cache works; no mutation buttons; no send.

## B7 — Observation
- Read-only commercial API observation window; no commercial entities; no commands; no send; no Gate C.
- Commercial COMMAND activation is a SEPARATE future approval — NOT part of this Gate B.

## BASELINE V2 RE-FREEZE (2026-06-18, after verified organic drift)
Execution-time invariants UPDATED (bundle/source/manifest UNCHANGED — HEAD 1286c1c, manifest v3,
sha256 1d8e7a77…):
```
REVISION_BEFORE=90   LEADS_BEFORE=62   HISTORICAL_SENDS_BEFORE=7 (ledger truth; not 8)
QUEUE_BEFORE=41 jobs COMPLETED, queue_revision 146, failed 0, dead_letters 0
COMMERCIAL_SECTIONS_BEFORE=0   COMMERCIAL_ENTITIES_BEFORE=0
After migration: REVISION_AFTER=91, 8 empty sections, 0 entities; leads/ledger/queue UNCHANGED.
```
Gate B is technically ready against baseline v2. Owner reapproval (bound to baseline v2) required
before any backup/stage/migrate/restart. Read-only activation mode unchanged.
