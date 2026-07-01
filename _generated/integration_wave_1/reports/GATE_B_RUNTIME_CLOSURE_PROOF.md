# Gate B — Runtime Closure Proof

date: 2026-06-18 · proves the deployed commercial runtime is self-contained and resolves on the VPS.

## Local closure scan (pre-deploy)
```
tools/commercial_core/tools/runtime_closure_scan.mjs
→ closure scan: entrypoints=9 deps=62 unresolved=0 crossOS=0 cwd=0 absWorkspace=0
CLOSURE_OK
```
- No import of tools/product_os or tools/revenue_os at runtime.
- No process.cwd() dependency; product/price truth resolved module-relative (import.meta.url) from
  the generated snapshot.
- Snapshot freshness: build_runtime_snapshot.mjs --check → SNAPSHOT_FRESH hash=dceb7a63 products=18.

## Deployed target verification (on VPS, post-install, pre-restart)
- node --check: 9/9 installed .mjs OK.
- Real ESM resolution from API workdir (/opt/master-controller/tools/mater_controller_api):
  ```
  import service.mjs, routes.mjs, product_catalog_runtime.mjs → IMPORT_CLOSURE=PASS
  FLAGS={"read":false,"command":false,"send":false}  (pre-activation)
  PRODUCTS_TOTAL=18  MINI_AUDIT_PRICE=10000  registerCommercialRoutes=function
  ```
- All 11 target files sha256 == manifest after-hashes (0 mismatches).

## Post-restart runtime (live)
```
ERR_MODULE_NOT_FOUND_COUNT=0  CWD_PATH_FAILURES=0  API_CRASH_LOOP=NO  NRestarts=0
health=200 ok:true
16/16 read endpoints resolve and return valid envelopes (products view renders 18 products from snapshot)
```

## Single-writer proof
- The commercial command seam routes mutations exclusively through
  shared/store_access.updateStoreWithRevision (the one canonical writer). The migration itself was
  applied through this same seam (revision-guarded 90→91).
- Worker (mcworker) and Telegram (mctelegram) run as separate users with empty ReadWritePaths and
  cannot write the 0750 canonical dir directly — confirmed in prior writer audit; unchanged here.

CLOSURE_OK · IMPORT_CLOSURE=PASS · SELF_CONTAINED=YES · SINGLE_WRITER=YES
