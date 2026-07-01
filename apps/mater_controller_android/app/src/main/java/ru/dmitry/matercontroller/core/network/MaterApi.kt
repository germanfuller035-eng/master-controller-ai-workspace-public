package ru.dmitry.matercontroller.core.network

import kotlinx.serialization.Serializable
import ru.dmitry.matercontroller.core.model.*
import retrofit2.Response
import retrofit2.http.*

@Serializable data class PairingStartBody(val deviceName: String? = null)
@Serializable data class PairingCompleteBody(val code: String, val deviceName: String? = null)
@Serializable data class RefreshBody(val refreshToken: String)
@Serializable data class EnqueueJobBody(
    val jobType: String,
    val entityType: String? = null,
    val entityId: String? = null,
    val idempotencyKey: String? = null,
)
@Serializable data class LeadStatusBody(val status: String, val expectedRevision: Int? = null)
@Serializable data class AutopilotModeBody(val mode: String)
@Serializable data class NotificationReadBody(val state: String = "read")

interface MaterApi {
    @GET("health")
    suspend fun health(): Response<Envelope<HealthData>>

    // ---- auth ----
    @POST("auth/pairing/start")
    suspend fun pairingStart(@Body body: PairingStartBody): Response<Envelope<PairingStartData>>

    @POST("auth/pairing/complete")
    suspend fun pairingComplete(@Body body: PairingCompleteBody): Response<Envelope<PairingCompleteData>>

    @POST("auth/refresh")
    suspend fun refresh(@Body body: RefreshBody): Response<Envelope<RefreshData>>

    // ---- projects ----
    @GET("projects")
    suspend fun projects(): Response<Envelope<ProjectsData>>

    // ---- mini-audit ----
    @GET("mini-audit/status")
    suspend fun miniAuditStatus(): Response<Envelope<MiniAuditStatus>>

    @GET("mini-audit/next-action")
    suspend fun nextAction(): Response<Envelope<NextActionData>>

    @GET("mini-audit/leads")
    suspend fun leads(
        @Query("bucket") bucket: String? = null,
        @Query("search") search: String? = null,
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 50,
    ): Response<Envelope<LeadsData>>

    @GET("mini-audit/leads/{id}")
    suspend fun lead(@Path("id") id: String): Response<Envelope<Lead>>

    @GET("mini-audit/leads/{id}/audit")
    suspend fun audit(@Path("id") id: String): Response<Envelope<AuditData>>

    @GET("mini-audit/leads/{id}/email-preview")
    suspend fun emailPreview(@Path("id") id: String): Response<Envelope<EmailPreviewData>>

    @POST("mini-audit/leads/{id}/send/prepare")
    suspend fun sendPrepare(@Path("id") id: String): Response<Envelope<ApprovalIntent>>

    @POST("mini-audit/approvals/{id}/approve")
    suspend fun approve(@Path("id") id: String, @Header("Idempotency-Key") key: String): Response<Envelope<Map<String, kotlinx.serialization.json.JsonElement>>>

    @POST("mini-audit/approvals/{id}/reject")
    suspend fun reject(@Path("id") id: String): Response<Envelope<Map<String, kotlinx.serialization.json.JsonElement>>>

    @POST("mini-audit/approvals/{id}/postpone")
    suspend fun postpone(@Path("id") id: String): Response<Envelope<Map<String, kotlinx.serialization.json.JsonElement>>>

    @GET("mini-audit/followups")
    suspend fun followups(): Response<Envelope<ItemsWrap>>

    @GET("mini-audit/followups/{id}/preview")
    suspend fun followupPreview(@Path("id") id: String): Response<Envelope<FollowupPreview>>

    @GET("mini-audit/send-uncertain")
    suspend fun sendUncertain(): Response<Envelope<ItemsWrap>>

    @POST("mini-audit/send-uncertain/{id}/check-proof")
    suspend fun checkProof(@Path("id") id: String): Response<Envelope<Map<String, kotlinx.serialization.json.JsonElement>>>

    // ---- system ----
    @GET("system/status")
    suspend fun systemStatus(): Response<Envelope<SystemStatus>>

    // ---- server-connected funnel / email hub ----
    @GET("server-funnel/status")
    suspend fun serverFunnelStatus(): Response<Envelope<ServerFunnelStatus>>

