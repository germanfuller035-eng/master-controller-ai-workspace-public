package ru.dmitry.matercontroller.core.model

import kotlinx.serialization.Serializable

// ============================================================================
// 0.6.0-rc4 — new authoritative read DTOs (read-only owner views; no send path).
//
// The backend serializes these in snake_case. The app's Json config has NO
// namingStrategy, so each Kotlin property name == its wire name (snake_case).
// Every field is nullable/default so partial payloads parse with
// ignoreUnknownKeys + coerceInputValues + explicitNulls=false.
//
// Money: *_class (FACT|TARGET|ESTIMATE|UNKNOWN) is honoured so UNKNOWN/null is
// rendered as words, never as 0. Calculated units are NEVER treated as rubles.
// ============================================================================

// ---------------------------------------------------------------------------
// GET /api/v1/offers/{id}/preview — authoritative offer preview.
// ---------------------------------------------------------------------------
@Serializable
data class OfferPreviewAttachment(
    val name: String? = null,
    val kind: String? = null,
    val size: Long? = null,
    val note: String? = null,
)

@Serializable
data class OfferPreviewDto(
    val offer_id: String? = null,
    val lead_id: String? = null,
    val company: String? = null,
    val product_id: String? = null,
    val product_name_ru: String? = null,
    val product_version: String? = null,
    val price: Double? = null,
    val currency: String? = null,
    val channel: String? = null,
    val recipient: String? = null,
    val recipient_verified: Boolean? = null,
    val subject: String? = null,
    val body_text: String? = null,
    val findings: List<String> = emptyList(),
    val finding_count: Int? = null,
    val next_step: String? = null,
    // RC5: provenance of next_step (source label + when it was computed). Both nullable.
    val next_step_source: String? = null,
    val next_step_created_at: String? = null,
    val attachments: List<OfferPreviewAttachment> = emptyList(),
    val attachments_note: String? = null,
    val version_created_at: String? = null,
    val version_updated_at: String? = null,
    val content_hash: String? = null,
    val status: String? = null,
    val owner_decision: String? = null,
    val send_capability: String? = null,
    val confirmed_send_exists: Boolean? = null,
    val blockers: List<String> = emptyList(),
    // missing_fields is a free-form {field: reason} map.
    val missing_fields: Map<String, String> = emptyMap(),
    val no_send_notice: String? = null,
)

// ---------------------------------------------------------------------------
// GET /api/v1/ai/usage — calculated AI cost usage.
// ---------------------------------------------------------------------------
@Serializable
data class AiUsageDto(
    val total_calculated_units: Long? = null,
    // RC6 (defect E): raw token counters may be a NUMBER or the literal string "UNKNOWN".
    // Typed String? and rendered «неизвестно» when "UNKNOWN" — NEVER a false 0. A real 0 stays 0.
    val raw_input_tokens: String? = null,
    val raw_output_tokens: String? = null,
    val cached_input_tokens: String? = null,
    val provider_calls: Long? = null,
    val no_llm_tasks: Long? = null,
    val cache_hits: Long? = null,
    val artifact_reuse: Long? = null,
    val escalations: Long? = null,
    val estimated_records: Long? = null,
    val by_provider: Map<String, Long> = emptyMap(),
    val by_model: Map<String, Long> = emptyMap(),
    val by_agent: Map<String, Long> = emptyMap(),
    val by_task_type: Map<String, Long> = emptyMap(),
    val by_lead: Map<String, Long> = emptyMap(),
    // Money is nullable; class is FACT|TARGET|ESTIMATE|UNKNOWN. UNKNOWN/null → «нет данных».
    val estimated_money_cost: Double? = null,
    val estimated_money_class: String? = null,
    // Optional explicit provider-side calculated units (kept distinct from money).
    val provider_calculated_units: Long? = null,
    val entries: Long? = null,
)

@Serializable
data class AiUsageCumulativeDto(
    val cumulative_calculated_units: Long? = null,
    val entries: Long? = null,
)

// ---------------------------------------------------------------------------
// GET /api/v1/ai/providers — provider registry.
// ---------------------------------------------------------------------------
@Serializable
data class ProviderRegistryItemDto(
    val provider_id: String? = null,
    val provider_type: String? = null,
    val base_url: String? = null,
    val enabled: Boolean? = null,
    val priority: Int? = null,
    val key_presence: String? = null,
    val models: List<String> = emptyList(),
    val state: String? = null,
    val cost_class: String? = null,
)

@Serializable
data class ProviderRegistryDto(
    val items: List<ProviderRegistryItemDto> = emptyList(),
)

