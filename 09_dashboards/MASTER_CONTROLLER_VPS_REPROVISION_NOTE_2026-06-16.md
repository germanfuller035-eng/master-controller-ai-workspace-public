# VPS Re-provisioning Note — Master Controller (2026-06-16)

DEPLOYMENT_PAUSED=YES — owner is reimaging the VPS before deploy.

## VPS
- CURRENT_VPS_IP=195.96.132.82
- OLD_VPS_IP=185.214.108.101 → OBSOLETE_WRONG_VPS_IP (do not use)
- CURRENT_OS=CentOS 7 (legacy/EOL) — not suitable for production Node runtime
- RECOMMENDED_OS=Debian 12 (bookworm)

## Deploy key (passphrase-less ed25519, deploy-only)
- Private key: `D:\AI_SECRETS\ssh\master_controller_195_96_132_82_ed25519` (ACL: current user only; NOT in repo)
- Public key (install into `/home/masterctl/.ssh/authorized_keys` after reimage):
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFtNc7s2BjQwdae41yXU24tfN7Jbca0wfL/7obiaMPBU master-controller@195.96.132.82
```
- Old key `~/.ssh/vps_185_214_108_101_ed25519` is passphrase-ENCRYPTED → deprecated; not used for deploy.

## After Debian 12 reimage — resume sequence
1. Owner provides root access (key or temp password) to fresh Debian 12.
2. Install the deploy public key for `masterctl` (sudo user); verify `masterctl@195.96.132.82` key login + NOPASSWD sudo.
3. Install Node 20 LTS + Caddy; deploy `tools/mater_controller_api` to `/opt/master-controller` via `deploy/deploy.sh`.
4. systemd unit `master-controller-api` (binds 127.0.0.1:8787), Caddy TLS on :443, ufw + fail2ban.
5. Server-side env at `/etc/master-controller/master-controller.env` (mode 600, NOT in repo).
6. Remote E2E no-send; Autosend stays BLOCKED.

## Guardrails honored this step
- No Node/Caddy/backend/systemd installed on CentOS 7.
- No further sshd config changes; root/password auth left as-is (sshd DEBUG3 already reverted to baseline).
- No emails sent. Autosend BLOCKED.
