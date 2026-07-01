# Telegram UX Hotfix — Deployment Report (Gate B executed)

date: 2026-06-17T20:57Z · branch feature/controlled-production-launch-v1 · GATE_B_APPROVED=YES · TELEGRAM_HOTFIX_DEPLOYMENT=PASS

## Scope (exactly as approved)
2 runtime files only, on master-controller-telegram.service. No API/worker/scheduler/IMAP/Caddy/
canonical/queue change, no reboot, no migration.

## Deployed files (pre → post hashes)
| file | before (prod) | after (prod) = target |
|------|---------------|------------------------|
| api_only/index.mjs | d6ad7146…ca14298 | b7b5eea0…822dec ✓ |
| api_only/views.mjs | 787d7544…92a4dc | 99071ffa…248a86 ✓ |
DEPLOYED_SOURCE_MATCH=YES. Owner/perms preserved (masterctl:masterctl, 755/644). api_client.mjs +
mc_service.mjs untouched.

## Backup / rollback
ROLLBACK_PATH=/opt/master-controller/backups/telegram_uxhotfix_20260617_204916 (index.mjs, views.mjs,
PRE_DEPLOY_SHA256SUMS.txt, METADATA.txt) — verified OK. ROLLBACK_EXECUTED=NO (not needed).

## Service restart (single)
master-controller-telegram.service restarted. PID 618 → 7080 (single expected change). ActiveState=
active, SubState=running, NRestarts=0 (no crash-loop), User=mctelegram, process count=1, poller count=1.

## Safety verification (post-restart, read-only)
- Architecture: deployed files clean — no fs/SMTP/localhost/canonical/ledger imports. API-only.
- Canonical unchanged: revision 66→66, leads 50→50.
- Sends: ledger 7→7, deployment-window sends=0, SMTP_CALLS=0, TELEGRAM_API_CALLS=0 (no real send).
- Queue: 28 jobs, 0 failed, 0 dead letters (unchanged).
- autosend=BLOCKED, SEND_ALLOWED_LIVE=OFF (unchanged).

## Server-side UX verification (deployed runtime, mocked svc, NO send)
- /health: no raw status keys ✓, Russian labels ✓ (Отклонены: 9 / Не найден публичный email: 10 / …).
- /next: Russian reason ✓ ("Доставка письма подтверждена…"), real inline button "📂 Открыть лид" ✓,
  callback lead:DKBI_RU ✓, /lead fallback ✓.
- lead callback opens card read-only ✓, NO mutation ✓.
- "меню" text alias → menu handler ✓.

## Soak T+0 (not final)
HOTFIX_SOAK_START_UTC=2026-06-17T20:57:18Z · HOTFIX_COMMIT=08a0a60 · TELEGRAM_PID=7080 ·
DEPLOYED_HASHES=b7b5eea0/99071ffa · rev=66 leads=50 ledger=7 window_sends=0 dead=0 poller=1.
Existing soak monitor reused (1 timer present); NOT modified (outside Gate B scope). SOAK_STATUS=T0_ONLY_NOT_FINAL.

## Result
TELEGRAM_HOTFIX_DEPLOYMENT=PASS · TELEGRAM_OWNER_SMOKE=NOT_RUN (owner retest pending) ·
production unchanged except the 2 approved Telegram view/routing files · tag v0.4.0-rc1 unmoved · no remote.
