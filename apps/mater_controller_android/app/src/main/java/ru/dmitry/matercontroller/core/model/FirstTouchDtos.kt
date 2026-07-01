package ru.dmitry.matercontroller.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ============================================================================
// First Touch Strategist (0.6.0-rc9) — read-only owner DTOs. No-send. All fields nullable/default
// so partial payloads parse. Wire fields are snake_case (Json has no naming strategy).
// ============================================================================

@Serializable
data class FirstTouchSummaryDto(
    @SerialName("leads_scored") val leadsScored: Int = 0,
    @SerialName("pilot_eligible") val pilotEligible: Int = 0,
    @SerialName("top_5_count") val top5Count: Int = 0,
    @SerialName("top_3_count") val top3Count: Int = 0,
    @SerialName("recommended_pilot") val recommendedPilot: String? = null,
    @SerialName("controlled_send_gate") val controlledSendGate: String = "DISABLED",
    @SerialName("transport_enabled") val transportEnabled: Boolean = false,
    @SerialName("no_send") val noSend: Boolean = true,
    val scope: String? = null,
)

@Serializable
data class FirstTouchCandidateRow(
    @SerialName("lead_id") val leadId: String = "",
    val company: String? = null,
    val segment: String? = null,
    val product: String? = null,
    @SerialName("contact_evidenced") val contactEvidenced: Boolean = false,
    @SerialName("audit_ready") val auditReady: Boolean = false,
    @SerialName("hook_type") val hookType: String? = null,
    @SerialName("quality_score") val qualityScore: Int? = null,
    val eligible: Boolean = false,
    @SerialName("excluded_reasons") val excludedReasons: List<String> = emptyList(),
    val score: Int = 0,
)

@Serializable
data class FirstTouchBlockedRow(
    @SerialName("lead_id") val leadId: String = "",
    val company: String? = null,
    @SerialName("blocked_reasons") val blockedReasons: List<String> = emptyList(),
)

@Serializable
data class FirstTouchCandidatesDto(
    @SerialName("leads_considered") val leadsConsidered: Int = 0,
    @SerialName("leads_scored") val leadsScored: Int = 0,
    @SerialName("pilot_eligible") val pilotEligible: Int = 0,
    @SerialName("top_5") val top5: List<FirstTouchCandidateRow> = emptyList(),
    @SerialName("top_3") val top3: List<FirstTouchCandidateRow> = emptyList(),
    @SerialName("recommended_pilot") val recommendedPilot: FirstTouchCandidateRow? = null,
    val blocked: List<FirstTouchBlockedRow> = emptyList(),
    @SerialName("no_send") val noSend: Boolean = true,
)

@Serializable
data class FirstTouchHook(
    @SerialName("hook_type") val hookType: String? = null,
    val title: String? = null,
    @SerialName("finding_id") val findingId: String? = null,
    @SerialName("evidence_url") val evidenceUrl: String? = null,
    @SerialName("evidence_text") val evidenceText: String? = null,
    @SerialName("business_impact") val businessImpact: String? = null,
    @SerialName("impact_confidence") val impactConfidence: Double? = null,
    @SerialName("reason_selected") val reasonSelected: String? = null,
)

@Serializable
data class FirstTouchSubject(
    val id: String = "",
    val text: String = "",
    val score: Int = 0,
    @SerialName("risk_flags") val riskFlags: List<String> = emptyList(),
    val reason: String? = null,
)

@Serializable
data class FirstTouchBodyMetrics(
    @SerialName("word_count") val wordCount: Int = 0,
    val questions: Int = 0,
    val exclaims: Int = 0,
    val links: Int = 0,
    @SerialName("has_price") val hasPrice: Boolean = false,
    @SerialName("cta_count") val ctaCount: Int = 0,
)

@Serializable
data class FirstTouchBody(
    val id: String = "",
    val text: String = "",
    val kind: String? = null,
    val metrics: FirstTouchBodyMetrics = FirstTouchBodyMetrics(),
)

@Serializable
data class FirstTouchQuality(
    @SerialName("total_score") val totalScore: Int = 0,
    @SerialName("evidence_score") val evidenceScore: Int = 0,
    @SerialName("hook_score") val hookScore: Int = 0,
    @SerialName("gate_result") val gateResult: String = "FAIL",
    @SerialName("failure_reasons") val failureReasons: List<String> = emptyList(),
)