    @POST("server-funnel/refresh-imap-readonly")
    suspend fun serverFunnelRefreshImapReadonly(
        @Body body: ServerFunnelEmptyBody = ServerFunnelEmptyBody(),
    ): Response<Envelope<kotlinx.serialization.json.JsonElement>>

    @POST("server-funnel/apply-snapshot")
    suspend fun serverFunnelApplySnapshot(
        @Body body: ServerFunnelEmptyBody = ServerFunnelEmptyBody(),
    ): Response<Envelope<kotlinx.serialization.json.JsonElement>>

    @GET("server-funnel/mail")
    suspend fun serverFunnelMail(): Response<Envelope<ServerFunnelMailData>>

    @GET("server-funnel/mail/{emailId}")
    suspend fun serverFunnelEmail(@Path("emailId") emailId: String): Response<Envelope<ServerFunnelEmailDetailData>>

    @POST("server-funnel/mail/{emailId}/reply-draft")
    suspend fun serverFunnelReplyDraft(
        @Path("emailId") emailId: String,
        @Body body: ServerFunnelEmptyBody = ServerFunnelEmptyBody(),
    ): Response<Envelope<ServerFunnelReplyDraft>>

    @POST("server-funnel/mail/{emailId}/approval-card")
    suspend fun serverFunnelApprovalCard(
        @Path("emailId") emailId: String,
        @Body body: ServerFunnelApprovalRequest,
    ): Response<Envelope<ServerFunnelApprovalCardResponse>>

    @GET("commercial/autonomy/status")
    suspend fun commercialAutonomyStatus(): Response<Envelope<CommercialAutonomyStatus>>

    @POST("commercial/autonomy/start-leadgen")
    suspend fun commercialAutonomyStartLeadgen(
        @Body body: CommercialAutonomyStartBody = CommercialAutonomyStartBody(),
    ): Response<Envelope<CommercialAutonomyStartResult>>

    @GET("commercial/outreach/queue")
    suspend fun outreachQueue(
        @Query("limit") limit: Int = 25,
        @Query("includeBlocked") includeBlocked: Boolean = true,
    ): Response<Envelope<OutreachQueueData>>

    @GET("commercial/outreach/leads/{leadId}")
    suspend fun outreachLead(@Path("leadId") leadId: String): Response<Envelope<OutreachLeadDetail>>

    @POST("commercial/outreach/leads/{leadId}/draft")
    suspend fun outreachSaveDraft(
        @Path("leadId") leadId: String,
        @Header("Idempotency-Key") key: String,
        @Body body: OutreachDraftBody,
    ): Response<Envelope<OutreachLeadDetail>>

    @POST("commercial/outreach/leads/{leadId}/send")
    suspend fun outreachSend(
        @Path("leadId") leadId: String,
        @Header("Idempotency-Key") key: String,
        @Body body: OutreachSendBody,
    ): Response<Envelope<OutreachSendResult>>

    @POST("commercial/outreach/leads/{leadId}/skip")
    suspend fun outreachSkip(
        @Path("leadId") leadId: String,
        @Header("Idempotency-Key") key: String,
        @Body body: OutreachDecisionBody,
    ): Response<Envelope<OutreachDecisionResult>>

    @POST("commercial/outreach/leads/{leadId}/postpone")
    suspend fun outreachPostpone(
        @Path("leadId") leadId: String,
        @Header("Idempotency-Key") key: String,
        @Body body: OutreachDecisionBody,
    ): Response<Envelope<OutreachDecisionResult>>

    @POST("commercial/outreach/leads/{leadId}/reject")
    suspend fun outreachReject(
        @Path("leadId") leadId: String,
        @Header("Idempotency-Key") key: String,
        @Body body: OutreachDecisionBody,
    ): Response<Envelope<OutreachDecisionResult>>

    // ---- replies (read-only inbound) ----
    @GET("replies")
    suspend fun replies(
        @retrofit2.http.Query("category") category: String? = null,
        @retrofit2.http.Query("status") status: String? = null,
    ): Response<Envelope<RepliesData>>

    @GET("replies/open")
    suspend fun openReplies(): Response<Envelope<RepliesData>>

    @GET("replies/counts")
    suspend fun replyCounts(): Response<Envelope<ReplyCounts>>

    @GET("replies/{id}")
    suspend fun reply(@Path("id") id: String): Response<Envelope<ReplyItem>>

    // ---- automation + pipeline (v0.4.0) ----
    @GET("automation/status")
    suspend fun automationStatus2(): Response<Envelope<AutomationStatusDto>>

