# Master Controller — VPS Canonical Writer Cutover (Release 2, 2026-06-16)

FINAL_STATUS=CUTOVER_DONE (VPS is canonical writer) — with TWO honest residual gaps (5E/5F)
described below. The single-writer guarantee currently holds because local writers are STOPPED;
it is not yet enforced by code in the Telegram/worker contours.

## Correction of the record
Earlier docs said "VPS single-writer declined by owner" — INCORRECT. Owner approved and this
cutover was executed. Superseded across DATA_MIGRATION and E2E_V030 docs.

## What was done (verified)
- 5A checkpoint: tests green (writes 14/14, replies 23/23, backend 47/47); commit `50ed55c`;
  pre-cutover backup `backups/master_controller_precutover_20260616_172521/` + COUNT_MANIFEST.json;
  restore drill PASS.
- 5B freeze: VPS maintenance ON; Telegram bot PID 6036 stopped via canonical
  `stop_telegram_gateway.ps1` (verified gone); ACTIVE_LOCAL_WRITERS=0 (no node procs, no
  scheduled tasks, no autostart/Run entries). Local files kept as immutable archive.
- 5C final migration: store hash unchanged since freeze (01ba740f…); imported to VPS writable
  canonical path `/opt/master-controller/canonical/lead_pipeline_store.json` (0644,
  config-driven via MATER_STORE_PATH — NOT chmod-only); 50 leads, byte-identical sha.
- 5D flip: MATER_CANONICAL_WRITER=true, MATER_MAINTENANCE=false; capabilities live =
  writeAllowed:true, sendAllowed:false, autosend:BLOCKED, canonicalWriter:true.
- 5G synthetic live proof (TEST_ONLY_CUTOVER lead, over HTTPS): read OK, update→rev2,
  idempotent replay (no overwrite), draft v1, draft reject, stale revision→409, two concurrent
  writes both persisted, API restart → state persisted (status survived). On-disk integrity:
  51 leads (50 real + 1 test), no real lead lost. TEST fixture then removed safely (back to 50).
- 5H rollback rehearsal: backup present + manifest verified; read-only toggle is config-driven
  and proven (5B); ROLLBACK_READY=yes. Actual rollback NOT executed (all tests passed).

## Counts before/after (no data loss)
- LEADS: 50 → 50 (real). SENDS ledger: 7 → 7. REPLIES: 0 → 0. FOLLOWUPS: 0 → 0.
- OPT_OUT: 0 → 0. by_status unchanged. store_revision 1 → 7 (test writes + cleanup; real data intact).
- EMAILS_SENT=0, CLIENT_MESSAGES_SENT=0, AUTOSEND=BLOCKED throughout.

## RESIDUAL GAPS (honest — not silently "done")
- 5E Telegram repoint: NOT done. The bot is STOPPED, but its code still writes the LOCAL store
  via `lead_store.saveStore` (no-lock). If it is restarted as-is, it writes locally again →
  two-writer divergence. Converting Telegram callbacks to call the VPS API write endpoints is a
  code change for the next session. UNTIL THEN: do not restart the local Telegram bot.
- 5F Workers: same — local workers are stopped, not converted to API-only. Do not start them.
- Android: already remote-API-only (rc1) and cold-start fixed; capabilities-driven hiding of
  write/send actions (writeAllowed/sendAllowed) is wired in the backend (`/capabilities`) but the
  Android UI does not yet consume it. Functional, not yet UX-gated.

## Single-writer status
SINGLE_CANONICAL_WRITER=YES *while local writers remain stopped*. Enforced by: VPS canonical
ON; local bot/workers stopped; no autostart. NOT yet enforced by Telegram/worker code (5E/5F).

## Rollback
- Data: `copy backups/master_controller_precutover_20260616_172521/13_sales/lead_pipeline_store.json`
  → `/opt/master-controller/canonical/lead_pipeline_store.json`.
- Mode: set MATER_CANONICAL_WRITER=false (+ MATER_MAINTENANCE=true) in
  `/etc/master-controller/master-controller.env`, restart — returns to READ_ONLY snapshot.
- Code: `git checkout 0e263e6` (pre-checkpoint); checkpoint is `50ed55c`.
- Local archive: `13_sales/*.json|*.jsonl` unchanged on the PC = immutable restore source.

## NEXT_ACTION
Next session (separate, gated): convert Telegram + workers to API-only (5E/5F) so the
single-writer invariant is code-enforced, then it is safe to bring the Telegram bot back online.
Phase 3/4 NOT started.
