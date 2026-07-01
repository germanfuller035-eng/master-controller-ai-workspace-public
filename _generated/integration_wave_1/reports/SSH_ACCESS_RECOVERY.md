# Integration Wave 1 — SSH Access Recovery (read-only)

date: 2026-06-18 · branch feature/integration-wave-1-commercial-core-v1 · HEAD 1286c1c

## Verdict
SSH_ACCESS_RECOVERED=YES · ACCESS_METHOD=PREVIOUSLY_PROVEN_EXISTING_KEY
AUTHORIZED_KEYS_CHANGED=NO · SSH_SERVER_CONFIG_CHANGED=NO · NEW_KEY_GENERATED=NO

The previous halt was cause #1 in the runbook: the prior pass selected the WRONG local key.
The correct, previously-proven deployment key lives in the protected secrets folder and
authenticates cleanly as masterctl. No server-side change was needed or made.

## Root cause of prior "Permission denied"
- Prior pass used ~/.ssh/vps_mc_key and ~/.ssh/vps_185_214_108_101_ed25519 — both the SAME key,
  fingerprint SHA256:uZ5hw9xhHCblYUrpIvHTq/Vy4q+VoKStwJBgQgtzRyc → REJECTED by production.
- The authorized deployment key was never in ~/.ssh; it is in AI_SECRETS/ssh.

## Recovered key (no private material printed)
PREVIOUS_WORKING_KEY_PATH=/d/AI_SECRETS/ssh/master_controller_195_96_132_82_ed25519
PREVIOUS_WORKING_KEY_FINGERPRINT=SHA256:iO8wf6143FN1U0DJJzrFShO62xT3k+HiGfNxPtgvXXs
PUBLIC_KEY_TYPE=ED25519 · KEY_COMMENT=master-controller@195.96.132.82
PREVIOUS_WORKING_USER=masterctl
PREVIOUS_WORKING_HOST=195.96.132.82
PRIVATE_VS_PUBLIC_MATCH=YES (ssh-keygen -y derived fp == .pub fp)

## Host-key verification (strict)
known_hosts ed25519 fp for 195.96.132.82 = SHA256:f04c0zJQPU01Dweap1bocyip47XMu/JQblNH8BmyZoY
Probe used StrictHostKeyChecking=yes, IdentitiesOnly=yes, PasswordAuthentication=no,
KbdInteractiveAuthentication=no, BatchMode=yes. No host-key bypass. No password auth. No root login.

## Probe result
ACCESS_OK · whoami=masterctl · hostname=debian12
(First attempt timed out — transient; TCP/22 confirmed open 3x; retry succeeded.)

## Key inventory
LOCAL_KEYS_SCANNED=3 (~/.ssh/vps_mc_key, ~/.ssh/vps_185_214_108_101_ed25519 [identical], AI_SECRETS key)
UNIQUE_KEY_FINGERPRINTS=2
REJECTED_KEY_FINGERPRINT=SHA256:uZ5hw9xhHCblYUrpIvHTq/Vy4q+VoKStwJBgQgtzRyc
AUTHORIZED_KEY_FINGERPRINT=SHA256:iO8wf6143FN1U0DJJzrFShO62xT3k+HiGfNxPtgvXXs
PREVIOUS_WORKING_KEY_FOUND=YES

## Security note
AI_SECRETS/01_env/vps_195_96_132_82.env contains a root password. It was NOT used (root login and
password auth are prohibited by the runbook). No secret values are reproduced in this report.
EVIDENCE_SOURCE_FILES=/d/AI_SECRETS/ssh/*, /d/AI_SECRETS/01_env/vps_195_96_132_82.env, ~/.ssh/*
