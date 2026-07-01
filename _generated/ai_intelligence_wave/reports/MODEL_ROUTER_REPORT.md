# MODEL ROUTER REPORT
Детерминированный `ai_model_router.mjs` (НЕ агент). Tiers: TIER_0_NO_LLM..TIER_4_PREMIUM.
- NO_LLM-first: 23 типа задач решаются без LLM. Cache hit / budget block → NO_LLM.
- Маршрут по task_type, поднятие tier при risk/external/complexity. Premium не авто для bulk (только owner+critical).
- Escalation: ровно один tier за раз, стоп на max; причины SCHEMA_FAILURE/QA_FAILED/LOW_CONFIDENCE/CRITICAL_RISK.
- Cross-model QA только для offer/audit/legal/financial/high-risk. retry≤1, repair≤1, premium/задача≤1.
- 25 unit-тестов (ai_intelligence.test.mjs) — PASS.
