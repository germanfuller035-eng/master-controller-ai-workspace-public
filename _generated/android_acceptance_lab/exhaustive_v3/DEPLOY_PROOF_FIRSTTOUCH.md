# DEPLOY PROOF — SAFE_TEST_ONLY_FIRSTTOUCH (2026-06-22)

## Preflight (read-only, до деплоя)
Prod-хеши 4 backend-файлов ТОЧНО совпали с закоммиченным HEAD (7f1e7fc) → prod был чист, дрейфа нет:
- first_touch_service.mjs = 6df2c57e... (== git HEAD)
- index.mjs = fab105e2... (== git HEAD)
- mini_audit/service.mjs = 4558cb01... (== git HEAD)
- owner_commercial_truth.mjs = 5e86b529... (== git HEAD)
seed_firsttouch_candidate.mjs — отсутствовал (новый файл). Сервис active.
Sole writer: один master-controller-api.service. Соседи: caddy, telegram, worker (отдельные).

## Backup
.bak_v3_ft создан для всех 4 изменяемых файлов (cp -n, не перезаписывает существующий).

## Deploy (scp 5 allowlisted файлов)
Postflight хеши на VPS == local (deploy match):
- first_touch_service.mjs = fbbfd4eb...
- index.mjs = c855f7d8...
- mini_audit/service.mjs = ad6e48c7...
- owner_commercial_truth.mjs = 1166a14c...
- seed_firsttouch_candidate.mjs = 67bc39de...

## Restart + postflight
sudo systemctl restart master-controller-api → active.
Public health: {"ok":true,"status":"ok"} (https://195-96-132-82.sslip.io/api/v1/health).
first-touch summary invariants (через node на VPS с env):
- summary(false): scope=COMMERCIAL_REAL_ONLY, leads_scored=40, controlled_send_gate=DISABLED, no_send=true
- summary(true): scope=COMMERCIAL_REAL_PLUS_TEST_ACCEPTANCE, leads_scored=40
- DELTA_leads_scored=0 (test-лида ещё нет → утечки нет; синтетик появится только после seed)

PRODUCTION_DEPLOYED=YES
PRODUCTION_HASH_MATCH=YES
SCHEMA_MIGRATION=NO
ROLLBACK=восстановить .bak_v3_ft + restart
CLIENT_MESSAGES_SENT=0, SMTP_CALLS=0, PAYMENT_OPERATIONS=0, SEND_LEDGER_DELTA=0 (на момент деплоя)
