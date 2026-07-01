package ru.dmitry.matercontroller.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

// Unified API envelope: { ok, data, error, requestId }
@Serializable
data class Envelope<T>(
    val ok: Boolean = false,
    val data: T? = null,
    val error: ApiError? = null,
    val requestId: String? = null,
)

@Serializable
data class ApiError(
    val code: String,
    val message: String,
    val details: JsonElement? = null,
)

@Serializable
data class HealthData(val status: String, val service: String, val apiVersion: String, val time: String)

@Serializable
data class PairingStartData(val code: String, val expiresInSeconds: Int)

@Serializable
data class PairingCompleteData(
    val deviceId: String,
    val accessToken: String,
    val refreshToken: String,
    val accessExpiresInSeconds: Long,
)

@Serializable
data class RefreshData(val accessToken: String, val accessExpiresInSeconds: Long)

@Serializable
data class Project(
    val id: String,
    val name: String,
    val status: String,
    val enabled: Boolean,
)

@Serializable
data class ProjectsData(val projects: List<Project>)

@Serializable
data class MiniAuditStatus(
    val waitingReply: Int = 0,
    val readySend: Int = 0,
    val preparing: Int = 0,
    val followupDue: Int = 0,
    val needsCheck: Int = 0,
    val sendUncertain: Int = 0,
    val total: Int = 0,
    val autosend: String = "BLOCKED",
    // RC7 unified-truth overlay (COMMERCIAL_REAL_ONLY). Commercial sends are 0; test/internal ledger
    // records are surfaced separately and never counted as commercial KPIs.
    @SerialName("commercial_successful_sends") val commercialSuccessfulSends: Int = 0,
    @SerialName("test_internal_ledger_records") val testInternalLedgerRecords: Int? = null,
    @SerialName("total_leads") val totalLeads: Int? = null,
    val scope: String? = null,
    @SerialName("truth_model_version") val truthModelVersion: String? = null,
)

@Serializable
data class Lead(
    val leadId: String,
    val company: String? = null,
    val website: String? = null,
    val niche: String? = null,
    val region: String? = null,
    val email: String? = null,
    val emailPresent: Boolean = false,
    val phone: String? = null,
    // Canonical score is a nested object on the wire (score_v1). Was incorrectly typed as Double?
    // which threw JsonDecodingException for every populated bucket (DEF-V3-002).
    val score: LeadScore? = null,
    val source: String? = null,
    val verificationStatus: String? = null,
    val status: String? = null,
    val auditReady: Boolean = false,
    val emailPreviewReady: Boolean = false,
    val sendProof: String? = null,
    val smtpCode: Int? = null,
    val sentAt: String? = null,
    val followupDue: Boolean = false,
    val replyState: String? = null,
    val sendable: Boolean = false,
    val category: String? = null,
    val blockingReasons: List<String> = emptyList(),
    val nextActionHint: String? = null,
    // follow-up / send-uncertain extras
    val followupSubject: String? = null,
    val attemptedAt: String? = null,
    val proofMissing: Boolean? = null,
    val recommendedAction: String? = null,
)

/** Canonical lead score (score_v1) — nested object on the wire. All fields optional so partial
 *  payloads parse (ignoreUnknownKeys + explicitNulls=false). See DEF-V3-002. */
@Serializable
data class LeadScore(
    @SerialName("score_version") val scoreVersion: String? = null,
    @SerialName("overall_priority_score") val overallPriorityScore: Double? = null,
    val result: String? = null,
    @SerialName("positive_signals") val positiveSignals: List<String> = emptyList(),
    @SerialName("negative_signals") val negativeSignals: List<String> = emptyList(),
    @SerialName("calculated_at") val calculatedAt: String? = null,
)

@Serializable
data class LeadsData(
    val items: List<Lead> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val pageSize: Int = 25,
    val bucket: String? = null,
)

@Serializable
data class NextActionData(
    val kind: String? = null,
    val reason: String? = null,
    val lead: Lead? = null,
)

@Serializable
data class AuditData(
    val leadId: String,
    val available: Boolean = false,
    val body: String? = null,
    val source: String? = null,
    val missingReason: String? = null,
)

