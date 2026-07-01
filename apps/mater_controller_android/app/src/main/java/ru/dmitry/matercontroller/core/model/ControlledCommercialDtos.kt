package ru.dmitry.matercontroller.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ControlledCommercialLeadDto(
    @SerialName("lead_id") val leadId: String,
    @SerialName("company_name") val companyName: String,
    val website: String,
    val niche: String = "",
    val region: String = "",
    val source: String,
    @SerialName("source_url") val sourceUrl: String,
    val confidence: String,
    @SerialName("collected_at") val collectedAt: String,
    @SerialName("contact_channel") val contactChannel: String,
    @SerialName("contact_value") val contactValue: String,
    @SerialName("contact_source_url") val contactSourceUrl: String,
    @SerialName("contact_confidence") val contactConfidence: String,
    @SerialName("suppression_status") val suppressionStatus: String = "UNKNOWN",
    @SerialName("prior_outreach_status") val priorOutreachStatus: String = "UNKNOWN",
    @SerialName("owner_decision") val ownerDecision: String = "PENDING",
)

@Serializable
data class ControlledLeadImportBody(
    val leads: List<ControlledCommercialLeadDto>,
    @SerialName("source_batch_id") val sourceBatchId: String,
    @SerialName("dry_run") val dryRun: Boolean = true,
)

@Serializable
data class ControlledLeadImportResult(
    val imported: Int = 0,
    val rejected: Int = 0,
    @SerialName("real_contact_data_in_git") val realContactDataInGit: Boolean = false,
)

@Serializable
data class LeadVerifyBody(
    @SerialName("owner_reviewed") val ownerReviewed: Boolean,
    @SerialName("owner_override_reason") val ownerOverrideReason: String? = null,
    @SerialName("payload_hash") val payloadHash: String,
)

@Serializable
data class DraftCreateBody(
    @SerialName("lead_id") val leadId: String,
    @SerialName("draft_text") val draftText: String? = null,
    @SerialName("payload_hash") val payloadHash: String? = null,
)

@Serializable
data class QaRunBody(
    @SerialName("lead_id") val leadId: String,
    @SerialName("draft_id") val draftId: String,
    @SerialName("payload_hash") val payloadHash: String,
)

@Serializable
data class ControlledSendPacketBody(
    @SerialName("lead_id") val leadId: String,
    @SerialName("exact_channel") val exactChannel: String,
    @SerialName("exact_recipient") val exactRecipient: String,
    @SerialName("exact_subject") val exactSubject: String,
    @SerialName("exact_body_hash") val exactBodyHash: String,
    @SerialName("risk_level") val riskLevel: String,
)

@Serializable
data class ControlledSendApprovalBody(
    @SerialName("approval_id") val approvalId: String,
    @SerialName("payload_hash") val payloadHash: String,
    @SerialName("owner_confirmation") val ownerConfirmation: Boolean,
    @SerialName("single_use") val singleUse: Boolean = true,
)

@Serializable
data class TransportSendApprovedBody(
    @SerialName("approval_id") val approvalId: String,
    @SerialName("payload_hash") val payloadHash: String,
    @SerialName("exact_channel") val exactChannel: String,
    @SerialName("exact_recipient") val exactRecipient: String,
    @SerialName("exact_subject") val exactSubject: String,
    @SerialName("exact_body_hash") val exactBodyHash: String,
    @SerialName("dry_run") val dryRun: Boolean = true,
)

@Serializable
data class ControlledTransportResultDto(
    val status: String = "BLOCKED",
    @SerialName("outbound_count") val outboundCount: Int = 0,
    @SerialName("payload_hash") val payloadHash: String? = null,
    @SerialName("audit_record_id") val auditRecordId: String? = null,
)

@Serializable
data class ReplyClassifyBody(
    @SerialName("reply_class") val replyClass: String,
    @SerialName("owner_reviewed") val ownerReviewed: Boolean,
    @SerialName("payload_hash") val payloadHash: String,
)

@Serializable
data class CrmWriteApprovedBody(
    val entity: String,
    @SerialName("source_event_id") val sourceEventId: String,
    @SerialName("idempotency_key") val idempotencyKey: String,
    val actor: String,
    @SerialName("created_at") val createdAt: String,
    @SerialName("payload_hash") val payloadHash: String,
    @SerialName("approval_id") val approvalId: String,
    @SerialName("previous_state") val previousState: String,
    @SerialName("new_state") val newState: String,
    @SerialName("rollback_hint") val rollbackHint: String,
    @SerialName("owner_approved") val ownerApproved: Boolean,
)

@Serializable
data class OpportunityCreateBody(
    @SerialName("lead_id") val leadId: String,
    val stage: String,
    @SerialName("reply_id") val replyId: String? = null,
    @SerialName("payload_hash") val payloadHash: String,
)

@Serializable
data class ControlledInvoiceDraftBody(
    @SerialName("deal_id") val dealId: String,
    val product: String,
    val amount: Long,
    val currency: String,
    @SerialName("payload_hash") val payloadHash: String,
)

@Serializable
data class PaymentApprovalBody(
    val client: String,
    @SerialName("deal_id") val dealId: String,
    val amount: Long,
    val currency: String,
    val product: String,
    @SerialName("invoice_id") val invoiceId: String,
    @SerialName("payment_provider") val paymentProvider: String,
    @SerialName("payment_link_hash") val paymentLinkHash: String,
    val expiry: String,
    @SerialName("owner_confirmation") val ownerConfirmation: Boolean,
)

@Serializable
data class AuditEventsDto(
    val items: List<AuditEventDto> = emptyList(),
    val total: Int = 0,
)

@Serializable
data class AuditEventDto(
    @SerialName("event_id") val eventId: String,
    @SerialName("source_event_id") val sourceEventId: String? = null,
    val actor: String,
    @SerialName("created_at") val createdAt: String,
    @SerialName("payload_hash") val payloadHash: String,
    @SerialName("rollback_hint") val rollbackHint: String? = null,
)

@Serializable
data class StopBody(
    val reason: String,
    @SerialName("owner_confirmation") val ownerConfirmation: Boolean,
)
