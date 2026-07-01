# RC3 ROOT CAUSE + FIX

| Дефект | Root cause | Fix | Live verify |
|---|---|---|---|
| 4.1 AI usage 0 (факт 196554) | PROVIDER_STATE in-memory, сброс при рестарте; нет persistent ledger | append-only `ai_usage_ledger.jsonl`; status/health читают cumulative из него | `/ai/usage/cumulative`=2643 (persistent, пережил рестарт) |
| 4.2 «Уже ожидает ответа» | preview брал stale lead.status=waiting_reply; STROYDVOR НЕ в send ledger | `offer_preview.mjs`: blockers из offer+send ledger; ALREADY_AWAITING только при send proof | blockers=[], ALREADY_AWAITING отсутствует |
| 4.3 preview metadata «нет данных» | hash/timestamp не считались на backend | backend SHA256 по содержимому + offer timestamps; missing → explicit reason | content_hash=9519cf…, created_at present |
| 4.4 локализация | presentation не покрывал продукты/роли | OwnerLocalization + тест запрета англ. | 139 Android тестов |
| 4.5 agents неполный | нет detail | /agents/provider-health расширен + Android detail | health отдаёт circuit/tasks/budget |
| 4.6 source registry | хардкод | Android читает /sources + /sources/health | registry endpoint |
