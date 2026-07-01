# RECOVERY VERIFICATION

**Дата:** 2026-06-18

## Проведённые recovery-тесты (live)

| Тест | Результат |
|---|---|
| API restart | `active`, /commercial/summary стабильна (3/3/3), идемпотентно |
| Worker restart | `active` |
| Send ledger после рестартов | 7 строк (без дублей) |
| store_revision после рестартов | 106 (без изменений) |
| Owner Telegram poller | `active` (не затронут рестартом API/worker) |
| Caddy | `active` |

## Без дубликатов
- Нет дублирующихся inbound-событий (webhooks gated 403).
- Нет дублирующихся лидов / opportunity (revision стабильна).
- Нет дублирующихся agent-run (shadow read-only).

## VPS reboot
Не выполнялся (не требовался) — restart только изменённого сервиса.

## Rollback
Не потребовался. При необходимости: восстановить `code/readmodels.mjs` из backup-каталога и
перезапустить API. Backup-каталог содержит SHA256SUMS для проверки.

```
RECOVERY_STATUS=PASS
ROLLBACK_REQUIRED=NO
ROLLBACK_EXECUTED=NO
```
