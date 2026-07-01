# Reliability Control Plane — Backup & Restore Instructions (MP54)

date: 2026-06-17

## Artifacts
- `reliability_src_20260617/` — source mirror of tools/reliability_os (16 files)
- `reliability_src_20260617_manifest.sha256` — deterministic SHA256 manifest (sorted)
- `reliability_20260617.gitbundle` — full git history to HEAD (gitignored large binary)

## Verify manifest
```bash
cd _generated/reliability_os/backups/reliability_src_20260617
sha256sum -c ../reliability_src_20260617_manifest.sha256
```

## Restore test (offline, no network, no process, no schedule, no production)
```bash
git clone <bundle> /tmp/rel_restore
cd /tmp/rel_restore
node tools/reliability_os/tests/run_all.mjs            # 109 functional + 21 self-security
node tools/ai_hq/tests/run_all.mjs                     # prior OS regression
node tools/reliability_os/reliability.mjs services     # service catalog
node tools/reliability_os/reliability.mjs dependencies # dependency graph + SPOF
node tools/reliability_os/reliability.mjs simulate H   # backup-missing health simulation
node tools/reliability_os/reliability.mjs release-gate
node tools/reliability_os/reliability.mjs validate-all
```
All commands offline + deterministic. No monitoring, no live health, no backup/restore execution,
no background process, no scheduled task, no production access.
