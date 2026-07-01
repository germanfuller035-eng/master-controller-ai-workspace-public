package ru.dmitry.matercontroller.core.data

import android.util.Log
import kotlinx.coroutines.flow.first
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import ru.dmitry.matercontroller.core.database.CacheDao
import ru.dmitry.matercontroller.core.database.CacheEntity
import ru.dmitry.matercontroller.core.database.DomainDao
import ru.dmitry.matercontroller.core.database.DomainEntity
import ru.dmitry.matercontroller.core.database.LeadDao
import ru.dmitry.matercontroller.core.database.LeadEntity
import ru.dmitry.matercontroller.core.model.*
import ru.dmitry.matercontroller.core.network.*
import java.net.SocketTimeoutException
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Single source of data for the UI. Wraps the API and the Room read-cache.
 * Network truth always wins; the Room cache is a read-only offline fallback for
 * lead lists. Destructive actions (send/approve) are NEVER served from cache and
 * fail when offline.
 */
@Singleton
class MaterRepository @Inject constructor(
    private val apiProvider: ApiProvider,
    private val tokens: SecureTokenStore,
    private val baseUrlHolder: BaseUrlHolder,
    private val settings: SettingsStore,
    private val leadDao: LeadDao,
    private val cacheDao: CacheDao,
    private val domainDao: DomainDao,
    private val json: Json,
) {
    val isPaired: Boolean get() = tokens.isPaired
    val deviceId: String? get() = tokens.deviceId
    val deviceName: String? get() = tokens.deviceName

    fun setBaseUrl(url: String) { baseUrlHolder.url = url }
    val currentBaseUrl: String get() = baseUrlHolder.url

    /**
     * Cold-start profile restore. Loads the persisted base URL into the in-memory
     * holder BEFORE any API client is built. Returns true if a usable profile
     * (paired + non-empty base URL) was restored. Must be awaited at app start so
     * requests never fire against an unconfigured/localhost holder.
     */
    suspend fun restoreProfile(): Boolean {
        val saved = runCatching { settings.baseUrl.first() }.getOrNull().orEmpty()
        if (saved.isNotBlank()) baseUrlHolder.url = saved
        return tokens.isPaired && baseUrlHolder.isConfigured
    }

    // ---------- connection / pairing ----------
    suspend fun checkHealth(url: String): DataResult<HealthData> = try {
        val resp = bareApi(normalize(url)).health()
        Log.i("MaterRepository", "Health check response: code=${resp.code()} success=${resp.isSuccessful} ok=${resp.body()?.ok}")
        unwrap(resp)
    } catch (e: Exception) {
        Log.w("MaterRepository", "Health check failed: ${e.javaClass.simpleName}: ${e.message}")
        DataResult.Error(if (e is SocketTimeoutException) ErrorCodes.TIMEOUT else ErrorCodes.NETWORK, e.message ?: "network error")
    }

    suspend fun checkAuthorized(): DataResult<SystemStatus> = read { apiProvider.api().systemStatus() }

    suspend fun pair(url: String, code: String, deviceName: String): DataResult<PairingCompleteData> = try {
        val origin = ru.dmitry.matercontroller.core.network.BaseUrlHolder.normalizeOrigin(url)
        val full = origin + "api/v1/"
        val resp = bareApi(full).pairingComplete(PairingCompleteBody(code = code.trim(), deviceName = deviceName))
        val r = unwrap(resp)
        if (r is DataResult.Success) {
            // Persist atomically-as-possible: token (encrypted) + base URL, THEN flip the
            // live holder. On cold start restoreProfile() reloads the same base URL.
            tokens.saveTokens(r.data.accessToken, r.data.refreshToken, r.data.deviceId, deviceName.trim())
            settings.setBaseUrl(origin)
            baseUrlHolder.url = origin
        }
        r
    } catch (e: Exception) {
        Log.w("MaterRepository", "Pairing failed: ${e.javaClass.simpleName}: ${e.message}")
        DataResult.Error(if (e is SocketTimeoutException) ErrorCodes.TIMEOUT else ErrorCodes.NETWORK, e.message ?: "network error")
    }

    fun unpair() { tokens.clear() }

    // ---------- mini-audit reads ----------
    suspend fun status(): DataResult<MiniAuditStatus> = readCached("mini_audit_status", MiniAuditStatus.serializer()) { apiProvider.api().miniAuditStatus() }
    suspend fun nextAction(): DataResult<NextActionData> = readCached("next_action", NextActionData.serializer()) { apiProvider.api().nextAction() }
    suspend fun systemStatus(): DataResult<SystemStatus> = readCached("system_status", SystemStatus.serializer()) { apiProvider.api().systemStatus() }
    suspend fun serverFunnelStatus(): DataResult<ServerFunnelStatus> =
        readCached("server_funnel_status", ServerFunnelStatus.serializer()) { apiProvider.api().serverFunnelStatus() }
    suspend fun serverFunnelMail(): DataResult<ServerFunnelMailData> =
        readCached("server_funnel_mail", ServerFunnelMailData.serializer()) { apiProvider.api().serverFunnelMail() }
    suspend fun serverFunnelEmail(emailId: String): DataResult<ServerFunnelEmailDetailData> =
        read { apiProvider.api().serverFunnelEmail(emailId) }
    suspend fun serverFunnelReplyDraft(emailId: String): DataResult<ServerFunnelReplyDraft> =
        command { apiProvider.api().serverFunnelReplyDraft(emailId) }
    suspend fun serverFunnelApprovalCard(emailId: String, body: ServerFunnelApprovalRequest): DataResult<ServerFunnelApprovalCardResponse> =
        command { apiProvider.api().serverFunnelApprovalCard(emailId, body) }
    suspend fun serverFunnelRefreshImapReadonly(): DataResult<kotlinx.serialization.json.JsonElement> =
        command { apiProvider.api().serverFunnelRefreshImapReadonly() }
    suspend fun serverFunnelApplySnapshot(): DataResult<kotlinx.serialization.json.JsonElement> =
        command { apiProvider.api().serverFunnelApplySnapshot() }
    suspend fun commercialAutonomyStatus(): DataResult<CommercialAutonomyStatus> =
        readCached("commercial_autonomy_status", CommercialAutonomyStatus.serializer()) { apiProvider.api().commercialAutonomyStatus() }
    suspend fun commercialAutonomyStartLeadgen(body: CommercialAutonomyStartBody = CommercialAutonomyStartBody()): DataResult<CommercialAutonomyStartResult> =
        command { apiProvider.api().commercialAutonomyStartLeadgen(body) }
    suspend fun outreachQueue(limit: Int = 25): DataResult<OutreachQueueData> =
        readCached("commercial_outreach_queue", OutreachQueueData.serializer()) { apiProvider.api().outreachQueue(limit = limit, includeBlocked = true) }
    suspend fun outreachLead(leadId: String): DataResult<OutreachLeadDetail> =
        read { apiProvider.api().outreachLead(leadId) }
    suspend fun outreachSaveDraft(leadId: String, subject: String, body: String): DataResult<OutreachLeadDetail> =
        command { apiProvider.api().outreachSaveDraft(leadId, "android-outreach-draft-" + UUID.randomUUID(), OutreachDraftBody(subject = subject, body = body)) }
    suspend fun outreachSend(leadId: String, recipient: String, subject: String, body: String): DataResult<OutreachSendResult> =
        command {
            apiProvider.api().outreachSend(
                leadId,
                "android-outreach-send-" + UUID.randomUUID(),
                OutreachSendBody(
                    exactRecipient = recipient,
                    exactSubject = subject,
                    exactBody = body,
                    ownerConfirmation = true,
                    provider = "live",
                ),
            )
        }
    suspend fun outreachSkip(leadId: String, reason: String = ""): DataResult<OutreachDecisionResult> =
        command { apiProvider.api().outreachSkip(leadId, "android-outreach-skip-" + UUID.randomUUID(), OutreachDecisionBody(reason = reason)) }
    suspend fun outreachPostpone(leadId: String, reason: String = ""): DataResult<OutreachDecisionResult> =
        command { apiProvider.api().outreachPostpone(leadId, "android-outreach-postpone-" + UUID.randomUUID(), OutreachDecisionBody(reason = reason)) }
    suspend fun outreachReject(leadId: String, reason: String = ""): DataResult<OutreachDecisionResult> =
        command { apiProvider.api().outreachReject(leadId, "android-outreach-reject-" + UUID.randomUUID(), OutreachDecisionBody(reason = reason)) }
    suspend fun projects(): DataResult<ProjectsData> = read { apiProvider.api().projects() }
    suspend fun lead(id: String): DataResult<Lead> = read { apiProvider.api().lead(id) }
    suspend fun audit(id: String): DataResult<AuditData> = read { apiProvider.api().audit(id) }
    suspend fun emailPreview(id: String): DataResult<EmailPreviewData> = read { apiProvider.api().emailPreview(id) }
    suspend fun followups(): DataResult<ItemsWrap> = read { apiProvider.api().followups() }
    suspend fun sendUncertain(): DataResult<ItemsWrap> = read { apiProvider.api().sendUncertain() }
    suspend fun followupPreview(id: String): DataResult<FollowupPreview> = read { apiProvider.api().followupPreview(id) }

    // ---------- automation + pipeline (v0.4.0; read-only) ----------
    suspend fun automationStatus2(): DataResult<AutomationStatusDto> = readCached("automation_status", AutomationStatusDto.serializer()) { apiProvider.api().automationStatus2() }

    // ---------- Integration Wave 1: commercial read-only (read-through cache; no mutation) ----------
    suspend fun commercialSummary(): DataResult<ru.dmitry.matercontroller.core.model.CommercialSummary> =
        readCached("commercial_summary", ru.dmitry.matercontroller.core.model.CommercialSummary.serializer()) { apiProvider.api().commercialSummary() }
    suspend fun financeSummary(): DataResult<ru.dmitry.matercontroller.core.model.FinanceSummaryDto> =
        readCached("finance_summary", ru.dmitry.matercontroller.core.model.FinanceSummaryDto.serializer()) { apiProvider.api().financeSummary() }
    suspend fun commercialIntegrationStatus(): DataResult<ru.dmitry.matercontroller.core.model.CommercialIntegrationStatus> =
        readCached("commercial_integration_status", ru.dmitry.matercontroller.core.model.CommercialIntegrationStatus.serializer()) { apiProvider.api().commercialIntegrationStatus() }

    // ---------- Gate C1-A: product catalog + reconciliation (read-through cache; no mutation) ----------
    suspend fun products(): DataResult<ru.dmitry.matercontroller.core.model.ProductCatalog> =
        readCached("products", ru.dmitry.matercontroller.core.model.ProductCatalog.serializer()) { apiProvider.api().products() }
    suspend fun product(id: String): DataResult<ru.dmitry.matercontroller.core.model.ProductDetail> =
        readCached("product:$id", ru.dmitry.matercontroller.core.model.ProductDetail.serializer()) { apiProvider.api().product(id) }
    suspend fun leadCountReconciliation(): DataResult<ru.dmitry.matercontroller.core.model.LeadCountReconciliation> =
        readCached("lead_count_recon", ru.dmitry.matercontroller.core.model.LeadCountReconciliation.serializer()) { apiProvider.api().leadCountReconciliation() }
    suspend fun sendReconciliation(): DataResult<ru.dmitry.matercontroller.core.model.SendReconciliation> =
        readCached("send_recon", ru.dmitry.matercontroller.core.model.SendReconciliation.serializer()) { apiProvider.api().sendReconciliation() }
    suspend fun technicalAcceptance(): DataResult<ru.dmitry.matercontroller.core.model.TechnicalAcceptance> =
        readCached("technical_acceptance", ru.dmitry.matercontroller.core.model.TechnicalAcceptance.serializer()) { apiProvider.api().technicalAcceptance() }

    // ---------- transport-readiness (RC3): read-through cache ----------
    suspend fun deliveryContainment(): DataResult<ru.dmitry.matercontroller.core.model.DeliveryContainment> =
        readCached("delivery_containment", ru.dmitry.matercontroller.core.model.DeliveryContainment.serializer()) { apiProvider.api().deliveryContainment() }
    suspend fun conversations(): DataResult<ru.dmitry.matercontroller.core.model.ConversationsList> =
        readCached("conversations", ru.dmitry.matercontroller.core.model.ConversationsList.serializer()) { apiProvider.api().conversations(ru.dmitry.matercontroller.BuildConfig.DEBUG) }
    suspend fun conversationTimeline(id: String): DataResult<ru.dmitry.matercontroller.core.model.ConversationTimeline> =
        readCached("conversation_timeline:$id", ru.dmitry.matercontroller.core.model.ConversationTimeline.serializer()) { apiProvider.api().conversationTimeline(id) }
    suspend fun presaleHealth(id: String): DataResult<ru.dmitry.matercontroller.core.model.PresaleHealth> =
        readCached("presale_health:$id", ru.dmitry.matercontroller.core.model.PresaleHealth.serializer()) { apiProvider.api().presaleHealth(id) }

    // ---------- RC4: agents + pipeline (read-through cache) ----------
    suspend fun agentStatus(): DataResult<ru.dmitry.matercontroller.core.model.AgentStatus> =
        readCached("agent_status", ru.dmitry.matercontroller.core.model.AgentStatus.serializer()) { apiProvider.api().agentStatus() }
    suspend fun agentShadowWave(): DataResult<ru.dmitry.matercontroller.core.model.ShadowWaveResult> =
        readCached("agent_shadow_wave", ru.dmitry.matercontroller.core.model.ShadowWaveResult.serializer()) { apiProvider.api().agentShadowWave() }
    suspend fun ownerQueues(): DataResult<ru.dmitry.matercontroller.core.model.OwnerQueues> =
        readCached("owner_queues", ru.dmitry.matercontroller.core.model.OwnerQueues.serializer()) { apiProvider.api().ownerQueues() }
    suspend fun executiveBrief(): DataResult<ru.dmitry.matercontroller.core.model.ExecutiveBrief> =
        readCached("executive_brief", ru.dmitry.matercontroller.core.model.ExecutiveBrief.serializer()) { apiProvider.api().executiveBrief() }

    // ---------- 0.6.0-rc2: offer review (read-through cache; no send) ----------
    suspend fun offers(): DataResult<ru.dmitry.matercontroller.core.model.OffersList> =
        readCached("offers", ru.dmitry.matercontroller.core.model.OffersList.serializer()) { apiProvider.api().offers() }
    suspend fun offer(id: String): DataResult<ru.dmitry.matercontroller.core.model.OfferDto> =
        readCached("offer:$id", ru.dmitry.matercontroller.core.model.OfferDto.serializer()) { apiProvider.api().offer(id) }

    // ---------- 0.6.0: multichannel (read-through cache) ----------
    suspend fun sources(): DataResult<ru.dmitry.matercontroller.core.model.SourcesList> =
        readCached("sources", ru.dmitry.matercontroller.core.model.SourcesList.serializer()) { apiProvider.api().sources() }
    suspend fun sourcesHealth(): DataResult<ru.dmitry.matercontroller.core.model.SourceHealthList> =
        readCached("sources_health", ru.dmitry.matercontroller.core.model.SourceHealthList.serializer()) { apiProvider.api().sourcesHealth() }
    suspend fun channels(): DataResult<ru.dmitry.matercontroller.core.model.ChannelsList> =
        readCached("channels", ru.dmitry.matercontroller.core.model.ChannelsList.serializer()) { apiProvider.api().channels() }
    suspend fun inbound(): DataResult<ru.dmitry.matercontroller.core.model.InboundList> =
        readCached("inbound", ru.dmitry.matercontroller.core.model.InboundList.serializer()) { apiProvider.api().inbound() }
    suspend fun multichannelOwnerQueue(): DataResult<ru.dmitry.matercontroller.core.model.MultichannelOwnerQueue> =
        readCached("mc_owner_queue", ru.dmitry.matercontroller.core.model.MultichannelOwnerQueue.serializer()) { apiProvider.api().multichannelOwnerQueue() }

    // ---------- 0.6.0-rc4: authoritative offer preview (read-through cache; no send) ----------
    suspend fun offerPreview(id: String): DataResult<ru.dmitry.matercontroller.core.model.OfferPreviewDto> =
        readCached("offer_preview:$id", ru.dmitry.matercontroller.core.model.OfferPreviewDto.serializer()) { apiProvider.api().offerPreview(id) }

    // ---------- 0.6.0-rc4: AI cost usage (read-through cache) ----------
    suspend fun aiUsage(): DataResult<ru.dmitry.matercontroller.core.model.AiUsageDto> =
        readCached("ai_usage", ru.dmitry.matercontroller.core.model.AiUsageDto.serializer()) { apiProvider.api().aiUsage() }
    suspend fun aiUsageCumulative(): DataResult<ru.dmitry.matercontroller.core.model.AiUsageCumulativeDto> =
        readCached("ai_usage_cumulative", ru.dmitry.matercontroller.core.model.AiUsageCumulativeDto.serializer()) { apiProvider.api().aiUsageCumulative() }
    suspend fun aiProviders(): DataResult<ru.dmitry.matercontroller.core.model.ProviderRegistryDto> =
        readCached("ai_providers", ru.dmitry.matercontroller.core.model.ProviderRegistryDto.serializer()) { apiProvider.api().aiProviders() }

    // ---------- 0.6.0-rc4: extended agent provider health (read-through cache) ----------
    suspend fun providerHealth(): DataResult<ru.dmitry.matercontroller.core.model.ProviderHealthDto> =
        readCached("provider_health", ru.dmitry.matercontroller.core.model.ProviderHealthDto.serializer()) { apiProvider.api().providerHealth(true) }

    // ---------- 0.6.0-rc4: knowledge radar (read-through cache) ----------
    suspend fun knowledgeStatus(): DataResult<ru.dmitry.matercontroller.core.model.KnowledgeStatusDto> =
        readCached("knowledge_status", ru.dmitry.matercontroller.core.model.KnowledgeStatusDto.serializer()) { apiProvider.api().knowledgeStatus() }
    suspend fun knowledgeSources(): DataResult<ru.dmitry.matercontroller.core.model.KnowledgeSourceList> =
        readCached("knowledge_sources", ru.dmitry.matercontroller.core.model.KnowledgeSourceList.serializer()) { apiProvider.api().knowledgeSources() }
    suspend fun knowledgeDigest(window: String): DataResult<ru.dmitry.matercontroller.core.model.KnowledgeDigestDto> =
        readCached("knowledge_digest:$window", ru.dmitry.matercontroller.core.model.KnowledgeDigestDto.serializer()) { apiProvider.api().knowledgeDigest(window) }

    // ---- 0.6.0-rc9: First Touch Strategist (read-only; no-send) ----
    suspend fun firstTouchSummary(): DataResult<ru.dmitry.matercontroller.core.model.FirstTouchSummaryDto> =
        readCached("first_touch_summary", ru.dmitry.matercontroller.core.model.FirstTouchSummaryDto.serializer()) { apiProvider.api().firstTouchSummary(ru.dmitry.matercontroller.BuildConfig.DEBUG) }
    suspend fun firstTouchCandidates(): DataResult<ru.dmitry.matercontroller.core.model.FirstTouchCandidatesDto> =
        readCached("first_touch_candidates", ru.dmitry.matercontroller.core.model.FirstTouchCandidatesDto.serializer()) { apiProvider.api().firstTouchCandidates(ru.dmitry.matercontroller.BuildConfig.DEBUG) }
    suspend fun firstTouchCandidate(leadId: String): DataResult<ru.dmitry.matercontroller.core.model.FirstTouchArtifactDto> =
        readCached("first_touch_candidate:$leadId", ru.dmitry.matercontroller.core.model.FirstTouchArtifactDto.serializer()) { apiProvider.api().firstTouchCandidate(leadId) }
    suspend fun firstTouchPilotReadiness(): DataResult<ru.dmitry.matercontroller.core.model.FirstTouchPilotReadinessDto> =
        readCached("first_touch_pilot_readiness", ru.dmitry.matercontroller.core.model.FirstTouchPilotReadinessDto.serializer()) { apiProvider.api().firstTouchPilotReadiness() }

    // ---- 0.6.0-rc10: First Touch owner commands (no-send). Never cached; fail offline. Each carries a
    // fresh UUID Idempotency-Key + expectedRevision; success only on 2xx + ok==true. 409 => CONFLICT. ----
    suspend fun storeRevision(): DataResult<ru.dmitry.matercontroller.core.model.StoreRevisionDto> =
        command { apiProvider.api().storeRevision() }
    suspend fun firstTouchGenerateDraft(leadId: String, expectedRevision: Int?) =
        command { apiProvider.api().firstTouchGenerateDraft("android-ftgen-" + UUID.randomUUID(), ru.dmitry.matercontroller.core.model.FirstTouchGenerateBody(leadId, expectedRevision)) }
    suspend fun firstTouchSelectSubject(draftId: String, subjectId: String, expectedRevision: Int?) =
        command { apiProvider.api().firstTouchSelectSubject("android-ftss-" + UUID.randomUUID(), ru.dmitry.matercontroller.core.model.FirstTouchDraftBody(draftId = draftId, subjectId = subjectId, expectedRevision = expectedRevision)) }
    suspend fun firstTouchSelectBody(draftId: String, bodyId: String, expectedRevision: Int?) =
        command { apiProvider.api().firstTouchSelectBody("android-ftsb-" + UUID.randomUUID(), ru.dmitry.matercontroller.core.model.FirstTouchDraftBody(draftId = draftId, bodyId = bodyId, expectedRevision = expectedRevision)) }
    suspend fun firstTouchRequestChanges(draftId: String, note: String, expectedRevision: Int?) =
        command { apiProvider.api().firstTouchRequestChanges("android-ftrc-" + UUID.randomUUID(), ru.dmitry.matercontroller.core.model.FirstTouchDraftBody(draftId = draftId, note = note, expectedRevision = expectedRevision)) }
    suspend fun firstTouchApproveTextOnly(draftId: String, expectedRevision: Int?) =
        command { apiProvider.api().firstTouchApproveTextOnly("android-ftat-" + UUID.randomUUID(), ru.dmitry.matercontroller.core.model.FirstTouchDraftBody(draftId = draftId, expectedRevision = expectedRevision)) }
    suspend fun firstTouchReject(draftId: String, reason: String, expectedRevision: Int?) =
        command { apiProvider.api().firstTouchReject("android-ftrj-" + UUID.randomUUID(), ru.dmitry.matercontroller.core.model.FirstTouchDraftBody(draftId = draftId, reason = reason, expectedRevision = expectedRevision)) }
    suspend fun firstTouchReturnToAudit(draftId: String, expectedRevision: Int?) =
        command { apiProvider.api().firstTouchReturnToAudit("android-ftra-" + UUID.randomUUID(), ru.dmitry.matercontroller.core.model.FirstTouchDraftBody(draftId = draftId, expectedRevision = expectedRevision)) }
    suspend fun firstTouchSelectPilot(leadId: String, expectedRevision: Int?) =
        command { apiProvider.api().firstTouchSelectPilot("android-ftsp-" + UUID.randomUUID(), ru.dmitry.matercontroller.core.model.FirstTouchPilotBody(leadId, expectedRevision)) }

    // ---------- 0.6.0-rc5: product presentation (Russian; read-through cache) ----------
    suspend fun productPresentation(code: String): DataResult<ru.dmitry.matercontroller.core.model.ProductPresentationDto> =
        readCached("product_presentation:$code", ru.dmitry.matercontroller.core.model.ProductPresentationDto.serializer()) { apiProvider.api().productPresentation(code) }
    suspend fun productsPresentation(): DataResult<ru.dmitry.matercontroller.core.model.ProductPresentationList> =
        readCached("products_presentation", ru.dmitry.matercontroller.core.model.ProductPresentationList.serializer()) { apiProvider.api().productsPresentation() }

    // ---------- 0.6.0-rc5: AI usage provenance / reconciliation (read-through cache) ----------
    suspend fun aiUsageReconciliation(): DataResult<ru.dmitry.matercontroller.core.model.AiUsageReconciliationDto> =
        readCached("ai_usage_reconciliation", ru.dmitry.matercontroller.core.model.AiUsageReconciliationDto.serializer()) { apiProvider.api().aiUsageReconciliation() }

    // ---------- 0.6.0-rc5: source telemetry (read-through cache) ----------
    suspend fun sourcesTelemetry(): DataResult<ru.dmitry.matercontroller.core.model.SourceTelemetryList> =
        readCached("sources_telemetry", ru.dmitry.matercontroller.core.model.SourceTelemetryList.serializer()) { apiProvider.api().sourcesTelemetry() }

    // ---------- 0.6.0-rc5: owner settings (read + audit; read-through cache) ----------
    suspend fun ownerSettings(): DataResult<ru.dmitry.matercontroller.core.model.OwnerSettingsDto> =
        readCached("owner_settings", ru.dmitry.matercontroller.core.model.OwnerSettingsDto.serializer()) { apiProvider.api().ownerSettings() }
    suspend fun ownerSettingsAudit(): DataResult<ru.dmitry.matercontroller.core.model.OwnerSettingsAuditDto> =
        readCached("owner_settings_audit", ru.dmitry.matercontroller.core.model.OwnerSettingsAuditDto.serializer()) { apiProvider.api().ownerSettingsAudit() }

    /**
     * Owner settings write (no send). NEVER cached; fails offline. expectedRevision + a fresh UUID
     * Idempotency-Key guard the write. Success is reported ONLY on HTTP 2xx + body.ok == true with a
     * confirmed result; the ViewModel re-reads GET /owner/settings before declaring success.
     * A 409 surfaces REVISION_CONFLICT with the canonical `actual` settings (never auto-retried);
     * a 422 surfaces SERVER with the validation errors[] payload so the UI can show hard-limit /
     * paid-confirmation messages. Body carries its own idempotencyKey so the server can dedupe.
     */
    suspend fun updateOwnerSettings(
        body: ru.dmitry.matercontroller.core.model.OwnerSettingsUpdateBody,
    ): DataResult<ru.dmitry.matercontroller.core.model.OwnerSettingsUpdateResult> = try {
        val key = body.idempotencyKey ?: ("android-owner-settings-" + UUID.randomUUID())
        val resp = apiProvider.api().updateOwnerSettings(key, body)
        val code = resp.code()
        val b = resp.body()
        when {
            resp.isSuccessful && b?.ok == true && b.data != null -> DataResult.Success(b.data)
            code == 409 -> {
                // Conflict: surface the canonical actual settings via the error data path. We still
                // return Error so the UI does NOT treat it as success; the actual settings are
                // re-fetched by the ViewModel via ownerSettings().
                DataResult.Error(ErrorCodes.REVISION_CONFLICT, b?.error?.message ?: "Данные изменились на сервере")
            }
            code == 422 -> {
                // Validation (hard limit / paid confirmation). Encode the errors so the VM can show them.
                val errs = b?.data?.errors ?: emptyList()
                val msg = if (errs.isNotEmpty()) errs.joinToString("; ") { it.message ?: it.code ?: "ошибка валидации" }
                else (b?.error?.message ?: "Проверьте значения")
                DataResult.Error("VALIDATION", msg)
            }
            code == 401 -> DataResult.Error(ErrorCodes.UNAUTHORIZED, "Требуется повторное подключение")
            else -> DataResult.Error(b?.error?.code ?: ErrorCodes.fromHttp(code), b?.error?.message ?: "Команда не подтверждена сервером")
        }
    } catch (e: Exception) { DataResult.Error(ErrorCodes.NETWORK, e.message ?: "network error") }

    // ---------- 0.6.0-rc5: domain reservoir + pipeline funnel (read-through cache) ----------
    suspend fun reservoirSummary(): DataResult<ru.dmitry.matercontroller.core.model.ReservoirSummaryDto> =
        readCached("reservoir_summary", ru.dmitry.matercontroller.core.model.ReservoirSummaryDto.serializer()) { apiProvider.api().reservoirSummary() }
    suspend fun reservoirFunnel(): DataResult<ru.dmitry.matercontroller.core.model.ReservoirFunnelDto> =
        readCached("reservoir_funnel", ru.dmitry.matercontroller.core.model.ReservoirFunnelDto.serializer()) { apiProvider.api().reservoirFunnel() }

    // ---------- 0.6.0-rc6: reconciliation / artifacts / radar-status / reservoir counters+domains / common-crawl ----------
    suspend fun commercialReconciliation(): DataResult<ru.dmitry.matercontroller.core.model.ReconciliationDto> =
        readCached("commercial_reconciliation", ru.dmitry.matercontroller.core.model.ReconciliationDto.serializer()) { apiProvider.api().commercialReconciliation() }
    suspend fun leadArtifacts(id: String): DataResult<ru.dmitry.matercontroller.core.model.LeadArtifactsDto> =
        readCached("lead_artifacts:$id", ru.dmitry.matercontroller.core.model.LeadArtifactsDto.serializer()) { apiProvider.api().leadArtifacts(id) }
    suspend fun leadAudit(id: String): DataResult<ru.dmitry.matercontroller.core.model.AuditDto> =
        readCached("lead_audit:$id", ru.dmitry.matercontroller.core.model.AuditDto.serializer()) { apiProvider.api().leadAudit(id) }
    suspend fun radarStatus(): DataResult<ru.dmitry.matercontroller.core.model.RadarStatusDto> =
        readCached("radar_status", ru.dmitry.matercontroller.core.model.RadarStatusDto.serializer()) { apiProvider.api().radarStatus() }
    suspend fun reservoirCounters(): DataResult<ru.dmitry.matercontroller.core.model.ReservoirCountersDto> =
        readCached("reservoir_counters", ru.dmitry.matercontroller.core.model.ReservoirCountersDto.serializer()) { apiProvider.api().reservoirCounters() }
    suspend fun reservoirDomains(): DataResult<ru.dmitry.matercontroller.core.model.ReservoirDomainList> =
        readCached("reservoir_domains", ru.dmitry.matercontroller.core.model.ReservoirDomainList.serializer()) { apiProvider.api().reservoirDomains() }
    suspend fun reservoirDomain(id: String): DataResult<ru.dmitry.matercontroller.core.model.ReservoirDomainDetailDto> =
        readCached("reservoir_domain:$id", ru.dmitry.matercontroller.core.model.ReservoirDomainDetailDto.serializer()) { apiProvider.api().reservoirDomain(id) }
    suspend fun commonCrawlProbe(): DataResult<ru.dmitry.matercontroller.core.model.CommonCrawlProbeDto> =
        readCached("common_crawl_probe", ru.dmitry.matercontroller.core.model.CommonCrawlProbeDto.serializer()) { apiProvider.api().commonCrawlProbe() }

    // ---------- 0.7.0-rc1: Campaign Governor (read-only; cached) ----------
    suspend fun campaigns(): DataResult<ru.dmitry.matercontroller.core.model.CampaignsData> =
        readCached("campaigns", ru.dmitry.matercontroller.core.model.CampaignsData.serializer()) { apiProvider.api().campaigns(ru.dmitry.matercontroller.BuildConfig.DEBUG) }
    suspend fun campaign(id: String): DataResult<ru.dmitry.matercontroller.core.model.CampaignSummary> =
        read { apiProvider.api().campaign(id) }

    // ---------- 0.8.0-rc1: Owner Command & Autonomy Center (read-only; cached) ----------
    suspend fun ownerSnapshot(): DataResult<ru.dmitry.matercontroller.core.model.OwnerSnapshot> =
        readCached("owner_snapshot", ru.dmitry.matercontroller.core.model.OwnerSnapshot.serializer()) { apiProvider.api().ownerSnapshot(ru.dmitry.matercontroller.BuildConfig.DEBUG) }
    suspend fun commandBrief(): DataResult<ru.dmitry.matercontroller.core.model.CommandBrief> =
        readCached("command_brief", ru.dmitry.matercontroller.core.model.CommandBrief.serializer()) { apiProvider.api().commandBrief() }
    suspend fun ownerNotifications(): DataResult<ru.dmitry.matercontroller.core.model.OwnerNotificationsData> =
        readCached("owner_notifications", ru.dmitry.matercontroller.core.model.OwnerNotificationsData.serializer()) { apiProvider.api().ownerNotifications(ru.dmitry.matercontroller.BuildConfig.DEBUG) }
    // Fresh (non-cached) events read used by the notification fallback worker to detect P0/P1.
    suspend fun ownerEvents(): DataResult<ru.dmitry.matercontroller.core.model.OwnerEventsData> =
        read { apiProvider.api().ownerEvents(ru.dmitry.matercontroller.BuildConfig.DEBUG) }
    suspend fun ownerDecisions(): DataResult<ru.dmitry.matercontroller.core.model.OwnerDecisionsData> =
        readCached("owner_decisions", ru.dmitry.matercontroller.core.model.OwnerDecisionsData.serializer()) { apiProvider.api().ownerDecisions(ru.dmitry.matercontroller.BuildConfig.DEBUG) }
    suspend fun ownerIncidents(): DataResult<ru.dmitry.matercontroller.core.model.IncidentsData> =
        readCached("owner_incidents", ru.dmitry.matercontroller.core.model.IncidentsData.serializer()) { apiProvider.api().ownerIncidents(ru.dmitry.matercontroller.BuildConfig.DEBUG) }
    suspend fun ownerIncidentsSummary(): DataResult<ru.dmitry.matercontroller.core.model.IncidentsSummary> =
        readCached("owner_incidents_summary", ru.dmitry.matercontroller.core.model.IncidentsSummary.serializer()) { apiProvider.api().ownerIncidentsSummary(ru.dmitry.matercontroller.BuildConfig.DEBUG) }
    suspend fun ownerAutopilot(): DataResult<ru.dmitry.matercontroller.core.model.AutopilotDto> =
        readCached("owner_autopilot", ru.dmitry.matercontroller.core.model.AutopilotDto.serializer()) { apiProvider.api().ownerAutopilot() }
    // 0.8.0-rc3 owner write paths (TEST_ONLY-safe; never send). Each is idempotent + server-confirmed.
    suspend fun setAutopilotMode(mode: String): DataResult<Boolean> =
        mutateBool { apiProvider.api().setAutopilotMode("android-ap-" + UUID.randomUUID(), ru.dmitry.matercontroller.core.network.AutopilotModeBody(mode)) }
    suspend fun markNotificationRead(id: String): DataResult<Boolean> =
        mutateBool { apiProvider.api().markNotificationRead(id, "android-nr-" + UUID.randomUUID(), ru.dmitry.matercontroller.core.network.NotificationReadBody("read")) }
    suspend fun acknowledgeIncident(id: String): DataResult<Boolean> =
        mutateBool { apiProvider.api().acknowledgeIncident(id, "android-inc-" + UUID.randomUUID()) }
    suspend fun ownerAgents(): DataResult<ru.dmitry.matercontroller.core.model.AgentsStatus> =
        readCached("owner_agents", ru.dmitry.matercontroller.core.model.AgentsStatus.serializer()) { apiProvider.api().ownerAgents() }
    suspend fun reliabilityOverview(): DataResult<ru.dmitry.matercontroller.core.model.ReliabilityOverview> =
        readCached("reliability_overview", ru.dmitry.matercontroller.core.model.ReliabilityOverview.serializer()) { apiProvider.api().reliability() }
    suspend fun costOverview(): DataResult<ru.dmitry.matercontroller.core.model.CostOverview> =
        readCached("cost_overview", ru.dmitry.matercontroller.core.model.CostOverview.serializer()) { apiProvider.api().costs() }
    suspend fun backupStatus(): DataResult<ru.dmitry.matercontroller.core.model.BackupStatus> =
        readCached("backup_status", ru.dmitry.matercontroller.core.model.BackupStatus.serializer()) { apiProvider.api().backupStatus() }
    // Restore drill is a read-only verification; cached so it survives offline like other reads.
    suspend fun restoreDrill(): DataResult<ru.dmitry.matercontroller.core.model.RestoreDrillAll> =
        readCached("restore_drill", ru.dmitry.matercontroller.core.model.RestoreDrillAll.serializer()) { apiProvider.api().restoreDrill() }

    // ---------- 0.8.0: FCM Push (status read cached; lifecycle commands never cached) ----------
    suspend fun pushStatus(): DataResult<ru.dmitry.matercontroller.core.model.PushStatus> =
        readCached("push_status", ru.dmitry.matercontroller.core.model.PushStatus.serializer()) { apiProvider.api().pushStatus() }
    suspend fun pushPreferences(): DataResult<ru.dmitry.matercontroller.core.model.PushPreferencesData> =
        read { apiProvider.api().pushPreferences() }
    suspend fun pushRegister(token: String, appVersion: String?, prefs: ru.dmitry.matercontroller.core.model.PushPrefs?): DataResult<kotlinx.serialization.json.JsonElement> =
        command { apiProvider.api().pushRegister("android-push-reg-" + UUID.randomUUID(), ru.dmitry.matercontroller.core.model.PushRegisterBody(token = token, appVersion = appVersion, prefs = prefs)) }
    suspend fun pushUnregister(): DataResult<kotlinx.serialization.json.JsonElement> =
        command { apiProvider.api().pushUnregister("android-push-unreg-" + UUID.randomUUID(), kotlinx.serialization.json.JsonObject(emptyMap())) }
    suspend fun pushSetPreferences(prefs: ru.dmitry.matercontroller.core.model.PushPrefs): DataResult<kotlinx.serialization.json.JsonElement> =
        command { apiProvider.api().pushSetPreferences("android-push-prefs-" + UUID.randomUUID(), ru.dmitry.matercontroller.core.model.PushPrefsBody(prefs)) }

    // ---------- Gate C1-A: owner internal commands (NEVER cached; fail offline; no send) ----------
    private suspend fun <T> command(block: suspend () -> Response<Envelope<T>>): DataResult<T> = try {
        unwrap(block())
    } catch (e: Exception) { DataResult.Error(ErrorCodes.NETWORK, e.message ?: "network error") }

    suspend fun createOpportunity(body: ru.dmitry.matercontroller.core.model.CreateOpportunityBody): DataResult<ru.dmitry.matercontroller.core.model.CommandResult> =
        command { apiProvider.api().createOpportunity("android-opp-" + UUID.randomUUID(), body) }
    suspend fun prepareOffer(opportunityId: String, expectedRevision: Int?): DataResult<ru.dmitry.matercontroller.core.model.CommandResult> =
        command { apiProvider.api().prepareOffer(opportunityId, "android-offer-" + UUID.randomUUID(), ru.dmitry.matercontroller.core.model.ExpectedRevisionBody(expectedRevision)) }
    suspend fun recordOwnerDecision(offerId: String, decision: String, expectedRevision: Int?): DataResult<ru.dmitry.matercontroller.core.model.CommandResult> =
        command { apiProvider.api().recordOwnerDecision(offerId, "android-dec-" + UUID.randomUUID(), ru.dmitry.matercontroller.core.model.DecisionBody(decision, expectedRevision)) }

    /**
     * RC3 offer-review owner decision (status-only; NEVER sends a message). Mirrors approve():
     * UUID Idempotency-Key, success ONLY when resp.isSuccessful && body.ok == true with a confirmed
     * CommandResult. A 409 revision conflict is surfaced as a distinct REVISION_CONFLICT code so the
     * UI can reload canonical state instead of blindly retrying. Never cached; fails offline.
     */
    suspend fun offerDecision(offerId: String, decision: String, expectedRevision: Int?): DataResult<ru.dmitry.matercontroller.core.model.CommandResult> = try {
        val key = "android-offer-dec-" + UUID.randomUUID()
        val resp = apiProvider.api().offerDecision(offerId, key, ru.dmitry.matercontroller.core.model.DecisionBody(decision, expectedRevision))
        val code = resp.code()
        val body = resp.body()
        when {
            resp.isSuccessful && body?.ok == true && body.data != null -> DataResult.Success(body.data)
            code == 409 -> DataResult.Error(ErrorCodes.REVISION_CONFLICT, body?.error?.message ?: "Данные изменились на сервере")
            code == 401 -> DataResult.Error(ErrorCodes.UNAUTHORIZED, "Требуется повторное подключение")
            !resp.isSuccessful -> DataResult.Error(body?.error?.code ?: ErrorCodes.fromHttp(code), body?.error?.message ?: "Ошибка сервера ($code)")
            else -> DataResult.Error(body?.error?.code ?: ErrorCodes.SERVER, body?.error?.message ?: "Команда не подтверждена сервером")
        }
    } catch (e: Exception) { DataResult.Error(ErrorCodes.NETWORK, e.message ?: "network error") }
    suspend fun createHandoff(dealId: String, expectedRevision: Int?): DataResult<ru.dmitry.matercontroller.core.model.CommandResult> =
        command { apiProvider.api().createHandoff(dealId, "android-handoff-" + UUID.randomUUID(), ru.dmitry.matercontroller.core.model.ExpectedRevisionBody(expectedRevision)) }
    suspend fun createProject(handoffId: String, expectedRevision: Int?): DataResult<ru.dmitry.matercontroller.core.model.CommandResult> =
        command { apiProvider.api().createProject(handoffId, "android-project-" + UUID.randomUUID(), ru.dmitry.matercontroller.core.model.ExpectedRevisionBody(expectedRevision)) }
    suspend fun createInvoiceDraft(dealId: String?, projectId: String?, expectedRevision: Int?): DataResult<ru.dmitry.matercontroller.core.model.CommandResult> =
        command { apiProvider.api().createInvoiceDraft("android-inv-" + UUID.randomUUID(), ru.dmitry.matercontroller.core.model.InvoiceDraftBody(dealId, projectId, expectedRevision)) }

    /**
     * Pipeline queue by canonical status with a generic Room (cache_kv) offline fallback.
     * Network truth wins and is written through; when the network fails we return the last
     * cached snapshot flagged fromCache so the UI can show a stale banner. Read-only — this
     * never mutates canonical data and there is no send path here.
     */
    suspend fun pipelineByStatus(status: String): DataResult<PipelineLeadsData> {
        val key = "pipeline_by_status:$status"
        return try {
            val r = unwrap(apiProvider.api().pipelineByStatus(status))
            if (r is DataResult.Success) {
                runCatching {
                    cacheDao.put(CacheEntity(key, json.encodeToString(PipelineLeadsData.serializer(), r.data), System.currentTimeMillis()))
                }
            }
            r
        } catch (e: Exception) {
            val row = runCatching { cacheDao.get(key) }.getOrNull()
            if (row != null) {
                val data = runCatching { json.decodeFromString(PipelineLeadsData.serializer(), row.json) }.getOrNull()
                if (data != null) return DataResult.Success(data, fromCache = true, cachedAt = row.updatedAt)
            }
            DataResult.Error(ErrorCodes.NETWORK, e.message ?: "network error")
        }
    }
    suspend fun replies(category: String? = null, status: String? = null): DataResult<RepliesData> =
        readCached("replies:${category ?: "all"}:${status ?: "all"}", RepliesData.serializer()) { apiProvider.api().replies(category, status) }
    suspend fun openReplies(): DataResult<RepliesData> = readCached("replies_open", RepliesData.serializer()) { apiProvider.api().openReplies() }
    suspend fun replyCounts(): DataResult<ReplyCounts> = readCached("reply_counts", ReplyCounts.serializer()) { apiProvider.api().replyCounts() }
    suspend fun reply(id: String): DataResult<ReplyItem> = read { apiProvider.api().reply(id) }

    // ---------- jobs / queue / dead letters (read-only, structured cache) ----------
    suspend fun jobs(status: String? = null, type: String? = null): DataResult<JobsData> {
        val domain = "job:${status ?: "all"}:${type ?: "all"}"
        return try {
            when (val r = unwrap(apiProvider.api().jobs(status, type))) {
                is DataResult.Success -> {
                    cacheDomainList(domain, r.data.jobs, JobSummary.serializer(), { it.jobId ?: it.hashCode().toString() }, { it.status }, { null })
                    r
                }
                is DataResult.Error -> {
                    if (!RepoLogic.shouldUseStaleCache(r.code)) r
                    else staleDomainList(domain, JobSummary.serializer())?.let { DataResult.Success(JobsData(it.data), fromCache = true, cachedAt = it.cachedAt) } ?: r
                }
            }
        } catch (e: Exception) {
            staleDomainList(domain, JobSummary.serializer())?.let { DataResult.Success(JobsData(it.data), fromCache = true, cachedAt = it.cachedAt) }
                ?: DataResult.Error(ErrorCodes.NETWORK, e.message ?: "network error")
        }
    }
    suspend fun job(id: String): DataResult<JobSummary> = read { apiProvider.api().job(id) }

    /** jobs/counts returns a free-form {STATUS: n} object → normalized into CountsData.
     * Read-through cached so the «Система» queue counts survive offline instead of collapsing
     * to 0 (a missing count must read as unknown/cached, never a false zero). */
    suspend fun jobsCounts(): DataResult<CountsData> {
        val key = "rc:jobs_counts"
        return try {
            when (val r = unwrap(apiProvider.api().jobsCounts())) {
                is DataResult.Success -> {
                    val data = CountsData(decodeCounts(r.data))
                    runCatching { cacheDao.put(CacheEntity(key, json.encodeToString(CountsData.serializer(), data), System.currentTimeMillis())) }
                    DataResult.Success(data)
                }
                is DataResult.Error -> if (RepoLogic.shouldUseStaleCache(r.code)) readCacheRow(key, CountsData.serializer()) ?: r else r
            }
        } catch (e: Exception) {
            readCacheRow(key, CountsData.serializer()) ?: DataResult.Error(ErrorCodes.NETWORK, e.message ?: "network error")
        }
    }

    suspend fun pipelineCountsMap(): DataResult<CountsData> = try {
        val resp = apiProvider.api().pipelineCounts()
        when (val r = unwrap(resp)) {
            is DataResult.Success -> DataResult.Success(CountsData(decodeCounts(r.data)))
            is DataResult.Error -> r
        }
    } catch (e: Exception) { DataResult.Error(ErrorCodes.NETWORK, e.message ?: "network error") }

    // ---------- mutations (never cached; fail offline; backend-confirmed) ----------
    /** Retry a dead-lettered job via the owner-auth retry endpoint. Idempotent; backend-confirmed. */
    suspend fun retryJob(job: JobSummary): DataResult<Boolean> {
        if (job.jobId == null) return DataResult.Error(ErrorCodes.SERVER, "job id отсутствует")
        val key = "android-retry-" + UUID.randomUUID()
        return mutateBool {
            apiProvider.api().retryJob(job.jobId, key)
        }
    }

    suspend fun setLeadStatus(id: String, status: String, expectedRevision: Int? = null): DataResult<Boolean> {
        val key = "android-status-" + UUID.randomUUID()
        return mutateBool {
            apiProvider.api().setLeadStatus(id, key, ru.dmitry.matercontroller.core.network.LeadStatusBody(status, expectedRevision))
        }
    }

    suspend fun postponeFollowup(id: String): DataResult<Boolean> {
        val key = "android-fup-" + UUID.randomUUID()
        return mutateBool { apiProvider.api().postponeFollowup(id, key) }
    }

    /**
     * Write-through a list of DTOs into structured domain_cache (called after a successful read).
     */
    suspend fun <T> cacheDomainList(
        domain: String,
        items: List<T>,
        serializer: kotlinx.serialization.KSerializer<T>,
        idOf: (T) -> String,
        statusOf: (T) -> String? = { null },
        revisionOf: (T) -> Int? = { null },
    ) {
        val now = System.currentTimeMillis()
        runCatching {
            domainDao.replaceDomain(domain, items.map {
                DomainEntity(domain, idOf(it), statusOf(it), revisionOf(it), json.encodeToString(serializer, it), now)
            })
        }
    }

    /** Stale fallback: read a cached domain list with its fetch timestamp. */
    suspend fun <T> staleDomainList(domain: String, serializer: kotlinx.serialization.KSerializer<T>): DataResult.Success<List<T>>? {
        val rows = runCatching { domainDao.listByDomain(domain) }.getOrNull()
        if (rows.isNullOrEmpty()) return null
        val items = rows.mapNotNull { runCatching { json.decodeFromString(serializer, it.json) }.getOrNull() }
        if (items.isEmpty()) return null
        return DataResult.Success(items, fromCache = true, cachedAt = rows.maxOfOrNull { it.fetchedAt })
    }

    private fun decodeCounts(el: kotlinx.serialization.json.JsonElement): Map<String, Int> =
        RepoLogic.decodeCounts(el)

    private suspend fun mutateBool(block: suspend () -> Response<Envelope<kotlinx.serialization.json.JsonElement>>): DataResult<Boolean> = try {
        val resp = block()
        if (resp.isSuccessful && resp.body()?.ok == true) DataResult.Success(true)
        else { val u = unwrap(resp); if (u is DataResult.Error) u else DataResult.Error(ErrorCodes.SERVER, "ошибка") }
    } catch (e: Exception) { DataResult.Error(ErrorCodes.NETWORK, e.message ?: "network error") }


    /** Lead list with Room-backed offline fallback when a plain bucket query fails. */
    suspend fun leads(bucket: String, search: String?): DataResult<LeadsData> {
        return try {
            val resp = apiProvider.api().leads(bucket = bucket, search = search, page = 1, pageSize = 100)
            val r = unwrap(resp)
            if (r is DataResult.Success && search.isNullOrBlank()) {
                val now = System.currentTimeMillis()
                leadDao.replaceBucket(bucket, r.data.items.map { it.toEntity(bucket, now) })
            }
            r
        } catch (e: Exception) {
            if (search.isNullOrBlank()) {
                val rows = runCatching { leadDao.observeByBucket(bucket).first() }.getOrNull()
                if (!rows.isNullOrEmpty()) {
                    val items = rows.mapNotNull { row -> runCatching { json.decodeFromString(Lead.serializer(), row.json) }.getOrNull() }
                    val cachedAt = rows.maxOfOrNull { row -> row.updatedAt }
                    return DataResult.Success(LeadsData(items = items, total = items.size, bucket = bucket), fromCache = true, cachedAt = cachedAt)
                }
            }
            DataResult.Error(ErrorCodes.NETWORK, e.message ?: "network error")
        }
    }

    // ---------- actions (never cached; fail offline) ----------
    suspend fun sendPrepare(id: String): DataResult<ApprovalIntent> = read { apiProvider.api().sendPrepare(id) }
    suspend fun reject(approvalId: String) = readBool { apiProvider.api().reject(approvalId) }
    suspend fun postpone(approvalId: String) = readBool { apiProvider.api().postpone(approvalId) }
    suspend fun checkProof(id: String) = readBool { apiProvider.api().checkProof(id) }

    suspend fun approve(approvalId: String): DataResult<Boolean> = try {
        val key = "android-" + UUID.randomUUID()
        val resp = apiProvider.api().approve(approvalId, key)
        if (resp.isSuccessful && resp.body()?.ok == true) DataResult.Success(true)
        else DataResult.Error(resp.body()?.error?.code ?: ErrorCodes.SERVER, resp.body()?.error?.message ?: "ошибка отправки")
    } catch (e: Exception) { DataResult.Error(ErrorCodes.NETWORK, e.message ?: "network error") }

    // ---------- helpers ----------
    private suspend fun <T> read(block: suspend () -> Response<Envelope<T>>): DataResult<T> = try {
        unwrap(block())
    } catch (e: Exception) {
        DataResult.Error(ErrorCodes.NETWORK, e.message ?: "network error")
    }

    /**
     * Read-through cache for read-only screens. Network truth wins and is written through into
     * cache_kv. On a NETWORK/transport failure (or a retriable server error eligible per
     * RepoLogic.shouldUseStaleCache) the last cached snapshot is returned flagged fromCache so the
     * UI shows it behind an offline banner instead of a raw error. Auth failures (401/403) never
     * serve stale cache. A raw transport exception NEVER escapes — it becomes a NETWORK error only
     * when there is no cache to serve.
     */
    private suspend fun <T> readCached(
        key: String,
        serializer: kotlinx.serialization.KSerializer<T>,
        block: suspend () -> Response<Envelope<T>>,
    ): DataResult<T> {
        val cacheKey = "rc:$key"
        return try {
            when (val r = unwrap(block())) {
                is DataResult.Success -> {
                    runCatching { cacheDao.put(CacheEntity(cacheKey, json.encodeToString(serializer, r.data), System.currentTimeMillis())) }
                    r
                }
                is DataResult.Error -> {
                    if (RepoLogic.shouldUseStaleCache(r.code)) readCacheRow(cacheKey, serializer) ?: r else r
                }
            }
        } catch (e: Exception) {
            // transport-level failure (connection closed, timeout, unknown host, …)
            readCacheRow(cacheKey, serializer) ?: DataResult.Error(ErrorCodes.NETWORK, e.message ?: "network error")
        }
    }

    private suspend fun <T> readCacheRow(cacheKey: String, serializer: kotlinx.serialization.KSerializer<T>): DataResult.Success<T>? {
        val row = runCatching { cacheDao.get(cacheKey) }.getOrNull() ?: return null
        val data = runCatching { json.decodeFromString(serializer, row.json) }.getOrNull() ?: return null
        return DataResult.Success(data, fromCache = true, cachedAt = row.updatedAt)
    }

    private suspend fun readBool(block: suspend () -> Response<Envelope<Map<String, kotlinx.serialization.json.JsonElement>>>): DataResult<Boolean> = try {
        val resp = block()
        if (resp.isSuccessful && resp.body()?.ok == true) DataResult.Success(true)
        else DataResult.Error(resp.body()?.error?.code ?: ErrorCodes.SERVER, resp.body()?.error?.message ?: "ошибка")
    } catch (e: Exception) { DataResult.Error(ErrorCodes.NETWORK, e.message ?: "network error") }

    private fun <T> unwrap(resp: Response<Envelope<T>>): DataResult<T> {
        val code = resp.code()
        if (code == 401) return DataResult.Error(ErrorCodes.UNAUTHORIZED, "Требуется повторное подключение")
        val body = resp.body()
        if (resp.isSuccessful && body?.ok == true && body.data != null) return DataResult.Success(body.data)
        // distinct, actionable error codes for 403/404/409/423/429/503
        if (!resp.isSuccessful) {
            val mapped = ErrorCodes.fromHttp(code)
            val msg = body?.error?.message ?: when (mapped) {
                ErrorCodes.FORBIDDEN -> "Недостаточно прав"
                ErrorCodes.NOT_FOUND -> "Не найдено"
                ErrorCodes.CONFLICT -> "Конфликт ревизии — данные изменились"
                ErrorCodes.MAINTENANCE -> "Сервер на обслуживании"
                ErrorCodes.RATE_LIMITED -> "Слишком много запросов"
                ErrorCodes.UNAVAILABLE -> "Сервер временно недоступен"
                else -> "Ошибка сервера ($code)"
            }
            return DataResult.Error(body?.error?.code ?: mapped, msg)
        }
        return DataResult.Error(body?.error?.code ?: ErrorCodes.SERVER, body?.error?.message ?: "Ошибка сервера ($code)")
    }

    private fun normalize(url: String): String {
        val origin = ru.dmitry.matercontroller.core.network.BaseUrlHolder.normalizeOrigin(url)
        return if (origin.isEmpty()) "" else origin + "api/v1/"
    }

    private fun Lead.toEntity(bucket: String, now: Long) = LeadEntity(
        leadId = leadId, bucket = bucket, company = company, status = status,
        sendProof = sendProof, smtpCode = smtpCode, sendable = sendable,
        json = json.encodeToString(Lead.serializer(), this), updatedAt = now,
    )

    private fun bareApi(fullBase: String): MaterApi {
        val client = OkHttpClient.Builder()
            .build()
        return Retrofit.Builder()
            .baseUrl(fullBase)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(MaterApi::class.java)
    }
}