    @GET("pipeline/counts")
    suspend fun pipelineCounts(): Response<Envelope<kotlinx.serialization.json.JsonElement>>

    @GET("pipeline/by-status/{status}")
    suspend fun pipelineByStatus(@Path("status") status: String): Response<Envelope<PipelineLeadsData>>

    // ---- jobs / queue / dead letters (owner) ----
    @GET("jobs")
    suspend fun jobs(
        @Query("status") status: String? = null,
        @Query("type") type: String? = null,
    ): Response<Envelope<JobsData>>

    @GET("jobs/counts")
    suspend fun jobsCounts(): Response<Envelope<kotlinx.serialization.json.JsonElement>>

    @GET("jobs/{id}")
    suspend fun job(@Path("id") id: String): Response<Envelope<JobSummary>>

    // Retry a dead-lettered job by re-enqueuing it (idempotent; backend-confirmed).
    @POST("jobs/enqueue")
    suspend fun enqueueJob(
        @Header("Idempotency-Key") key: String,
        @Body body: EnqueueJobBody,
    ): Response<Envelope<kotlinx.serialization.json.JsonElement>>

    // Owner-initiated retry of a dead-lettered/failed job (owner token; re-enqueues idempotently).
    @POST("jobs/{id}/retry")
    suspend fun retryJob(
        @Path("id") id: String,
        @Header("Idempotency-Key") key: String,
    ): Response<Envelope<kotlinx.serialization.json.JsonElement>>

    // ---- lead status mutation (no-send; owner) ----
    @POST("mini-audit/leads/{id}/status")
    suspend fun setLeadStatus(
        @Path("id") id: String,
        @Header("Idempotency-Key") key: String,
        @Body body: LeadStatusBody,
    ): Response<Envelope<kotlinx.serialization.json.JsonElement>>

    // ---- followup prepare / postpone (no-send; owner) ----
    @POST("mini-audit/followups/{id}/postpone")
    suspend fun postponeFollowup(
        @Path("id") id: String,
        @Header("Idempotency-Key") key: String,
    ): Response<Envelope<kotlinx.serialization.json.JsonElement>>

    // ---- Integration Wave 1: commercial read-only (feature-gated off in prod until deploy) ----
    @GET("commercial/summary")
    suspend fun commercialSummary(): Response<Envelope<ru.dmitry.matercontroller.core.model.CommercialSummary>>

    @GET("finance/summary")
    suspend fun financeSummary(): Response<Envelope<ru.dmitry.matercontroller.core.model.FinanceSummaryDto>>

    @GET("commercial/integration-status")
    suspend fun commercialIntegrationStatus(): Response<Envelope<ru.dmitry.matercontroller.core.model.CommercialIntegrationStatus>>

    // ---- Gate C1-A: product catalog (read-only) ----
    @GET("products")
    suspend fun products(): Response<Envelope<ru.dmitry.matercontroller.core.model.ProductCatalog>>

    @GET("products/{id}")
    suspend fun product(@Path("id") id: String): Response<Envelope<ru.dmitry.matercontroller.core.model.ProductDetail>>

    // ---- Gate C1-A: reconciliation read models ----
    @GET("mini-audit/lead-count-definitions")
    suspend fun leadCountReconciliation(): Response<Envelope<ru.dmitry.matercontroller.core.model.LeadCountReconciliation>>

    @GET("mini-audit/send-reconciliation")
    suspend fun sendReconciliation(): Response<Envelope<ru.dmitry.matercontroller.core.model.SendReconciliation>>

    @GET("commercial/technical-acceptance")
    suspend fun technicalAcceptance(): Response<Envelope<ru.dmitry.matercontroller.core.model.TechnicalAcceptance>>

    // ---- Gate C1-A: owner internal commands (no send). Each requires owner auth + Idempotency-Key. ----
    @POST("opportunities")
    suspend fun createOpportunity(
        @Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.CreateOpportunityBody,
    ): Response<Envelope<ru.dmitry.matercontroller.core.model.CommandResult>>

    @POST("opportunities/{id}/prepare-offer")
    suspend fun prepareOffer(
        @Path("id") id: String,
        @Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.ExpectedRevisionBody,
    ): Response<Envelope<ru.dmitry.matercontroller.core.model.CommandResult>>

    @POST("offers/{id}/decision")
    suspend fun recordOwnerDecision(
        @Path("id") id: String,
        @Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.DecisionBody,
    ): Response<Envelope<ru.dmitry.matercontroller.core.model.CommandResult>>