@Serializable
data class FirstTouchCompliance(
    @SerialName("prior_commercial_send") val priorCommercialSend: Boolean = false,
    @SerialName("prior_opt_out") val priorOptOut: Boolean = false,
    @SerialName("public_business_contact") val publicBusinessContact: Boolean = false,
    @SerialName("gate_result") val gateResult: String = "FAIL",
)

@Serializable
data class FirstTouchDeliverability(
    val status: String = "NOT_VERIFIED",
    @SerialName("recipient_domain") val recipientDomain: String? = null,
    @SerialName("company_domain_match") val companyDomainMatch: Boolean = false,
    @SerialName("smtp_probing") val smtpProbing: Boolean = false,
)

@Serializable
data class FirstTouchArtifactDto(
    @SerialName("artifact_type") val artifactType: String = "FIRST_TOUCH",
    @SerialName("lead_id") val leadId: String = "",
    @SerialName("audit_id") val auditId: String? = null,
    @SerialName("product_id") val productId: String? = null,
    val status: String = "DRAFT",
    val hook: FirstTouchHook? = null,
    @SerialName("subject_variants") val subjectVariants: List<FirstTouchSubject> = emptyList(),
    @SerialName("body_variants") val bodyVariants: List<FirstTouchBody> = emptyList(),
    @SerialName("recommended_subject_id") val recommendedSubjectId: String? = null,
    @SerialName("recommended_body_id") val recommendedBodyId: String? = null,
    val quality: FirstTouchQuality = FirstTouchQuality(),
    val compliance: FirstTouchCompliance = FirstTouchCompliance(),
    val deliverability: FirstTouchDeliverability = FirstTouchDeliverability(),
    @SerialName("content_hash") val contentHash: String? = null,
    @SerialName("no_send") val noSend: Boolean = true,
)

@Serializable
data class FirstTouchPilotReadinessDto(
    @SerialName("recommended_pilot") val recommendedPilot: String? = null,
    @SerialName("controlled_send_gate") val controlledSendGate: String = "DISABLED",
    @SerialName("transport_enabled") val transportEnabled: Boolean = false,
    @SerialName("send_allowed_live") val sendAllowedLive: Boolean = false,
    @SerialName("approval_token_issued") val approvalTokenIssued: Boolean = false,
    @SerialName("no_send") val noSend: Boolean = true,
)

// ---- 0.6.0-rc10: owner command bodies (no-send). expectedRevision + Idempotency-Key (header). ----
@Serializable
data class FirstTouchGenerateBody(
    @SerialName("leadId") val leadId: String,
    @SerialName("expectedRevision") val expectedRevision: Int? = null,
)

@Serializable
data class FirstTouchDraftBody(
    @SerialName("draftId") val draftId: String,
    @SerialName("subjectId") val subjectId: String? = null,
    @SerialName("bodyId") val bodyId: String? = null,
    @SerialName("note") val note: String? = null,
    @SerialName("reason") val reason: String? = null,
    @SerialName("expectedRevision") val expectedRevision: Int? = null,
)

@Serializable
data class FirstTouchPilotBody(
    @SerialName("leadId") val leadId: String,
    @SerialName("expectedRevision") val expectedRevision: Int? = null,
)

// Command result for First Touch owner commands. no_send/transport invariants are always echoed back.
@Serializable
data class FirstTouchCommandResult(
    val ok: Boolean = false,
    @SerialName("draft_id") val draftId: String? = null,
    @SerialName("lead_id") val leadId: String? = null,
    val status: String? = null,
    @SerialName("selected_subject_id") val selectedSubjectId: String? = null,
    @SerialName("selected_body_id") val selectedBodyId: String? = null,
    @SerialName("text_approved") val textApproved: Boolean = false,
    @SerialName("selected_pilot") val selectedPilot: String? = null,
    @SerialName("send_allowed_live") val sendAllowedLive: Boolean = false,
    @SerialName("approval_token_issued") val approvalTokenIssued: Boolean = false,
    @SerialName("no_send") val noSend: Boolean = true,
    @SerialName("transport_enabled") val transportEnabled: Boolean = false,
    val revision: Int? = null,
    val idempotent: Boolean = false,
)

@Serializable
data class StoreRevisionDto(val revision: Int = 0)
