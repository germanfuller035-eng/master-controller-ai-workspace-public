# Master Controller — Operations Runbook (2026-06-16)

VPS 195.96.132.82 · API https://195-96-132-82.sslip.io/api/v1 · canonical store
/opt/master-controller/canonical/lead_pipeline_store.json (writer = API only).

## Services (systemd, all enabled at boot)
| Unit | Role |
|---|---|
| master-controller-api | canonical writer + HTTP API (127.0.0.1:8787, behind Caddy TLS) |
| caddy | HTTPS reverse proxy :443 → 8787 |
| master-controller-worker | API-only job worker (user mcworker, no canonical FS access) |
| master-controller-imap.timer | read-only IMAP reply sync (15 min) |
| master-controller-backup.timer | daily canonical backup 03:17 + checksum + retention 14 |
| master-controller-discovery.timer | daily lead discovery 06:12 (one job/day, idempotent) |
| fail2ban | sshd jail (systemd backend) |
| master-controller-telegram | API-only Telegram bot (user mctelegram, single poller, no canonical FS) |

## Telegram (API-only, since v0.4.0 work 2026-06-16)
- Entrypoint: `tools/telegram_gateway/api_only/index.mjs` (the ONLY production Telegram runtime).
  Long-poll, owner-allowlisted (TELEGRAM_OWNER_IDS), every read/mutation via Master Controller
  HTTPS API through McService. No fs/canonical/SMTP/localhost (static invariant test).
- Service user `mctelegram` (nologin) CANNOT read canonical / worker cred / IMAP cred (proven NO).
- Creds in `/etc/master-controller/telegram.env` (root:mctelegram 0640): bot token, service
  API token (telegram scopes: read + approvals:write + jobs:read), owner IDs. Never logged.
- Restart: `systemctl restart master-controller-telegram`. Single poller enforced by offset loop.
- Legacy 5033-line `telegram_master_bot.mjs` stays DISABLED (local start guard); deprecated,
  non-runtime. Do not start it.
- Send stays BLOCKED: approval is not send; explicit send returns blocked while SEND_ALLOWED_LIVE=OFF.

## Health / status
- Public health: `curl https://195-96-132-82.sslip.io/api/v1/health`
- Automation: GET /api/v1/automation/status (owner or worker token) — queue counts, pipeline
  counts, deadLetter, autosend (always BLOCKED), sendAllowedLive (OFF).
- Jobs: GET /api/v1/jobs/counts, /jobs (owner token).

## Pause / resume discovery
- Pause: set `MC_DISCOVERY_PAUSED=true` in /etc/systemd/system/master-controller-discovery.service
  (or worker.env), `systemctl daemon-reload`. Scheduler logs SCHED_PAUSED and enqueues nothing.
- Resume: remove the flag, daemon-reload.

## Send posture (HARD)
- AUTOSEND=BLOCKED, SEND_ALLOWED_LIVE=OFF. No worker/Telegram SMTP path. Drafts + follow-up +
  reply drafts are ALL approval-pending; nothing sends without owner approval through the
  canonical seam outbound_channel_router.sendApprovedMessage.

## Backup / restore
- Backups: /opt/master-controller/backups/ + CHECKSUMS.txt (sha256). Daily timer + on-demand
  `systemctl start master-controller-backup.service`.
- Restore drill (non-destructive): copy a backup to a temp file, JSON.parse, compare counts.
- Restore production: stop API, copy backup → canonical path, start API.

## Pipeline flow (worker handlers, all REAL)
LEAD_DISCOVERY → stage → LEAD_VERIFY → LEAD_SCORE → (verified_ready) → AUDIT_GENERATE →
(audit_ready) → DRAFT_GENERATE → approval_pending. FOLLOWUP_PLAN + REPLY_DRAFT_GENERATE
produce approval-pending drafts. No-website leads route to MANUAL_REVIEW_PRODUCT_ROUTING.

## Known limitation
OSM Overpass (keyless) yields no-website businesses → product-routing only. Audit/draft track
needs a website-bearing source (2GIS/DataForSEO API key in D:\AI_SECRETS, not yet provided).

## Rollback
See MASTER_CONTROLLER_CUTOVER_REPORT_2026-06-16.md. Read-only revert: set
MATER_CANONICAL_WRITER=false + MATER_MAINTENANCE=true in the env, restart API.
