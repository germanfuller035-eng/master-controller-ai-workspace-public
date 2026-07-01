# Canonical Consolidation — Backup & Restore Instructions (MP47-48)

date: 2026-06-17

## Artifacts
- `consolidation_src_20260617/` — source mirror of tools/consolidation_os (10 files)
- `consolidation_src_20260617_manifest.sha256` — deterministic SHA256 manifest (verified 10/10)
- `consolidation_20260617.gitbundle` — full git history to HEAD (gitignored large binary)
- `pre_apply_20260617/` — pre-apply backup of branch doc dirs (09_dashboards, 03_sop)

## Clean-clone reproducibility test (PASS)
```bash
git clone <bundle> /tmp/cons_restore && cd /tmp/cons_restore
ls tools/consolidation_os/consolidation.mjs              # tracked source
ls tools/communication_monitor/yandex_mail_imap_read.mjs # read-only comm-monitor
find 16_security 17_reliability -name '*.md' | wc -l      # applied canonical docs
node tools/consolidation_os/tests/run_all.mjs            # 73 + 19 = 92 tests
node tools/consolidation_os/run_master_validation.mjs    # 17 suites PASS, android NOT_RUN
node tools/consolidation_os/consolidation.mjs e2e        # 18-step E2E, no real send
node tools/consolidation_os/consolidation.mjs release-candidate
```
Verified: all tracked source present, no required untracked source, registries/docs load, tests run,
E2E runs, no network/production/send, no real data, no secret. CLEAN_CLONE=PASS, RESTORE_TEST=PASS.