@Serializable
data class EmailPreviewData(
    val leadId: String,
    val recipient: String? = null,
    val subject: String? = null,
    val body: String? = null,
    val available: Boolean = false,
    val sendable: Boolean = false,
    val blockingReasons: List<String> = emptyList(),
)

@Serializable
data class ApprovalIntent(
    val approvalId: String,
    val leadId: String,
    val company: String? = null,
    val recipient: String? = null,
    val subject: String? = null,
    val body: String? = null,
    val warning: String? = null,
    val autosend: String? = null,
)

@Serializable
data class FollowupPreview(
    val leadId: String,
    val initialSentAt: String? = null,
    val proof: String? = null,
    val stage: String? = null,
    val subject: String? = null,
    val body: String? = null,
)

@Serializable
data class ItemsWrap(val items: List<Lead> = emptyList())

@Serializable
data class FileInfo(val exists: Boolean = false, val sizeBytes: Long? = null, val modified: String? = null)

@Serializable
data class TelegramHeartbeat(val polling: Boolean? = null, val status: String? = null, val lastBeat: String? = null)

@Serializable
data class ServerFunnelStatus(
    val version: String? = null,
    @SerialName("yandex_imap_read") val yandexImapRead: ServerFunnelImap? = null,
    @SerialName("yandex_smtp_ready") val yandexSmtpReady: ServerFunnelSmtp? = null,
    @SerialName("email_classification") val emailClassification: ServerFunnelClassification? = null,
    @SerialName("crm_local_write") val crmLocalWrite: ServerFunnelLocalWrite? = null,
    @SerialName("telegram_approval") val telegramApproval: ServerFunnelApproval? = null,
    val funnel: ServerFunnelStages? = null,
    val safety: ServerFunnelSafety? = null,
    @SerialName("owner_visible_ru") val ownerVisibleRu: ServerFunnelOwnerText? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
)

@Serializable
data class ServerFunnelImap(
    val enabled: Boolean = false,
    @SerialName("read_only") val readOnly: Boolean = true,
    @SerialName("headers_only") val headersOnly: Boolean = true,
    @SerialName("pop3_used") val pop3Used: Boolean = false,
    @SerialName("snapshot_exists") val snapshotExists: Boolean = false,
    @SerialName("fetched_at") val fetchedAt: String? = null,
    val count: Int = 0,
)

@Serializable
data class ServerFunnelSmtp(
    val configured: Boolean = false,
    @SerialName("real_send_enabled") val realSendEnabled: Boolean = false,
    @SerialName("allowed_after_owner_approval") val allowedAfterOwnerApproval: Boolean = false,
    @SerialName("missing_keys") val missingKeys: List<String> = emptyList(),
)

@Serializable
data class ServerFunnelClassification(
    val enabled: Boolean = false,
    val counts: Map<String, Int> = emptyMap(),
)

@Serializable
data class ServerFunnelLocalWrite(
    val enabled: Boolean = false,
    @SerialName("private_only") val privateOnly: Boolean = true,
    @SerialName("production_synced") val productionSynced: Boolean = false,
)

@Serializable
data class ServerFunnelApproval(
    val enabled: Boolean = false,
    @SerialName("sends_telegram_now") val sendsTelegramNow: Boolean = false,
    @SerialName("card_ready") val cardReady: Boolean = false,
)

@Serializable
data class ServerFunnelStages(val enabled: Boolean = false, val stages: List<String> = emptyList())

@Serializable
data class ServerFunnelSafety(
    @SerialName("auto_reply") val autoReply: String = "OFF",
    @SerialName("mass_send") val massSend: String = "OFF",
    @SerialName("payment_live") val paymentLive: String = "OFF",
    @SerialName("payment_link") val paymentLink: String = "OFF",
    @SerialName("production_db_write") val productionDbWrite: String = "OFF",
    @SerialName("outbound_count") val outboundCount: Int = 0,
    @SerialName("payment_count") val paymentCount: Int = 0,
    @SerialName("production_db_writes") val productionDbWrites: Int = 0,
)

@Serializable
data class ServerFunnelOwnerText(
    val status: String? = null,
    @SerialName("next_action") val nextAction: String? = null,
    @SerialName("blocked_reason") val blockedReason: String? = null,
    @SerialName("last_refresh") val lastRefresh: String? = null,
    @SerialName("stale_reason") val staleReason: String? = null,
)

