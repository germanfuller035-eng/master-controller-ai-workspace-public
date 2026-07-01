# Gate B Package — Telegram Owner-Smoke UX Hotfix

date: 2026-06-17 · branch feature/controlled-production-launch-v1 · GATE_B_REQUIRED=YES · GATE_B_APPROVED=NO (do not deploy)

This fix changes the production Telegram runtime → Gate B required. Owner approval token NOT present
in this pass. NO deployment, restart, or VPS change performed.

## Exact changed files (2)
| file | production sha256 (current) | target sha256 (this branch) |
|------|------------------------------|------------------------------|
| tools/telegram_gateway/api_only/index.mjs | d6ad71460f8ade5477532cb2e1226790af4ab01812ebab57717ffd422ca14298 | b7b5eea04666dbcbdb38a2b10afbaa49b8412ae5d4f39c9ddf104b60a8822dec |
| tools/telegram_gateway/api_only/views.mjs | 787d7544d5462f18aa659af308cddfe823dd79caff926a50cde3cb13e292a4dc | 99071ffa0107f1aa6153f4d65d7dfb5876cfc81d656d03a9a2e17656d3248a86 |

UNCHANGED (must NOT be touched): api_client.mjs (4904d7a5…), mc_service.mjs (5a09559c…) — identical
prod vs branch.

SOURCE_COMMIT=08a0a60
SERVICE_AFFECTED=master-controller-telegram.service
DATA_MIGRATION_REQUIRED=NO · CANONICAL_DATA_IMPACT=NONE · REBOOT_REQUIRED=NO
EXPECTED_DOWNTIME=brief Telegram restart only (seconds; API/worker/canonical untouched)
AUTOSEND=BLOCKED · SEND_ALLOWED_LIVE=OFF (unchanged by this fix)

## Backup plan (owner runs at Gate B)
```
ts=$(date -u +%Y%m%d_%H%M%S)
mkdir -p /opt/master-controller/backups/telegram_uxhotfix_$ts
cp /opt/master-controller/tools/telegram_gateway/api_only/index.mjs /opt/master-controller/backups/telegram_uxhotfix_$ts/
cp /opt/master-controller/tools/telegram_gateway/api_only/views.mjs /opt/master-controller/backups/telegram_uxhotfix_$ts/
sha256sum /opt/master-controller/backups/telegram_uxhotfix_$ts/*.mjs > /opt/master-controller/backups/telegram_uxhotfix_$ts/SHA256SUMS.txt
```

## Deployment commands (owner runs at Gate B — exact 2-file copy, no rsync)
```
# from a trusted host that has the reviewed branch files:
scp -i <AI_SECRETS key> index.mjs  masterctl@195.96.132.82:/opt/master-controller/tools/telegram_gateway/api_only/index.mjs
scp -i <AI_SECRETS key> views.mjs  masterctl@195.96.132.82:/opt/master-controller/tools/telegram_gateway/api_only/views.mjs
# verify hashes match target BEFORE restart:
ssh ... 'cd /opt/master-controller/tools/telegram_gateway/api_only && sha256sum index.mjs views.mjs'
# expect: index b7b5eea0… , views 99071ffa…
```

## Restart command (single service)
```
sudo systemctl restart master-controller-telegram.service
```

## Post-restart checks (read-only)
1. `systemctl show master-controller-telegram.service -p ActiveState -p SubState -p MainPID -p NRestarts` → active/running, NRestarts +1 only.
2. One poller: `pgrep -u mctelegram -c` → 1 (no getUpdates conflict in journal).
3. API-only: no new fs/SMTP access (static guard already proven); service user still mctelegram.
4. No-send: autosend=false unchanged; ledger still 7 lines (no new send).
5. Owner re-runs Telegram smoke: /health Russian + no raw keys; /next shows real 📂 Открыть лид button; меню alias works; /leads shows filter + buttons.

## Rollback
TRIGGER: any post-restart check fails, poller>1, service crash-loop, or owner smoke still failing.
```
cp /opt/master-controller/backups/telegram_uxhotfix_$ts/index.mjs /opt/master-controller/tools/telegram_gateway/api_only/index.mjs
cp /opt/master-controller/backups/telegram_uxhotfix_$ts/views.mjs /opt/master-controller/tools/telegram_gateway/api_only/views.mjs
sudo systemctl restart master-controller-telegram.service
```
Rollback restores prod hashes d6ad7146… / 787d7544…. Canonical store untouched throughout — no
canonical rollback needed, no newer-data overwrite risk.

## Scope guarantees
Only 2 Telegram view/routing files. No backend/worker/scheduler/IMAP/canonical/schema change. No
second writer, no autosend, no live send, no reboot, no migration.
