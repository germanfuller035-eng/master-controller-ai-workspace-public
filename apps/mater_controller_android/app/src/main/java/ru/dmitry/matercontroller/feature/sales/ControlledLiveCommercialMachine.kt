package ru.dmitry.matercontroller.feature.sales

import java.security.MessageDigest

enum class CommercialFeatureMode {
    OFF,
    OWNER_APPROVAL_REQUIRED,
    PRODUCTION_READ_ONLY,
    LIVE_READY,
}

data class CommercialFeatureFlags(
    val outboundEmail: CommercialFeatureMode = CommercialFeatureMode.OWNER_APPROVAL_REQUIRED,
    val outboundSocial: CommercialFeatureMode = CommercialFeatureMode.OFF,
    val replyMonitorRead: CommercialFeatureMode = CommercialFeatureMode.PRODUCTION_READ_ONLY,
    val crmWrite: CommercialFeatureMode = CommercialFeatureMode.OFF,
    val paymentDraft: CommercialFeatureMode = CommercialFeatureMode.OFF,
    val paymentLinkCreate: CommercialFeatureMode = CommercialFeatureMode.OFF,
    val paymentLinkSend: CommercialFeatureMode = CommercialFeatureMode.OFF,
    val autoSafe: CommercialFeatureMode = CommercialFeatureMode.OFF,
    val browserActions: CommercialFeatureMode = CommercialFeatureMode.OFF,
    val productionDbWrite: CommercialFeatureMode = CommercialFeatureMode.OFF,
)

data class LiveCommercialLead(
    val leadId: String,
    val companyName: String,
    val website: String,
    val niche: String,
    val region: String,
    val source: String,
    val sourceUrl: String,
    val confidence: String,
    val collectedAt: String,
    val contactChannel: String,
    val contactValue: String,
    val contactSourceUrl: String,
    val contactConfidence: String,
    val suppressionStatus: String,
    val priorOutreachStatus: String,
    val ownerDecision: String,
) {
    val hasContactProvenance: Boolean
        get() = contactValue.isNotBlank() &&
            contactChannel.isNotBlank() &&
            contactSourceUrl.isNotBlank() &&
            contactConfidence.isNotBlank()
}

data class OwnerOverrideAudit(
    val reason: String = "",
    val riskText: String = "",
    val ownerConfirmation: Boolean = false,
    val timestamp: String = "",
    val payloadHash: String = "",
    val auditRecord: String = "",
) {
    val confirmed: Boolean
        get() = reason.isNotBlank() &&
            riskText.isNotBlank() &&
            ownerConfirmation &&
            timestamp.isNotBlank() &&
            payloadHash.isNotBlank() &&
            auditRecord.isNotBlank()
}

data class SendApprovalPayload(
    val approvalId: String,
    val leadId: String,
    val singleUse: Boolean,
    val expiresAt: String,
    val exactRecipient: String,
    val exactChannel: String,
    val exactSubject: String,
    val exactBodyHash: String,
    val riskLevel: String,
    val ownerId: String,
    val payloadHash: String,
)

data class SendPreconditions(
    val qaPassed: Boolean,
    val ownerOverride: OwnerOverrideAudit? = null,
    val suppressionStatus: String,
    val priorOutreachStatus: String,
    val stopEnabled: Boolean,
    val dailyCap: Int,
    val sentToday: Int,
)

data class TransportSendRequest(
    val approvalId: String,
    val payloadHash: String,
    val recipient: String,
    val channel: String,
    val subject: String,
    val body: String,
    val mode: CommercialTransportMode,
)

enum class CommercialTransportMode {
    DRY_RUN,
    LIVE,
}

data class CommercialGateDecision(
    val allowed: Boolean,
    val status: String,
    val reasons: List<String>,
    val auditRecordPreview: List<String>,
    val outboundCount: Int = 0,
)

enum class ReplyClass {
    INTERESTED,
    ASKED_DETAILS,
    NOT_INTERESTED,
    WRONG_CONTACT,
    BOUNCE,
    AUTO_REPLY,
    UNSUBSCRIBE,
    COMPLAINT,
    UNKNOWN,
}