@Serializable
data class ServerFunnelMailData(
    @SerialName("snapshot_exists") val snapshotExists: Boolean = false,
    @SerialName("fetched_at") val fetchedAt: String? = null,
    val count: Int = 0,
    val items: List<ServerFunnelMailItem> = emptyList(),
)

@Serializable
data class ServerFunnelMailItem(
    @SerialName("email_id") val emailId: String,
    @SerialName("thread_id") val threadId: String? = null,
    val date: String? = null,
    @SerialName("from_masked") val fromMasked: String? = null,
    val subject: String? = null,
    val classification: ServerFunnelEmailClassification? = null,
    @SerialName("status_ru") val statusRu: String? = null,
    @SerialName("next_action_ru") val nextActionRu: String? = null,
)

@Serializable
data class ServerFunnelEmailClassification(
    val type: String? = null,
    val confidence: Double? = null,
    @SerialName("reason_ru") val reasonRu: String? = null,
)

@Serializable
data class ServerFunnelEmailDetailData(
    val email: ServerFunnelMailItem,
    val linked: ServerFunnelLinkedObject? = null,
    @SerialName("risk_ru") val riskRu: String? = null,
    @SerialName("proposed_next_action_ru") val proposedNextActionRu: String? = null,
)

@Serializable
data class ServerFunnelLinkedObject(
    @SerialName("lead_id") val leadId: String? = null,
    @SerialName("deal_id") val dealId: String? = null,
)

@Serializable
data class ServerFunnelReplyDraft(
    @SerialName("email_id") val emailId: String? = null,
    val subject: String? = null,
    val body: String? = null,
    @SerialName("summary_ru") val summaryRu: String? = null,
    @SerialName("suggested_action") val suggestedAction: String? = null,
    @SerialName("risk_ru") val riskRu: String? = null,
    val quality: ServerFunnelQuality? = null,
    @SerialName("text_hash") val textHash: String? = null,
    val sends: Boolean = false,
    @SerialName("auto_reply") val autoReply: String? = null,
)

@Serializable
data class ServerFunnelQuality(
    val status: String? = null,
    val checks: List<ServerFunnelQualityCheck> = emptyList(),
    val blocked: List<String> = emptyList(),
    val ownerReview: List<String> = emptyList(),
)

@Serializable
data class ServerFunnelQualityCheck(
    val key: String? = null,
    val state: String? = null,
    @SerialName("label_ru") val labelRu: String? = null,
)

@Serializable
data class ServerFunnelApprovalCardResponse(
    @SerialName("email_id") val emailId: String? = null,
    val packet: ServerFunnelSendPacket? = null,
    @SerialName("approval_card") val approvalCard: ServerFunnelApprovalCard? = null,
    @SerialName("telegram_sent") val telegramSent: Boolean = false,
    @SerialName("telegram_status") val telegramStatus: String? = null,
    @SerialName("sends_client_email") val sendsClientEmail: Boolean = false,
)

@Serializable
data class ServerFunnelSendPacket(
    @SerialName("packet_id") val packetId: String? = null,
    val recipient: String? = null,
    val channel: String? = null,
    val subject: String? = null,
    val body: String? = null,
    @SerialName("text_hash") val textHash: String? = null,
    @SerialName("packet_hash") val packetHash: String? = null,
    @SerialName("expires_at") val expiresAt: String? = null,
    val status: String? = null,
    @SerialName("quality_status") val qualityStatus: String? = null,
)

@Serializable
data class ServerFunnelApprovalCard(
    @SerialName("approval_id") val approvalId: String? = null,
    val status: String? = null,
    @SerialName("expires_at") val expiresAt: String? = null,
    @SerialName("approval_hash") val approvalHash: String? = null,
    @SerialName("card_ru") val cardRu: ServerFunnelApprovalCardRu? = null,
)

@Serializable
data class ServerFunnelApprovalCardRu(
    val from: String? = null,
    val type: String? = null,
    @SerialName("lead_or_deal") val leadOrDeal: String? = null,
    val summary: String? = null,
    val risk: String? = null,
    val draft: String? = null,
    val buttons: List<String> = emptyList(),
)

