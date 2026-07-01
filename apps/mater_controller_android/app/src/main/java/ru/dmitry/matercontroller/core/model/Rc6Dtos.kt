package ru.dmitry.matercontroller.core.model

import kotlinx.serialization.Serializable

// ============================================================================
// 0.6.0-rc6 — new authoritative read DTOs (read-only owner views; no send path).
//
// The backend serializes these in snake_case. The app's Json config has NO
// namingStrategy, so each Kotlin property name == its wire name (snake_case).
// Every field is nullable/default so partial payloads parse with
// ignoreUnknownKeys + coerceInputValues + explicitNulls=false.
//
// Provenance rule (RC5/RC6): any field where the server may emit a number OR the
// literal string "UNKNOWN" is typed String? and rendered «неизвестно», never a false 0.
// ============================================================================

// ---------------------------------------------------------------------------
// GET /api/v1/commercial/reconciliation — authoritative send/queue reconciliation (defect A).
// Sent leads are NEVER placed in send-review; READY_FOR_SEND_REVIEW means "awaiting owner's
// send-review decision", not "already sent". All current sends are test/internal.
// ---------------------------------------------------------------------------
@Serializable
data class ReconciliationSend(
    val lead_id: String? = null,
    val company: String? = null,
    val recipient_masked: String? = null,
    val timestamp: String? = null,
    val channel: String? = null,
    val delivery_proof: String? = null,
    val lead_status: String? = null,
    val offer_status: String? = null,
    val owner_decision: String? = null,
    val is_commercial_offer: Boolean? = null,
    val effective_state: String? = null,
    val classification: String? = null,
    val repeat_send_blocked: Boolean? = null,
)

@Serializable
data class ReconciliationQueueItem(
    val lead_id: String? = null,
    val company: String? = null,
    val offer_status: String? = null,
    val effective_state: String? = null,
    val classification: String? = null,
)

@Serializable
data class ReconciliationDto(
    val send_ledger_total: Int? = null,
    val sends: List<ReconciliationSend> = emptyList(),
    val commercial_sends: Int? = null,
    val test_or_internal_sends: Int? = null,
    val ready_for_send_review: List<ReconciliationQueueItem> = emptyList(),
    val ready_for_send_review_count: Int? = null,
    val awaiting_reply: List<ReconciliationQueueItem> = emptyList(),
    val awaiting_reply_count: Int? = null,
    val followup_required_count: Int? = null,
    val sent_leads_in_send_review: Int? = null,
    val unsent_leads_in_awaiting_reply: Int? = null,
    val stale_status_conflicts_detected: Int? = null,
    val repeat_send_guard: Boolean? = null,
    val no_lead_in_conflicting_queues: Boolean? = null,
)

// ---------------------------------------------------------------------------
// GET /api/v1/leads/{id}/artifacts — audit + email artifacts (defect B).
// audit_equals_email is false: the audit and the client email are DISTINCT artifacts and must be
// shown on separate tabs. When audit_ready=false the audit tab shows «Аудит не готов: <status>»
// and the email is NOT shown in its place.
// GET /api/v1/leads/{id}/audit returns the same audit object.
// ---------------------------------------------------------------------------
@Serializable
data class AuditFindingDto(
    val finding_id: String? = null,
    val title: String? = null,
    val evidence_url: String? = null,
    val evidence_text: String? = null,
    val observed_at: String? = null,
    val impact: String? = null,
    val priority: String? = null,
    val recommendation: String? = null,
    val confidence: String? = null,
    val source: String? = null,
    val is_inferred: Boolean? = null,
)

@Serializable
data class AuditDto(
    val audit_id: String? = null,
    val lead_id: String? = null,
    val product_id: String? = null,
    val created_at: String? = null,
    val source_snapshot_at: String? = null,
    val findings: List<AuditFindingDto> = emptyList(),
    val finding_count: Int? = null,
    val quick_fix_plan: List<String> = emptyList(),
    val next_step: String? = null,
    val limitations: List<String> = emptyList(),
    val qa_status: String? = null,
    val artifact_hash: String? = null,
    val provider_provenance: String? = null,
    val client_facing_ready: Boolean? = null,
    val audit_ready: Boolean? = null,
    val audit_status: String? = null,
    val is_email: Boolean? = null,
)

@Serializable
data class EmailArtifactDto(
    val artifact_type: String? = null,
    val lead_id: String? = null,
    val subject: String? = null,
    val recipient_masked: String? = null,
    val body_text: String? = null,
    val template_id: String? = null,
    val no_send_notice: String? = null,
)