data class ReplyMonitorRecord(
    val replyId: String,
    val leadId: String,
    val replyClass: ReplyClass,
    val readOnly: Boolean,
    val suggestedNextStep: String,
    val suppressionEntryRequired: Boolean,
    val futureSendBlocked: Boolean,
)

data class CrmWriteRequest(
    val entity: String,
    val sourceEventId: String,
    val idempotencyKey: String,
    val actor: String,
    val createdAt: String,
    val payloadHash: String,
    val approvalId: String,
    val previousState: String,
    val newState: String,
    val rollbackHint: String,
    val ownerApproved: Boolean,
)

data class PaymentApprovalPayload(
    val client: String,
    val dealId: String,
    val amount: Long,
    val currency: String,
    val product: String,
    val invoiceId: String,
    val paymentProvider: String,
    val paymentLinkHash: String,
    val expiry: String,
    val ownerConfirmation: Boolean,
)

data class AutonomyMetrics(
    val manualApprovedSends: Int,
    val unauthorizedSends: Int,
    val duplicateSends: Int,
    val suppressionBypass: Int,
    val contactCompletenessPercent: Int,
    val qaPassRatePercent: Int,
    val replyMonitorPass: Boolean,
    val dailyCapPass: Boolean,
    val stopRehearsalPass: Boolean,
    val rollbackRehearsalPass: Boolean,
    val ownerApprovalLogPercent: Int,
    val complaintRateBelowThreshold: Boolean,
    val bounceRateBelowThreshold: Boolean,
)

object ControlledLiveCommercialMachine {
    val initialFlags = CommercialFeatureFlags()

    val requiredEndpoints = listOf(
        "POST /commercial/leads/import",
        "GET /commercial/leads",
        "GET /commercial/leads/{id}",
        "POST /commercial/leads/{id}/verify",
        "POST /commercial/leads/{id}/draft",
        "POST /commercial/leads/{id}/qa",
        "POST /commercial/send-packets",
        "POST /commercial/approvals/send",
        "POST /commercial/transport/send-approved",
        "GET /commercial/replies",
        "POST /commercial/replies/{id}/classify",
        "POST /commercial/crm/write-approved",
        "POST /commercial/opportunities",
        "POST /commercial/invoices/draft",
        "POST /commercial/payments/approval",
        "GET /commercial/audit/events",
        "POST /commercial/stop",
    )

    fun bodyHash(body: String): String = sha256(body.trim())

    fun createSendApprovalPayload(
        approvalId: String,
        leadId: String,
        recipient: String,
        channel: String,
        subject: String,
        body: String,
        riskLevel: String,
        ownerId: String,
        expiresAt: String,
    ): SendApprovalPayload {
        val unsigned = SendApprovalPayload(
            approvalId = approvalId,
            leadId = leadId,
            singleUse = true,
            expiresAt = expiresAt,
            exactRecipient = recipient.trim(),
            exactChannel = channel.trim().lowercase(),
            exactSubject = subject.trim(),
            exactBodyHash = bodyHash(body),
            riskLevel = riskLevel,
            ownerId = ownerId,
            payloadHash = "",
        )
        return unsigned.copy(payloadHash = sha256(canonicalApproval(unsigned)))
    }

