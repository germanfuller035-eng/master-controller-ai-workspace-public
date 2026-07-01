# Operational Soak — Discovery Cycle Integrity

**Дата:** 2026-06-19 · bounded observation + один controlled manual trigger (те же гейты/лимиты).

## Результат
```
discovery scheduler owner: 1 (master-controller-discovery.service, oneshot+timer)
duplicate jobs: 0 · direct canonical writers: 0 · promotion path: API_ONLY
manual trigger: enqueued LEAD_DISCOVERY -> worker COMPLETED, без дубликатов
leads: 69 (idempotent — повторный same-day прогон не добавил лидов)
queue: 51 COMPLETED, 0 FAILED, 0 DEAD_LETTER
stale writelock at rest: ОТСУТСТВУЕТ (фикс acquireLock работает)
services: api/telegram/worker active
send ledger: 04fda652, 7 строк (unchanged) · commercial sends 0 · SMTP 0
canonical writer count: 1
```
ВЫВОД: discovery работает стабильно, один владелец, без дублей и прямых записей, контур безопасен.
