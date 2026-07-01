package ru.dmitry.matercontroller

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.dmitry.matercontroller.feature.sales.AutonomyMetrics
import ru.dmitry.matercontroller.feature.sales.CommercialFeatureFlags
import ru.dmitry.matercontroller.feature.sales.CommercialFeatureMode
import ru.dmitry.matercontroller.feature.sales.CommercialTransportMode
import ru.dmitry.matercontroller.feature.sales.ControlledLiveCommercialMachine
import ru.dmitry.matercontroller.feature.sales.CrmWriteRequest
import ru.dmitry.matercontroller.feature.sales.LiveCommercialLead
import ru.dmitry.matercontroller.feature.sales.OwnerOverrideAudit
import ru.dmitry.matercontroller.feature.sales.PaymentApprovalPayload
import ru.dmitry.matercontroller.feature.sales.ReplyClass
import ru.dmitry.matercontroller.feature.sales.SendPreconditions
import ru.dmitry.matercontroller.feature.sales.TransportSendRequest

class ControlledLiveCommercialMachineTest {
    @Test
    fun approvalPayloadHashIsStableAndBodyBound() {
        val first = approval(body = "Здравствуйте. Проверил сайт, предлагаю короткий разбор.")
        val second = approval(body = "Здравствуйте. Проверил сайт, предлагаю короткий разбор.")
        val changed = approval(body = "Здравствуйте. Текст изменился после подтверждения.")

        assertEquals(first.payloadHash, second.payloadHash)
        assertEquals(first.exactBodyHash, second.exactBodyHash)
        assertNotEquals(first.payloadHash, changed.payloadHash)
        assertNotEquals(first.exactBodyHash, changed.exactBodyHash)
    }

    @Test
    fun approvalReplayIsBlocked() {
        val approval = approval()
        val decision = ControlledLiveCommercialMachine.evaluateSendApproval(
            lead = lead(),
            payload = approval,
            preconditions = cleanPreconditions(),
            usedPayloadHashes = setOf(approval.payloadHash),
            nowIso = NOW,
        )

        assertFalse(decision.allowed)
        assertEquals("SEND_BLOCKED", decision.status)
        assertTrue(decision.reasons.any { it.contains("уже использован") })
        assertEquals(0, decision.outboundCount)
    }

    @Test
    fun approvalExpiryIsBlocked() {
        val approval = ControlledLiveCommercialMachine.createSendApprovalPayload(
            approvalId = "approval_expired",
            leadId = "lead_1",
            recipient = "owner-approved@example.test",
            channel = "email",
            subject = "Короткий внешний мини-разбор",
            body = BODY,
            riskLevel = "низкие",
            ownerId = "owner_local",
            expiresAt = NOW,
        )
        val decision = ControlledLiveCommercialMachine.evaluateSendApproval(
            lead = lead(),
            payload = approval,
            preconditions = cleanPreconditions(),
            nowIso = NOW,
        )

        assertFalse(decision.allowed)
        assertTrue(decision.reasons.any { it.contains("истёк") })
        assertEquals(0, decision.outboundCount)
    }

    @Test
    fun dailyCapBlocksSend() {
        val decision = ControlledLiveCommercialMachine.evaluateSendApproval(
            lead = lead(),
            payload = approval(),
            preconditions = cleanPreconditions(sentToday = 1, dailyCap = 1),
            nowIso = NOW,
        )

        assertFalse(decision.allowed)
        assertTrue(decision.reasons.any { it.contains("дневной лимит") })
        assertEquals(0, decision.outboundCount)
    }

    @Test
    fun requiredContractsUseCommercialV1Prefix() {
        val endpoints = ControlledLiveCommercialMachine.requiredEndpoints

        assertTrue(endpoints.contains("POST /commercial/leads/import"))
        assertTrue(endpoints.contains("GET /commercial/replies"))
        assertTrue(endpoints.contains("POST /commercial/transport/send-approved"))
        assertTrue(endpoints.contains("POST /commercial/crm/write-approved"))
        assertTrue(endpoints.contains("POST /commercial/payments/approval"))
        assertTrue(endpoints.all { it.startsWith("GET /commercial/") || it.startsWith("POST /commercial/") })
    }

    @Test
    fun stopBlocksSendCrmWriteAndPayment() {
        val send = ControlledLiveCommercialMachine.evaluateSendApproval(
            lead = lead(),
            payload = approval(),
            preconditions = cleanPreconditions(stop = true),
            nowIso = NOW,
        )
        val crm = ControlledLiveCommercialMachine.evaluateCrmWrite(
            request = crmWrite(ownerApproved = true),
            flags = CommercialFeatureFlags(
                crmWrite = CommercialFeatureMode.OWNER_APPROVAL_REQUIRED,
                productionDbWrite = CommercialFeatureMode.OWNER_APPROVAL_REQUIRED,
            ),
            stopEnabled = true,
            usedIdempotencyKeys = emptySet(),
        )
        val payment = ControlledLiveCommercialMachine.evaluatePaymentDraft(
            payload = payment(ownerConfirmed = true),
            flags = CommercialFeatureFlags(paymentDraft = CommercialFeatureMode.OWNER_APPROVAL_REQUIRED),
            stopEnabled = true,
            repliesReceived = 1,
        )

        assertFalse(send.allowed)
        assertFalse(crm.allowed)
        assertFalse(payment.allowed)
        assertTrue(send.reasons.any { it.contains("STOP") })
        assertTrue(crm.reasons.any { it.contains("STOP") })
        assertTrue(payment.reasons.any { it.contains("STOP") })
    }

