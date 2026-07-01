package ru.dmitry.matercontroller.core.model

import kotlinx.serialization.Serializable

// ============================================================================
// 0.6.0-rc5 — new authoritative read DTOs + owner-settings command DTO.
//
// The backend serializes these in snake_case. The app's Json config has NO
// namingStrategy, so each Kotlin property name == its wire name (snake_case).
// Every field is nullable/default so partial payloads parse with
// ignoreUnknownKeys + coerceInputValues + explicitNulls=false.
//
// Provenance rule (RC5): raw_input_tokens / raw_output_tokens / pre_ledger_provider_calls
// may be a NUMBER or the literal string "UNKNOWN". They are typed String? and rendered as
// «неизвестно» when "UNKNOWN" — NEVER a false 0.
// ============================================================================

// ---------------------------------------------------------------------------
// GET /api/v1/products/{code}/presentation — owner-facing Russian product presentation.
// GET /api/v1/products/presentation — { items: [...] }
// ---------------------------------------------------------------------------
@Serializable
data class ProductPresentationDto(
    val product_code: String? = null,
    val product_name_ru: String? = null,
    val description_ru: String? = null,
    val scope_ru: List<String> = emptyList(),
    val exclusions_ru: List<String> = emptyList(),
    val required_inputs_ru: List<String> = emptyList(),
    val outputs_ru: List<String> = emptyList(),
    val acceptance_criteria_ru: List<String> = emptyList(),
    val price: Double? = null,
    val currency: String? = null,
)

@Serializable
data class ProductPresentationList(
    val items: List<ProductPresentationDto> = emptyList(),
)

// ---------------------------------------------------------------------------
// GET /api/v1/ai/usage/reconciliation — AI usage provenance.
// raw_input_tokens / raw_output_tokens / pre_ledger_provider_calls are String? because the
// backend may emit a number OR the literal "UNKNOWN". Never render a false 0.
// ---------------------------------------------------------------------------
@Serializable
data class AiUsageBySourceUnits(
    val ACTUAL_PROVIDER_RESPONSE: Long? = null,
    val ESTIMATED: Long? = null,
    val CONFIRMED_HISTORICAL_EVIDENCE: Long? = null,
    val SYNTHETIC_TEST: Long? = null,
)

@Serializable
data class AiUsageReconciliationDto(
    val since_persistent_ledger: Long? = null,
    val confirmed_pre_ledger_history: Long? = null,
    val total_known_usage: Long? = null,
    val actual_records: Long? = null,
    val estimated_records: Long? = null,
    val no_llm_records: Long? = null,
    val historical_records: Long? = null,
    // may be a number OR the string "UNKNOWN"
    val raw_input_tokens: String? = null,
    val raw_output_tokens: String? = null,
    val provider_calls: Long? = null,
    val pre_ledger_provider_calls: String? = null,
    val by_source_units: AiUsageBySourceUnits? = null,
    val false_zeros: Long? = null,
    val evidence_reference: String? = null,
)

// ---------------------------------------------------------------------------
// GET /api/v1/sources/telemetry — authoritative source telemetry.
// ---------------------------------------------------------------------------
@Serializable
data class SourceTelemetryItem(
    val source_id: String? = null,
    val display_name: String? = null,
    val source_type: String? = null,
    val enabled: Boolean? = null,
    val credential_state: String? = null,
    val health_state: String? = null,
    val disabled_reason: String? = null,
    val last_check_at: String? = null,
    val last_success_at: String? = null,
    val last_failure_at: String? = null,
    val last_error_category: String? = null,
    val records_discovered_total: Long? = null,
    val records_discovered_last_run: Long? = null,
    val records_promoted_total: Long? = null,
    val records_rejected_total: Long? = null,
    val cost_class: String? = null,
    val inbound_capability: Boolean? = null,
    val discovery_capability: Boolean? = null,
    val outbound_capability: Boolean? = null,
    val never_run_note: String? = null,
)

@Serializable
data class SourceTelemetryList(
    val items: List<SourceTelemetryItem> = emptyList(),
)

