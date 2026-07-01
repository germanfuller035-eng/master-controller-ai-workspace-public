# Integration Wave 1 — Production-Like Clean-Tree Rehearsal

date: 2026-06-18 · suite tools/commercial_core/tests/production_like_rehearsal.mjs (12/12 PASS)
result: _generated/integration_wave_1/data/production_like_rehearsal_result.json

## What makes this different from the prior (defective) rehearsal
The earlier exact-bundle rehearsal ran inside the full Git worktree, so missing cross-OS imports were
silently resolved from neighbouring directories. This rehearsal builds an ISOLATED temp tree
(`<tmp>/opt/master-controller/...`) containing ONLY the deployable closure + the baseline API modules
they import + a synthetic canonical store. NODE_PATH is emptied, there are no symlinks back to the
worktree, and the full repo is NOT present (asserted: no package.json/.git at the tree root, no
product_os/revenue_os directories). Node runs from the production-like cwd
(`/opt/master-controller/tools/mater_controller_api` mirror) with absolute file:// URLs.

## Results (R0–R21 intent)
- R0–R2 clean root built; closure files copied; full repo NOT present; worktree fallback impossible.
- R4 no cross-OS directories landed in the tree.
- R6/R15 the product runtime imports and resolves the snapshot module-relative → {18, ACTIVE, 10000}
  with ZERO ERR_MODULE_NOT_FOUND from the API cwd.
- R12 read models execute; empty summary confirmed_payments_class = UNKNOWN (not 0).
- R10 migration applies in the clean tree (8 sections, rev 66→67, leads preserved).
- R18 no send/SMTP/queue/transport in any clean-tree runtime file.
- R19 runtime rollback = remove copied files (all were absent on target).
- R21 clean tree removed.

```
CLEAN_TREE_USED=YES
FULL_REPO_PRESENT=NO
WORKTREE_FALLBACK_POSSIBLE=NO
IMPORT_CLOSURE_PASS=YES
ERR_MODULE_NOT_FOUND=0
CWD_PATH_FAILURES=0
READ_MODELS_EXECUTE=YES
MIGRATION_APPLIES=YES
COMMAND_MUTATIONS=0  QUEUE_WRITES=0  MESSAGES_SENT=0  SMTP_CALLS=0
ROLLBACK_SIMULATION=PASS
```

Complemented by route_security.test.mjs (20, real registrar+adapter, command FEATURE_DISABLED + zero
mutation) and runtime_bundle.test.mjs (20, parity + cwd-independence + determinism). The closure
scanner (runtime_closure_scan.mjs) gates CI: CLOSURE_OK, unresolved=0, crossOS=0, cwd=0.
