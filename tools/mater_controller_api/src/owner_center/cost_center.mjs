// owner_center/cost_center.mjs
// ============================================================
// Cost & Capacity Center (0.8.0) — deterministic, read-only aggregator.
// ------------------------------------------------------------
// Answers the owner's cost questions in one place:
//   - usage: how many AI calculated-units were spent (post-ledger + confirmed history)?
//   - breakdown: by provider / model / agent / source?
//   - budgets: what are the limits, and how close are we (units, not invented money)?
//   - capacity: which providers/sources are active vs disabled/credential-gated?
//
// HARD INVARIANTS:
//   - PURE read-model. It NEVER writes, NEVER sends, NEVER opens a gate, NEVER
//     enables a paid source, NEVER changes a limit. It only REPORTS.
//   - The AI usage ledger (ai_usage_ledger.mjs) is the single source of usage truth.
//     Budget LIMITS come from owner_settings (the single settings truth). We do not
//     create a second budget store.
//   - Honest UNKNOWN: money is surfaced only when journaled; raw tokens only when
//     evidenced. Never coerce UNKNOWN to a false 0. Source $ cost is UNKNOWN (free
//     sources only in this build; no metered source billing is journaled).

export const COST_CENTER_VERSION = 'cost_center_v1';

// Percent of a unit budget consumed (deterministic; null/UNKNOWN-safe).
function pct(used, limit) {
    const u = Number(used || 0);
    const l = Number(limit || 0);
    if (!l || l <= 0) return null; // no limit configured → percent is UNKNOWN
    return Math.round((u / l) * 1000) / 10; // one decimal place
}

// Map a percent to a deterministic Russian budget state.
export function budgetState(percent) {
    if (percent == null) return { level: 'UNKNOWN', text_ru: 'Лимит не задан' };
    if (percent >= 100) return { level: 'EXCEEDED', text_ru: 'Лимит исчерпан' };
    if (percent >= 80) return { level: 'WARNING', text_ru: 'Близко к лимиту' };
    return { level: 'OK', text_ru: 'В пределах лимита' };
}

// Provider/source capacity view (deterministic; no secrets). Reports which slots
// can actually spend and which are disabled / waiting on credentials.
export function capacityBreakdown(providerRegistry = null, sourceTelemetry = null) {
    const providers = providerRegistry && Array.isArray(providerRegistry.items)
        ? providerRegistry.items.map((p) => ({
            provider_id: p.provider_id, cost_class: p.cost_class || 'unknown',
            state: p.state || (p.enabled ? 'ACTIVE' : 'DISABLED'), enabled: !!p.enabled,
            key_presence: p.key_presence || null,
        }))
        : null;
    const sources = sourceTelemetry && Array.isArray(sourceTelemetry.items)
        ? sourceTelemetry.items.map((s) => ({
            source_id: s.source_id, cost_class: s.cost_class || 'FREE',
            health_state: s.health_state || null, credential_state: s.credential_state || null,
        }))
        : null;
    return {
        providers: providers || 'UNKNOWN',
        sources: sources || 'UNKNOWN',
        active_paid_providers: providers ? providers.filter((p) => p.cost_class === 'paid' && p.enabled).length : 'UNKNOWN',
        paid_sources_active: sources ? sources.filter((s) => s.cost_class === 'PAID' && s.health_state === 'HEALTHY').length : 'UNKNOWN',
    };
}

// Build the full Cost overview the owner screen renders.
// inputs:
//   usageSummary: result of ai_usage_ledger.usageSummary()
//   reconciliation: result of ai_usage_ledger.usageReconciliation() (optional)
//   settings: owner_settings.getSettings() (for the unit budget limit)
//   providerRegistry: provider_registry.registry()
//   sourceTelemetry: multichannel.sourceTelemetry()
export function costOverview({ usageSummary = null, reconciliation = null, settings = null, providerRegistry = null, sourceTelemetry = null } = {}) {
    const us = usageSummary || {};
    const totalUnits = Number(us.total_calculated_units || 0);
    // Daily unit limit is the authoritative budget knob (owner_settings). No money invented.
    const dailyLimit = settings && Number(settings.daily_calculated_units_limit || 0) ? Number(settings.daily_calculated_units_limit) : null;
    const dayPct = pct(totalUnits, dailyLimit);
    const dayState = budgetState(dayPct);

    // Money: surface ONLY if journaled; otherwise honest UNKNOWN.
    const moneyKnown = us.estimated_money_class === 'ESTIMATE' && us.estimated_money_cost != null;

    const capacity = capacityBreakdown(providerRegistry, sourceTelemetry);

    return {
        cost_center_version: COST_CENTER_VERSION,
        // usage totals
        total_calculated_units: totalUnits,
        provider_calls: us.provider_calls ?? 'UNKNOWN',
        no_llm_tasks: us.no_llm_tasks ?? 0,
        cache_hits: us.cache_hits ?? 0,
        escalations: us.escalations ?? 0,
        raw_input_tokens: us.raw_input_tokens ?? 'UNKNOWN',
        raw_output_tokens: us.raw_output_tokens ?? 'UNKNOWN',
        // money — honest UNKNOWN unless journaled
        estimated_money_cost: moneyKnown ? us.estimated_money_cost : 'UNKNOWN',
        estimated_money_class: us.estimated_money_class || 'UNKNOWN',
        money_note_ru: moneyKnown ? 'Оценка по журналу' : 'Денежная стоимость не журналируется — показываем расчётные единицы',
        // breakdown
        by_provider: us.by_provider || {},
        by_model: us.by_model || {},
        by_agent: us.by_agent || {},
        by_task_type: us.by_task_type || {},
        // budget (units, not invented money)
        budget: {
            daily_calculated_units_limit: dailyLimit ?? 'UNKNOWN',
            used_calculated_units: totalUnits,
            percent_used: dayPct ?? 'UNKNOWN',
            state: dayState.level,
            state_ru: dayState.text_ru,
            paid_sources_enabled: settings ? !!settings.paid_sources_enabled : 'UNKNOWN',
            source_strategy: settings ? (settings.source_strategy || null) : 'UNKNOWN',
        },
        // confirmed history (pre-ledger) — surfaced separately, never merged into a fake "spend now"
        history: reconciliation ? {
            confirmed_pre_ledger_units: reconciliation.confirmed_pre_ledger_history ?? 'UNKNOWN',
            total_known_units: reconciliation.total_known_usage ?? 'UNKNOWN',
            evidence_reference: reconciliation.evidence_reference || null,
        } : null,
        // capacity
        capacity,
        // no-spend posture
        autosend_ru: 'Платные действия и автоотправка отключены',
        performs_payment: false,
        sends: false,
    };
}

export default { COST_CENTER_VERSION, budgetState, capacityBreakdown, costOverview };
