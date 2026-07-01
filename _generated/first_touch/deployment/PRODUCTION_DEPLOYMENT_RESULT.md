# First Touch — Production Deployment + Live Verification (no-send)

**Дата:** 2026-06-19 · VPS 195.96.132.82 (`masterctl@debian12`) · API `https://195-96-132-82.sslip.io` (loopback 8787)

## SSH
- Использован известный ключ `D:\AI_SECRETS\ssh\master_controller_195_96_132_82_ed25519`.
- Fingerprint: **совпал** (`SHA256:iO8wf6143FN1U0DJJzrFShO62xT3k+HiGfNxPtgvXXs`). Новые ключи не добавлялись, `authorized_keys` не менялся.

## Backup
- `/opt/master-controller/backups/first_touch_20260619T115054Z` — заменяемые файлы + canonical store + send ledger + job queue + `SHA256SUMS.txt`. Before-хэши: engine `91a4cfc1`, service `55ca58a5`, index `5876069e`, store `04c0160d`, ledger `04fda652`. Rollback подтверждён наличием .bak.

## Deploy (frozen manifest v2, 2 изменённых файла)
- staging → sha-verify (engine `b7c15c6d`, service `0e549bfc`) → `node --check` PASS → atomic `mv` → post-replace hashes совпали.
- `index.mjs` не трогался (на prod уже идентичен, routes присутствуют).
- Рестарт **только** `master-controller-api` (PID 2480→3503, NRestarts 0). Telegram + worker: active, не трогались. Caddy/IMAP/scheduler/reboot — не трогались.

## Live verification (4 read-only эндпоинта, authed loopback)
Доказательства: `LIVE_PRODUCTION_ENDPOINTS.txt` (все 4 → `ok:true`).
- `/first-touch/summary`: **leads_considered=62, leads_scored=62, leads_not_scored=55, unexplained_exclusions=0, pilot_eligible=7**, recommended BETON-MASTERS_RU, controlled_send_gate=DISABLED, transport_enabled=false, no_send=true.
- `/first-touch/candidates`: top-5 (BETON-MASTERS_RU, DKBI_RU, GBIRESURS_RU, KZ-JBI_RU, MEGALIT-KRD_RU), все q98/s84.
- `/first-touch/pilot-readiness`: send_allowed_live=false, approval_token_issued=false, owner_text_approved=false, transport_disabled=true.
- `/first-touch/candidates/BETON-MASTERS_RU`: QA_PASSED, q98/PASS, deliverability READY_NO_SEND, content_hash `08d2ed71976f61c9dcb332fac3751ade`. Грамматика исправлена («Наблюдение по сайту», без «на сайте на сайте») — фикс подтверждён на production.

## Честная оговорка по «command API» и материализации
Развёрнутый/замороженный First Touch на production — **только read-only**: 4 GET-роута, **0 POST/command-роутов**. «FIRST_TOUCH_COMMAND_API», материализация draft-сущностей и owner-команды (select/approve/reject) в замороженном коде **отсутствуют**. Их добавление — новая production-функциональность, что запрещено во время деплоя. Поэтому: команды не включались, draft-сущности не материализовались (0), писатель canonical не вызывался.

## Целостность production после деплоя
```
store sha = 04c0160d (unchanged) · ledger sha = 04fda652 (unchanged)
revision = 106 · leads = 62 · send ledger = 7 lines · commercial sends = 0
queue: 41 COMPLETED / 0 failed / 0 dead letters · writer = 1
autosend BLOCKED · sendAllowedLive OFF · commercial_send OFF · followup_autosend OFF · payment_facts 0
REAL_OUTBOUND_MESSAGES=0 · SMTP_CALLS=0 · EMAILS_SENT=0
```
ROLLBACK_REQUIRED=NO.
