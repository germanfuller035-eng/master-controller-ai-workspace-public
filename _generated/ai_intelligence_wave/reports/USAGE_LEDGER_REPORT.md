# USAGE LEDGER REPORT
Authoritative append-only `ai_usage_ledger.jsonl` (рядом с canonical store).
- Поля: usage_key, timestamp, task/lead/agent, provider, model, request_id, raw in/out tokens, calculated_units, estimated_money_cost(nullable), usage_source(provider|estimated|no_llm), retry/repair, cache_hit, artifact_reused, tier, result.
- Idempotent: повтор usage_key не списывает повторно (units_delta=0).
- Live: cumulative=2643 units (3 entries), by_lead DKBI/STROYDVOR/ZAVODATOM, переживает рестарт API.
- Не смешивается с send ledger / payments.
