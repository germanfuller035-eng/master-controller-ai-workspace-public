# PRODUCTION DEPLOYMENT RESULT

**Дата:** 2026-06-18
**Изменение:** один backend-файл — `tools/commercial_core/lib/readmodels.mjs` (commercial summary fix).

## Backup (перед деплоем)
```
/opt/master-controller/backups/multichannel_activation_20260618T204716Z/
  canonical/{lead_pipeline_store.json, job_queue.json, outbound_send_ledger.jsonl}
  code/readmodels.mjs   env/master-controller.env   SHA256SUMS.txt
```
ledger в бэкапе = 7 строк; SHA256 зафиксированы.

## Деплой (атомарный)
1. SFTP файл → `/tmp/readmodels_new.mjs`.
2. `node --check` → SYNTAX_OK.
3. `chown masterctl:masterctl` + atomic `mv` → `/opt/.../readmodels.mjs`.
4. Restart **только** `master-controller-api.service` (worker/telegram/caddy не трогались на этом шаге).

## Проверка после деплоя (live)
```
/commercial/summary: open_opportunities=3, offers_awaiting_owner=3,
                     offers_ready_for_send_review=3, owner_decisions_required=3   ← ДЕФЕКТ УСТРАНЁН
```
Ранее было `offers_awaiting_owner=0`.

## Production flags (все безопасны, без изменений)
```
MATER_NO_SEND=true            COMMERCIAL_SEND=false        FOLLOWUP_AUTOSEND=false
AGENT_MODE=SHADOW_NO_SEND     AGENT_SEND=false             AGENT_PAYMENT=false
VK_INBOUND=false              MAX_INBOUND=false            CLIENT_TELEGRAM_INBOUND=false
EMAIL_REAL_SEND_ENABLED=false
```

## Целостность после деплоя
```
store_revision=106  canonical_leads=62  jobs=41 COMPLETED  dead_letters=0  send_ledger=7
canonical_writer_count=1
```
