# Security Control Plane — Backup & Restore Instructions (MP50)

date: 2026-06-17

## Artifacts
- `security_src_20260617/` — source mirror of tools/security_os (16 files). Contains NO excluded
  real-data file (the disposition JSON only NAMES excluded paths; no email address/message body).
- `security_src_20260617_manifest.sha256` — deterministic SHA256 manifest (sorted)
- `security_20260617.gitbundle` — full git history to HEAD (gitignored large binary)

## Verify manifest
```bash
cd _generated/security_os/backups/security_src_20260617
sha256sum -c ../security_src_20260617_manifest.sha256
```

## Restore test (offline, no network, no production, no secret values, no delete)
```bash
git clone <bundle> /tmp/sec_restore
cd /tmp/sec_restore
node tools/security_os/tests/run_all.mjs        # 112 functional + 18 self-security
node tools/ai_hq/tests/run_all.mjs              # prior OS regression
node tools/security_os/security.mjs attack 7    # ssh-key detection (synthetic)
node tools/security_os/security.mjs sbom
node tools/security_os/security.mjs dashboard-refresh
node tools/security_os/security.mjs validate-all
# verify excluded real-data files absent from the clone:
ls tools/communication_monitor/yandex_send_zb23_result.json 2>/dev/null && echo PRESENT || echo "ABSENT (correct)"
```
All commands offline + deterministic. No network, no live scan, no secret value printed, no production
access, no file deletion.
