# SSH Access Recovery (Phase 1)

date: 2026-06-17 · branch feature/controlled-production-launch-v1

## Finding
The previous Gate A pass failed because it used `~/.ssh` keys (fingerprint `SHA256:uZ5hw9...`), which
are NOT authorized on the VPS. The historically-working release credential lives in the protected
AI_SECRETS contour. Recovered from tracked release evidence:

```
ssh -o IdentitiesOnly=yes -i /d/AI_SECRETS/ssh/master_controller_195_96_132_82_ed25519 masterctl@195.96.132.82
```

## Fields
PREVIOUS_SUCCESS_EVIDENCE=YES (release report: "SSH RESTORED: masterctl@195.96.132.82"; documented command line)
HISTORICAL_SSH_USER=masterctl
HISTORICAL_HOST=195.96.132.82
IDENTITY_REFERENCE_FOUND=YES (/d/AI_SECRETS/ssh/master_controller_195_96_132_82_ed25519, present, 432 bytes)
IDENTITY_FINGERPRINT=SHA256:iO8wf6143FN1U0DJJzrFShO62xT3k+HiGfNxPtgvXXs (ED25519, comment master-controller@)
EXPECTED_HOST_KEY_TYPE=ssh-ed25519 (in known_hosts)
CURRENT_AGENT_KEYS=none (no ssh-agent)
SELECTED_SSH_METHOD=IdentitiesOnly=yes + -i <AI_SECRETS key> + masterctl@ + StrictHostKeyChecking=yes
SECRET_VALUES_EXPOSED=NO (fingerprint only; no key content read)
NEW_KEY_CREATED=NO
AUTHORIZED_KEYS_CHANGED=NO
