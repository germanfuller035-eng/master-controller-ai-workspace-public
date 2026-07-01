package ru.dmitry.matercontroller

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.dmitry.matercontroller.feature.sales.ManualLeadInput
import ru.dmitry.matercontroller.feature.sales.OutboundHistoryEvidence
import ru.dmitry.matercontroller.feature.sales.SalesFunnelStatus
import ru.dmitry.matercontroller.feature.sales.SendReadinessStatus
import ru.dmitry.matercontroller.feature.sales.WorkingSalesMvpEngine
import ru.dmitry.matercontroller.feature.sales.WorkingSalesSiteAnalyzer

class WorkingSalesMvpEngineTest {
    @Test
    fun safeExampleBuildsCompleteNoSendFlow() {
        val result = WorkingSalesMvpEngine.build(WorkingSalesMvpEngine.safeExample)

        assertTrue(result.leadStatus.contains("не отправлено"))
        assertTrue(result.leadStatus.contains("рабочая база не записана"))
        assertTrue(result.qualification.fitScore >= 55)
        assertEquals("прошло", result.qaReview.status)
        assertEquals("PASS", result.outboundHistoryGate.status)
        assertTrue(result.productStrategy.productFitReason.isNotBlank())
        assertTrue(result.offerDraft.ownerApprovalRequiredBeforeSend)
        assertFalse(result.offerDraft.scope.isEmpty())
        assertTrue(result.roiAssumptions.baseline.contains("не предполагает выручку"))
        assertEquals("прошло", result.firstTouchDraft.qualityStatus)
        assertTrue(result.firstTouchDraft.subject.isNotBlank())
        assertTrue(result.firstTouchDraft.angleExplanation.contains("мини-разбор"))
        assertTrue(result.firstTouchDraft.basedOnFacts.isNotEmpty())
        assertTrue(result.firstTouchDraft.text.contains("Меня зовут Дмитрий"))
        assertTrue(result.firstTouchDraft.text.contains("первого касания"))
        assertTrue(result.firstTouchDraft.text.contains("Не утверждаю"))
        assertTrue(result.firstTouchDraft.text.contains("3-5"))
        assertTrue(result.firstTouchDraft.text.contains("кому у вас удобнее передать"))
        assertFalse(result.firstTouchDraft.text.contains("публичное присутствие", ignoreCase = true))
        assertFalse(result.firstTouchDraft.text.contains("первый ответ", ignoreCase = true))
        assertFalse(result.firstTouchDraft.text.contains("ROI", ignoreCase = true))
        assertFalse(result.firstTouchDraft.text.contains("конверсия", ignoreCase = true))
        assertFalse(result.firstTouchDraft.text.contains("трафик", ignoreCase = true))
        assertTrue(result.digitalPresenceDraft.unsupportedClaims.isEmpty())
        assertTrue(result.qaReview.allowsManualPacket)
        assertTrue(result.manualSendReadiness.canCreatePacket)
        assertTrue(result.manualSendReadiness.status.contains("отправочного пакета"))
        assertEquals(SalesFunnelStatus.READY_FOR_SEND, result.funnelStatus.status)
        assertEquals(0, result.autoSendDryRun.outboundCount)
        assertTrue(result.ownerApprovedBatch.ready)
        assertEquals("ONLY_WEBSITE", result.leadgenPipeline.ownerInputRequired)
        assertTrue(result.leadgenPipeline.siteAnalysis.normalizedDomain.isNotBlank())
        assertTrue(result.manualSendReadiness.blockedActions.any { it.contains("Автоматическая отправка без владельца") })
        assertTrue(result.manualSendReadiness.blockedActions.contains("Запрос платежа"))
        assertTrue(result.manualSendReadiness.blockedActions.contains("Запись в рабочую базу без отдельного разрешения"))
        assertTrue(result.manualSendReadiness.auditRecordPreview.any { it.contains("запись в рабочую базу только после отдельного разрешения") })
    }

    @Test
    fun funnelStatusModelHasCanonicalSalesStates() {
        assertEquals(
            listOf(
                "NEW",
                "ENRICHING",
                "NEEDS_REVIEW",
                "QUALIFIED",
                "DRAFT_READY",
                "QA_FAILED",
                "SUPPRESSED",
                "READY_FOR_OWNER",
                "READY_FOR_SEND",
                "SENT",
                "BOUNCED",
                "REPLIED",
                "HOLD",
                "REJECTED",
            ),
            SalesFunnelStatus.values().map { it.name },
        )
    }