    // RC3: explicit offer-review decision entry point (status-only owner command; never sends).
    // Same backend route as recordOwnerDecision; named per the offer-review feature.
    @POST("offers/{id}/decision")
    suspend fun offerDecision(
        @Path("id") id: String,
        @Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.DecisionBody,
    ): Response<Envelope<ru.dmitry.matercontroller.core.model.CommandResult>>

    @POST("deals/{id}/delivery-handoff")
    suspend fun createHandoff(
        @Path("id") id: String,
        @Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.ExpectedRevisionBody,
    ): Response<Envelope<ru.dmitry.matercontroller.core.model.CommandResult>>

    @POST("delivery/handoffs/{id}/create-project")
    suspend fun createProject(
        @Path("id") id: String,
        @Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.ExpectedRevisionBody,
    ): Response<Envelope<ru.dmitry.matercontroller.core.model.CommandResult>>

    @POST("finance/invoices")
    suspend fun createInvoiceDraft(
        @Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.InvoiceDraftBody,
    ): Response<Envelope<ru.dmitry.matercontroller.core.model.CommandResult>>

    // ---- transport-readiness (RC3): read-only ----
    @GET("mini-audit/delivery-containment")
    suspend fun deliveryContainment(): Response<Envelope<ru.dmitry.matercontroller.core.model.DeliveryContainment>>

    // includeTest is an ACCEPTANCE-ONLY switch (same model as first-touch). The debug build sends
    // includeTest=BuildConfig.DEBUG; release sends false -> backend excludes test/internal dialogs.
    @GET("conversations")
    suspend fun conversations(@retrofit2.http.Query("includeTest") includeTest: Boolean = false): Response<Envelope<ru.dmitry.matercontroller.core.model.ConversationsList>>

    @GET("conversations/{id}/timeline")
    suspend fun conversationTimeline(@Path("id") id: String): Response<Envelope<ru.dmitry.matercontroller.core.model.ConversationTimeline>>

    @GET("conversations/{id}/presale-health")
    suspend fun presaleHealth(@Path("id") id: String): Response<Envelope<ru.dmitry.matercontroller.core.model.PresaleHealth>>

    // ---- RC4: agents + pipeline (read-only) ----
    @GET("agents/status")
    suspend fun agentStatus(): Response<Envelope<ru.dmitry.matercontroller.core.model.AgentStatus>>

    @GET("agents/shadow-wave")
    suspend fun agentShadowWave(): Response<Envelope<ru.dmitry.matercontroller.core.model.ShadowWaveResult>>

    @GET("owner-queues")
    suspend fun ownerQueues(): Response<Envelope<ru.dmitry.matercontroller.core.model.OwnerQueues>>

    // ---- 0.6.0-rc2: offer review (read-only; no send) ----
    @GET("offers")
    suspend fun offers(): Response<Envelope<ru.dmitry.matercontroller.core.model.OffersList>>

    @GET("offers/{id}")
    suspend fun offer(@retrofit2.http.Path("id") id: String): Response<Envelope<ru.dmitry.matercontroller.core.model.OfferDto>>

    @GET("executive-brief")
    suspend fun executiveBrief(): Response<Envelope<ru.dmitry.matercontroller.core.model.ExecutiveBrief>>

    // ---- 0.6.0: multichannel (read-only) ----
    @GET("sources")
    suspend fun sources(): Response<Envelope<ru.dmitry.matercontroller.core.model.SourcesList>>

    @GET("sources/health")
    suspend fun sourcesHealth(): Response<Envelope<ru.dmitry.matercontroller.core.model.SourceHealthList>>

    @GET("channels")
    suspend fun channels(): Response<Envelope<ru.dmitry.matercontroller.core.model.ChannelsList>>

    @GET("inbound")
    suspend fun inbound(): Response<Envelope<ru.dmitry.matercontroller.core.model.InboundList>>

    @GET("owner-queues/multichannel")
    suspend fun multichannelOwnerQueue(): Response<Envelope<ru.dmitry.matercontroller.core.model.MultichannelOwnerQueue>>

    // ---- 0.6.0-rc4: authoritative offer preview (read-only; no send) ----
    @GET("offers/{id}/preview")
    suspend fun offerPreview(@retrofit2.http.Path("id") id: String): Response<Envelope<ru.dmitry.matercontroller.core.model.OfferPreviewDto>>

