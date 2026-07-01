# MULTISOURCE DISCOVERY CONTINUITY

**Дата:** 2026-06-18

## Scheduler работает независимо от credentials отдельных источников

- `master-controller-discovery.timer` — ежедневно (последний запуск 06:15 EDT, следующий ~06:16 завтра).
- `master-controller-discovery.service` логирует `SCHED_OK day=… niche=… idempotent=true job=…`.
- Worker `MATER_WORKER_TYPES` включает `LEAD_DISCOVERY, LEAD_VERIFY, LEAD_SCORE`.
- Scheduler enqueues ОДИН bounded job/день идемпотентно (DAILY_LIMIT, MAX_PENDING_STAGING=50).

## Source run matrix
```
OSM=ACTIVE
WEB_INTAKE=ACTIVE
REFERRAL=ACTIVE
VK=PENDING_CREDENTIAL
2GIS=PENDING_CREDENTIAL
DATAFORSEO=PENDING_CREDENTIAL
```

## Метрики bounded-цикла (read-only, текущее production состояние)
```
NEW_CANDIDATES=0 (последний batch обработан; очередь job COMPLETED=41/41)
VERIFIED=—  DUPLICATES=—  REJECTED=—  CANONICAL_PROMOTIONS=0
GUESSED_EMAILS=0
UNSUPPORTED_IDENTITIES=0
DIRECT_WRITES=0
```

> Пустая очередь «Новые кандидаты» — не ошибка: worker уже обработал batch (все job COMPLETED).
> Android (RC2) показывает счётчики очередей и открывает их; раздельные статусы источников видны.

## Целостность
canonical revision=106, leads=62, send_ledger=7 — discovery не выполнял прямых записей и не нарушил ledger.