    fun evaluateSendApproval(
        lead: LiveCommercialLead,
        payload: SendApprovalPayload,
        preconditions: SendPreconditions,
        flags: CommercialFeatureFlags = initialFlags,
        usedPayloadHashes: Set<String> = emptySet(),
        nowIso: String,
    ): CommercialGateDecision {
        val reasons = mutableListOf<String>()
        if (preconditions.stopEnabled) reasons.add("STOP включён")
        if (flags.outboundEmail == CommercialFeatureMode.OFF) reasons.add("исходящая почта выключена")
        if (flags.autoSafe != CommercialFeatureMode.OFF) reasons.add("автоматический режим должен оставаться выключенным")
        if (!lead.hasContactProvenance) reasons.add("нет подтверждённого источника контакта")
        if (!preconditions.qaPassed && preconditions.ownerOverride?.confirmed != true) {
            reasons.add("текст не прошёл проверку и нет подтверждённого исключения владельца")
        }
        if (suppressionTriggered(preconditions) && preconditions.ownerOverride?.confirmed != true) {
            reasons.add("найден запрет или предыдущий контакт, нужно исключение владельца")
        }
        if (payload.payloadHash in usedPayloadHashes) reasons.add("этот пакет уже использован")
        if (!payload.singleUse) reasons.add("пакет должен быть одноразовым")
        if (nowIso >= payload.expiresAt) reasons.add("срок действия пакета истёк")
        if (preconditions.sentToday >= preconditions.dailyCap) reasons.add("дневной лимит исчерпан")

        return if (reasons.isEmpty()) {
            CommercialGateDecision(
                allowed = true,
                status = "OWNER_APPROVAL_READY",
                reasons = emptyList(),
                auditRecordPreview = listOf(
                    "approval_id=${payload.approvalId}",
                    "payload_hash=${payload.payloadHash}",
                    "single_use=true",
                    "outbound_count=0 until transport",
                ),
                outboundCount = 0,
            )
        } else {
            CommercialGateDecision(
                allowed = false,
                status = "SEND_BLOCKED",
                reasons = reasons,
                auditRecordPreview = listOf("approval_id=${payload.approvalId}", "blocked=true"),
                outboundCount = 0,
            )
        }
    }

    fun evaluateTransportSend(
        approval: SendApprovalPayload,
        request: TransportSendRequest,
        flags: CommercialFeatureFlags,
        preconditions: SendPreconditions,
        usedPayloadHashes: Set<String>,
        nowIso: String,
    ): CommercialGateDecision {
        val approvalDecision = evaluateSendApproval(
            lead = LiveCommercialLead(
                leadId = approval.leadId,
                companyName = "approved",
                website = "",
                niche = "",
                region = "",
                source = "approval",
                sourceUrl = "approval",
                confidence = "approved",
                collectedAt = nowIso,
                contactChannel = approval.exactChannel,
                contactValue = approval.exactRecipient,
                contactSourceUrl = "approval",
                contactConfidence = "approved",
                suppressionStatus = preconditions.suppressionStatus,
                priorOutreachStatus = preconditions.priorOutreachStatus,
                ownerDecision = "approved",
            ),
            payload = approval,
            preconditions = preconditions,
            flags = flags,
            usedPayloadHashes = usedPayloadHashes,
            nowIso = nowIso,
        )
        val reasons = approvalDecision.reasons.toMutableList()
        if (request.approvalId != approval.approvalId) reasons.add("approval_id не совпадает")
        if (request.payloadHash != approval.payloadHash) reasons.add("payload_hash не совпадает")
        if (request.recipient.trim() != approval.exactRecipient) reasons.add("получатель изменился после подтверждения")
        if (request.channel.trim().lowercase() != approval.exactChannel) reasons.add("канал изменился после подтверждения")
        if (request.subject.trim() != approval.exactSubject) reasons.add("тема изменилась после подтверждения")
        val bodyChanged = bodyHash(request.body) != approval.exactBodyHash
        if (bodyChanged) reasons.add("текст изменился после подтверждения")
        if (request.mode == CommercialTransportMode.LIVE && flags.outboundEmail != CommercialFeatureMode.OWNER_APPROVAL_REQUIRED) {
            reasons.add("режим отправки не открыт через подтверждение владельца")
        }

        if (reasons.isNotEmpty()) {
            val status = if (bodyChanged) "SEND_BLOCKED_PAYLOAD_CHANGED" else "TRANSPORT_BLOCKED"
            return CommercialGateDecision(false, status, reasons, listOf("transport_allowed=false"), 0)
        }

        return if (request.mode == CommercialTransportMode.DRY_RUN) {
            CommercialGateDecision(true, "TRANSPORT_DRY_RUN_PASS", listOf("реальная отправка не выполняется"), listOf("outbound_count=0"), 0)
        } else {
            CommercialGateDecision(
                true,
                "SINGLE_LIVE_SEND_READY",
                emptyList(),
                listOf("Исходящее действие будет одно: только после подтверждения владельца в почтовом приложении."),
                1,
            )
        }
    }

