# Owner Command & Autonomy Center — Production Deploy Evidence (0.8.0)

Deployed: 2026-06-20 UTC · Host 195.96.132.82 · no-send

## Backup
/opt/master-controller/backups/owner_autonomy_center_20260620_131314 (canonical rev 221 + api_src)

## Deployed (additive, 4 files; prod server/config == baseline 8b9bd75, no drift reverted)
- tools/mater_controller_api/src/owner_center/service.mjs (NEW)
- tools/mater_controller_api/src/owner_center/chief_ops.mjs (NEW)
- tools/mater_controller_api/src/shared/config.mjs (additive: OWNER_CENTER_STORE_PATH)
- tools/mater_controller_api/src/server/index.mjs (additive: owner-center routes)

## Services restarted: master-controller-api, master-controller-worker (health 200)

## Live no-send smoke (TEST_ONLY)
- P0 event, P1 decision, P2 event created
- error storm (5 signals) → 1 grouped incident
- test_only hidden from default events; visible with includeTest
- decision resolve write+reread, performsOutbound=false
- routes verified: /events /command-brief /agents/status /autopilot → 401 (auth-gated); /bogus → 404
- TEST_ONLY stray store removed; canonical untouched rev 221 / 13 leads

## Invariants after deploy
MATER_NO_SEND=true EMAIL_REAL_SEND_ENABLED=false COMMERCIAL_SEND=false FOLLOWUP_AUTOSEND=false AGENT_SEND=false
canonical_writer_count=1 discovery_scheduler_owners=1 queue_failed=0 dead_letters=0