@Serializable
data class LeadArtifactsDto(
    val lead_id: String? = null,
    val audit: AuditDto? = null,
    val email: EmailArtifactDto? = null,
    // Always false: audit ≠ email. Surfaced as an explicit badge on the lead detail.
    val audit_equals_email: Boolean? = null,
)

// ---------------------------------------------------------------------------
// GET /api/v1/knowledge/radar-status — authoritative radar status (defect C).
// This is the radar-specific status (NOT the general /system status). Used so a radar-only
// outage is classified separately and does NOT show «нет соединения» for the whole app.
// endpoint is LIVE or CACHE.
// ---------------------------------------------------------------------------
@Serializable
data class RadarStatusDto(
    val endpoint: String? = null,
    val active: Boolean? = null,
    val mode: String? = null,
    val last_run: String? = null,
    val last_successful_update: String? = null,
    val sources_total: Int? = null,
    val findings_total: Int? = null,
    val production_findings: Int? = null,
    val test_only_findings: Int? = null,
    val verified_urgent: Int? = null,
    val needs_verification: Int? = null,
    val prompt_injection_quarantines: Int? = null,
    val circuit_state: String? = null,
    val llm_summarization: Boolean? = null,
    val weekly_budget_units: Long? = null,
    val next_scheduled_run: String? = null,
    val last_error: String? = null,
    val auto_production_changes: Boolean? = null,
)

// ---------------------------------------------------------------------------
// GET /api/v1/reservoir/counters — exclusive states + invariants (defect G).
// exclusive_states partition the reservoir; invariants assert the sums reconcile.
// ---------------------------------------------------------------------------
@Serializable
data class ReservoirSignals(
    val test_only: Long? = null,
    val has_contacts: Long? = null,
)

@Serializable
data class ReservoirCountersDto(
    val total_records: Long? = null,
    val exclusive_states: Map<String, Long> = emptyMap(),
    val active: Long? = null,
    val promoted: Long? = null,
    val rejected: Long? = null,
    val signals: ReservoirSignals? = null,
    // invariants is a free-form {name: bool} map asserting the partition reconciles.
    val invariants: Map<String, Boolean> = emptyMap(),
)

// ---------------------------------------------------------------------------
// GET /api/v1/reservoir/domains — list of reservoir domains.
// ---------------------------------------------------------------------------
@Serializable
data class ReservoirDomainItem(
    val domain_id: String? = null,
    val host: String? = null,
    val source: String? = null,
    val source_mode: String? = null,
    val state: String? = null,
    val economic_score: Double? = null,
    val economic_band: String? = null,
    val contacts_found: Long? = null,
    val last_checked_at: String? = null,
    val ai_calls: Long? = null,
)

@Serializable
data class ReservoirDomainList(
    val items: List<ReservoirDomainItem> = emptyList(),
)

// ---------------------------------------------------------------------------
// GET /api/v1/reservoir/domains/{id} — single domain detail card.
// ---------------------------------------------------------------------------
@Serializable
data class ReservoirDomainDetailDto(
    val domain_id: String? = null,
    val host: String? = null,
    val source: String? = null,
    val test_only: Boolean? = null,
    val inserted_run: String? = null,
    val last_checked_at: String? = null,
    val current_stage: String? = null,
    val dns_ok: Boolean? = null,
    val http_status: Int? = null,
    val final_url: String? = null,
    val title: String? = null,
    val contacts_found: Long? = null,
    val economic_score: Double? = null,
    val economic_band: String? = null,
    val rejection_reason: String? = null,
    val ai_calls: Long? = null,
    val promoted: Boolean? = null,
    val no_send_status: String? = null,
)

// ---------------------------------------------------------------------------
// GET /api/v1/reservoir/common-crawl/probe — honest Common Crawl mode (defect G).
// common_crawl_mode TEST_ONLY + live_compatibility NOT_VERIFIED must be shown honestly:
// «Тестовый режим, совместимость не подтверждена», NOT just «Готов».
// ---------------------------------------------------------------------------
@Serializable
data class CommonCrawlProbeDto(
    val common_crawl_mode: String? = null,
    val live_compatibility: String? = null,
    val reason: String? = null,
    val max_index_requests: Long? = null,
    val max_hosts_inspected: Long? = null,
    val max_reservoir_inserts: Long? = null,
    val ai_calls: Long? = null,
    val canonical_promotions: Long? = null,
    val paid_source_calls: Long? = null,
)
