# Master Controller — Autonomous Core (progress, 2026-06-16)

This pass: hardening + safety automation that protects the whole system, done with live proof.
The large autonomy phases (Telegram/worker API-only conversion, leadgen/verify/audit/draft
pipeline, follow-up UI, full E2E, device test) are NOT done — they are multi-session and
remain staged. No PASS is claimed without proof below.

## DONE + verified this pass
- **fail2ban fixed** (Phase 10 security): was `failed` since reprovision (Debian 12 logs SSH to
  journal; jail expected a logfile). Added `/etc/fail2ban/jail.local` with `backend=systemd`.
  Now `active`; sshd jail tracking (282 historical attempts).
- **Automated VPS canonical backup** (Phase 9.4/9.5): `master-controller-backup.{sh,service,timer}`
  — daily, sha256 + retention(14) + disk guard. Timer `active` (next 03:23 EDT). Ran once:
  `BACKUP_OK sha=477c0e54 disk=33%`. Restore drill PASS (temp restore, 50 leads, rev 7,
  counts match canonical, checksum recorded). No secrets in backup.

## Baseline confirmed
- VPS: api active, caddy active, fail2ban now active. canonical 50 leads / rev 7. RAM 305/960MB,
  disk 33%. No local writers; local start guard in place (v2B).
- Telegram service / worker service: NOT deployed on VPS (inactive).

## STOP CONDITION hit — Phase 3 (IMAP 24/7)
24/7 IMAP reply sync on the VPS needs the Yandex mail credentials ON the VPS
(`NO_MAIL_CREDS_ON_VPS`) + `imapflow` install + connector deploy. Putting a mail app-password
on the public host is (a) a missing credential I must not fabricate and (b) a data-residency
decision for the owner. Did NOT deploy non-functional scaffolding or claim "IMAP active".

## NOT done (honest — staged, multi-session)
- Phase 1 Telegram API-only: 5033-line bot + ~16 modules still contain direct-file paths;
  bot stopped + guarded (safe) but not converted. No VPS Telegram service.
- Phase 2 Workers API-only: not converted; no VPS worker service; no job queue built.
- Phase 3 IMAP 24/7: blocked on VPS mail creds (above).
- Phases 4–8 leadgen/verify/audit/draft/follow-up automation: not built this pass.
- Phases 11–13 full E2E / reboot / device: not run this pass.

## Safe state
Single canonical writer (VPS API) holds: 1 writer process, 0 local writers, start guard armed,
AUTOSEND=BLOCKED, 0 emails. Backup now automated + restore-proven. fail2ban restored.

## NEXT_ACTION (one owner decision unblocks Phase 3)

## UPDATE 2 — owner approved IMAP cred on VPS; Phases A + D DONE
- Phase A: Yandex IMAP app-password provisioned to VPS `/etc/master-controller/credentials/yandex_imap.env`
  root:root 0600. Unprivileged service user CANNOT read it (verified MASTERCTL_CAN_READ=NO).
  Secret not in git, not in journal (0 hits), not in argv. Transferred via SFTP+sudo, never printed.
- Phase D: 24/7 read-only IMAP reply sync LIVE. `master-controller-imap.{service,timer}` (every
  15 min, active). Live fetch proven: TLS read-only EXAMINE, creds PRESENT, fetched_headers=0
  (no matching inbound now), 0 flags changed, idempotent ingest, nothing sent. imapflow installed.
  reply_monitor paths env-overridable (MC_REPLY_DIR); API serves /replies/counts from it over HTTPS.
  Reply tests still 23/23.
- STILL NOT DONE (multi-session, honestly): Phase B (Telegram API-only, 5033-line bot + ~16 modules
  + VPS service), Phase C (workers API-only + job queue + VPS service), Phases E–G (leadgen,
  verification, auto-audit, auto-draft, follow-up automation), Phase I full E2E, Phases J/13
  device test. These are NOT blocked by anything external now — they are simply large build work.

## NEXT_ACTION (original — superseded by UPDATE 2)
