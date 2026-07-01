# Gate A Live Verification Report (COMPLETE — read-only)

date: 2026-06-17T19:33Z · branch feature/controlled-production-launch-v1 · GATE_A_APPROVED=YES · GATE_A_EXECUTED=YES

## SSH recovery
Recovered the previously-working authorized credential from the protected AI_SECRETS contour:
`ssh -o IdentitiesOnly=yes -i /d/AI_SECRETS/ssh/master_controller_195_96_132_82_ed25519 masterctl@195.96.132.82`
(fingerprint `SHA256:iO8wf6...`, comment master-controller@). StrictHostKeyChecking=yes passed — no
host-key mismatch. The prior pass had used the wrong `~/.ssh` key (`SHA256:uZ5hw9...`). No new key
created, no authorized_keys change, no secret value exposed.

## VPS identity (live)
debian12 · Debian 12 (bookworm) · kernel 6.1.0-22-amd64 · VMware VM · uptime 20h21m · load 0.00 ·
RAM 960Mi (550Mi available) · disk / 8.9G (33% used, 5.7G free) · inodes 8%.

## Services (live, systemd)
| service | state | user | PID | restarts |
|---------|-------|------|-----|----------|
| master-controller-api | active/running, enabled | masterctl | 615 | 0 |
| master-controller-worker | active/running, enabled | mcworker | 620 | 0 |
| master-controller-telegram | active/running, enabled | mctelegram | 618 | 0 |
| caddy | active/running, enabled | — | — | — |
| master-controller-imap.timer | active (last cycle exit 0, ~5min ago) | — | — | — |
| master-controller-backup.timer | active (next ~11h) | — | — | — |
| master-controller-discovery.timer | active | — | — | — |

Three SEPARATE low-privilege service users (masterctl/mcworker/mctelegram) — strong isolation. API
listens only on 127.0.0.1:8787 behind Caddy (443). Listeners: 22, 80, 443, localhost 2019 (caddy admin),
localhost 8787 (api). No unexpected public listener.

## Canonical store (live, aggregates only — NO lead PII read)
path `/opt/master-controller/canonical/lead_pipeline_store.json`, owner masterctl:masterctl, mode 644,
size 154337. **store_revision=66**, version=1, updated_by="verify", last_operation_id="verify-lh_TEST_ONLY_TRACKB".
**lead_count=50, unique_ids=50, duplicate_ids=0** (matches documented baseline of 50). CANONICAL_INTEGRITY=PASS
(valid JSON, expected root keys, unique IDs, non-zero size). CANONICAL_WRITER_COUNT=1 (single API service,
single store owner, no second writer service, worker runs API-only with no canonical file access).

## Send metrics (live, aggregates only — NO recipients/bodies)
outbound_send_ledger.jsonl = **7 lines, all status SENT, 0 test_only, 0 unexpected** → matches
HISTORICAL_SUCCESSFUL_LEDGER_SENDS=7. email_ledger=63 lines (historical detail). CURRENT_GATE_A_SENDS=0,
SMTP_CALLS=0, TELEGRAM_API_CALLS=0, MESSAGES_SENT=0. autosend=false in all canonical/config occurrences.

## Queue / worker / scheduler (live)
job_queue.json: 28 jobs, all COMPLETED, 0 pending/running/failed, **0 dead letters**. Worker active,
0 restarts. Scheduler timers firing on schedule (discovery last 9h ago, next ~14h).

## Telegram / IMAP (live, no API/protocol call)
TELEGRAM_PROCESS_COUNT=1, TELEGRAM_POLLER_COUNT=1, getUpdates conflicts=0, service user mctelegram,
0 restarts, no direct canonical file access (separate user), no local fallback listener. IMAP service
runs `stage1_readonly`, last cycle exit 0; ExecStart = read-only sync script; no flag mutation, no send.

## Infrastructure (live)
Caddy active+enabled · TLS Let's Encrypt valid → 2026-09-14 (~88d) · UFW **active** · fail2ban **active**
(sshd jail) · latest canonical backup present (154337 bytes) + CHECKSUMS.txt · disk/memory healthy.

## API (live GET)
/health → 200 (well-formed, no secrets). Privileged endpoints → 401 (device-pairing enforced — auth
boundary active). No mutation endpoint called.

## Safety
VPS_CHANGES=0 · PRODUCTION_CANONICAL_WRITES=0 · SERVICES_RESTARTED=0 · REBOOT=NO · BACKUP/RESTORE=NO ·
SECRETS_PRINTED=0 · MESSAGES_SENT=0 · autosend unchanged (false) · tag unmoved · no remote.
