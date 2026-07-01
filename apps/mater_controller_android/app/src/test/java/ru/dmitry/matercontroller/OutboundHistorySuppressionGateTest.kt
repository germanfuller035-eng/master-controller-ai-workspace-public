package ru.dmitry.matercontroller

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.dmitry.matercontroller.feature.sales.ManualLeadInput
import ru.dmitry.matercontroller.feature.sales.OutboundHistoryEvidence
import ru.dmitry.matercontroller.feature.sales.WorkingSalesMvpEngine

class OutboundHistorySuppressionGateTest {
    @Test
    fun newLeadWithClearHistoryCanProceedToOwnerReview() {
        val result = WorkingSalesMvpEngine.build(input(OutboundHistoryEvidence.clearForNewLead()))

        assertEquals("PASS", result.outboundHistoryGate.status)
        assertEquals("прошло", result.qaReview.status)
    }

    @Test
    fun sameDomainEmailedBeforeNoReplyCannotBeSendNow() {
        val result = WorkingSalesMvpEngine.build(
            input(
                OutboundHistoryEvidence(
                    outboundHistoryChecked = true,
                    suppressionChecked = true,
                    duplicateContactChecked = true,
                    priorReplyChecked = true,
                    priorOutreachExists = true,
                    noReplyAfterPriorOutreach = true,
                ),
            ),
        )

        assertEquals("NEEDS_OWNER_OVERRIDE", result.outboundHistoryGate.status)
        assertTrue(result.qaReview.blockers.any { it.contains("истории контактов") })
    }

    @Test
    fun ownerApprovedRecontactCanProceedToOwnerConfirmationOnly() {
        val result = WorkingSalesMvpEngine.build(
            input(
                OutboundHistoryEvidence(
                    outboundHistoryChecked = true,
                    suppressionChecked = true,
                    duplicateContactChecked = true,
                    priorReplyChecked = true,
                    priorOutreachExists = true,
                    noReplyAfterPriorOutreach = true,
                    ownerRecontactApproved = true,
                    ownerOverrideReason = "Владелец подтвердил причину повторного ручного обращения.",
                    ownerOverrideConfirmed = true,
                ),
            ),
        )

        assertEquals("PASS_OWNER_OVERRIDE", result.outboundHistoryGate.status)
        assertEquals("прошло", result.qaReview.status)
        assertTrue(result.manualSendReadiness.status.contains("отправочного пакета"))
        assertTrue(result.manualSendReadiness.blockedActions.any { it.contains("Автоматическая отправка без владельца") })
    }

    @Test
    fun sameContactEmailedTwiceIsSuppressed() {
        val result = WorkingSalesMvpEngine.build(input(clearHistory(repeatedContact = true)))

        assertEquals("NEEDS_OWNER_OVERRIDE", result.outboundHistoryGate.status)
        assertTrue(result.manualSendReadiness.status.contains("заблокировано"))
    }

    @Test
    fun suppressionOverrideRequiresReasonAndAuditConfirmation() {
        val withoutAudit = WorkingSalesMvpEngine.build(
            input(
                clearHistory(repeatedContact = true).copy(
                    ownerRecontactApproved = true,
                    ownerOverrideReason = "ok",
                    ownerOverrideConfirmed = true,
                ),
            ),
        )
        assertEquals("NEEDS_OWNER_OVERRIDE", withoutAudit.outboundHistoryGate.status)

        val withAudit = WorkingSalesMvpEngine.build(
            input(
                clearHistory(repeatedContact = true).copy(
                    ownerRecontactApproved = true,
                    ownerOverrideReason = "Владелец подтвердил исключение после сверки дубликата.",
                    ownerOverrideConfirmed = true,
                ),
            ),
        )
        assertEquals("PASS_OWNER_OVERRIDE", withAudit.outboundHistoryGate.status)
        assertTrue(withAudit.manualSendReadiness.canCreatePacket)
    }

    @Test
    fun priorReplyUsesExistingThreadOnly() {
        val result = WorkingSalesMvpEngine.build(input(clearHistory(priorReplyExists = true)))

        assertEquals("FOLLOW_UP_ONLY_EXISTING_THREAD", result.outboundHistoryGate.status)
        assertTrue(result.outboundHistoryGate.recommendation.contains("существующей ветке"))
    }

    @Test
    fun selfTestIsNotARealLead() {
        val result = WorkingSalesMvpEngine.build(input(clearHistory(selfTestOnly = true)))

        assertEquals("NOT_A_REAL_LEAD", result.outboundHistoryGate.status)
    }

    @Test
    fun previewOnlyIsNotCountedAsSent() {
        val result = WorkingSalesMvpEngine.build(input(clearHistory(previewOnlyNotSent = true)))

        assertEquals("PASS_PREVIEW_ONLY_NOT_SENT", result.outboundHistoryGate.status)
        assertEquals("прошло", result.qaReview.status)
    }

    @Test
    fun missingHistoryDataRequiresOwnerHistoryReview() {
        val result = WorkingSalesMvpEngine.build(input(OutboundHistoryEvidence.notChecked()))

        assertEquals("NEEDS_OWNER_HISTORY_REVIEW", result.outboundHistoryGate.status)
        assertTrue(result.outboundHistoryGate.blockers.any { it.contains("не проверена история") })
        assertTrue(result.qaReview.blockers.any { it.contains("истории контактов") })
    }

    private fun input(history: OutboundHistoryEvidence) = ManualLeadInput(
        companyName = "Synthetic B2B Co",
        websiteOrDomain = "synthetic-b2b.example.test",
        contact = "manual public contact",
        problemHints = "B2B manufacturing website with manual request flow",
        notes = "synthetic no-send unit test",
        outboundHistory = history,
    )

    private fun clearHistory(
        repeatedContact: Boolean = false,
        priorReplyExists: Boolean = false,
        selfTestOnly: Boolean = false,
        previewOnlyNotSent: Boolean = false,
    ) = OutboundHistoryEvidence.clearForNewLead().copy(
        repeatedContact = repeatedContact,
        priorReplyExists = priorReplyExists,
        selfTestOnly = selfTestOnly,
        previewOnlyNotSent = previewOnlyNotSent,
    )
}