// ---------------------------------------------------------------------------
// GET /api/v1/agents/provider-health?probe=true — extended provider health.
// ---------------------------------------------------------------------------
@Serializable
data class ProviderHealthDto(
    val provider: String? = null,
    val configured: Boolean? = null,
    val reachable: Boolean? = null,
    val primary_model: String? = null,
    val active_model: String? = null,
    val api_mode: String? = null,
    val last_successful_call: String? = null,
    val last_failure: String? = null,
    val circuit_state: String? = null,
    val completed_tasks: Int? = null,
    val failed_tasks: Int? = null,
    val quarantined_tasks: Int? = null,
    val cumulative_calculated_units: Long? = null,
    val raw_input_tokens: Long? = null,
    val raw_output_tokens: Long? = null,
    val first_run_budget_limit: Long? = null,
    val first_run_budget_remaining: Long? = null,
    val sends_attempted: Int? = null,
    val direct_writes_attempted: Int? = null,
)

// ---------------------------------------------------------------------------
// GET /api/v1/knowledge/status — knowledge radar status.
// ---------------------------------------------------------------------------
@Serializable
data class KnowledgeStatusDto(
    val active: Boolean? = null,
    val mode: String? = null,
    val sources_total: Int? = null,
    val tier1_sources: Int? = null,
    val tier2_sources: Int? = null,
    val tier3_sources: Int? = null,
    val tier4_sources: Int? = null,
    val findings_stored: Int? = null,
    val proposals: Int? = null,
    val last_run: String? = null,
    val llm_summarization: Boolean? = null,
    val weekly_budget_units: Long? = null,
    val monthly_budget_units: Long? = null,
    val auto_production_changes: Boolean? = null,
    val auto_client_messages: Boolean? = null,
    val auto_financial_decisions: Boolean? = null,
)

// ---------------------------------------------------------------------------
// GET /api/v1/knowledge/sources — knowledge source registry.
// ---------------------------------------------------------------------------
@Serializable
data class KnowledgeSourceDto(
    val source_id: String? = null,
    val name: String? = null,
    val type: String? = null,
    val tier: Int? = null,
    val category: String? = null,
    val enabled: Boolean? = null,
    val cost_class: String? = null,
)

@Serializable
data class KnowledgeSourceList(
    val items: List<KnowledgeSourceDto> = emptyList(),
)

// ---------------------------------------------------------------------------
// GET /api/v1/knowledge/digest?window=urgent|weekly|monthly — radar digest.
// ---------------------------------------------------------------------------
@Serializable
data class KnowledgeDigestItem(
    val id: String? = null,
    // RC5: backend may use item_id; both are accepted (id preferred, item_id fallback).
    val item_id: String? = null,
    val title: String? = null,
    val category: String? = null,
    val source: String? = null,
    val source_id: String? = null,
    val source_name: String? = null,
    val source_tier: Int? = null,
    val source_url: String? = null,
    val what_changed: String? = null,
    val trust: String? = null,
    val relevance: String? = null,
    val urgency: String? = null,
    val security_impact: String? = null,
    val legal_impact: String? = null,
    val route: String? = null,
    val review_route: String? = null,
    val recommended_action: String? = null,
    val owner_decision_required: Boolean? = null,
    val legal_review_required: Boolean? = null,
    val security_review_required: Boolean? = null,
    val auto_action: String? = null,
    // RC5: grounded evidence fields (all nullable/default; partial payloads parse).
    val published_at: String? = null,
    val cve_id: String? = null,
    val advisory_id: String? = null,
    val affected_versions: String? = null,
    val installed_version: String? = null,
    val stack_match: String? = null,
    val applicability: String? = null,
    val effective_at: String? = null,
    val document_id: String? = null,
    val evidence_excerpt: String? = null,
    val priority_reason: String? = null,
    // VERIFIED / TEST_ONLY / SYNTHETIC / UNVERIFIED
    val verification: String? = null,
) {
    /** Stable identity preferring the canonical id, falling back to item_id. */
    val itemKey: String? get() = id ?: item_id
}

@Serializable
data class KnowledgeDigestDto(
    val window: String? = null,
    val items: List<KnowledgeDigestItem> = emptyList(),
    // RC6 (defect C): server-driven empty state — when true the radar genuinely has no confirmed
    // urgent events; the UI must show a real empty state, NOT fixtures or a false error.
    val empty_state: Boolean? = null,
    val production_only: Boolean? = null,
    val verified_urgent: Int? = null,
)
