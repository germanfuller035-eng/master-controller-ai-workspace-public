# Master Controller — Release 2B: Telegram + Workers API-only (2026-06-16)

FINAL_STATUS: PARTIAL — protective guard DONE + verified; full API-only conversion is
multi-session and NOT yet done. Honest scope statement below (no faked completion).

## DONE + verified this session
- **Local production start guard** (the most important protection): `.canonical_writer_location`
  marker (=VPS) makes both `start_telegram_gateway.ps1` and `start_master_bot.ps1` refuse to
  launch with `LOCAL_PRODUCTION_START_ATTEMPT -> refused / reason=VPS_CANONICAL_WRITER_ACTIVE`
  (exit 2). VERIFIED: both scripts refuse. This closes the dangerous accidental-restart →
  two-writer hole that Release 2 left open.
- Confirmed: LOCAL_TELEGRAM_ACTIVE=NO, LOCAL_WORKERS_ACTIVE=NO.
- VPS OS state: API runs as `masterctl`; canonical file owned `masterctl:masterctl` 0644;
  RAM 304/960 MB; disk 33%.

## Telegram direct-write INVENTORY (proven, not assumed)
Runtime write callsites in the gateway (saveStore / ledger / reply / followup), by module:
- mini_audit_draft_actions.mjs (4) — saveStore on draft prepare/accept/reject
- lead_store.mjs (4) — saveStore core + mint/update helpers
- outbound_send_ledger.mjs (3) — recordSendOnce / appendLedgerEntry
- reply_monitor.mjs (2), reply_ingest.mjs (2), followup_engine.mjs (2),
  contact_resolver_v2.mjs (2), mini_audit_enrichment_batch_1.mjs (2)
- queue_navigation.mjs (1), mini_audit_promote_preview.mjs (1), mini_audit_lead_prep_run.mjs (1),
  osm_lead_prep_run.mjs (1), run_email_first_csv_import.mjs (1), reply_monitor_bot_glue.mjs (1)
- telegram_master_bot.mjs: 5033 lines, imports saveStore as `_salesSaveCanonicalStore` + many handlers.

Mapping each to a target API route (status→POST /status, draft→POST /draft,
reject→POST /draft/reject, send→approve route, replies/followups→GET) is straightforward per
callsite, but there are dozens of handlers across a 5033-line entrypoint + 16 modules. Doing it
correctly (every handler, with idempotency keys + 409 handling + no-send tests) is the bulk of
2B and must be staged, not rushed.

## NOT done (honest)
- Telegram handlers still call `lead_store.saveStore` etc. directly → TELEGRAM_API_ONLY=NO in code.
- No shared API client built yet for Telegram/workers.
- No `master-controller-telegram.service` / `master-controller-worker.service` on the VPS.
- No separate telegram/worker system users or scoped API credentials yet.
- Worker API-only conversion not done.

## Why partial (not a failure to hide)
The protective invariant is currently held operationally (local writers stopped + start guard
refuses relaunch + VPS is sole live writer). The CODE-level API-only conversion of a 5033-line
bot + 16 modules, plus two new VPS services with isolated users/scopes, is realistically several
focused sessions. Faking "TELEGRAM_API_ONLY=YES" would be false.

## Safe state right now
- CANONICAL_WRITER_PROCESSES=1 (VPS API only; nothing else running writes).
- DIRECT_FILE_WRITERS_ACTIVE=0 (no local writer process; guard prevents restart).
- DIRECT_FILE_WRITERS_PRODUCTION_CODE: still >0 (Telegram/workers code), but UNREACHABLE at
  runtime because those processes are stopped and guarded.
- AUTOSEND=BLOCKED, EMAILS_SENT=0.

## Rollback
Guard is additive (marker file + script preflight); remove `.canonical_writer_location` or set
it to LOCAL to restore old behavior. No data touched.

## NEXT_ACTION (staged plan for next sessions)
1. Build shared API client (HTTPS, auth, retry/backoff, operation_id/idempotency, 409/401/maintenance).
2. Convert Telegram handlers callsite-by-callsite to the client; keep canonical send seam.
3. Deploy master-controller-telegram.service on VPS under a dedicated low-priv user (token + API cred only).
4. Convert + deploy worker service (no-send, bounded, locked) similarly.
5. OS isolation: telegram/worker users without write (ideally without read) to canonical dir; permission test.
6. Full no-send Telegram test matrix + worker tests + reboot recovery; then v0.3.1-rc1.
