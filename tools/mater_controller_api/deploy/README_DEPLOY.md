# Master Controller — VPS Deployment (PREPARED; blocked on SSH key)

VPS: 195.96.132.82 (1 vCPU / 1 GB / 10 GB). Lightweight: systemd + Node + Caddy. No Docker.

> BLOCKER: the VPS was reprovisioned — its SSH host key changed and the public key
> `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAII/8RKd4WeaI+uPKN7vH1/w2UBthdGWKa5rs88zUYSko`
> is no longer authorized. Add it to `/root/.ssh/authorized_keys` (or a `masterctl` user)
> via the provider console, then run `deploy.sh`. The SSH password is never used in any
> script/log per policy.

## One-time hardening (run as root after key is authorized)
```bash
# user + ssh key
adduser --disabled-password --gecos "" masterctl
install -d -m700 -o masterctl -g masterctl /home/masterctl/.ssh
cp /root/.ssh/authorized_keys /home/masterctl/.ssh/authorized_keys
chown masterctl:masterctl /home/masterctl/.ssh/authorized_keys && chmod 600 /home/masterctl/.ssh/authorized_keys
# verify masterctl key login from laptop BEFORE disabling password:
#   ssh -i ~/.ssh/vps_185_214_108_101_ed25519 masterctl@195.96.132.82 'echo ok'
# only then:
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload ssh
# firewall + fail2ban
apt-get update && apt-get install -y ufw fail2ban
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
systemctl enable --now fail2ban
# swap (1 GB) for a 1 GB box
fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
# node LTS + caddy
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs git
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
# (Caddy install per official repo)
```

## App layout
- Code: `/opt/master-controller` (owner masterctl).
- Secrets: `/etc/master-controller/master-controller.env` (root:masterctl, mode 600) — NOT in repo.
- Backend binds `127.0.0.1:8787`. Caddy terminates TLS on :443 and reverse-proxies to it.

## HTTPS hostname
Preferred: owner domain. Fallback: `195-96-132-82.sslip.io` (resolves to the IP), which lets
Caddy obtain a real Let's Encrypt cert automatically. If neither the domain nor sslip.io issuance
works, do NOT serve plain HTTP over the internet and do NOT disable Android TLS verification —
that is the documented blocker.

See `Caddyfile`, `master-controller-api.service`, `deploy.sh` in this folder.
