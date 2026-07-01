# Analytics OS Completion v1 — Backup & Restore Report

date: 2026-06-17
status: PASS

## Backup artifacts
- Git bundle: `_generated/analytics_os/backups/analytics_os_completion_20260617.gitbundle` — `git bundle verify` → "records a complete history" PASS
- Source backup: `_generated/analytics_os/backups/analytics_src_20260617/` (46 files)
- Checksum manifest: `_generated/analytics_os/backups/analytics_src_20260617_manifest.sha256` (46 sha256 lines)

## Restore test (clean clone from bundle)
1. clone bundle → HEAD 5b24843 ✓
2. analytics.test → 38/38 ✓
3. completion.test → 69/69 ✓ (after running from clone root — CLI/libs resolve from cwd by design)
4. security.test → 13/13 ✓
5. Product OS compat → 2/2 ✓
6. Customer Success OS compat → 2/2 ✓
7. synthetic snapshot generated (deterministic checksum 5ac566da) ✓
8. funnel generated (overall 0.5%) ✓
9. cohort generated (blended 42.86%) ✓
10. quality report generated (score 1.0, 0 critical) ✓
11. experiment evaluated (ready=true, running_allowed=false, will_start=false) ✓
12. no production access (no VPS IP / prod API / SMTP in non-test code) ✓

## Note
Analytics OS CLI + libs resolve DATA_DIR/FIXTURE_DIR from process.cwd() (matching the sibling OS
convention). Restore/run must be executed from the repository root. Documented for operators.