    @Test
    fun suppressionRequiresOwnerOverrideAudit() {
        val blocked = ControlledLiveCommercialMachine.evaluateSendApproval(
            lead = lead(suppression = "есть повторный контакт"),
            payload = approval(),
            preconditions = cleanPreconditions(suppression = "есть повторный контакт"),
            nowIso = NOW,
        )
        val overrideAudit = OwnerOverrideAudit(
            reason = "Владелец подтвердил ручной повтор после проверки контекста.",
            riskText = "Есть риск раздражения адресата.",
            ownerConfirmation = true,
            timestamp = NOW,
            payloadHash = approval().payloadHash,
            auditRecord = "override-record-1",
        )
        val allowed = ControlledLiveCommercialMachine.evaluateSendApproval(
            lead = lead(suppression = "есть повторный контакт"),
            payload = approval(),
            preconditions = cleanPreconditions(suppression = "есть повторный контакт", overrideAudit = overrideAudit),
            nowIso = NOW,
        )

        assertFalse(blocked.allowed)
        assertTrue(blocked.reasons.any { it.contains("исключение владельца") })
        assertTrue(allowed.allowed)
        assertEquals("OWNER_APPROVAL_READY", allowed.status)
    }

    @Test
    fun exactPayloadMismatchBlocksTransport() {
        val approval = approval()
        val decision = ControlledLiveCommercialMachine.evaluateTransportSend(
            approval = approval,
            request = TransportSendRequest(
                approvalId = approval.approvalId,
                payloadHash = approval.payloadHash,
                recipient = approval.exactRecipient,
                channel = approval.exactChannel,
                subject = approval.exactSubject,
                body = "Текст поменялся после подтверждения.",
                mode = CommercialTransportMode.LIVE,
            ),
            flags = CommercialFeatureFlags(),
            preconditions = cleanPreconditions(),
            usedPayloadHashes = emptySet(),
            nowIso = NOW,
        )

        assertFalse(decision.allowed)
        assertEquals("SEND_BLOCKED_PAYLOAD_CHANGED", decision.status)
        assertTrue(decision.reasons.any { it.contains("Текст изменился") || it.contains("текст изменился") })
        assertEquals(0, decision.outboundCount)
    }

    @Test
    fun dryRunTransportNeverCountsOutbound() {
        val approval = approval()
        val decision = ControlledLiveCommercialMachine.evaluateTransportSend(
            approval = approval,
            request = TransportSendRequest(
                approvalId = approval.approvalId,
                payloadHash = approval.payloadHash,
                recipient = approval.exactRecipient,
                channel = approval.exactChannel,
                subject = approval.exactSubject,
                body = BODY,
                mode = CommercialTransportMode.DRY_RUN,
            ),
            flags = CommercialFeatureFlags(),
            preconditions = cleanPreconditions(),
            usedPayloadHashes = emptySet(),
            nowIso = NOW,
        )

        assertTrue(decision.allowed)
        assertEquals("TRANSPORT_DRY_RUN_PASS", decision.status)
        assertEquals(0, decision.outboundCount)
    }

    @Test
    fun replyMonitorIsReadOnlyAndCreatesSuppressionForOptOut() {
        val reply = ControlledLiveCommercialMachine.classifyReplyReadOnly(
            replyId = "reply_1",
            leadId = "lead_1",
            rawText = "Не пишите нам больше, пожалуйста.",
        )

        assertEquals(ReplyClass.UNSUBSCRIBE, reply.replyClass)
        assertTrue(reply.readOnly)
        assertTrue(reply.suppressionEntryRequired)
        assertTrue(reply.futureSendBlocked)
    }

    @Test
    fun crmWriteRequiresGateAndIdempotency() {
        val duplicate = ControlledLiveCommercialMachine.evaluateCrmWrite(
            request = crmWrite(ownerApproved = true),
            flags = CommercialFeatureFlags(
                crmWrite = CommercialFeatureMode.OWNER_APPROVAL_REQUIRED,
                productionDbWrite = CommercialFeatureMode.OWNER_APPROVAL_REQUIRED,
            ),
            stopEnabled = false,
            usedIdempotencyKeys = setOf("idem_1"),
        )
        val approved = ControlledLiveCommercialMachine.evaluateCrmWrite(
            request = crmWrite(ownerApproved = true),
            flags = CommercialFeatureFlags(
                crmWrite = CommercialFeatureMode.OWNER_APPROVAL_REQUIRED,
                productionDbWrite = CommercialFeatureMode.OWNER_APPROVAL_REQUIRED,
            ),
            stopEnabled = false,
            usedIdempotencyKeys = emptySet(),
        )

        assertFalse(duplicate.allowed)
        assertTrue(duplicate.reasons.any { it.contains("idempotency") })
        assertTrue(approved.allowed)
        assertEquals("CRM_WRITE_APPROVED", approved.status)
    }

