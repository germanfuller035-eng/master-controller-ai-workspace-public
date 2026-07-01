# Production Deployment + Live Verification — Production Activation Wave

**Дата:** 2026-06-19 · VPS 195.96.132.82 (masterctl@debian12).

## SSH
Известный ключ, fingerprint совпал. Новых ключей не добавлено, authorized_keys не менялся.

## Backup
`/opt/master-controller/backups/production_activation_20260619T132653Z` — queue_store.mjs, index.mjs, canonical store, send ledger, job_queue + SHA256SUMS. Rollback rehearsal: before-хэши совпадают с prod (restore доказан).

## Deploy (3 файла, staging→sha-verify→atomic mv)
| Файл | before | after | назначение |
|---|---|---|---|
| `jobs/queue_store.mjs` | 43ecfd11 | e8cfb0c0 | фикс acquireLock (mtime fallback) |
| `commercial/first_touch_commands.mjs` | ABSENT | dc59a3a4 | новый no-send command-слой |
| `server/index.mjs` | 5876069e | 1f22adbb | 8 command-роутов |
Рестарт только API (NRestarts 0). telegram/worker/IMAP/Caddy не трогались. Reboot не было.

## Live verification (no-send)
- Discovery enqueue восстановлен (был 500 из-за stale lock).
- Command workflow на KZ-JBI_RU: generate-draft ok; идемпотентный replay (тот же draft_id); select-subject ok; **approve-text-only → text_approved=true, send_allowed_live=false, approval_token_issued=false**; stale revision → **409**; select-pilot → selected_pilot=KZ-JBI_RU, send_allowed_live=false.
- Материализовано **2** draft-пакета (≤3) через sole writer.

## Целостность production после волны
```
send ledger: 04fda652 (UNCHANGED) · 7 строк · commercial sends=0 · SMTP=0 · client messages=0
canonical: rev 106→125, leads 62→69 (7 промоушенов discovery + owner-command записи в first_touch.* секции)
queue: 50 COMPLETED, 0 failed, 0 dead letters · writer count=1
KZ-JBI_RU send-поля не тронуты (last_send_status=none)
services: api/telegram/worker active
autosend BLOCKED · sendAllowedLive OFF · controlled_send_gate DISABLED · transport false · payment 0
```

## Объяснение инкрементов revision (106→125)
- 106→120: discovery validation run (7 новых лидов, FREE_ONLY).
- 120→125: owner-command записи (generate-draft ×2, select-subject, approve-text-only, select-pilot) в секции `first_touch.drafts/decisions/pilot`. Никаких изменений send-ledger/awaiting_reply/follow-up/transport.

ROLLBACK_REQUIRED=NO.
