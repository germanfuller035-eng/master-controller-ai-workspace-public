# Master Controller v0.4.0-rc1 — Rollback & Recovery Runbook

Date: 2026-06-17. Branch: feature/master-controller-lead-hunter-integration.
Tag: v0.4.0-rc1 (annotated, unsigned, NOT pushed) → 9d346f3. HEAD: 9cb073d (+post-release docs).
Build commit: ef6eaf3 (Android source byte-identical to 9d346f3 — verified). versionCode 4.
SSH: masterctl@195.96.132.82, key fp SHA256:iO8wf6143FN1U0DJJzrFShO62xT3k+HiGfNxPtgvXXs (no secret values here).

## A. Android app rollback

Previous shipping artifacts remain in `dist/master_controller_android/`:
- v0.3.0-rc1: MasterController-release-v0.3.0-rc1.apk / .aab (versionCode 3)
- v0.2.0-rc2: MasterController-release-v0.2.0-rc2.apk / .aab

To roll back: reinstall the prior signed APK (same signing key CN=Mater Controller, so in-place
update works) or re-upload the prior AAB. versionCode 4 → reverting requires uninstall+install on
device (Android blocks version downgrade in-place). Play/internal track: upload prior AAB as new build.

## B. VPS canonical store rollback

Backup created pre-reboot: `/opt/master-controller/backups/release_20260617_prereboot/`
- lead_pipeline_store.json (revision 66, 50 leads, sha 20e5cce5…)
- job_queue.json (sha ba867a67…)
- telegram_api_only.tar.gz (sha 77c474b8…)
- systemd_units.tar.gz (sha fc3dcb36…)
- MANIFEST.sha256

Restore canonical (as masterctl, API stopped to avoid concurrent write):
```
sudo systemctl stop master-controller-api.service
cp /opt/master-controller/backups/release_20260617_prereboot/lead_pipeline_store.json \
   /opt/master-controller/canonical/lead_pipeline_store.json
cp /opt/master-controller/backups/release_20260617_prereboot/job_queue.json \
   /opt/master-controller/canonical/job_queue.json
sha256sum /opt/master-controller/canonical/lead_pipeline_store.json   # must equal 20e5cce5…
sudo systemctl start master-controller-api.service
curl -s http://127.0.0.1:8787/api/v1/health
```
Restore drill verified: backup restores to valid JSON, revision/leads intact, checksum matches.

## C. Telegram api_only client rollback
```
cd /opt/master-controller/tools/telegram_gateway
tar xzf /opt/master-controller/backups/release_20260617_prereboot/telegram_api_only.tar.gz
sudo systemctl restart master-controller-telegram.service
systemctl status master-controller-telegram.service --no-pager
```
Do NOT restore the deprecated local bot (telegram_master_bot.mjs) — it is not deployed and must stay so.

## D. systemd units rollback
```
cd /tmp && tar xzf /opt/master-controller/backups/release_20260617_prereboot/systemd_units.tar.gz
sudo cp master-controller-*.service master-controller-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
```

## E. Git rollback
- Tag target ef6eaf3. To undo the release commit chain: `git revert ef6eaf3` (checkpoint doc only)
  and `git revert 73f17ae` (release artifacts), preserving history. Do not force-push.

## F. Safety invariants to re-verify after ANY rollback
- single api/worker/telegram process; no legacy bot; autosend BLOCKED; MATER_NO_SEND=true;
  EMAIL_REAL_SEND_ENABLED=false; canonical dir 0750 masterctl-only; worker/telegram cannot read canonical.

(old §E git rollback superseded by §H below.)

## G. Operational commands (day-to-day)

SSH: `ssh -o IdentitiesOnly=yes -i /d/AI_SECRETS/ssh/master_controller_195_96_132_82_ed25519 masterctl@195.96.132.82`

Service status:    `systemctl status master-controller-{api,worker,telegram}.service --no-pager`
Service restart:   `sudo systemctl restart master-controller-<svc>.service`
Timers:            `systemctl list-timers 'master-controller-*' --no-pager`
API health:        `curl -s http://127.0.0.1:8787/api/v1/health`  (ext: https://195-96-132-82.sslip.io/api/v1/health)
Single-poller chk: `pgrep -u mctelegram -f index.mjs | wc -l`  (must be 1)
Failed units:      `systemctl --failed --no-legend`  (must be 0)

Scheduler pause/resume (discovery): `sudo systemctl stop|start master-controller-discovery.timer`
Dead-letter inspect: API `GET /api/v1/jobs` (dead-letter bucket) or Android System→Operations→Dead Letters.

No-send safety verify (must show false/true):
`sudo grep -hoE '^(EMAIL_REAL_SEND_ENABLED|MATER_NO_SEND)=[a-z]+' /etc/master-controller/*.env`
`ss -tln | grep -cE ':(25|465|587)\b'`  (must be 0)

## H. Git rollback (corrected)
- Tag v0.4.0-rc1 → 9d346f3. To revert post-tag docs only: `git revert 9cb073d a7c20ac`.
- To undo release content: `git revert 9d346f3 73f17ae` (preserves history). Do NOT force-push.
- Pre-v0.4.0 baseline: checkout tag v0.3.5-rc1 or commit a5b22c3~ for the prior Android state.

## I. Reboot validation (post-reboot checklist)
1. SSH returns. 2. `systemctl --failed` = 0. 3. api/worker/telegram active, NRestarts=0.
4. single poller. 5. canonical revision retained (was 66 / 50 leads). 6. API health ok ext+int.
7. no-send env intact. 8. caddy/ufw/fail2ban active. 9. soak timer re-armed.

## J. Backup & restore drill
- Backups: `/opt/master-controller/backups/release_<TS>/` (canonical, job_queue, telegram_api_only.tar.gz, systemd_units.tar.gz, MANIFEST.sha256).
- Create: see §B/§C tar commands. Drill (non-destructive): copy to mktemp, `sha256sum` vs MANIFEST, `node -e` JSON validity + revision/leads.
- Latest verified backups: release_20260617_prereboot, release_20260617_postaccept (both restore-drilled OK).

## K. Soak observability (read-only)
- Timer `mc-soak-capture.timer` (hourly, oneshot, User=masterctl) appends to
  `/opt/master-controller/soak/soak_observations.jsonl`. NOT a scheduler/worker/poller — read-only.
- Stop after acceptance: `sudo systemctl disable --now mc-soak-capture.timer` then remove unit files.