    @Test
    fun paymentDraftDoesNotEnableLivePayment() {
        val blocked = ControlledLiveCommercialMachine.evaluatePaymentDraft(
            payload = payment(ownerConfirmed = true),
            flags = ControlledLiveCommercialMachine.initialFlags,
            stopEnabled = false,
            repliesReceived = 1,
        )
        val draftReady = ControlledLiveCommercialMachine.evaluatePaymentDraft(
            payload = payment(ownerConfirmed = true),
            flags = CommercialFeatureFlags(paymentDraft = CommercialFeatureMode.OWNER_APPROVAL_REQUIRED),
            stopEnabled = false,
            repliesReceived = 1,
        )

        assertFalse(blocked.allowed)
        assertTrue(blocked.reasons.any { it.contains("оплаты выключен") })
        assertTrue(draftReady.allowed)
        assertEquals("PAYMENT_DRAFT_READY", draftReady.status)
        assertTrue(draftReady.auditRecordPreview.any { it.contains("payment_live=false") })
    }

    @Test
    fun limitedAutonomyBlockedUntilOneHundredManualApprovedSends() {
        val decision = ControlledLiveCommercialMachine.limitedAutonomyReady(
            AutonomyMetrics(
                manualApprovedSends = 99,
                unauthorizedSends = 0,
                duplicateSends = 0,
                suppressionBypass = 0,
                contactCompletenessPercent = 100,
                qaPassRatePercent = 100,
                replyMonitorPass = true,
                dailyCapPass = true,
                stopRehearsalPass = true,
                rollbackRehearsalPass = true,
                ownerApprovalLogPercent = 100,
                complaintRateBelowThreshold = true,
                bounceRateBelowThreshold = true,
            ),
        )

        assertFalse(decision.allowed)
        assertEquals("LIMITED_AUTONOMY_NOT_READY", decision.status)
        assertTrue(decision.reasons.any { it.contains("100") })
    }

    private fun approval(body: String = BODY) = ControlledLiveCommercialMachine.createSendApprovalPayload(
        approvalId = "approval_1",
        leadId = "lead_1",
        recipient = "owner-approved@example.test",
        channel = "email",
        subject = "Короткий внешний мини-разбор",
        body = body,
        riskLevel = "низкие",
        ownerId = "owner_local",
        expiresAt = FUTURE,
    )

    private fun lead(suppression: String = "локальный список запретов не сработал") = LiveCommercialLead(
        leadId = "lead_1",
        companyName = "Example",
        website = "https://example.test",
        niche = "B2B",
        region = "Москва",
        source = "сайт",
        sourceUrl = "https://example.test",
        confidence = "высокая",
        collectedAt = NOW,
        contactChannel = "email",
        contactValue = "owner-approved@example.test",
        contactSourceUrl = "https://example.test/contacts",
        contactConfidence = "высокая",
        suppressionStatus = suppression,
        priorOutreachStatus = "история проверена, прежних обращений не найдено",
        ownerDecision = "send",
    )

    private fun cleanPreconditions(
        stop: Boolean = false,
        suppression: String = "локальный список запретов не сработал",
        overrideAudit: OwnerOverrideAudit? = null,
        dailyCap: Int = 1,
        sentToday: Int = 0,
    ) = SendPreconditions(
        qaPassed = true,
        ownerOverride = overrideAudit,
        suppressionStatus = suppression,
        priorOutreachStatus = "история проверена, прежних обращений не найдено",
        stopEnabled = stop,
        dailyCap = dailyCap,
        sentToday = sentToday,
    )

    private fun crmWrite(ownerApproved: Boolean) = CrmWriteRequest(
        entity = "outreach_events",
        sourceEventId = "event_1",
        idempotencyKey = "idem_1",
        actor = "owner",
        createdAt = NOW,
        payloadHash = "hash_1",
        approvalId = "approval_1",
        previousState = "READY_FOR_SEND",
        newState = "SENT",
        rollbackHint = "mark event void and restore previous lead state",
        ownerApproved = ownerApproved,
    )

    private fun payment(ownerConfirmed: Boolean) = PaymentApprovalPayload(
        client = "Example",
        dealId = "deal_1",
        amount = 10000,
        currency = "RUB",
        product = "Mini Audit",
        invoiceId = "invoice_1",
        paymentProvider = "manual",
        paymentLinkHash = "payment_hash_1",
        expiry = FUTURE,
        ownerConfirmation = ownerConfirmed,
    )

    companion object {
        private const val NOW = "2026-06-29T10:00:00Z"
        private const val FUTURE = "2026-06-29T11:00:00Z"
        private const val BODY = "Здравствуйте. Проверил сайт, предлагаю короткий разбор."
    }
}