// ---------------------------------------------------------------------------
// GET /api/v1/owner/settings — owner automation/limits settings.
// hard_limits is a free-form {field: max} map; *_available lists carry profile/strategy options.
// ---------------------------------------------------------------------------
@Serializable
data class OwnerSettingsDto(
    val settings_revision: Int? = null,
    val profile: String? = null,
    val discovery_runs_per_day: Int? = null,
    val raw_candidates_per_day: Int? = null,
    val verified_leads_per_day: Int? = null,
    val sites_checked_per_day: Int? = null,
    val same_segment_rescan_days: Int? = null,
    val owner_queue_max: Int? = null,
    val audit_ready_queue_max: Int? = null,
    val ai_audits_per_day: Int? = null,
    val offers_per_day: Int? = null,
    val daily_calculated_units_limit: Long? = null,
    val premium_calls_per_day: Int? = null,
    val repair_attempts: Int? = null,
    val fallback_attempts: Int? = null,
    val provider_concurrency: Int? = null,
    val source_strategy: String? = null,
    val paid_sources_enabled: Boolean? = null,
    val morning_discovery_time: String? = null,
    val evening_discovery_time: String? = null,
    val processing_window: String? = null,
    val timezone: String? = null,
    val hard_limits: Map<String, Double> = emptyMap(),
    val profiles_available: List<String> = emptyList(),
    val source_strategy_active: List<String> = emptyList(),
)

// ---------------------------------------------------------------------------
// GET /api/v1/owner/settings/audit — settings change history.
// ---------------------------------------------------------------------------
@Serializable
data class OwnerSettingsAuditEntry(
    val revision: Int? = null,
    val at: String? = null,
    val by: String? = null,
    val changed_fields: List<String> = emptyList(),
    val profile: String? = null,
)

@Serializable
data class OwnerSettingsAuditDto(
    val items: List<OwnerSettingsAuditEntry> = emptyList(),
)

// ---------------------------------------------------------------------------
// POST /api/v1/owner/settings — request body + responses.
// Numeric fields are nullable so only the changed ones are sent. changedFields is the
// explicit list of fields the owner touched. expectedRevision + idempotencyKey guard the write.
// ---------------------------------------------------------------------------
@Serializable
data class OwnerSettingsUpdateBody(
    val profile: String? = null,
    val discovery_runs_per_day: Int? = null,
    val raw_candidates_per_day: Int? = null,
    val verified_leads_per_day: Int? = null,
    val sites_checked_per_day: Int? = null,
    val same_segment_rescan_days: Int? = null,
    val owner_queue_max: Int? = null,
    val audit_ready_queue_max: Int? = null,
    val ai_audits_per_day: Int? = null,
    val offers_per_day: Int? = null,
    val daily_calculated_units_limit: Long? = null,
    val premium_calls_per_day: Int? = null,
    val repair_attempts: Int? = null,
    val fallback_attempts: Int? = null,
    val provider_concurrency: Int? = null,
    val source_strategy: String? = null,
    val confirm_paid_sources: Boolean? = null,
    val expectedRevision: Int? = null,
    val idempotencyKey: String? = null,
    val changedFields: List<String> = emptyList(),
    val timestamp: String? = null,
)

/** ok response body: { settings_revision, settings }. */
@Serializable
data class OwnerSettingsUpdateResult(
    val settings_revision: Int? = null,
    val settings: OwnerSettingsDto? = null,
    // 409 surfaces the actual canonical revision/settings; 422 surfaces errors[].
    val actual: OwnerSettingsDto? = null,
    val errors: List<OwnerSettingsError> = emptyList(),
)

@Serializable
data class OwnerSettingsError(
    val field: String? = null,
    val code: String? = null,
    val message: String? = null,
    val limit: Double? = null,
)

// ---------------------------------------------------------------------------
// GET /api/v1/reservoir/summary — domain reservoir summary.
// ---------------------------------------------------------------------------
@Serializable
data class ReservoirSummaryDto(
    val reservoir_domains: Long? = null,
    val by_state: Map<String, Long> = emptyMap(),
    val cursor: String? = null,
    val runs_total: Long? = null,
    val canonical_promotions_total: Long? = null,
    val common_crawl_adapter: String? = null,
    val common_crawl_mode: String? = null,
    val common_crawl_refresh: String? = null,
    val paid_sources_enabled: Boolean? = null,
)

// ---------------------------------------------------------------------------
// GET /api/v1/reservoir/funnel — pipeline funnel.
// ---------------------------------------------------------------------------
@Serializable
data class ReservoirFunnelDto(
    val raw_candidates: Long? = null,
    val technically_alive: Long? = null,
    val business_identified: Long? = null,
    val contact_verified: Long? = null,
    val audit_candidates: Long? = null,
    val audit_ready: Long? = null,
    val promoted_to_canonical: Long? = null,
    val rejected: Long? = null,
    val raw_import_ai_calls: Long? = null,
)
