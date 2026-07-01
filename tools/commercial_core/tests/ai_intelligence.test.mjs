// tools/commercial_core/tests/ai_intelligence.test.mjs
// Router + usage ledger + Knowledge Radar + DeepSeek + cost governor tests. No network.
import { route, shouldEscalate, crossModelQaRequired, NO_LLM_TASKS } from '../lib/ai_model_router.mjs';
import { BudgetLedger, calcUnits, CircuitBreaker } from '../lib/ai_provider.mjs';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('FAIL', n); } };

// ---- Router: NO_LLM first ----
ok('R1 deterministic task -> NO_LLM', route({ task_type: 'email_format_validation' }).decision === 'NO_LLM');
ok('R2 dedup -> NO_LLM', route({ task_type: 'deduplication' }).tier === 'TIER_0_NO_LLM');
ok('R3 cache hit -> NO_LLM', route({ task_type: 'offer_draft' }, { cachedArtifact: { valid: true } }).reason_code === 'CACHE_HIT');
ok('R4 budget 0 -> blocked', route({ task_type: 'offer_draft' }, { remainingBudget: 0 }).budget_state === 'BUDGET_BLOCKED');

// ---- Router: tiers ----
ok('R5 classification -> TIER1', route({ task_type: 'classification' }).tier === 'TIER_1_FAST_CHEAP');
ok('R6 offer_draft -> TIER2', route({ task_type: 'offer_draft' }).tier === 'TIER_2_BALANCED');
ok('R7 mini_audit -> cross-model QA', route({ task_type: 'mini_audit' }).qa_policy === 'CROSS_MODEL_QA');
ok('R8 classification -> deterministic QA', route({ task_type: 'classification' }).qa_policy === 'DETERMINISTIC_QA');
ok('R9 high risk raises tier', route({ task_type: 'classification', risk_level: 'high' }).tier === 'TIER_3_STRONG');
ok('R10 premium not auto for bulk', route({ task_type: 'critical_architecture' }).tier === 'TIER_3_STRONG');
ok('R11 premium for owner+critical', route({ task_type: 'critical_architecture', owner_requested: true, risk_level: 'critical' }).tier === 'TIER_4_PREMIUM');
ok('R12 output limit classification<=500', route({ task_type: 'classification' }).max_output_tokens <= 500);
ok('R13 retry/repair capped at 1', route({ task_type: 'offer_draft' }).retry_limit === 1 && route({ task_type: 'offer_draft' }).repair_limit === 1);
ok('R14 reason is russian', /[А-Яа-я]/.test(route({ task_type: 'classification' }).reason_ru));

// ---- Escalation: one tier only, stop at max ----
ok('E1 schema fail escalates one tier', (() => { const e = shouldEscalate({ schemaValid: false, currentTier: 'TIER_1_FAST_CHEAP' }); return e.escalate && e.to === 'TIER_2_BALANCED'; })());
ok('E2 qa fail escalates', shouldEscalate({ qaPassed: false, schemaValid: true, currentTier: 'TIER_2_BALANCED' }).escalate === true);
ok('E3 low confidence escalates', shouldEscalate({ qaPassed: true, schemaValid: true, confidence: 0.3, currentTier: 'TIER_2_BALANCED' }).escalate === true);
ok('E4 threshold met -> no escalate', shouldEscalate({ qaPassed: true, schemaValid: true, confidence: 0.9, currentTier: 'TIER_2_BALANCED' }).escalate === false);
ok('E5 max tier stops', shouldEscalate({ schemaValid: false, currentTier: 'TIER_4_PREMIUM' }).escalate === false);

// ---- Cross-model QA gating ----
ok('Q1 offer needs cross-model', crossModelQaRequired('offer_draft') === true);
ok('Q2 tagging does not', crossModelQaRequired('tagging') === false);

// ---- Cost governor (budget ledger) ----
const b = new BudgetLedger(1000000);
ok('C1 within budget', !b.wouldExceed(8000));
ok('C2 projected exceed blocks', b.wouldExceed(2000000));
b.record({ calculated_units: 196554 });
ok('C3 cumulative tracked', b.cumulative === 196554 && b.remaining() === 803446);
ok('C4 calc units multiplier', calcUnits(8000, 1500, 2.2) === Math.ceil(9500 * 2.2));

console.log(`\n==== ai_intelligence: ${pass} passed, ${fail} failed ====`);
if (fail > 0) process.exit(1);
