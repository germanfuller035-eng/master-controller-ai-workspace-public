# Agent Orchestration — Backup & Restore Instructions (MP45)

date: 2026-06-17

## Artifacts
- `orchestrator_src_20260617/` — source mirror of tools/orchestrator_os + tools/communication_monitor (22 files)
- `orchestrator_src_20260617_manifest.sha256` — deterministic SHA256 manifest (sorted)
- `orchestrator_20260617.gitbundle` — full git history to HEAD (gitignored large binary)

## Verify manifest
```bash
cd _generated/orchestrator_os/backups/orchestrator_src_20260617
sha256sum -c ../orchestrator_src_20260617_manifest.sha256
```

## Restore test (offline, no network, no production, no agent launch, no scheduler)
```bash
git clone <bundle> /tmp/orc_restore
cd /tmp/orc_restore
ls tools/communication_monitor/yandex_mail_imap_read.mjs        # source exists
node tools/communication_monitor/tests/no_imap_readonly.test.mjs # read-only, no IMAP
node tools/orchestrator_os/tests/run_all.mjs                     # 130 tests
node tools/ai_hq/tests/run_all.mjs                              # prior OS regression
node tools/orchestrator_os/orchestrator.mjs simulate A          # synthetic E2E
node tools/orchestrator_os/orchestrator.mjs validate-all
```
All commands offline + deterministic. No background process, no network, no production access, no
real agent launch.