    @Test
    fun readinessModelHasWebsiteLeadgenStates() {
        assertEquals(
            listOf(
                "READY_FOR_DRAFT",
                "NEEDS_CONTACT",
                "NEEDS_REVIEW",
                "SUPPRESSED",
                "READY_FOR_PACKET",
                "READY_FOR_SEND_DRY_RUN",
                "READY_FOR_OWNER_SEND",
                "READY_FOR_LIMITED_AUTO_SEND",
            ),
            SendReadinessStatus.values().map { it.name },
        )
    }

    @Test
    fun websiteOnlyInputBuildsLeadAnalysisWithoutOwnerFields() {
        val input = WorkingSalesMvpEngine.analyzeWebsite("https://acme-beton.example.test")
        val result = WorkingSalesMvpEngine.build(input)

        assertEquals("acme-beton.example.test", input.websiteOrDomain)
        assertTrue(input.companyName.isNotBlank())
        assertTrue(input.contact.isBlank())
        assertTrue(input.sourceUrl.startsWith("https://"))
        assertTrue(input.evidence.contains("Домен нормализован"))
        assertEquals("ONLY_WEBSITE", result.leadgenPipeline.ownerInputRequired)
        assertEquals("acme-beton.example.test", result.leadgenPipeline.siteAnalysis.normalizedDomain)
        assertTrue(result.leadgenPipeline.siteAnalysis.productsServices.isEmpty())
        assertTrue(result.leadgenPipeline.siteAnalysis.contactSourceUrl.isBlank())
        assertEquals("низкая", result.leadgenPipeline.siteAnalysis.sourceConfidence)
        assertTrue(result.qualification.missingData.contains("контакт"))
        assertTrue(result.firstTouchDraft.subject.isNotBlank())
        assertFalse(result.qaReview.allowsManualPacket)
        assertEquals(0, result.autoSendDryRun.outboundCount)
    }

    @Test
    fun blankWebsiteNeedsReviewAndDoesNotInventContact() {
        val result = WorkingSalesMvpEngine.buildFromWebsite("")

        assertEquals("ONLY_WEBSITE", result.leadgenPipeline.ownerInputRequired)
        assertEquals(SendReadinessStatus.NEEDS_REVIEW, result.leadgenPipeline.readiness)
        assertTrue(result.leadgenPipeline.siteAnalysis.normalizedDomain.isBlank())
        assertTrue(result.qualification.missingData.contains("сайт / домен"))
        assertFalse(result.manualSendReadiness.canCreatePacket)
        assertEquals(0, result.autoSendDryRun.outboundCount)
    }

    @Test
    fun fetchedHtmlUsesPageFactsInsteadOfGenericProductTemplate() {
        val html = """
            <html>
              <head><title>ООО «Синтетическая Сфера» Строительная компания</title></head>
              <body>
                <h1>Демонтаж зданий и сооружений</h1>
                <h2>Разработка котлованов</h2>
                <h2>Аренда техники</h2>
                <a href="/contacts">Контакты</a>
              </body>
            </html>
        """.trimIndent()
        val input = WorkingSalesSiteAnalyzer.analyzeFetchedHtml(
            inputSite = "https://synthetic-builder.example.test/",
            finalUrl = "https://synthetic-builder.example.test/",
            html = html,
        )
        val result = WorkingSalesMvpEngine.build(input)

        assertTrue(input.companyName.contains("Синтетическая Сфера"))
        assertTrue(input.productsServices.contains("Демонтаж зданий и сооружений"))
        assertTrue(input.productsServices.contains("Разработка котлованов"))
        assertTrue(input.productsServices.contains("Аренда техники"))
        assertFalse(input.productsServices.contains("услуги"))
        assertTrue(input.contactSourceUrl.endsWith("/contacts"))
        assertTrue(result.leadgenPipeline.siteAnalysis.productsServices.contains("Аренда техники"))
        assertEquals(0, result.autoSendDryRun.outboundCount)
    }

