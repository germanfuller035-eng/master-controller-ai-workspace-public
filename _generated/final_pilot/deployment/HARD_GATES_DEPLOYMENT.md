# Deployment — Hard-Gate Selector + Blocked-Candidate Surfacing

**Дата:** 2026-06-19 · VPS 195.96.132.82.

## Изменённые runtime-файлы (2)
| Файл | before | after |
|---|---|---|
| `commercial/first_touch_service.mjs` | 0e549bfc | 6df2c57e |
| `server/index.mjs` | 1f22adbb | 7d249b19 |

(`followup_engine.mjs` в source control добавлен, но на prod уже идентичен 79d5066 — деплой не требовался.)

## Процесс
backup (`/opt/master-controller/backups/hard_gates_20260619T150300Z`) → staging → sha-verify → node --check → atomic mv → restart только API (NRestarts 0). Telegram/worker/IMAP/Caddy не трогались.

## Live verification
```
/first-touch/summary: leads_considered=69, pilot_eligible=0, recommended_pilot=null
/first-touch/candidates: top_5=0, blocked=50 (каждый с причиной)
  KZ-JBI_RU -> BLOCKED_IDENTITY_MISMATCH, BLOCKED_CONTACT_UNVERIFIED
```
Ни один лид не подаётся как безопасный пилот.

## Целостность
```
canonical rev 125, leads 69 (unchanged) · ledger 7 / 04fda652 (unchanged)
commercial sends 0 · SMTP 0 · services active · writer 1
```
ROLLBACK_REQUIRED=NO.
