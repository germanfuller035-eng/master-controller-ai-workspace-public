# RC3 PHYSICAL DEFECT MATRIX + ROOT CAUSE

**Дата:** 2026-06-19

| # | Дефект (физ. скриншот) | Root cause (подтверждён) | Source of truth для фикса |
|---|---|---|---|
| 4.1 | AI usage 0/1M (факт 196554) | `PROVIDER_STATE` — in-memory в agents.mjs, обнуляется при рестарте API. Persistent usage ledger ОТСУТСТВУЕТ (`/agents/status` отдаёт cumulative_calculated_units=0 после рестарта). | Новый persistent append-only AI usage ledger (JSONL), cumulative читается из него. |
| 4.2 | blocker «Уже ожидает ответа» на STROYDVOR-UG_RU | preview/blocker берёт lead-level статус (waiting_reply историч.) вместо authoritative delivery state; нет send proof в ledger для этого оффера. | Blocker ALREADY_AWAITING_REPLY только при send-ledger SENT для этого lead/offer. |
| 4.3 | preview metadata = «нет данных» (findings/next step/timestamp/hash) | поля не формируются в draft; hash/timestamp не вычисляются на backend. | backend: вычислять content hash + timestamp по факт. содержимому; additive backfill для 3 офферов. |
| 4.4 | продукт/роли по-английски | presentation-локализация не покрывает product description/scope/exclusions/inputs/criteria и роли агентов. | Android presentation layer + тест запрета англ. owner-facing строк. |
| 4.5 | экран агентов неполный | нет detail views (last call, circuit, tasks, artifacts, QA, usage, errors, model IDs, cost per task, reason). | расширить /agents read API + Android detail. |
| 4.6 | Source Registry неполный | Android показывает захардкоженный список вместо authoritative /sources registry. | Android читает /sources + /sources/health. |

Подтверждение на источнике: `/agents/status` → `cumulative_calculated_units=0`, `last_successful_call=null` (in-memory сброшен). canonical rev=106, sends=7 неизменны.