    fun classifyReplyReadOnly(
        replyId: String,
        leadId: String,
        rawText: String,
        flags: CommercialFeatureFlags = initialFlags,
    ): ReplyMonitorRecord {
        val lower = rawText.lowercase()
        val klass = when {
            "unsubscribe" in lower || "не пишите" in lower || "отпис" in lower -> ReplyClass.UNSUBSCRIBE
            "жалоб" in lower || "spam" in lower || "спам" in lower -> ReplyClass.COMPLAINT
            "wrong" in lower || "не тот" in lower || "ошиб" in lower -> ReplyClass.WRONG_CONTACT
            "undelivered" in lower || "bounce" in lower || "недостав" in lower -> ReplyClass.BOUNCE
            "auto" in lower || "автоответ" in lower || "vacation" in lower -> ReplyClass.AUTO_REPLY
            "подроб" in lower || "details" in lower || "услов" in lower -> ReplyClass.ASKED_DETAILS
            "интерес" in lower || "давайте" in lower || "готов" in lower -> ReplyClass.INTERESTED
            "не интересно" in lower || "not interested" in lower -> ReplyClass.NOT_INTERESTED
            else -> ReplyClass.UNKNOWN
        }
        val suppression = klass in setOf(ReplyClass.UNSUBSCRIBE, ReplyClass.COMPLAINT, ReplyClass.WRONG_CONTACT)
        return ReplyMonitorRecord(
            replyId = replyId,
            leadId = leadId,
            replyClass = klass,
            readOnly = flags.replyMonitorRead == CommercialFeatureMode.PRODUCTION_READ_ONLY,
            suggestedNextStep = when (klass) {
                ReplyClass.INTERESTED, ReplyClass.ASKED_DETAILS -> "подготовить следующий шаг владельцу"
                ReplyClass.UNSUBSCRIBE, ReplyClass.COMPLAINT, ReplyClass.WRONG_CONTACT -> "запретить будущие обращения"
                ReplyClass.BOUNCE -> "проверить контакт"
                ReplyClass.NOT_INTERESTED -> "закрыть без повторного касания"
                else -> "проверить вручную"
            },
            suppressionEntryRequired = suppression,
            futureSendBlocked = suppression,
        )
    }

    fun evaluateCrmWrite(
        request: CrmWriteRequest,
        flags: CommercialFeatureFlags,
        stopEnabled: Boolean,
        usedIdempotencyKeys: Set<String>,
    ): CommercialGateDecision {
        val reasons = mutableListOf<String>()
        if (stopEnabled) reasons.add("STOP включён")
        if (flags.crmWrite == CommercialFeatureMode.OFF) reasons.add("запись в рабочую базу выключена")
        if (flags.productionDbWrite == CommercialFeatureMode.OFF) reasons.add("рабочая база закрыта")
        if (!request.ownerApproved) reasons.add("нет подтверждения владельца")
        if (request.idempotencyKey in usedIdempotencyKeys) reasons.add("повторный idempotency_key заблокирован")
        if (request.rollbackHint.isBlank()) reasons.add("нет подсказки отката")
        return if (reasons.isEmpty()) {
            CommercialGateDecision(true, "CRM_WRITE_APPROVED", emptyList(), listOf("entity=${request.entity}", "idempotency_key=${request.idempotencyKey}"), 0)
        } else {
            CommercialGateDecision(false, "CRM_WRITE_BLOCKED", reasons, listOf("entity=${request.entity}", "write_allowed=false"), 0)
        }
    }

