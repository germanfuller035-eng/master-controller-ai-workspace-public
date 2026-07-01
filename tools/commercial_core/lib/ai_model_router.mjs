// tools/commercial_core/lib/ai_model_router.mjs
// Deterministic AI Model Router + Cost Governor + Quality Escalation policy. This is INFRASTRUCTURE,
// not an agent: given a task descriptor it returns a routing decision (which tier/provider/model,
// limits, qa policy, escalation policy, reason code) WITHOUT calling any LLM. Pure & testable.
//
// Core principle: NO_LLM first. Only escalate one tier at a time, only when a threshold is unmet.
// The router never sends, never writes canonical, never performs payments.

export const TIERS = ['TIER_0_NO_LLM', 'TIER_1_FAST_CHEAP', 'TIER_2_BALANCED', 'TIER_3_STRONG', 'TIER_4_PREMIUM'];

// Task types that are FULLY deterministic — never need an LLM.
export const NO_LLM_TASKS = new Set([
    'email_format_validation', 'dns_validation', 'url_normalization', 'domain_company_matching',
    'deduplication', 'hash_comparison', 'source_arbitration', 'status_transition', 'revision_check',
    'idempotency', 'price_lookup', 'product_snapshot', 'evidence_presence', 'required_fields',
    'duplicate_findings', 'queue_routing', 'send_proof_verification', 'budget_calculation',
    'cache_lookup', 'artifact_reuse', 'schedule_calculation', 'cve_version_matching', 'source_trust_rules',
]);

// Default tier by task type (when an LLM is needed).
const TASK_TIER = {
    classification: 'TIER_1_FAST_CHEAP', extraction: 'TIER_1_FAST_CHEAP', normalization: 'TIER_1_FAST_CHEAP',
    short_summary: 'TIER_1_FAST_CHEAP', intent_detection: 'TIER_1_FAST_CHEAP', translation: 'TIER_1_FAST_CHEAP',
    tagging: 'TIER_1_FAST_CHEAP', website_content_first_pass: 'TIER_1_FAST_CHEAP', reply_classification: 'TIER_1_FAST_CHEAP',
    offer_draft: 'TIER_2_BALANCED', response_draft: 'TIER_2_BALANCED', mini_audit: 'TIER_2_BALANCED',
    structured_recommendation: 'TIER_2_BALANCED', medium_qa: 'TIER_2_BALANCED', business_trend: 'TIER_2_BALANCED',
    complex_audit: 'TIER_3_STRONG', ambiguous_identity: 'TIER_3_STRONG', multi_source_reconciliation: 'TIER_3_STRONG',
    complex_debugging: 'TIER_3_STRONG', legal_impact: 'TIER_3_STRONG', financial_impact: 'TIER_3_STRONG', architecture_review: 'TIER_3_STRONG',
    critical_architecture: 'TIER_4_PREMIUM', security_incident: 'TIER_4_PREMIUM', irreversible_migration_plan: 'TIER_4_PREMIUM',
    high_risk_contradiction: 'TIER_4_PREMIUM',
};

// Output token ceilings per task type (configurable via opts).
const OUTPUT_LIMITS = {
    classification: 500, extraction: 1000, short_summary: 1200, offer_draft: 2000, mini_audit: 4000,
    complex_architecture: 12000, default: 2000,
};

// Provider/model preference per tier. Direct DeepSeek preferred for cheap tiers WHEN healthy+enabled.
function pickProviderModel(tier, ctx) {
    const dsHealthy = ctx.providerHealth?.deepseek_direct === 'healthy';
    const tkHealthy = ctx.providerHealth?.tokenator !== 'unhealthy';
    switch (tier) {
        case 'TIER_1_FAST_CHEAP':
            if (dsHealthy) return { provider: 'deepseek_direct', model: 'deepseek-chat' };
            return { provider: 'tokenator', model: 'gpt-5.4' };
        case 'TIER_2_BALANCED':
            return { provider: 'tokenator', model: 'gpt-5.5' };
        case 'TIER_3_STRONG':
            return { provider: 'tokenator', model: 'gpt-5.5' };
        case 'TIER_4_PREMIUM':
            return { provider: 'tokenator', model: 'claude-opus-4-8' };
        default:
            return tkHealthy ? { provider: 'tokenator', model: 'gpt-5.5' } : { provider: null, model: null };
    }
}

