# Master Controller v0.4.0-rc1 — Rollback & Recovery Runbook

Date: 2026-06-17. Branch: feature/master-controller-lead-hunter-integration. Tag target: ef6eaf3.

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