@Serializable
data class ServerFunnelEmptyBody(val noop: Boolean = true)

@Serializable
data class ServerFunnelApprovalRequest(
    val recipient: String? = null,
    val subject: String? = null,
    val body: String? = null,
    val sendTelegram: Boolean = false,
)

@Serializable
data class CommercialAutonomyStatus(
    val version: String? = null,
    val enabled: Boolean = false,
    val mode: String? = null,
    val flags: CommercialAutonomyFlags? = null,
    @SerialName("job_counts") val jobCounts: Map<String, Int> = emptyMap(),
    @SerialName("pipeline_counts") val pipelineCounts: Map<String, Int> = emptyMap(),
    val active: CommercialAutonomyActive? = null,
    @SerialName("first_touch") val firstTouch: CommercialAutonomyFirstTouch? = null,
    @SerialName("owner_visible_ru") val ownerVisibleRu: CommercialAutonomyOwnerText? = null,
    val safety: CommercialAutonomySafety? = null,
)

@Serializable
data class CommercialAutonomyFlags(
    @SerialName("LEAD_DISCOVERY_ENABLED") val leadDiscoveryEnabled: Boolean = false,
    @SerialName("VERIFY_ENABLED") val verifyEnabled: Boolean = false,
    @SerialName("AUDIT_AND_DRAFT_ENABLED") val auditAndDraftEnabled: Boolean = false,
    @SerialName("OWNER_APPROVAL_REQUIRED_FOR_SEND") val ownerApprovalRequiredForSend: Boolean = true,
    @SerialName("AUTO_SEND_ENABLED") val autoSendEnabled: Boolean = false,
    @SerialName("AUTO_REPLY_ENABLED") val autoReplyEnabled: Boolean = false,
    @SerialName("MASS_SEND_ENABLED") val massSendEnabled: Boolean = false,
    @SerialName("PAYMENT_LIVE_ENABLED") val paymentLiveEnabled: Boolean = false,
    @SerialName("PRODUCTION_DB_WRITE_ENABLED") val productionDbWriteEnabled: Boolean = false,
)

@Serializable
data class CommercialAutonomyActive(
    @SerialName("lead_discovery_jobs") val leadDiscoveryJobs: Int = 0,
    @SerialName("verification_jobs") val verificationJobs: Int = 0,
    @SerialName("preparation_jobs") val preparationJobs: Int = 0,
    @SerialName("total_working_jobs") val totalWorkingJobs: Int = 0,
)

@Serializable
data class CommercialAutonomyFirstTouch(
    @SerialName("leads_considered") val leadsConsidered: Int = 0,
    @SerialName("pilot_eligible") val pilotEligible: Int = 0,
    @SerialName("approval_pending") val approvalPending: Int = 0,
)

@Serializable
data class CommercialAutonomyOwnerText(
    val status: String? = null,
    @SerialName("next_action") val nextAction: String? = null,
    val blocker: String? = null,
)

@Serializable
data class CommercialAutonomySafety(
    @SerialName("auto_send") val autoSend: String = "OFF",
    @SerialName("auto_reply") val autoReply: String = "OFF",
    @SerialName("mass_send") val massSend: String = "OFF",
    @SerialName("payment_live") val paymentLive: String = "OFF",
    @SerialName("production_db_write") val productionDbWrite: String = "OFF",
    @SerialName("outbound_count") val outboundCount: Int = 0,
    @SerialName("payment_count") val paymentCount: Int = 0,
    @SerialName("production_db_writes") val productionDbWrites: Int = 0,
)

@Serializable
data class OutreachQueueData(
    val items: List<OutreachLeadRow> = emptyList(),
    val total: Int = 0,
    @SerialName("ready_count") val readyCount: Int = 0,
    @SerialName("blocked_count") val blockedCount: Int = 0,
    @SerialName("live_send_enabled") val liveSendEnabled: Boolean = false,
    @SerialName("mock_send_enabled") val mockSendEnabled: Boolean = false,
    @SerialName("payments_live") val paymentsLive: Boolean = false,
    @SerialName("production_db_write") val productionDbWrite: Boolean = false,
    @SerialName("next_action_ru") val nextActionRu: String? = null,
)

