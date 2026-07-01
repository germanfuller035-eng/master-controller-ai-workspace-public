## Backup & Restore — Finance OS

date: 2026-06-17

## Artifacts
- Source manifest (32 files, 0 secrets); finance source backup (7 files, 7/7 verified); git bundle (all refs, verified OK).
- Paths under `_generated/finance_os/backups/`.

## Restore procedure (verified)
1. verify-bundle → "verify OK". 2. clone → checkout `feature/finance-os-business-control-v1`.
3. `finance validate-all` → ok=true. 4. create-invoice (no-send). 5. reconcile (no auto-confirm).
6. pnl. 7. cashflow. 8. tests 2/2. 9. no bank/send/prod paths.

## Restore test result (this run)
Clone OK; validate-all ok=true; invoice send_allowed=false; reconcile auto_confirm=false; P&L; cashflow
gap detected; 2/2 suites pass. No bank/send/production path.

## RPO/RTO
RPO: 1 commit/push. RTO: < 1 hour (clone + validate). Docs apply post-soak via owner-gated apply_canonical.mjs.
