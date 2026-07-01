# Discovery Owner Inventory + Failed-Unit Root Cause

**Дата:** 2026-06-19 · VPS 195.96.132.82 (masterctl@debian12).

## Inventory всех discovery-компонентов
| Компонент | Тип | Состояние | Роль |
|---|---|---|---|
| `master-controller-discovery.service` | systemd oneshot (timer) | был failed → исправлен | **единственный production scheduler owner** |
| `master-controller-discovery.timer` | systemd timer | active (next ~06:19 daily) | триггер scheduler |
| `daily_discovery.mjs` | node script (mcworker) | OK | enqueue ОДНОГО LEAD_DISCOVERY/день через API |
| `master-controller-worker.service` | systemd (active) | OK | исполняет LEAD_DISCOVERY job (OverpassAdapter), promotion через API |
| `master-controller-api.service` | systemd (active) | OK | sole canonical writer |
| `master-controller-imap.service/.timer` | systemd | inactive/dead (по расписанию) | read-only reply sync |
| `master-controller-backup.service/.timer` | systemd | OK | ежедневный backup |
| `mc-soak-capture.service` | systemd | inactive | observability |

## Вердикт: ВАРИАНТ A — единственный нужный owner
- Дубликатов discovery нет. Прямых писателей canonical нет (worker promotion идёт строго через API).
- `daily_discovery.mjs` идемпотентен по дню, учитывает backpressure, paused-флаг; не имеет FS/SMTP-доступа.
- Сервис успешно отрабатывал 16/17/18 июня (`SCHED_OK`).

## Root cause failed-юнита (2026-06-19)
- 06:16:53 `SCHED_ENQUEUE_FAIL status=500` от `POST /jobs/enqueue`.
- Причина: **stale пустой writelock** `/opt/master-controller/canonical/job_queue.json.writelock` (0 байт, 02:05). `acquireLock()` пытался `JSON.parse` пустого файла → исключение до проверки staleness → lock не переосвобождался → все enqueue упирались в `QUEUE_LOCK_TIMEOUT` → 500.
- Подтверждено: воспроизведён 500, удалён stale lock → enqueue снова 200, discovery `SCHED_OK`.

## Действия
1. Операционно: удалён stale пустой writelock (никакой процесс его не держал — `lsof` пуст).
2. Кодовый фикс: `acquireLock()` теперь при пустом/битом lock берёт mtime файла как fallback и переосвобождает stale-lock (защита от повтора). Self-test пройден.
3. Discovery validation run выполнен (см. ниже).

## Итоговые инварианты
```
ACTIVE_DISCOVERY_SCHEDULER_OWNERS=1
DUPLICATE_PRODUCTION_DISCOVERY_RUNS=0
DIRECT_CANONICAL_DISCOVERY_WRITERS=0
PROMOTION_PATH=API_ONLY
```