// Main routing decision. Pure: returns a plan, performs no I/O.
export function route(task = {}, ctx = {}) {
    const taskType = task.task_type || 'classification';

    // 1) NO_LLM first.
    if (NO_LLM_TASKS.has(taskType) || task.deterministic === true) {
        return decision('TIER_0_NO_LLM', { provider: null, model: null }, task, ctx, 'NO_LLM_DETERMINISTIC');
    }
    // 2) Cache / artifact reuse short-circuit.
    if (ctx.cachedArtifact && ctx.cachedArtifact.valid === true) {
        return decision('TIER_0_NO_LLM', { provider: null, model: null }, task, ctx, 'CACHE_HIT');
    }
    // 3) Budget guard.
    if (ctx.remainingBudget != null && ctx.remainingBudget <= 0) {
        return { ...decision('TIER_0_NO_LLM', { provider: null, model: null }, task, ctx, 'BUDGET_BLOCKED'), budget_state: 'BUDGET_BLOCKED', no_llm: true };
    }

    // 4) Base tier from task type, raised by risk/external-facing/complexity.
    let tier = TASK_TIER[taskType] || 'TIER_2_BALANCED';
    if (task.risk_level === 'high' && tierIndex(tier) < tierIndex('TIER_3_STRONG')) tier = 'TIER_3_STRONG';
    if (task.external_facing === true && tierIndex(tier) < tierIndex('TIER_2_BALANCED')) tier = 'TIER_2_BALANCED';
    if (task.complexity === 'high' && tierIndex(tier) < tierIndex('TIER_3_STRONG')) tier = 'TIER_3_STRONG';
    // Premium is never auto-selected for bulk/low-risk work.
    if (tier === 'TIER_4_PREMIUM' && task.owner_requested !== true && task.risk_level !== 'critical') tier = 'TIER_3_STRONG';

    // 5) Provider health fallback.
    const pm = pickProviderModel(tier, ctx);
    return decision(tier, pm, task, ctx, 'TASK_TYPE_ROUTING');
}

function tierIndex(t) { return TIERS.indexOf(t); }

function decision(tier, pm, task, ctx, reasonCode) {
    const taskType = task.task_type || 'classification';
    const maxOut = task.max_output_tokens || OUTPUT_LIMITS[taskType] || OUTPUT_LIMITS.default;
    const noLlm = tier === 'TIER_0_NO_LLM';
    return {
        decision: noLlm ? 'NO_LLM' : 'LLM',
        tier,
        provider: pm.provider,
        model: pm.model,
        max_input_tokens: task.max_input_tokens || 8000,
        max_output_tokens: maxOut,
        timeout_ms: task.timeout_ms || 30000,
        retry_limit: 1,
        repair_limit: 1,
        qa_policy: crossModelQaRequired(taskType) ? 'CROSS_MODEL_QA' : 'DETERMINISTIC_QA',
        escalation_policy: { max_tier: task.max_tier || 'TIER_4_PREMIUM', step: 'ONE_TIER', premium_per_task: 1 },
        reason_code: reasonCode,
        reason_ru: reasonRu(reasonCode, tier),
        estimated_cost_units: noLlm ? 0 : estimateUnits(tier, maxOut),
    };
}

// Cross-model QA only for high-stakes outputs.
export function crossModelQaRequired(taskType) {
    return ['offer_draft', 'response_draft', 'mini_audit', 'legal_impact', 'financial_impact',
        'high_risk_contradiction', 'irreversible_migration_plan', 'critical_architecture'].includes(taskType);
}

function estimateUnits(tier, maxOut) {
    const perTier = { TIER_1_FAST_CHEAP: 1.0, TIER_2_BALANCED: 2.2, TIER_3_STRONG: 3.0, TIER_4_PREMIUM: 6.0 };
    return Math.ceil((8000 + maxOut) * (perTier[tier] || 2.2));
}

function reasonRu(code, tier) {
    const m = {
        NO_LLM_DETERMINISTIC: 'Задача решена детерминированно, без обращения к ИИ.',
        CACHE_HIT: 'Использован кешированный артефакт — повторный запрос не требуется.',
        BUDGET_BLOCKED: 'Бюджет исчерпан — выполнение без ИИ.',
        TASK_TYPE_ROUTING: `Выбран минимально достаточный уровень модели (${tier}).`,
    };
    return m[code] || 'Маршрутизация по умолчанию.';
}

// ---- Quality escalation: decide whether to go up exactly one tier ----
export function shouldEscalate({ qaPassed, schemaValid, confidence, threshold = 0.6, currentTier, maxTier = 'TIER_4_PREMIUM', riskLevel }) {
    if (tierIndex(currentTier) >= tierIndex(maxTier)) return { escalate: false, reason: 'MAX_TIER_REACHED' };
    if (!schemaValid) return { escalate: true, reason: 'SCHEMA_FAILURE', to: TIERS[tierIndex(currentTier) + 1] };
    if (!qaPassed) return { escalate: true, reason: 'QA_FAILED', to: TIERS[tierIndex(currentTier) + 1] };
    if (typeof confidence === 'number' && confidence < threshold) return { escalate: true, reason: 'LOW_CONFIDENCE', to: TIERS[tierIndex(currentTier) + 1] };
    if (riskLevel === 'critical' && tierIndex(currentTier) < tierIndex('TIER_4_PREMIUM')) return { escalate: true, reason: 'CRITICAL_RISK', to: TIERS[tierIndex(currentTier) + 1] };
    return { escalate: false, reason: 'THRESHOLD_MET' };
}

export default { route, shouldEscalate, crossModelQaRequired, TIERS, NO_LLM_TASKS };