@Serializable
data class OutreachLeadRow(
    @SerialName("lead_id") val leadId: String,
    @SerialName("company_name") val companyName: String = "",
    val website: String = "",
    @SerialName("what_sells") val whatSells: String = "",
    val niche: String = "",
    val region: String = "",
    val source: String = "",
    val confidence: String = "",
    @SerialName("collected_at") val collectedAt: String? = null,
    @SerialName("contact_channel") val contactChannel: String = "",
    @SerialName("contact_present") val contactPresent: Boolean = false,
    @SerialName("contact_source_present") val contactSourcePresent: Boolean = false,
    @SerialName("contact_confidence") val contactConfidence: String = "",
    @SerialName("prior_outreach_status") val priorOutreachStatus: String = "",
    @SerialName("contact_restriction_status") val contactRestrictionStatus: String = "",
    @SerialName("duplicate_status") val duplicateStatus: String = "",
    val status: String = "",
    @SerialName("priority_score") val priorityScore: Int = 0,
    @SerialName("fit_score") val fitScore: Int = 0,
    @SerialName("draft_subject") val draftSubject: String = "",
    @SerialName("draft_body_preview") val draftBodyPreview: String = "",
    @SerialName("text_marker") val textMarker: String = "",
    val readiness: OutreachReadiness = OutreachReadiness(),
    @SerialName("next_action_ru") val nextActionRu: String = "",
)

@Serializable
data class OutreachReadiness(
    val ready: Boolean = false,
    val blockers: List<String> = emptyList(),
    val warnings: List<String> = emptyList(),
    @SerialName("owner_action_ru") val ownerActionRu: String = "",
)

@Serializable
data class OutreachLeadDetail(
    @SerialName("lead_id") val leadId: String,
    @SerialName("company_name") val companyName: String = "",
    val website: String = "",
    @SerialName("what_sells") val whatSells: String = "",
    val niche: String = "",
    val region: String = "",
    val source: String = "",
    val confidence: String = "",
    @SerialName("exact_recipient") val exactRecipient: String = "",
    @SerialName("contact_source_url") val contactSourceUrl: String = "",
    @SerialName("contact_channel") val contactChannel: String = "",
    @SerialName("prior_outreach_status") val priorOutreachStatus: String = "",
    @SerialName("contact_restriction_status") val contactRestrictionStatus: String = "",
    @SerialName("duplicate_status") val duplicateStatus: String = "",
    val status: String = "",
    @SerialName("fit_score") val fitScore: Int = 0,
    val readiness: OutreachReadiness = OutreachReadiness(),
    val draft: OutreachDraft = OutreachDraft(),
    val history: OutreachHistory = OutreachHistory(),
)

@Serializable
data class OutreachDraft(
    @SerialName("draft_id") val draftId: String = "",
    val subject: String = "",
    val body: String = "",
    @SerialName("text_marker") val textMarker: String = "",
    val quality: OutreachQuality = OutreachQuality(),
    val status: String = "",
)

@Serializable
data class OutreachQuality(
    val status: String = "",
    val checks: List<OutreachQualityCheck> = emptyList(),
)

@Serializable
data class OutreachQualityCheck(
    val id: String = "",
    @SerialName("label_ru") val labelRu: String = "",
    val state: String = "",
    @SerialName("reason_ru") val reasonRu: String = "",
)

@Serializable
data class OutreachHistory(
    @SerialName("prior_outreach_exists") val priorOutreachExists: Boolean = false,
    @SerialName("prior_reply_exists") val priorReplyExists: Boolean = false,
    @SerialName("sent_at") val sentAt: String? = null,
    @SerialName("send_proof_status") val sendProofStatus: String? = null,
)

@Serializable
data class OutreachDraftBody(
    val subject: String,
    val body: String,
    val expectedRevision: Int? = null,
)

@Serializable
data class OutreachSendBody(
    @SerialName("exactRecipient") val exactRecipient: String,
    @SerialName("exactSubject") val exactSubject: String,
    @SerialName("exactBody") val exactBody: String,
    @SerialName("ownerConfirmation") val ownerConfirmation: Boolean = true,
    val provider: String = "live",
    val expectedRevision: Int? = null,
)

