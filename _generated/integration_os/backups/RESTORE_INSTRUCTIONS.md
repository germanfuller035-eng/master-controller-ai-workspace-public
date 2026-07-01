# Integration OS — Backup & Restore Instructions (MP44)

date: 2026-06-17

## Artifacts
- `integration_src_20260617/` — source mirror of tools/integration_os (19 files)
- `integration_src_20260617_manifest.sha256` — deterministic SHA256 manifest (sorted)
- `integration_20260617.gitbundle` — full git history to HEAD (gitignored large binary)

## Verify manifest
```bash
cd _generated/integration_os/backups/integration_src_20260617
sha256sum -c ../integration_src_20260617_manifest.sha256
```

## Restore test (offline, no network, no production, no merge, no delete)
```bash
git clone <bundle> /tmp/int_restore
cd /tmp/int_restore
node tools/integration_os/tests/run_all.mjs       # 98 functional + 26 security
node tools/ai_hq/tests/run_all.mjs                # prior OS regression
node tools/integration_os/integration.mjs contracts
node tools/integration_os/integration.mjs compatibility
node tools/integration_os/integration.mjs e2e --scenario A   # Mini Audit synthetic E2E
node tools/integration_os/integration.mjs security
node tools/integration_os/integration.mjs validate-all
```
All commands offline + deterministic. No network, no production reads/writes, no branch merge,
no migration apply, no doc apply, no deletion.
