package ru.dmitry.matercontroller.core.model

import kotlinx.serialization.Serializable

// ============================================================================
// Gate C1-A — product catalog + reconciliation + command DTOs.
// All fields default so partial payloads parse. Unknown price is null (rendered as words, never 0).
// ============================================================================

@Serializable
data class ProductListItem(
    val product_id: String,
    val name: String? = null,
    val status: String? = null,
    val price: Double? = null,            // null when unknown — never coerce to 0
    val price_display: String? = null,
    val currency: String? = "RUB",
    val short_description: String? = null,
    val readiness: String? = null,
    val version: String? = null,
    val category: String? = null,
)

@Serializable
data class ProductCatalog(
    val items: List<ProductListItem> = emptyList(),
    val total: Int = 0,
    val counts: Map<String, Int> = emptyMap(),
    val count_definitions: Map<String, String> = emptyMap(),
)

@Serializable
data class ProductDetail(
    val product_id: String,
    val name: String? = null,
    val status: String? = null,
    val price: Double? = null,
    val price_display: String? = null,
    val currency: String? = "RUB",
    val scope_included: List<String> = emptyList(),
    val scope_excluded: List<String> = emptyList(),
    val inputs_required: List<String> = emptyList(),
    val deliverables: List<String> = emptyList(),
    val acceptance_criteria: List<String> = emptyList(),
    val claims: List<String> = emptyList(),
    val description: String? = null,
    val readiness: String? = null,
    val version: String? = null,
    val category: String? = null,
)

// ---- reconciliation read models ----
@Serializable
data class LeadCountReconciliation(
    val canonical_total_leads: Int = 0,
    val mini_audit_operational_leads: Int = 0,
    val excluded_from_mini_audit: Int = 0,
    val excluded_breakdown_by_status: Map<String, Int> = emptyMap(),
    val count_definitions: Map<String, String> = emptyMap(),
) {
    fun definitionFor(key: LeadCountKey): String? = count_definitions[key.wire]
}

/** Stable wire keys for lead-count definitions (kept out of UI literals for owner-safety scans). */
enum class LeadCountKey(val wire: String) {
    CANONICAL_TOTAL("canonical_total_leads"),
    OPERATIONAL("mini_audit_operational_leads"),
    EXCLUDED("excluded_from_mini_audit"),
}

@Serializable
data class SendReconRecord(
    val leadId: String = "",
    val classification: String = "",
    val sendProof: String? = null,
    val lastSendStatus: String? = null,
    val smtpCode: Int? = null,
    val attemptedAt: String? = null,
    val recommendedAction: String? = null,
)

@Serializable
data class SendReconciliation(
    val authoritative_successful_sends: Int = 0,
    val records_requiring_reconciliation: Int = 0,
    val classifications: Map<String, Int> = emptyMap(),
    val records: List<SendReconRecord> = emptyList(),
    val unauthorized_sends: Int = 0,
    val unknown_sends: Int = 0,
    val definitions: Map<String, String> = emptyMap(),
)

// ---- C1-A command request/response bodies ----
@Serializable
data class LeadRef(
    val lead_id: String,
    val customer_id: String? = null,
    val company: String? = null,
    val verification_status: String? = null,
)

@Serializable
data class CreateOpportunityBody(
    val lead: LeadRef,
    val productId: String? = "mini_audit",
    val expectedRevision: Int? = null,
    val testOnly: Boolean = false,
)

@Serializable
data class ExpectedRevisionBody(val expectedRevision: Int? = null)

@Serializable
data class DecisionBody(val decision: String, val expectedRevision: Int? = null)

@Serializable
data class InvoiceDraftBody(val dealId: String? = null, val projectId: String? = null, val expectedRevision: Int? = null)

@Serializable
data class CommandResult(
    val ok: Boolean = false,
    val id: String? = null,
    val entity: String? = null,
    val revision: Int? = null,
    val dealId: String? = null,
    val decision: String? = null,
)

@Serializable
data class TechnicalAcceptance(
    val test_only_opportunities: Int = 0,
    val test_only_offers: Int = 0,
    val test_only_deals: Int = 0,
    val test_only_handoffs: Int = 0,
    val test_only_projects: Int = 0,
    val test_only_invoice_drafts: Int = 0,
    val test_only_payments: Int = 0,
    val excluded_from_business_kpi: Boolean = true,
)

// ---- transport-readiness DTOs (RC3) ----
@Serializable
data class DeliveryRecord(
    val leadId: String = "",
    val category: String = "",
    val attemptTimestamp: String? = null,
    val channel: String? = null,
    val smtpProof: Boolean = false,
    val confirmedSent: Boolean = false,
    val automaticResendAllowed: Boolean = false,
    val automaticFollowupAllowed: Boolean = false,
    val ownerReviewRequired: Boolean = true,
)

@Serializable
data class DeliveryContainment(
    val records_total: Int = 0,
    val by_category: Map<String, Int> = emptyMap(),
    val owner_review_queue: List<DeliveryRecord> = emptyList(),
    val automatic_resend_allowed: Boolean = false,
    val automatic_followup_allowed: Boolean = false,
    val definitions: Map<String, String> = emptyMap(),
)

@Serializable
data class TimelineEvent(
    val at: String? = null,
    val type: String = "",
    val ref: String? = null,
    val stage: String? = null,
    val status: String? = null,
    val decision: String? = null,
    val category: String? = null,
    val result: String? = null,
)