    // ---- 0.6.0-rc4: AI cost usage (read-only) ----
    @GET("ai/usage")
    suspend fun aiUsage(): Response<Envelope<ru.dmitry.matercontroller.core.model.AiUsageDto>>

    @GET("ai/usage/cumulative")
    suspend fun aiUsageCumulative(): Response<Envelope<ru.dmitry.matercontroller.core.model.AiUsageCumulativeDto>>

    @GET("ai/providers")
    suspend fun aiProviders(): Response<Envelope<ru.dmitry.matercontroller.core.model.ProviderRegistryDto>>

    // ---- 0.6.0-rc4: extended agent provider health (read-only) ----
    @GET("agents/provider-health")
    suspend fun providerHealth(@Query("probe") probe: Boolean = true): Response<Envelope<ru.dmitry.matercontroller.core.model.ProviderHealthDto>>

    // ---- 0.6.0-rc4: knowledge radar (read-only) ----
    @GET("knowledge/status")
    suspend fun knowledgeStatus(): Response<Envelope<ru.dmitry.matercontroller.core.model.KnowledgeStatusDto>>

    @GET("knowledge/sources")
    suspend fun knowledgeSources(): Response<Envelope<ru.dmitry.matercontroller.core.model.KnowledgeSourceList>>

    @GET("knowledge/digest")
    suspend fun knowledgeDigest(@Query("window") window: String): Response<Envelope<ru.dmitry.matercontroller.core.model.KnowledgeDigestDto>>

    // ---- 0.6.0-rc9: First Touch Strategist (read-only; no-send) ----
    // includeTest is an ACCEPTANCE-ONLY switch. The debug build sends includeTest=BuildConfig.DEBUG so
    // the firsttouch candidate dialog can be exercised against a TEST_ONLY synthetic lead; release sends
    // false -> backend excludes test leads (COMMERCIAL_REAL_ONLY, identical to prior behavior).
    @GET("first-touch/summary")
    suspend fun firstTouchSummary(@retrofit2.http.Query("includeTest") includeTest: Boolean = false): Response<Envelope<ru.dmitry.matercontroller.core.model.FirstTouchSummaryDto>>

    @GET("first-touch/candidates")
    suspend fun firstTouchCandidates(@retrofit2.http.Query("includeTest") includeTest: Boolean = false): Response<Envelope<ru.dmitry.matercontroller.core.model.FirstTouchCandidatesDto>>

    @GET("first-touch/candidates/{leadId}")
    suspend fun firstTouchCandidate(@retrofit2.http.Path("leadId") leadId: String): Response<Envelope<ru.dmitry.matercontroller.core.model.FirstTouchArtifactDto>>

    @GET("first-touch/pilot-readiness")
    suspend fun firstTouchPilotReadiness(): Response<Envelope<ru.dmitry.matercontroller.core.model.FirstTouchPilotReadinessDto>>

    // ---- Controlled Live Commercial Machine V1 contracts. Declarations only; callers still need gates. ----
    @POST("commercial/leads/import")
    suspend fun controlledLeadsImport(
        @Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.ControlledLeadImportBody,
    ): Response<Envelope<ru.dmitry.matercontroller.core.model.ControlledLeadImportResult>>

    @GET("commercial/leads")
    suspend fun controlledLeads(): Response<Envelope<LeadsData>>

    @GET("commercial/leads/{id}")
    suspend fun controlledLead(@Path("id") id: String): Response<Envelope<Lead>>

    @POST("commercial/leads/{id}/verify")
    suspend fun controlledLeadVerify(
        @Path("id") id: String,
        @Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.LeadVerifyBody,
    ): Response<Envelope<CommandResult>>

    @POST("commercial/leads/{id}/draft")
    suspend fun controlledLeadDraft(
        @Path("id") id: String,
        @Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.DraftCreateBody,
    ): Response<Envelope<CommandResult>>

    @POST("commercial/leads/{id}/qa")
    suspend fun controlledLeadQa(
        @Path("id") id: String,
        @Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.QaRunBody,
    ): Response<Envelope<CommandResult>>

    @POST("commercial/send-packets")
    suspend fun controlledSendPacket(
        @Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.ControlledSendPacketBody,
    ): Response<Envelope<CommandResult>>

    @POST("commercial/approvals/send")
    suspend fun controlledSendApproval(
        @Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.ControlledSendApprovalBody,
    ): Response<Envelope<CommandResult>>

