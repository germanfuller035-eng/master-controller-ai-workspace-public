# Master Controller — Rollback (v0.3.5-rc1, 2026-06-16)

Backend checkpoint: autonomous pipeline (discovery→verify→score→audit→draft→follow-up→
reply-draft) all REAL + job queue + worker + daily scheduler + IMAP + backup, all on the VPS.
Telegram API-only, Android queues, and full multi-failure live E2E remain for a later release —
hence v0.3.5-rc1, NOT v0.4.0-rc1.

## Tag
- v0.3.5-rc1 @ commit cf8a50e (branch feature/master-controller-vps-e2e).

## Rollback options (least → most invasive)
1. Pause automation only: set MC_DISCOVERY_PAUSED=true in the discovery service env +
   `systemctl daemon-reload`. Scheduler enqueues nothing; everything else keeps running.
2. Stop a service: `systemctl disable --now master-controller-{discovery.timer,worker,imap.timer}`.
   Canonical store + API stay up read-serving.
3. Revert API to read-only: set MATER_CANONICAL_WRITER=false + MATER_MAINTENANCE=true in
   /etc/master-controller/master-controller.env, `systemctl restart master-controller-api`.
   All mutations → 503; no writes possible.
4. Restore data: stop API, copy newest /opt/master-controller/backups/lead_pipeline_store.*.json
   → /opt/master-controller/canonical/lead_pipeline_store.json, start API. (No data was lost —
   50 leads, rev 53; backups daily + checksummed.)
5. Code rollback: `git checkout <prev tag>` and redeploy src to /opt/master-controller.

## Safety invariants (unchanged by this release)
- VPS sole canonical writer; worker/Telegram have NO canonical FS access (worker proven NO/NO).
- AUTOSEND=BLOCKED, SEND_ALLOWED_LIVE=OFF, EMAILS_SENT=0, SMTP_CALLS=0.
- Single send seam outbound_channel_router.sendApprovedMessage; no second store/ledger/router.
- Local production writer stays OFF (start guard active).

## What this release does NOT include
Telegram API-only conversion + VPS service; Android automation/queue screens; full 57-scenario
live E2E (offline 21/21 harness exists); audit/draft track needs a website-bearing lead source.