@Serializable
data class OutreachDecisionBody(
    val reason: String = "",
    val expectedRevision: Int? = null,
)

@Serializable
data class OutreachSendResult(
    val ok: Boolean = false,
    val status: String? = null,
    @SerialName("lead_id") val leadId: String? = null,
    @SerialName("sent_count") val sentCount: Int = 0,
    val provider: String? = null,
    @SerialName("text_marker") val textMarker: String? = null,
    @SerialName("package_marker") val packageMarker: String? = null,
    @SerialName("duplicate_guard_id") val duplicateGuardId: String? = null,
    val revision: Int? = null,
)

@Serializable
data class OutreachDecisionResult(
    val ok: Boolean = false,
    @SerialName("lead_id") val leadId: String? = null,
    val decision: String? = null,
    val revision: Int? = null,
)

@Serializable
data class CommercialAutonomyStartBody(
    val niche: String? = null,
    val bbox: List<Double>? = null,
    val limit: Int = 20,
    val region: String? = null,
    val includeTest: Boolean = false,
)

@Serializable
data class CommercialAutonomyStartResult(
    val ok: Boolean = false,
    val status: String? = null,
    val idempotent: Boolean = false,
    @SerialName("owner_visible_ru") val ownerVisibleRu: CommercialAutonomyOwnerText? = null,
    val safety: CommercialAutonomySafety? = null,
    val after: CommercialAutonomyStatus? = null,
)

@Serializable
data class SystemStatus(
    val api: JsonElement? = null,
    val telegramBot: TelegramHeartbeat? = null,
    val leadStore: FileInfo? = null,
    val outboundLedger: FileInfo? = null,
    val emailLedger: FileInfo? = null,
    val smtpConfigured: Boolean = false,
    val serverFunnel: ServerFunnelStatus? = null,
    val autosend: String = "BLOCKED",
    val lastSync: String? = null,
)

// ---- replies (read-only inbound) ----
@Serializable
data class ReplyItem(
    val replyId: String,
    val leadId: String? = null,
    val company: String? = null,
    val from: String? = null,
    val subject: String? = null,
    val category: String? = null,
    val suggested: String? = null,
    val optout: Boolean = false,
    val signals: List<String> = emptyList(),
    val status: String? = null,
    val receivedAt: String? = null,
    val text: String? = null,
    val matchMethod: String? = null,
    val matchConfidence: String? = null,
)

@Serializable
data class RepliesData(val items: List<ReplyItem> = emptyList(), val total: Int = 0)

@Serializable
data class ReplyCounts(
    val total: Int = 0,
    @SerialName("new") val newCount: Int = 0,
    val interested: Int = 0,
    @SerialName("not_interested") val notInterested: Int = 0,
    val bounce: Int = 0,
    val unmatched: Int = 0,
)


// ---- automation + pipeline (v0.4.0) ----
@Serializable
data class AutomationStatusDto(
    val canonicalWriter: Boolean = false,
    val autosend: String = "BLOCKED",
    val sendAllowedLive: Boolean = false,
    val maintenance: Boolean = false,
    val storeRevision: Int? = null,
    val deadLetter: Int = 0,
    val running: Int = 0,
    val queued: Int = 0,
    val blockedApproval: Int = 0,
    val queue: JsonElement? = null,
    val pipeline: JsonElement? = null,
)

@Serializable
data class PipelineLead(
    val lead_id: String? = null,
    val company: String? = null,
    val status: String? = null,
    val website: String? = null,
    val website_status: String? = null,
    val email_status: String? = null,
    val identity_status: String? = null,
    // score_v2 (Lead Hunter candidate score) — kept strictly separate from canonical score_v1.
    @SerialName("candidate_score") val candidateScoreV2: Int? = null,
    @SerialName("candidate_score_version") val candidateScoreVersionV2: String? = null,
    // score_v1 (canonical pipeline priority score) — wire field `score`. Never merged with v2.
    @SerialName("score") val canonicalScoreV1: Double? = null,
    val lead_route: String? = null,
    val region: String? = null,
    val industry: String? = null,
)

@Serializable
data class PipelineLeadsData(val items: List<PipelineLead> = emptyList())
