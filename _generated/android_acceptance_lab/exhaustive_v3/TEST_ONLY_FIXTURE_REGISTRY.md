# TEST_ONLY FIXTURE REGISTRY — acceptance_v3 (CLEANUP DONE 2026-06-23)

Источник истины: prod API через service-токен (worker, health ok). includeTest=false == owner/release visibility;
includeTest=true == acceptance/debug контур. CLEANUP ВЫПОЛНЕН (SSH восстановлен).

## РЕЗУЛЬТАТ CLEANUP (2026-06-23)
- seed_acceptance_fixtures.mjs cleanup (с canonical env MATER_STORE_PATH): events 4→0, notif 4→0,
  decisions 1→0, incidents 1→0, campaigns 1→0.
- ВАЖНО: store резолвится как dirname(MATER_STORE_PATH) -> /opt/master-controller/canonical/
  (НЕ 13_sales). verify без env давал ложный 0 — запускать cleanup только с canonical env.
- НАЙДЕНА И УСТРАНЕНА УТЕЧКА: 2 test_only remediations (rem_c1ec6e3c0ff8, rem_6797a129b97b;
  HEALTH_RECHECK rc3_prod_smoke/rc3_live_verify; pre-existing 2026-06-20) утекали в owner
  command-brief как automatic_recoveries=2. Причина: chief_ops.mjs DEF-V3-001 фильтрует test_only
  для incidents (стр.45) и decisions (стр.56), но НЕ для remediations (стр.70/113).
  Данные test_only удалены вручную (atomic temp+rename) -> automatic_recoveries=0.
  ОСТАТОЧНЫЙ КОД-ДЕФЕКТ (НЕ в скоупе этой задачи): chief_ops.mjs не фильтрует test_only remediations
  — задокументировано для будущей сессии (не деплоить здесь, скоуп = только Conversations).
- Backup canonical store: owner_center_store.json.bak_conv_cleanup, campaigns_store.json.bak_conv_cleanup.

## ФИНАЛЬНАЯ ИСТИНА (после cleanup, prod API)
- Residual test_only во ВСЕХ canonical массивах (owner_center + campaigns) = 0.
- owner production (includeTest=false): command-brief штатный (recoveries=0, incidents=0, severity все 0,
  primary_constraint=AUDIT_BACKLOG), owner-decisions total=0, campaigns=[], conversations total=0.
- acceptance (includeTest=true): conversations total=7 (pre-existing internal/test 002/A/MA-1 и др.,
  НЕ наши — не создавали и не трогали); campaigns=[] (наша fixture удалена).
- send reconciliation: authoritative_successful_sends=7 (исторические, не этой сессии),
  unauthorized_sends=0, unknown_sends=0 -> SEND_LEDGER_DELTA=0.
=> TEST_ONLY_FIXTURES_REMAINING=0, TEST_ONLY_KPI_LEAKS=0, OWNER_BRIEF_TEST_ONLY_LEAKS=0,
   REAL_LEADS_CHANGED_BY_TESTS=0, SEND_LEDGER_DELTA=0.

---
## (исторический реестр до cleanup)

## Реестр оставшихся acceptance fixtures

| fixture_id / store        | type          | run_id        | owner(false) | acceptance(true) | KPI visible | owner brief | cleanup |
|---------------------------|---------------|---------------|--------------|------------------|-------------|-------------|---------|
| owner_center events       | event×4       | acceptance_v3 | 0            | 4 (P0..P3)       | NO          | NO          | pending |
| owner_center notifications| notif×4       | acceptance_v3 | 0            | 4 unread         | NO          | NO          | pending |
| owner_center incidents    | incident×1    | acceptance_v3 | 0            | 1 (P0 active)    | NO          | NO          | pending |
| campaigns store           | campaign×1    | acceptance_v3 | 0            | 1                | NO          | NO          | pending |
| commercial technical-acc. | opp/offer/... | —             | 0            | 0 (none)         | NO          | NO          | n/a     |
| conversations (002/A/MA-1)| timeline      | pre-existing  | 0 (hidden)   | (route after deploy) | NO      | NO          | n/a (не наши; pre-existing internal/test) |

## Доказанная изоляция (через prod API, includeTest=false)
- events/summary: total=0 (P0..P3 = 0)
- notifications/unread-count: unread=0
- incidents/summary: total=0, active=0, p0=0
- owner-decisions: count=0
- campaigns: count=0
- commercial/technical-acceptance: все test_only_* = 0
- command-brief (owner brief): test_only_mentions=0, primaryConstraint=AUDIT_BACKLOG (НЕ test)

=> TEST_ONLY_KPI_LEAKS=0, OWNER_BRIEF_TEST_ONLY_LEAKS=0 (в owner production). Изоляция работает.

## Что осталось вычистить (финальный cleanup, требует SSH к VPS)
- owner_center store: 4 events + 4 notifications + 1 incident (run_id=acceptance_v3)
- campaigns store: 1 campaign (test_only)
- Инструмент: tools/android_acceptance_lab/seed_acceptance_fixtures.mjs cleanup (серверный, purges ALL test_only).

## После cleanup доказать повторным reread (includeTest=true должен дать 0)
- TEST_ONLY_FIXTURES_REMAINING=0
- TEST_ONLY_KPI_LEAKS=0
- OWNER_BRIEF_TEST_ONLY_LEAKS=0
- REAL_LEADS_CHANGED_BY_TESTS=0
- SEND_LEDGER_DELTA=0

## Безопасность
Все фикстуры test_only=true, no_send=true, excluded_from_commercial_KPI=true. Реальные сущности не тронуты.
CLIENT_MESSAGES_SENT=0, SMTP_CALLS=0, PAYMENT_OPERATIONS=0.
