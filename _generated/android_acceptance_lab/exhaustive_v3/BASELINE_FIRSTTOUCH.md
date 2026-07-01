# BASELINE — SAFE_TEST_ONLY_FIRSTTOUCH (snapshot before changes)

Дата: 2026-06-22. Снято read-only через ssh с VPS (prod) + локальный fixture.

## PROD canonical store (VPS 195.96.132.82)
STORE_PATH=/opt/master-controller/canonical/lead_pipeline_store.json
store_revision=281
real_leads=40
test_leads=0
total_leads=40
first_touch.drafts=5
first_touch.decisions=9
first_touch.pilot={} (пусто)

## PROD send ledger
SEND_LEDGER_PATH=/opt/master-controller/13_sales/outbound_send_ledger.jsonl
send_ledger_lines=7  (исходящие исторические; commercial sends=0 по truth-модели)

## Назначение baseline
После всего контура должно выполняться:
- real_leads НЕ изменилось (40);
- send_ledger_lines НЕ изменилось (7) → SEND_LEDGER_DELTA=0;
- после cleanup test_leads вернётся к 0, first_touch.drafts/decisions по синтетическому лиду = удалены;
- store_revision МОЖЕТ вырасти (sole writer seed+draft+cleanup), но реальные сущности неизменны —
  НЕ заявлять, что revision вернулся назад.

## Известный дрейф от handoff
Handoff фиксировал rev 254 / 29 реальных лидов. Сейчас rev 281 / 40 лидов — это нормальный
prod-discovery drift между сессиями (scheduler добавляет реальные лиды), НЕ результат тестов.