    fun evaluatePaymentDraft(
        payload: PaymentApprovalPayload?,
        flags: CommercialFeatureFlags,
        stopEnabled: Boolean,
        repliesReceived: Int,
    ): CommercialGateDecision {
        val reasons = mutableListOf<String>()
        if (stopEnabled) reasons.add("STOP включён")
        if (repliesReceived <= 0) reasons.add("ещё нет реальной обратной связи")
        if (flags.paymentDraft == CommercialFeatureMode.OFF) reasons.add("черновик оплаты выключен")
        if (flags.paymentLinkCreate != CommercialFeatureMode.OFF) reasons.add("создание платёжной ссылки должно открываться отдельным контролем")
        if (flags.paymentLinkSend != CommercialFeatureMode.OFF) reasons.add("отправка платёжной ссылки должна оставаться выключенной")
        if (payload != null && !payload.ownerConfirmation) reasons.add("нет подтверждения владельца для оплаты")
        return if (reasons.isEmpty()) {
            CommercialGateDecision(true, "PAYMENT_DRAFT_READY", emptyList(), listOf("payment_live=false"), 0)
        } else {
            CommercialGateDecision(false, "PAYMENT_BLOCKED", reasons, listOf("payment_live=false"), 0)
        }
    }

    fun limitedAutonomyReady(metrics: AutonomyMetrics): CommercialGateDecision {
        val reasons = mutableListOf<String>()
        if (metrics.manualApprovedSends < 100) reasons.add("нужно минимум 100 ручных подтверждённых отправок")
        if (metrics.unauthorizedSends != 0) reasons.add("были несанкционированные отправки")
        if (metrics.duplicateSends != 0) reasons.add("были дубли отправок")
        if (metrics.suppressionBypass != 0) reasons.add("был обход запрета")
        if (metrics.contactCompletenessPercent < 95) reasons.add("полнота контактов ниже 95%")
        if (metrics.qaPassRatePercent < 95) reasons.add("качество текстов ниже 95%")
        if (!metrics.replyMonitorPass) reasons.add("мониторинг ответов не подтверждён")
        if (!metrics.dailyCapPass) reasons.add("дневной лимит не подтверждён")
        if (!metrics.stopRehearsalPass) reasons.add("STOP не отрепетирован")
        if (!metrics.rollbackRehearsalPass) reasons.add("откат не отрепетирован")
        if (metrics.ownerApprovalLogPercent < 100) reasons.add("журнал подтверждений неполный")
        if (!metrics.complaintRateBelowThreshold) reasons.add("жалобы выше порога")
        if (!metrics.bounceRateBelowThreshold) reasons.add("недоставки выше порога")
        return if (reasons.isEmpty()) {
            CommercialGateDecision(true, "APPROVED_BATCH_MAX_3_READY", emptyList(), listOf("batch_max=3"), 0)
        } else {
            CommercialGateDecision(false, "LIMITED_AUTONOMY_NOT_READY", reasons, listOf("batch_max=0"), 0)
        }
    }

    private fun suppressionTriggered(preconditions: SendPreconditions): Boolean {
        val combined = "${preconditions.suppressionStatus} ${preconditions.priorOutreachStatus}".lowercase()
        if ("не сработал" in combined && "прежних обращений не найдено" in combined) return false
        return listOf(
            "контакт запрещ",
            "нужно исключение",
            "повтор",
            "предыдущее обращение",
            "есть ответ",
            "reply",
            "bounce",
            "недостав",
        ).any { it in combined }
    }

    private fun canonicalApproval(payload: SendApprovalPayload): String = listOf(
        "approval_id=${payload.approvalId}",
        "lead_id=${payload.leadId}",
        "single_use=${payload.singleUse}",
        "expires_at=${payload.expiresAt}",
        "exact_recipient=${payload.exactRecipient}",
        "exact_channel=${payload.exactChannel}",
        "exact_subject=${payload.exactSubject}",
        "exact_body_hash=${payload.exactBodyHash}",
        "risk_level=${payload.riskLevel}",
        "owner_id=${payload.ownerId}",
    ).joinToString("\n")

    private fun sha256(value: String): String {
        val bytes = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }
}