    @Test
    fun strongCleanLeadReachesDryRunCandidateWithoutOutbound() {
        val result = WorkingSalesMvpEngine.build(strongCleanLead())

        assertEquals(SalesFunnelStatus.READY_FOR_SEND, result.funnelStatus.status)
        assertTrue(result.manualSendReadiness.canCreatePacket)
        assertEquals("прошло", result.qaReview.status)
        assertEquals("PASS", result.outboundHistoryGate.status)
        assertTrue(result.autoSendDryRun.wouldSend)
        assertEquals(0, result.autoSendDryRun.outboundCount)
        assertTrue(result.autoSendDryRun.candidateExplanation.any { it.contains("реальная отправка не выполняется") })
    }

    @Test
    fun doNotContactSuppressesLeadAndBlocksDryRun() {
        val result = WorkingSalesMvpEngine.build(strongCleanLead().copy(doNotContact = true))

        assertEquals(SalesFunnelStatus.SUPPRESSED, result.funnelStatus.status)
        assertFalse(result.manualSendReadiness.canCreatePacket)
        assertFalse(result.autoSendDryRun.wouldSend)
        assertEquals(0, result.autoSendDryRun.outboundCount)
        assertTrue(result.manualSendReadiness.blockingReasons.any { it.contains("не контактировать") })
    }

    @Test
    fun productStrategyIsNotAlwaysMiniAudit() {
        val leadSystem = WorkingSalesMvpEngine.build(
            ManualLeadInput(
                companyName = "Synthetic Lead Capture Co",
                websiteOrDomain = "lead-capture.example.test",
                contact = "manual form",
                problemHints = "lead capture form is unclear and website conversion is weak",
                notes = "synthetic",
            ),
        )

        assertEquals("Система лидов", leadSystem.productStrategy.product)
    }

    @Test
    fun qaBlocksFalseSuccessLanguage() {
        val result = WorkingSalesMvpEngine.build(
            ManualLeadInput(
                companyName = "Synthetic Risk Co",
                websiteOrDomain = "risk.example.test",
                contact = "manual",
                problemHints = "guaranteed revenue and send now",
                notes = "synthetic",
            ),
        )

        assertEquals("заблокировано", result.qaReview.status)
        assertTrue(result.qaReview.blockers.any { it.contains("ложный успех") })
        assertTrue(result.manualSendReadiness.status.contains("заблокировано"))
    }

    @Test
    fun editedDraftIsRecheckedByQa() {
        val result = WorkingSalesMvpEngine.build(
            WorkingSalesMvpEngine.safeExample.copy(
                draftTextOverride = "Срочно гарантируем рост продаж на 30%.",
            ),
        )

        assertEquals("нужно исправить", result.firstTouchDraft.qualityStatus)
        assertTrue(result.qaReview.blockers.any { it.contains("текст первого касания") })
        assertFalse(result.manualSendReadiness.canCreatePacket)
    }

    @Test
    fun qaOverrideAllowsPacketButKeepsAuditFlag() {
        val result = WorkingSalesMvpEngine.build(
            WorkingSalesMvpEngine.safeExample.copy(
                draftTextOverride = "Срочно гарантируем рост продаж на 30%.",
                qaOverrideReason = "Владелец вручную перепроверит рискованную формулировку перед действием.",
                qaOverrideConfirmed = true,
            ),
        )

        assertEquals("override владельца", result.qaReview.status)
        assertTrue(result.qaReview.overrideApplied)
        assertTrue(result.manualSendReadiness.canCreatePacket)
        assertTrue(result.manualSendReadiness.auditRecordPreview.any { it.contains("контроль=override владельца") })
    }

    private fun strongCleanLead() = ManualLeadInput(
        companyName = "Synthetic Ready Co",
        websiteOrDomain = "ready.example.test",
        contact = "owner@example.test",
        problemHints = "форма заявки теряет лиды, нет ответа, ручная обработка контактов",
        notes = "ручная проверка владельца",
        niche = "B2B производство",
        region = "Москва",
        sourceUrl = "https://example.test/source",
        evidence = "видимая форма контакта, неясный призыв к действию, ручной ответ",
        leadSource = "публичный сайт",
        sourceConfidence = "высокая",
        collectedAt = "2026-06-28",
        contactChannel = "email",
        outboundHistory = OutboundHistoryEvidence.clearForNewLead(),
    )
}