@Serializable
data class ConversationTimeline(
    val conversation_id: String? = null,
    val lead_id: String? = null,
    val events: List<TimelineEvent> = emptyList(),
    val event_count: Int = 0,
    val send_capability: String = "NONE",
    val offer_status: String? = null,
)

@Serializable
data class ConversationSummary(
    val conversation_id: String? = null,
    val lead_id: String? = null,
    val event_count: Int = 0,
    val has_offer: Boolean = false,
    val has_reply: Boolean = false,
)

@Serializable
data class ConversationsList(val items: List<ConversationSummary> = emptyList(), val total: Int = 0)

@Serializable
data class PresaleHealth(
    val lead_id: String? = null,
    val state: String? = null,
    val communication_health: String? = null,
    val days_since_last_action: Int? = null,
    val reply_received: Boolean = false,
    val followup_due: Boolean = false,
    val delivery_status_confidence: String? = null,
    val owner_attention_reason: String? = null,
)

// ---- RC4: agent + pipeline DTOs ----
@Serializable
data class AgentProfileDto(val profile: String = "", val state: String = "")

@Serializable
data class AgentStatus(
    val runtime: String = "OFF",
    val mode: String = "SHADOW_NO_SEND",
    val provider_available: Boolean = false,
    val profiles: List<AgentProfileDto> = emptyList(),
    // RC3: live provider telemetry. snake_case wire fields parse directly (Json config uses the
    // property names); all nullable/default so older payloads without them still parse.
    val provider: String? = null,                       // e.g. "tokenator" or null until available
    val active_model: String? = null,                   // e.g. "gpt-5.5"
    val last_successful_call: String? = null,           // ISO-8601 timestamp or null
    val circuit_state: String? = null,                  // e.g. "CLOSED" / "OPEN" / "HALF_OPEN"
    val cumulative_calculated_units: Long? = null,
    val first_run_budget_limit: Long? = null,
)

@Serializable
data class AgentArtifactSummary(
    val lead_id: String = "",
    val qa_verdict: String = "",
    val owner_review_required: Boolean = false,
)

@Serializable
data class ShadowWaveResult(
    val agent_mode: String = "SHADOW_NO_SEND",
    val shadow_leads_processed: Int = 0,
    val agent_tasks_completed: Int = 0,
    val agent_tasks_failed: Int = 0,
    val agent_dead_letters: Int = 0,
    val qa_verdicts: Map<String, Int> = emptyMap(),
    val unsupported_claims: Int = 0,
    val guessed_emails: Int = 0,
    val send_attempts: Int = 0,
    val artifacts: List<AgentArtifactSummary> = emptyList(),
)

@Serializable
data class OwnerQueues(
    val ready_for_send_review: List<String> = emptyList(),
    val awaiting_reply: Int = 0,
    val replies_received: Int = 0,
    val followup_due: Int = 0,
    val delivery_review: Int = 0,
    val agent_results_to_review: Int = 0,
    val test_records: Int = 0,
    val note: String? = null,
)

@Serializable
data class ExecutiveBrief(
    val what_changed: String? = null,
    val needs_owner: String? = null,
    val leads_ready: Int = 0,
    val replies_in: Int = 0,
    val followup_due: Int = 0,
    val agent_runs_failed: Int = 0,
    val next_safe_action: String? = null,
    val confirmed_sends: Int = 0,
    val delivery_unconfirmed: Int = 0,
)

// ---- 0.6.0: multichannel DTOs ----
@Serializable
data class SourceItem(
    val source_id: String = "",
    val source_type: String = "",
    val display_name: String = "",
    val status: String = "",
    val capabilities: List<String> = emptyList(),
    // RC4: authoritative Source Registry fields (all nullable/default; partial payloads parse).
    val name: String? = null,
    val enabled: Boolean? = null,
    val credential_status: String? = null,
    val reason_disabled: String? = null,
    val cost_class: String? = null,
    val inbound: Boolean? = null,
    val outbound: Boolean? = null,
)

@Serializable
data class SourcesList(val items: List<SourceItem> = emptyList(), val total: Int = 0)

@Serializable
data class SourceHealthItem(
    val source_id: String = "",
    val status: String = "",
    val last_run: String? = null,
    val candidates: Int? = null,
    val verified: Int? = null,
    val duplicates: Int? = null,
    val has_data: Boolean = false,
    // RC4: authoritative health fields.
    val health: String? = null,
    val last_success: String? = null,
    val last_failure: String? = null,
    val records_discovered: Int? = null,
    val records_promoted: Int? = null,
)

@Serializable
data class SourceHealthList(val items: List<SourceHealthItem> = emptyList())

@Serializable
data class ChannelItem(
    val channel: String = "",
    val discovery: String = "",
    val inbound: String = "",
    val outbound: String = "",
)

@Serializable
data class ChannelsList(val items: List<ChannelItem> = emptyList(), val outbound_channels_enabled: Int = 0)

@Serializable
data class InboundItem(
    val id: String = "",
    val source: String = "",
    val channel: String = "",
    val company: String? = null,
    val received_at: String? = null,
    val status: String = "NEW",
)

@Serializable
data class InboundList(val items: List<InboundItem> = emptyList())

@Serializable
data class MultichannelOwnerQueue(
    val inbound_to_review: Int = 0,
    val identity_conflicts: Int = 0,
    val reply_drafts: Int = 0,
    val quarantine: Int = 0,
    val note: String? = null,
)