    @POST("commercial/transport/send-approved")
    suspend fun controlledTransportSendApproved(
        @Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.TransportSendApprovedBody,
    ): Response<Envelope<ru.dmitry.matercontroller.core.model.ControlledTransportResultDto>>

    @GET("commercial/replies")
    suspend fun controlledReplies(): Response<Envelope<RepliesData>>

    @POST("commercial/replies/{id}/classify")
    suspend fun controlledReplyClassify(
        @Path("id") id: String,
        @Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.ReplyClassifyBody,
    ): Response<Envelope<CommandResult>>

    @POST("commercial/crm/write-approved")
    suspend fun controlledCrmWriteApproved(
        @Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.CrmWriteApprovedBody,
    ): Response<Envelope<CommandResult>>

    @POST("commercial/opportunities")
    suspend fun controlledOpportunityCreate(
        @Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.OpportunityCreateBody,
    ): Response<Envelope<CommandResult>>

    @POST("commercial/invoices/draft")
    suspend fun controlledInvoiceDraft(
        @Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.ControlledInvoiceDraftBody,
    ): Response<Envelope<CommandResult>>

    @POST("commercial/payments/approval")
    suspend fun controlledPaymentApproval(
        @Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.PaymentApprovalBody,
    ): Response<Envelope<CommandResult>>

    @GET("commercial/audit/events")
    suspend fun controlledAuditEvents(): Response<Envelope<ru.dmitry.matercontroller.core.model.AuditEventsDto>>

    @POST("commercial/stop")
    suspend fun controlledStop(
        @Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.StopBody,
    ): Response<Envelope<CommandResult>>

    // ---- 0.6.0-rc10: First Touch owner commands (no-send). Owner auth + Idempotency-Key + expectedRevision. ----
    @GET("store/revision")
    suspend fun storeRevision(): Response<Envelope<ru.dmitry.matercontroller.core.model.StoreRevisionDto>>

    @POST("first-touch/generate-draft")
    suspend fun firstTouchGenerateDraft(
        @retrofit2.http.Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.FirstTouchGenerateBody,
    ): Response<Envelope<ru.dmitry.matercontroller.core.model.FirstTouchCommandResult>>

    @POST("first-touch/select-subject")
    suspend fun firstTouchSelectSubject(
        @retrofit2.http.Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.FirstTouchDraftBody,
    ): Response<Envelope<ru.dmitry.matercontroller.core.model.FirstTouchCommandResult>>

    @POST("first-touch/select-body")
    suspend fun firstTouchSelectBody(
        @retrofit2.http.Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.FirstTouchDraftBody,
    ): Response<Envelope<ru.dmitry.matercontroller.core.model.FirstTouchCommandResult>>

    @POST("first-touch/request-changes")
    suspend fun firstTouchRequestChanges(
        @retrofit2.http.Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.FirstTouchDraftBody,
    ): Response<Envelope<ru.dmitry.matercontroller.core.model.FirstTouchCommandResult>>

    @POST("first-touch/approve-text-only")
    suspend fun firstTouchApproveTextOnly(
        @retrofit2.http.Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.FirstTouchDraftBody,
    ): Response<Envelope<ru.dmitry.matercontroller.core.model.FirstTouchCommandResult>>

    @POST("first-touch/reject")
    suspend fun firstTouchReject(
        @retrofit2.http.Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.FirstTouchDraftBody,
    ): Response<Envelope<ru.dmitry.matercontroller.core.model.FirstTouchCommandResult>>

    @POST("first-touch/return-to-audit")
    suspend fun firstTouchReturnToAudit(
        @retrofit2.http.Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.FirstTouchDraftBody,
    ): Response<Envelope<ru.dmitry.matercontroller.core.model.FirstTouchCommandResult>>

    @POST("first-touch/select-pilot")
    suspend fun firstTouchSelectPilot(
        @retrofit2.http.Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.FirstTouchPilotBody,
    ): Response<Envelope<ru.dmitry.matercontroller.core.model.FirstTouchCommandResult>>

    // ---- 0.6.0-rc5: product presentation (Russian owner-facing; read-only) ----
    @GET("products/{code}/presentation")
    suspend fun productPresentation(@Path("code") code: String): Response<Envelope<ru.dmitry.matercontroller.core.model.ProductPresentationDto>>

    @GET("products/presentation")
    suspend fun productsPresentation(): Response<Envelope<ru.dmitry.matercontroller.core.model.ProductPresentationList>>

