# SSH Access Register

> ⚠️ METADATA ONLY. No passwords, keys or private key material stored here.

## SSH Hosts

| ID | IP | Port | User | Auth Method | Key Location | Status | Notes |
|---|---|---|---|---|---|---|---|
| SSH-002 | 195.96.132.82 | 22 | root | Password (bootstrap) → key | `~/.ssh/vps_185_214_108_101_ed25519` (label only) | 🟢 ACTIVE VPS | Master Controller API host. Key install pending root password bootstrap. |
| SSH-001 | 185.214.108.101 | 22 | root | — | — | ❌ OBSOLETE_WRONG_VPS_IP | Decommissioned address; do not use for SSH/deploy/Caddy/Android/runtime. |

## SSH Key Plan

| Step | Action | Status |
|---|---|---|
| 1 | Generate ed25519 key on Windows | ⏳ PENDING |
| 2 | Copy public key to VPS | ⏳ PENDING |
| 3 | Test login with key | ⏳ PENDING |
| 4 | Set PasswordAuthentication no in /etc/ssh/sshd_config | ⏳ PENDING |
| 5 | Store private key in D:\AI_SECRETS\02_ssh_keys\ | ⏳ PENDING |

## Commands (for Dmitry, not for AI)

```
# Windows: generate key
ssh-keygen -t ed25519 -C "admin@185.214.108.101" -f C:\Users\dima-\.ssh\id_ed25519_vps

# Copy to VPS (requires password)
ssh-copy-id -i C:\Users\dima-\.ssh\id_ed25519_vps.pub root@185.214.108.101

# Test
ssh -i C:\Users\dima-\.ssh\id_ed25519_vps root@185.214.108.101

# After confirmed: disable password login
# /etc/ssh/sshd_config → PasswordAuthentication no
# systemctl restart sshd
```

## SSH Tunnel for Panel Access (after 2053 is closed)

```
ssh -L 2053:127.0.0.1:2053 root@185.214.108.101
# Then open: http://127.0.0.1:2053/admin/
```

## Event Log

| Date | Event | By | Notes |
|---|---|---|---|
| 2026-05-24 | VPS first configured with VLESS Reality | Cline/AI | Password auth only; key not yet created |
| 2026-05-24 | VLESS Reality inbound created on port 443 | Cline/AI | bonding_vpn safe, 3X-UI active |