    // ---- 0.6.0-rc5: AI usage provenance / reconciliation (read-only) ----
    @GET("ai/usage/reconciliation")
    suspend fun aiUsageReconciliation(): Response<Envelope<ru.dmitry.matercontroller.core.model.AiUsageReconciliationDto>>

    // ---- 0.6.0-rc5: authoritative source telemetry (read-only) ----
    @GET("sources/telemetry")
    suspend fun sourcesTelemetry(): Response<Envelope<ru.dmitry.matercontroller.core.model.SourceTelemetryList>>

    // ---- 0.6.0-rc5: owner automation/limits settings (read + audit + command) ----
    @GET("owner/settings")
    suspend fun ownerSettings(): Response<Envelope<ru.dmitry.matercontroller.core.model.OwnerSettingsDto>>

    @GET("owner/settings/audit")
    suspend fun ownerSettingsAudit(): Response<Envelope<ru.dmitry.matercontroller.core.model.OwnerSettingsAuditDto>>

    // Owner settings write (no send). Idempotency-Key + expectedRevision guarded. Never cached.
    @POST("owner/settings")
    suspend fun updateOwnerSettings(
        @Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.OwnerSettingsUpdateBody,
    ): Response<Envelope<ru.dmitry.matercontroller.core.model.OwnerSettingsUpdateResult>>

    // ---- 0.6.0-rc5: domain reservoir + pipeline funnel (read-only) ----
    @GET("reservoir/summary")
    suspend fun reservoirSummary(): Response<Envelope<ru.dmitry.matercontroller.core.model.ReservoirSummaryDto>>

    @GET("reservoir/funnel")
    suspend fun reservoirFunnel(): Response<Envelope<ru.dmitry.matercontroller.core.model.ReservoirFunnelDto>>

    // ---- 0.6.0-rc6: reconciliation, lead artifacts, radar status, reservoir counters/domains, common-crawl probe ----
    @GET("commercial/reconciliation")
    suspend fun commercialReconciliation(): Response<Envelope<ru.dmitry.matercontroller.core.model.ReconciliationDto>>

    @GET("leads/{id}/artifacts")
    suspend fun leadArtifacts(@Path("id") id: String): Response<Envelope<ru.dmitry.matercontroller.core.model.LeadArtifactsDto>>

    @GET("leads/{id}/audit")
    suspend fun leadAudit(@Path("id") id: String): Response<Envelope<ru.dmitry.matercontroller.core.model.AuditDto>>

    @GET("knowledge/radar-status")
    suspend fun radarStatus(): Response<Envelope<ru.dmitry.matercontroller.core.model.RadarStatusDto>>

    @GET("reservoir/counters")
    suspend fun reservoirCounters(): Response<Envelope<ru.dmitry.matercontroller.core.model.ReservoirCountersDto>>

    @GET("reservoir/domains")
    suspend fun reservoirDomains(): Response<Envelope<ru.dmitry.matercontroller.core.model.ReservoirDomainList>>

    @GET("reservoir/domains/{id}")
    suspend fun reservoirDomain(@Path("id") id: String): Response<Envelope<ru.dmitry.matercontroller.core.model.ReservoirDomainDetailDto>>

    @GET("reservoir/common-crawl/probe")
    suspend fun commonCrawlProbe(): Response<Envelope<ru.dmitry.matercontroller.core.model.CommonCrawlProbeDto>>

    // ---- 0.7.0-rc1: Campaign Governor (read-only in app; no-send posture) ----
    @GET("campaigns")
    suspend fun campaigns(@Query("includeTest") includeTest: Boolean = false): Response<Envelope<ru.dmitry.matercontroller.core.model.CampaignsData>>

    @GET("campaigns/{id}")
    suspend fun campaign(@Path("id") id: String): Response<Envelope<ru.dmitry.matercontroller.core.model.CampaignSummary>>

    // ---- 0.8.0-rc1: Owner Command & Autonomy Center (read-only in app; never sends) ----
    @GET("next-actions")
    suspend fun ownerSnapshot(@Query("includeTest") includeTest: Boolean = false): Response<Envelope<ru.dmitry.matercontroller.core.model.OwnerSnapshot>>

    @GET("command-brief")
    suspend fun commandBrief(): Response<Envelope<ru.dmitry.matercontroller.core.model.CommandBrief>>

    @GET("events")
    suspend fun ownerEvents(@Query("includeTest") includeTest: Boolean = false): Response<Envelope<ru.dmitry.matercontroller.core.model.OwnerEventsData>>

    @GET("notifications")
    suspend fun ownerNotifications(@Query("includeTest") includeTest: Boolean = false): Response<Envelope<ru.dmitry.matercontroller.core.model.OwnerNotificationsData>>

    @GET("notifications/unread-count")
    suspend fun ownerUnreadCount(@Query("includeTest") includeTest: Boolean = false): Response<Envelope<ru.dmitry.matercontroller.core.model.UnreadCount>>

    @GET("owner-decisions")
    suspend fun ownerDecisions(@Query("includeTest") includeTest: Boolean = false): Response<Envelope<ru.dmitry.matercontroller.core.model.OwnerDecisionsData>>

    @GET("incidents")
    suspend fun ownerIncidents(@Query("includeTest") includeTest: Boolean = false): Response<Envelope<ru.dmitry.matercontroller.core.model.IncidentsData>>

    @GET("incidents/summary")
    suspend fun ownerIncidentsSummary(@Query("includeTest") includeTest: Boolean = false): Response<Envelope<ru.dmitry.matercontroller.core.model.IncidentsSummary>>

    @GET("autopilot")
    suspend fun ownerAutopilot(): Response<Envelope<ru.dmitry.matercontroller.core.model.AutopilotDto>>

    @GET("agents/status")
    suspend fun ownerAgents(): Response<Envelope<ru.dmitry.matercontroller.core.model.AgentsStatus>>

    // ---- 0.8.0: Reliability Center (read-only; never sends) ----
    @GET("reliability")
    suspend fun reliability(): Response<Envelope<ru.dmitry.matercontroller.core.model.ReliabilityOverview>>

    // ---- 0.8.0: Cost & Capacity Center (read-only; never spends) ----
    @GET("costs")
    suspend fun costs(): Response<Envelope<ru.dmitry.matercontroller.core.model.CostOverview>>

    // ---- 0.8.0-rc3: Owner Command & Autonomy write paths (owner-auth; TEST_ONLY-safe; no send) ----
    @POST("autopilot/mode")
    suspend fun setAutopilotMode(
        @Header("Idempotency-Key") key: String,
        @Body body: AutopilotModeBody,
    ): Response<Envelope<kotlinx.serialization.json.JsonElement>>

    @POST("notifications/{id}/read")
    suspend fun markNotificationRead(
        @Path("id") id: String,
        @Header("Idempotency-Key") key: String,
        @Body body: NotificationReadBody,
    ): Response<Envelope<kotlinx.serialization.json.JsonElement>>

    @POST("incidents/{id}/acknowledge")
    suspend fun acknowledgeIncident(
        @Path("id") id: String,
        @Header("Idempotency-Key") key: String,
    ): Response<Envelope<kotlinx.serialization.json.JsonElement>>

    // ---- 0.8.0: Backup & Recovery Center (read-only; non-destructive drill) ----
    @GET("backups/status")
    suspend fun backupStatus(): Response<Envelope<ru.dmitry.matercontroller.core.model.BackupStatus>>

    @GET("backups/restore-drill")
    suspend fun restoreDrill(): Response<Envelope<ru.dmitry.matercontroller.core.model.RestoreDrillAll>>

    // ---- 0.8.0: FCM Push (owner operational push; DISABLED by default; never client outbound) ----
    @GET("push/status")
    suspend fun pushStatus(): Response<Envelope<ru.dmitry.matercontroller.core.model.PushStatus>>

    @GET("push/preferences")
    suspend fun pushPreferences(): Response<Envelope<ru.dmitry.matercontroller.core.model.PushPreferencesData>>

    @POST("push/register")
    suspend fun pushRegister(
        @Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.PushRegisterBody,
    ): Response<Envelope<kotlinx.serialization.json.JsonElement>>

    @POST("push/unregister")
    suspend fun pushUnregister(
        @Header("Idempotency-Key") key: String,
        @Body body: kotlinx.serialization.json.JsonElement,
    ): Response<Envelope<kotlinx.serialization.json.JsonElement>>

    @POST("push/preferences")
    suspend fun pushSetPreferences(
        @Header("Idempotency-Key") key: String,
        @Body body: ru.dmitry.matercontroller.core.model.PushPrefsBody,
    ): Response<Envelope<kotlinx.serialization.json.JsonElement>>
}
