package ru.dmitry.matercontroller.feature.sales

data class ManualLeadInput(
    val companyName: String,
    val websiteOrDomain: String,
    val contact: String,
    val problemHints: String,
    val notes: String,
    val niche: String = "",
    val region: String = "",
    val productsServices: List<String> = emptyList(),
    val sourceUrl: String = "",
    val contactSourceUrl: String = "",
    val evidence: String = "",
    val doNotContact: Boolean = false,
    val leadSource: String = "ручной ввод владельца",
    val sourceConfidence: String = "не указана",
    val collectedAt: String = "не указана",
    val contactChannel: String = "не указан",
    val outreachHistorySummary: String = "",
    val suppressionStatus: String = "",
    val draftTextOverride: String = "",
    val qaOverrideReason: String = "",
    val qaOverrideConfirmed: Boolean = false,
    val outboundHistory: OutboundHistoryEvidence = OutboundHistoryEvidence.notChecked(),
)

data class OutboundHistoryEvidence(
    val outboundHistoryChecked: Boolean,
    val suppressionChecked: Boolean,
    val duplicateContactChecked: Boolean,
    val priorReplyChecked: Boolean,
    val priorOutreachExists: Boolean = false,
    val noReplyAfterPriorOutreach: Boolean = false,
    val repeatedContact: Boolean = false,
    val priorReplyExists: Boolean = false,
    val bounceHistoryExists: Boolean = false,
    val doNotContact: Boolean = false,
    val ownerManualBan: Boolean = false,
    val selfTestOnly: Boolean = false,
    val previewOnlyNotSent: Boolean = false,
    val ownerRecontactApproved: Boolean = false,
    val ownerOverrideReason: String = "",
    val ownerOverrideConfirmed: Boolean = false,
) {
    companion object {
        fun notChecked() = OutboundHistoryEvidence(
            outboundHistoryChecked = false,
            suppressionChecked = false,
            duplicateContactChecked = false,
            priorReplyChecked = false,
        )

        fun clearForNewLead() = OutboundHistoryEvidence(
            outboundHistoryChecked = true,
            suppressionChecked = true,
            duplicateContactChecked = true,
            priorReplyChecked = true,
        )
    }
}

data class OutboundHistoryGateResult(
    val status: String,
    val recommendation: String,
    val checks: List<String>,
    val blockers: List<String>,
)

data class QualificationResult(
    val fitScore: Int,
    val readiness: String,
    val missingData: List<String>,
    val reason: String,
)

data class DigitalPresenceDraft(
    val observedIssues: List<String>,
    val evidenceSource: String,
    val assumptions: List<String>,
    val unsupportedClaims: List<String>,
)

data class ProductStrategyResult(
    val product: String,
    val productFitReason: String,
)

data class OfferDraftResult(
    val title: String,
    val scope: List<String>,
    val expectedValue: String,
    val assumptions: List<String>,
    val risk: String,
    val nextStep: String,
    val ownerApprovalRequiredBeforeSend: Boolean,
)

data class RoiAssumptions(
    val baseline: String,
    val upliftAssumption: String,
    val paybackLogic: String,
    val confidence: String,
)

data class FirstTouchDraftResult(
    val subject: String,
    val text: String,
    val angleExplanation: String,
    val basedOnFacts: List<String>,
    val qualityStatus: String,
    val risks: List<String>,
)

data class QaReviewResult(
    val status: String,
    val blockers: List<String>,
    val checks: List<String>,
    val allowsManualPacket: Boolean,
    val overrideApplied: Boolean,
)

data class ManualSendReadiness(
    val status: String,
    val approvalPacketTitle: String,
    val packetItems: List<String>,
    val blockedActions: List<String>,
    val blockingReasons: List<String>,
    val fixActions: List<String>,
    val auditRecordPreview: List<String>,
    val canCreatePacket: Boolean,
)

enum class SalesFunnelStatus {
    NEW,
    ENRICHING,
    NEEDS_REVIEW,
    QUALIFIED,
    DRAFT_READY,
    QA_FAILED,
    SUPPRESSED,
    READY_FOR_OWNER,
    READY_FOR_SEND,
    SENT,
    BOUNCED,
    REPLIED,
    HOLD,
    REJECTED,
}

data class FunnelStatusResult(
    val status: SalesFunnelStatus,
    val label: String,
    val explanation: String,
    val nextStep: String,
)

data class LeadScoringResult(
    val fitScore: Int,
    val urgencyScore: Int,
    val contactConfidence: Int,
    val websitePainSignal: Int,
    val nicheMatch: Int,
    val riskScore: Int,
    val totalScore: Int,
    val whySelected: List<String>,
)

data class AutoSendDryRunResult(
    val mode: String,
    val wouldSend: Boolean,
    val outboundCount: Int,
    val candidateExplanation: List<String>,
    val blockedReasons: List<String>,
)

data class OwnerApprovedBatchResult(
    val ready: Boolean,
    val approvedCount: Int,
    val batchSizeRange: String,
    val requirements: List<String>,
)

enum class SendReadinessStatus {
    READY_FOR_DRAFT,
    NEEDS_CONTACT,
    NEEDS_REVIEW,
    SUPPRESSED,
    READY_FOR_PACKET,
    READY_FOR_SEND_DRY_RUN,
    READY_FOR_OWNER_SEND,
    READY_FOR_LIMITED_AUTO_SEND,
}

data class SiteLeadAnalysisResult(
    val inputSite: String,
    val normalizedDomain: String,
    val normalizedUrl: String,
    val companyName: String,
    val niche: String,
    val cityOrRegion: String,
    val productsServices: List<String>,
    val contactChannel: String,
    val contactSourceUrl: String,
    val collectedAt: String,
    val sourceConfidence: String,
    val evidenceSnippets: List<String>,
    val priorOutreachStatus: String,
    val suppressionStatus: String,
    val recommendedFirstTouchAngle: String,
    val toolNotes: List<String>,
    val needsReview: Boolean,
)

data class LeadgenPipelineResult(
    val readiness: SendReadinessStatus,
    val ownerInputRequired: String,
    val siteAnalysis: SiteLeadAnalysisResult,
    val nextPrimaryAction: String,
    val missingForSend: List<String>,
    val auditEvents: List<String>,
)

data class WorkingSalesMvpResult(
    val leadStatus: String,
    val funnelStatus: FunnelStatusResult,
    val leadgenPipeline: LeadgenPipelineResult,
    val scoring: LeadScoringResult,
    val qualification: QualificationResult,
    val digitalPresenceDraft: DigitalPresenceDraft,
    val productStrategy: ProductStrategyResult,
    val offerDraft: OfferDraftResult,
    val roiAssumptions: RoiAssumptions,
    val firstTouchDraft: FirstTouchDraftResult,
    val outboundHistoryGate: OutboundHistoryGateResult,
    val qaReview: QaReviewResult,
    val manualSendReadiness: ManualSendReadiness,
    val autoSendDryRun: AutoSendDryRunResult,
    val ownerApprovedBatch: OwnerApprovedBatchResult,
    val nextOwnerAction: String,
)

object WorkingSalesMvpEngine {
    val emptyWebsiteInput = ManualLeadInput(
        companyName = "",
        websiteOrDomain = "",
        contact = "",
        problemHints = "",
        notes = "Введите сайт компании и нажмите «Разобрать». Остальные поля система подготовит сама.",
        niche = "",
        region = "",
        productsServices = emptyList(),
        sourceUrl = "",
        contactSourceUrl = "",
        evidence = "",
        leadSource = "сайт ещё не введён",
        sourceConfidence = "низкая",
        collectedAt = "",
        contactChannel = "",
        outreachHistorySummary = "",
        suppressionStatus = "",
        outboundHistory = OutboundHistoryEvidence.notChecked(),
    )

    val safeExample = ManualLeadInput(
        companyName = "KGBI 23 Example",
        websiteOrDomain = "kgbi23.example.test",
        contact = "owner@example.test",
        problemHints = "на сайте найден интерес к расчёту заявки; нужен короткий ручной первый контакт",
        notes = "Синтетический fixture для no-send проверок. Не использовать как реальные контактные данные.",
        niche = "строительство / материалы",
        region = "Россия, регион уточняется",
        productsServices = listOf("строительные материалы", "расчёт заявки", "консультация"),
        sourceUrl = "https://kgbi23.example.test",
        contactSourceUrl = "https://kgbi23.example.test/contacts",
        evidence = "Синтетический fixture: домен .example.test; продукт и контакт заданы только для локальных тестов",
        leadSource = "синтетический локальный fixture",
        sourceConfidence = "высокая",
        collectedAt = "сегодня, локально",
        contactChannel = "email из synthetic fixture",
        outreachHistorySummary = "история проверена, прежних обращений не найдено",
        suppressionStatus = "локальный список запретов не сработал",
        outboundHistory = OutboundHistoryEvidence.clearForNewLead(),
    )

    fun buildFromWebsite(
        site: String,
        history: OutboundHistoryEvidence = OutboundHistoryEvidence.clearForNewLead(),
    ): WorkingSalesMvpResult = build(analyzeWebsite(site, history))

    fun analyzeWebsite(
        site: String,
        history: OutboundHistoryEvidence = OutboundHistoryEvidence.clearForNewLead(),
    ): ManualLeadInput {
        val domain = normalizeDomain(site)
        if (domain.isBlank()) return emptyWebsiteInput.copy(outboundHistory = history)

        val url = normalizedUrl(domain)
        val niche = inferNiche(domain)
        val region = inferRegion(domain)
        val company = companyNameFromDomain(domain)
        val evidenceSnippets = listOf(
            "Домен нормализован: $domain",
            "Факты с сайта ещё не извлечены",
            "Услуги и контактный путь требуют проверки владельцем",
        )
        return ManualLeadInput(
            companyName = company,
            websiteOrDomain = domain,
            contact = "",
            problemHints = "сайт требует внешнего разбора: направление, регион, контактный путь, первый шаг обращения и ручная обработка ответа",
            notes = "Система подготовила только базовую карточку из сайта. Услуги, контакт и контактную страницу нужно подтвердить вручную или получить из фактического HTML-разбора.",
            niche = niche,
            region = region,
            productsServices = emptyList(),
            sourceUrl = url,
            contactSourceUrl = "",
            evidence = evidenceSnippets.joinToString("; "),
            doNotContact = false,
            leadSource = "сайт, введённый владельцем",
            sourceConfidence = "низкая",
            collectedAt = "сегодня, локально",
            contactChannel = "",
            outreachHistorySummary = "история обращений не найдена в локальной карточке",
            suppressionStatus = "локальный список запретов не сработал",
            outboundHistory = history,
        )
    }

    fun build(rawInput: ManualLeadInput): WorkingSalesMvpResult {
        val input = enrichInputFromWebsite(rawInput)
        val normalizedHints = input.problemHints.lowercase()
        val siteAnalysis = siteAnalysisFromInput(input)
        val missingData = missingData(input)
        val score = fitScore(input, missingData)
        val qualification = QualificationResult(
            fitScore = score,
            readiness = when {
                score >= 80 -> "готово к проверке владельцем"
                score >= 55 -> "пригодный ручной черновик"
                else -> "нужно больше ручных данных"
            },
            missingData = missingData,
            reason = qualificationReason(input, missingData),
        )
        val audit = digitalPresenceDraft(input, normalizedHints)
        val product = chooseProduct(normalizedHints)
        val strategy = ProductStrategyResult(
            product = product,
            productFitReason = productFitReason(product, normalizedHints),
        )
        val roi = RoiAssumptions(
            baseline = "База вводится владельцем; приложение не предполагает выручку.",
            upliftAssumption = "Осторожная ценность считается от меньшего числа пропущенных лидов и более ясного следующего шага, а не от гарантированных продаж.",
            paybackLogic = "Владелец сравнивает сэкономленное ручное время и первые квалифицированные возможности с объёмом черновика.",
            confidence = if (missingData.isEmpty()) "средняя ручная уверенность" else "низкая до заполнения недостающих полей",
        )
        val offer = OfferDraftResult(
            title = "Контур: $product для ${input.companyName.ifBlank { "ручной лид" }}",
            scope = offerScope(product),
            expectedValue = "Только черновая ценность: понятнее захват лида, быстрее ответ и измеримый первый результат.",
            assumptions = audit.assumptions + roi.upliftAssumption,
            risk = "Нет доказательств живого трафика, выручки или разрешения на контакт, пока владелец не проверит вручную.",
            nextStep = "Владелец проверяет черновик, правит факты и отдельно решает, разрешён ли будущий контроль отправки.",
            ownerApprovalRequiredBeforeSend = true,
        )
        val firstTouch = firstTouchDraft(normalizedHints, input.draftTextOverride)
        val outboundHistoryGate = outboundHistoryGate(input.outboundHistory)
        val qa = qaReview(input, audit, offer, firstTouch, outboundHistoryGate)
        val scoring = leadScoring(input, qualification, outboundHistoryGate, qa)
        val readiness = manualSendReadiness(input, qualification, scoring, audit, strategy, offer, roi, qa, outboundHistoryGate)
        val funnelStatus = funnelStatus(input, missingData, scoring, firstTouch, outboundHistoryGate, qa, readiness)
        val dryRun = autoSendDryRun(funnelStatus, scoring, qa, readiness, outboundHistoryGate)
        val batch = ownerApprovedBatch(dryRun)
        val pipeline = leadgenPipeline(input, siteAnalysis, scoring, qa, outboundHistoryGate, readiness, dryRun)
        return WorkingSalesMvpResult(
            leadStatus = if (readiness.canCreatePacket) {
                "готово к ручному подтверждению владельцем, не отправлено, рабочая база не записана"
            } else {
                "ручной черновик, не отправлено, рабочая база не записана"
            },
            funnelStatus = funnelStatus,
            leadgenPipeline = pipeline,
            scoring = scoring,
            qualification = qualification,
            digitalPresenceDraft = audit,
            productStrategy = strategy,
            offerDraft = offer,
            roiAssumptions = roi,
            firstTouchDraft = firstTouch,
            outboundHistoryGate = outboundHistoryGate,
            qaReview = qa,
            manualSendReadiness = readiness,
            autoSendDryRun = dryRun,
            ownerApprovedBatch = batch,
            nextOwnerAction = if (readiness.canCreatePacket) {
                "Проверить финальный текст на телефоне и создать отправочный пакет; фактическую отправку выполняет только владелец."
            } else {
                "Сначала закрыть причины блокировки: данные лида, историю контактов, текст, QA или исключение владельца."
            },
        )
    }

    private fun enrichInputFromWebsite(input: ManualLeadInput): ManualLeadInput {
        val domain = normalizeDomain(input.websiteOrDomain)
        if (domain.isBlank()) return input
        val analyzed = analyzeWebsite(domain, input.outboundHistory)
        fun String.missing() = isBlank() || equals("не указана", ignoreCase = true) || equals("не указан", ignoreCase = true)
        return input.copy(
            companyName = input.companyName.ifBlank { analyzed.companyName },
            websiteOrDomain = domain,
            contact = input.contact.ifBlank { analyzed.contact },
            problemHints = input.problemHints.ifBlank { analyzed.problemHints },
            notes = input.notes.ifBlank { analyzed.notes },
            niche = input.niche.ifBlank { analyzed.niche },
            region = input.region.ifBlank { analyzed.region },
            productsServices = input.productsServices.ifEmpty { analyzed.productsServices },
            sourceUrl = input.sourceUrl.ifBlank { analyzed.sourceUrl },
            contactSourceUrl = input.contactSourceUrl.ifBlank { analyzed.contactSourceUrl },
            evidence = input.evidence.ifBlank { analyzed.evidence },
            leadSource = if (input.leadSource.missing()) analyzed.leadSource else input.leadSource,
            sourceConfidence = if (input.sourceConfidence.missing()) analyzed.sourceConfidence else input.sourceConfidence,
            collectedAt = if (input.collectedAt.missing()) analyzed.collectedAt else input.collectedAt,
            contactChannel = if (input.contactChannel.missing()) analyzed.contactChannel else input.contactChannel,
            outreachHistorySummary = input.outreachHistorySummary.ifBlank { analyzed.outreachHistorySummary },
            suppressionStatus = input.suppressionStatus.ifBlank { analyzed.suppressionStatus },
        )
    }

    private fun siteAnalysisFromInput(input: ManualLeadInput): SiteLeadAnalysisResult {
        val domain = normalizeDomain(input.websiteOrDomain)
        val url = input.sourceUrl.ifBlank { normalizedUrl(domain) }
        val niche = input.niche.ifBlank { inferNiche(domain) }
        val region = input.region.ifBlank { inferRegion(domain) }
        val products = input.productsServices
        val contactSource = when {
            input.contactSourceUrl.isNotBlank() -> input.contactSourceUrl
            input.sourceUrl.contains("/contact", ignoreCase = true) -> input.sourceUrl
            input.sourceUrl.contains("/kontakt", ignoreCase = true) -> input.sourceUrl
            input.sourceUrl.contains("/kontakty", ignoreCase = true) -> input.sourceUrl
            else -> ""
        }
        val history = input.outboundHistory
        val priorOutreachStatus = when {
            history.priorReplyExists -> "есть ответ, работать только в существующей ветке"
            history.priorOutreachExists -> "было предыдущее обращение"
            history.outboundHistoryChecked -> "история проверена, прежних обращений не найдено"
            else -> "история ещё не проверена"
        }
        val suppressionStatus = when {
            input.doNotContact || history.doNotContact || history.ownerManualBan -> "контакт запрещён"
            history.bounceHistoryExists -> "есть история недоставки"
            history.repeatedContact -> "есть повторный контакт, нужно решение владельца"
            history.suppressionChecked -> "локальный список запретов не сработал"
            else -> "список запретов ещё не проверен"
        }
        val sourceConfidence = input.sourceConfidence.ifBlank {
            if (domain.isBlank()) "низкая" else "средняя"
        }
        val needsReview = domain.isBlank() ||
            input.contact.isBlank() ||
            sourceConfidence.contains("низ", ignoreCase = true) ||
            !history.outboundHistoryChecked ||
            !history.suppressionChecked ||
            !history.duplicateContactChecked ||
            !history.priorReplyChecked
        val evidence = input.evidence
            .split(';', '\n')
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .ifEmpty {
                if (domain.isBlank()) {
                    listOf("Сайт ещё не введён")
                } else {
                    listOf("Домен нормализован: $domain", "Контактный путь не подтверждён")
                }
            }
        return SiteLeadAnalysisResult(
            inputSite = input.websiteOrDomain,
            normalizedDomain = domain,
            normalizedUrl = url,
            companyName = input.companyName.ifBlank { companyNameFromDomain(domain) },
            niche = niche,
            cityOrRegion = region,
            productsServices = products,
            contactChannel = input.contactChannel.ifBlank { input.contact },
            contactSourceUrl = contactSource,
            collectedAt = input.collectedAt.ifBlank { "не зафиксировано" },
            sourceConfidence = sourceConfidence,
            evidenceSnippets = evidence,
            priorOutreachStatus = priorOutreachStatus,
            suppressionStatus = suppressionStatus,
            recommendedFirstTouchAngle = recommendedAngle(niche),
            toolNotes = listOf(
                "Основной ввод владельца: только сайт",
                "Контакты без подтверждения не превращаются в реальные адреса",
                "Живая автоотправка доступна только после отдельного контроля",
            ),
            needsReview = needsReview,
        )
    }

    private fun leadgenPipeline(
        input: ManualLeadInput,
        siteAnalysis: SiteLeadAnalysisResult,
        scoring: LeadScoringResult,
        qa: QaReviewResult,
        outboundHistoryGate: OutboundHistoryGateResult,
        readiness: ManualSendReadiness,
        dryRun: AutoSendDryRunResult,
    ): LeadgenPipelineResult {
        val suppressed = input.doNotContact ||
            input.outboundHistory.doNotContact ||
            input.outboundHistory.ownerManualBan ||
            input.outboundHistory.bounceHistoryExists ||
            outboundHistoryGate.status == "NEEDS_OWNER_OVERRIDE"
        val status = when {
            suppressed -> SendReadinessStatus.SUPPRESSED
            siteAnalysis.normalizedDomain.isBlank() -> SendReadinessStatus.NEEDS_REVIEW
            input.contact.isBlank() -> SendReadinessStatus.NEEDS_CONTACT
            qa.status == "заблокировано" -> SendReadinessStatus.NEEDS_REVIEW
            dryRun.wouldSend -> SendReadinessStatus.READY_FOR_SEND_DRY_RUN
            readiness.canCreatePacket && scoring.contactConfidence >= 70 -> SendReadinessStatus.READY_FOR_OWNER_SEND
            readiness.canCreatePacket -> SendReadinessStatus.READY_FOR_PACKET
            scoring.totalScore >= 55 -> SendReadinessStatus.READY_FOR_DRAFT
            else -> SendReadinessStatus.NEEDS_REVIEW
        }
        val missing = readiness.blockingReasons.ifEmpty {
            when (status) {
                SendReadinessStatus.NEEDS_CONTACT -> listOf("нужно подтвердить контактный канал")
                SendReadinessStatus.NEEDS_REVIEW -> listOf("нужна проверка владельца")
                else -> emptyList()
            }
        }
        val nextAction = when (status) {
            SendReadinessStatus.NEEDS_CONTACT -> "Найти контакт"
            SendReadinessStatus.NEEDS_REVIEW -> "Проверить историю"
            SendReadinessStatus.SUPPRESSED -> "Разобрать запрет"
            SendReadinessStatus.READY_FOR_DRAFT -> "Подготовить первое касание"
            SendReadinessStatus.READY_FOR_PACKET,
            SendReadinessStatus.READY_FOR_SEND_DRY_RUN,
            SendReadinessStatus.READY_FOR_OWNER_SEND -> "Создать отправочный пакет"
            SendReadinessStatus.READY_FOR_LIMITED_AUTO_SEND -> "Открыть отдельный контроль автоотправки"
        }
        return LeadgenPipelineResult(
            readiness = status,
            ownerInputRequired = "ONLY_WEBSITE",
            siteAnalysis = siteAnalysis,
            nextPrimaryAction = nextAction,
            missingForSend = missing,
            auditEvents = listOf(
                "лид создан из сайта",
                "сайт разобран",
                "контактный путь определён",
                "черновик создан",
                "качество проверено",
                "история и запреты проверены",
                "сухой прогон автоотправки выполнен без исходящих действий",
            ),
        )
    }

    private fun normalizeDomain(site: String): String {
        val trimmed = site.trim()
        if (trimmed.isBlank()) return ""
        return trimmed
            .removePrefix("https://")
            .removePrefix("http://")
            .substringBefore("/")
            .substringBefore("?")
            .substringBefore("#")
            .substringBefore(":")
            .removePrefix("www.")
            .lowercase()
            .filter { it.isLetterOrDigit() || it == '.' || it == '-' }
            .trim('.', '-')
    }

    private fun normalizedUrl(domain: String): String = if (domain.isBlank()) "" else "https://$domain"

    private fun companyNameFromDomain(domain: String): String {
        if (domain.isBlank()) return ""
        val core = domain
            .split('.')
            .firstOrNull { it.isNotBlank() && it !in setOf("www", "mail", "contact") }
            .orEmpty()
        val readable = core
            .split('-', '_')
            .filter { it.isNotBlank() }
            .joinToString(" ") { part ->
                part.replaceFirstChar { ch -> ch.uppercase() }
            }
        return readable.ifBlank { "Компания с сайта $domain" }
    }

    private fun inferNiche(domain: String): String {
        val lower = domain.lowercase()
        return when {
            listOf("beton", "stroy", "jbi", "zhbi", "kgbi", "build", "cement", "kirpich").any { it in lower } -> "строительство / материалы"
            listOf("metal", "zavod", "prom", "factory", "plant").any { it in lower } -> "производство"
            listOf("clinic", "med", "doctor", "dent").any { it in lower } -> "медицина / услуги"
            listOf("auto", "car", "sto").any { it in lower } -> "авто / сервис"
            listOf("logist", "cargo", "trans", "delivery").any { it in lower } -> "логистика"
            listOf("hotel", "rest", "cafe", "food").any { it in lower } -> "гостеприимство / питание"
            else -> "B2B / услуги"
        }
    }

    private fun inferRegion(domain: String): String {
        val lower = domain.lowercase()
        return when {
            lower.endsWith(".kz") -> "Казахстан, регион уточняется"
            lower.endsWith(".by") -> "Беларусь, регион уточняется"
            lower.endsWith(".ru") -> "Россия, регион уточняется"
            else -> "регион уточняется"
        }
    }

    private fun inferProducts(domain: String, niche: String): List<String> {
        val lower = "$domain $niche".lowercase()
        return when {
            listOf("beton", "jbi", "zhbi", "kgbi", "cement").any { it in lower } ->
                listOf("строительные материалы", "расчёт заявки", "консультация")
            listOf("metal", "zavod", "prom", "factory", "plant").any { it in lower } ->
                listOf("производственные услуги", "расчёт заказа", "техническая консультация")
            listOf("clinic", "med", "doctor", "dent").any { it in lower } ->
                listOf("услуги записи", "консультация", "первичный приём")
            listOf("auto", "car", "sto").any { it in lower } ->
                listOf("сервис", "запись", "консультация")
            else -> listOf("услуги", "консультация", "первичная заявка")
        }
    }

    private fun recommendedAngle(niche: String): String = when {
        "строител" in niche.lowercase() || "материал" in niche.lowercase() ->
            "предложить короткий разбор пути от сайта к расчёту заявки"
        "производ" in niche.lowercase() ->
            "предложить внешний разбор первого запроса и ручной передачи заявки"
        else -> "предложить короткий внешний мини-разбор первого обращения"
    }

    private fun firstTouchDraft(hints: String, draftOverride: String): FirstTouchDraftResult {
        val segmentLine = firstTouchSegmentLine(hints)
        val subject = "Короткий внешний разбор сайта"
        val generated = """
            Здравствуйте.

            Меня зовут Дмитрий. Я занимаюсь разбором сайтов и первого касания для B2B и производственных компаний.

            Посмотрел вашу страницу/сайт. По открытой информации видно, что $segmentLine.

            Не утверждаю, что у вас это работает плохо: без внутренней статистики это было бы неправильно. Но могу сделать короткий внешний мини-разбор на 3-5 конкретных пунктов: что видит новый клиент при первом контакте, где может возникнуть лишнее трение и что можно упростить без большого проекта.

            Если актуально, кому у вас удобнее передать такой разбор?
        """.trimIndent()
        val text = draftOverride.trim().ifBlank { generated }
        val risks = firstTouchRisks(text)
        return FirstTouchDraftResult(
            subject = subject,
            text = text,
            angleExplanation = "Спокойный angle: предложить короткий внешний мини-разбор без обещаний результата и без давления.",
            basedOnFacts = listOf(
                "Владелец ввёл сайт компании",
                "Система не делает выводов о выручке, трафике или проблемах без внутренних данных",
                "Первое касание просит удобный маршрут передачи разбора, а не продажу или оплату",
            ),
            qualityStatus = if (risks.isEmpty()) "прошло" else "нужно исправить",
            risks = risks,
        )
    }

    private fun firstTouchSegmentLine(hints: String): String = when {
        "жби" in hints || "бетон" in hints || "строител" in hints || "материал" in hints ->
            "компания работает в сегменте ЖБИ / строительных материалов, где для нового клиента обычно важно быстро понять: что именно можно заказать, по какому региону вы работаете и как удобнее запросить расчет или консультацию"
        "производ" in hints || "b2b" in hints ->
            "для нового клиента в B2B обычно важно быстро понять направление работы, регион и удобный способ запросить расчет или консультацию"
        else ->
            "для нового клиента обычно важно быстро понять направление работы, регион и удобный способ первого обращения"
    }

    private fun firstTouchRisks(text: String): List<String> {
        val lower = text.lowercase()
        return buildList {
            if (text.length !in 220..900) add("длина текста вне безопасного диапазона")
            if (!lower.contains("здравствуйте")) add("нет спокойного приветствия")
            if (!lower.contains("меня зовут дмитрий")) add("нет человеческого представления")
            if (!lower.contains("первого касания") && !lower.contains("первое касание")) add("нет контекста первого касания")
            if (!lower.contains("посмотрел") && !lower.contains("увидел") && !lower.contains("страниц")) add("нет видимого контекста сайта")
            if (!lower.contains("не утверждаю") && !lower.contains("не делаю вывод")) add("нет оговорки против ложной уверенности")
            if (!Regex("""3[-–]5""").containsMatchIn(text)) add("нет мини-разбора на 3-5 пунктов")
            if (!lower.contains("кому у вас удобнее передать")) add("нет мягкого вопроса о передаче разбора")
            if (forbiddenFirstTouchTerms.any { lower.contains(it) }) add("есть абстрактная или рискованная формулировка")
            if (Regex("""\d+\s*%|\d[\d\s]*₽|\d+\s*руб""").containsMatchIn(lower)) add("есть числа, цена или платёжное давление")
            if (lower.contains("нашли у вас проблему") || lower.contains("точно есть проблема")) add("есть ложная уверенность о проблеме")
            if (listOf("срочно", "гарантир", "увеличим продажи", "скидка", "только сегодня").any { it in lower }) {
                add("тон сообщения давит или обещает результат")
            }
        }
    }

    private val forbiddenFirstTouchTerms = listOf(
        "public digital presence",
        "first-response friction",
        "client-volume",
        "публичное присутствие",
        "первый ответ",
        "roi",
        "конверсия",
        "трафик",
        "рост продаж",
        "payment request",
        "оплат",
        "договор",
    )

    private fun outboundHistoryGate(history: OutboundHistoryEvidence): OutboundHistoryGateResult {
        val ownerOverrideReady = history.ownerRecontactApproved &&
            history.ownerOverrideConfirmed &&
            history.ownerOverrideReason.trim().length >= 10
        val suppressionTriggered = history.repeatedContact ||
            (history.priorOutreachExists && history.noReplyAfterPriorOutreach) ||
            history.doNotContact ||
            history.ownerManualBan ||
            history.bounceHistoryExists
        val blockers = buildList {
            if (!history.outboundHistoryChecked) add("не проверена история контактов")
            if (!history.suppressionChecked) add("не проверен список запретов")
            if (!history.duplicateContactChecked) add("не проверены дубли контактов")
            if (!history.priorReplyChecked) add("не проверены ответы")
            if (history.selfTestOnly) add("служебная или самопроверочная запись")
            if (history.doNotContact) add("лид помечен как не контактировать")
            if (history.ownerManualBan) add("владелец вручную запретил контакт")
            if (history.bounceHistoryExists) add("есть история недоставки")
            if (history.repeatedContact && !ownerOverrideReady) add("контакт уже получал повторные сообщения; нужно исключение владельца")
            if (history.priorReplyExists) add("есть ответ; использовать только существующую ветку")
            if (history.priorOutreachExists && history.noReplyAfterPriorOutreach && !ownerOverrideReady) {
                add("было предыдущее обращение без ответа; нужно явное решение владельца")
            }
        }
        val status = when {
            history.selfTestOnly -> "NOT_A_REAL_LEAD"
            history.priorReplyExists -> "FOLLOW_UP_ONLY_EXISTING_THREAD"
            suppressionTriggered && ownerOverrideReady -> "PASS_OWNER_OVERRIDE"
            suppressionTriggered -> "NEEDS_OWNER_OVERRIDE"
            blockers.isNotEmpty() -> "NEEDS_OWNER_HISTORY_REVIEW"
            history.previewOnlyNotSent -> "PASS_PREVIEW_ONLY_NOT_SENT"
            else -> "PASS"
        }
        val recommendation = when (status) {
            "PASS", "PASS_PREVIEW_ONLY_NOT_SENT" -> "можно готовить ручное подтверждение владельцем"
            "PASS_OWNER_OVERRIDE" -> "можно готовить пакет только с зафиксированным исключением владельца"
            "FOLLOW_UP_ONLY_EXISTING_THREAD" -> "не начинать холодное письмо; работать только в существующей ветке"
            "NOT_A_REAL_LEAD" -> "не использовать как реальный лид"
            "NEEDS_OWNER_OVERRIDE" -> "нужно явное решение владельца с причиной и записью контроля"
            else -> "сначала завершить проверку истории и списка запретов"
        }
        return OutboundHistoryGateResult(
            status = status,
            recommendation = recommendation,
            checks = listOf(
                "История контактов: ${if (history.outboundHistoryChecked) "проверена" else "нужна проверка"}",
                "Список запретов: ${if (history.suppressionChecked) "проверен" else "нужна проверка"}",
                "Дубли контактов: ${if (history.duplicateContactChecked) "проверены" else "нужна проверка"}",
                "Ответы: ${if (history.priorReplyChecked) "проверены" else "нужна проверка"}",
                "Запрет или повтор: ${if (suppressionTriggered) if (ownerOverrideReady) "исключение владельца зафиксировано" else "нужно исключение владельца" else "не сработал"}",
                "Причина исключения: ${history.ownerOverrideReason.ifBlank { "не указана" }}",
            ),
            blockers = blockers,
        )
    }

    private fun missingData(input: ManualLeadInput): List<String> = buildList {
        if (input.companyName.isBlank()) add("компания / имя")
        if (input.websiteOrDomain.isBlank()) add("сайт / домен")
        if (input.niche.isBlank()) add("ниша")
        if (input.region.isBlank()) add("регион")
        if (input.sourceUrl.isBlank()) add("ссылка на источник")
        if (input.evidence.isBlank()) add("доказательства")
        if (input.contact.isBlank()) add("контакт")
        if (input.problemHints.isBlank()) add("сигналы проблемы")
    }

    private fun fitScore(input: ManualLeadInput, missingData: List<String>): Int {
        var score = 45
        if (input.websiteOrDomain.isNotBlank()) score += 15
        if (input.contact.isNotBlank()) score += 10
        if (input.niche.isNotBlank()) score += 5
        if (input.region.isNotBlank()) score += 5
        if (input.sourceUrl.isNotBlank() && input.evidence.isNotBlank()) score += 10
        if (input.problemHints.length >= 25) score += 20
        if (input.notes.contains("manual", ignoreCase = true) || input.notes.contains("ручн", ignoreCase = true)) score += 5
        score -= missingData.size * 10
        return score.coerceIn(0, 100)
    }

    private fun qualificationReason(input: ManualLeadInput, missingData: List<String>): String {
        if (missingData.isNotEmpty()) {
            return "У ручного лида есть полезный контекст, но не хватает: ${missingData.joinToString(", ")}."
        }
        val source = if (input.websiteOrDomain.endsWith(".test") || input.websiteOrDomain.endsWith(".local")) "ручного ввода без внешней проверки" else "ручного ввода владельца"
        return "У лида есть название компании, контекст домена / контакта и сигналы проблемы из $source."
    }

    private fun digitalPresenceDraft(input: ManualLeadInput, hints: String): DigitalPresenceDraft {
        val issues = buildList {
            if ("cta" in hints || "conversion" in hints || "конверс" in hints) add("CTA и путь конверсии требуют проверки владельцем.")
            if ("capture" in hints || "lead" in hints || "захват" in hints || "лид" in hints) add("Захват лида выглядит неясным по ручным заметкам.")
            if ("response" in hints || "manual" in hints || "ответ" in hints || "ручн" in hints) add("Обработка ответа может зависеть от ручного продолжения.")
            if (isEmpty()) add("Конкретная проблема ещё не доказана; владелец должен добавить наблюдаемые факты.")
        }
        val assumptions = listOf(
            "Факты о сайте ручные и требуют проверки владельцем.",
            "Трафик, выручка и разрешение на контакт не выводятся автоматически.",
            "Оффер остаётся черновиком, пока владелец не подтвердит доказательства.",
        )
        return DigitalPresenceDraft(
            observedIssues = issues,
            evidenceSource = if (input.websiteOrDomain.endsWith(".test")) {
                "ручные сигналы без внешней проверки"
            } else {
                "только ручные поля, введённые владельцем"
            },
            assumptions = assumptions,
            unsupportedClaims = emptyList(),
        )
    }

    private fun chooseProduct(hints: String): String = when {
        "front office" in hints || "response" in hints || "manual" in hints || "ответ" in hints || "ручн" in hints -> "AI Front Office"
        "lead" in hints || "capture" in hints || "лид" in hints || "захват" in hints -> "Система лидов"
        "website" in hints || "cta" in hints || "conversion" in hints || "сайт" in hints || "конверс" in hints -> "Сайт / стартовая страница"
        "presence" in hints || "domain" in hints || "присутств" in hints || "домен" in hints -> "Проверка цифрового присутствия"
        else -> "Мини-аудит"
    }

    private fun productFitReason(product: String, hints: String): String = when (product) {
        "AI Front Office" -> "Сигналы проблемы указывают на ручной ответ или нагрузку фронт-офиса; первый продукт должен уменьшить пропущенные разговоры."
        "Система лидов" -> "Сигналы проблемы указывают на захват лида; первый продукт должен сделать захват и продолжение видимыми."
        "Сайт / стартовая страница" -> "Сигналы проблемы указывают на сайт, CTA или конверсию; первый продукт должен прояснить путь покупателя."
        "Проверка цифрового присутствия" -> "Сигналы проблемы указывают на присутствие / домен; первый продукт должен проверить готовность публичного контура."
        else -> if (hints.isBlank()) {
            "Сильного продуктового сигнала пока нет; мини-аудит остаётся только разведочным черновиком, не заявлением по умолчанию."
        } else {
            "Ручные сигналы требуют структурированного аудита перед выбором большего продукта."
        }
    }

    private fun offerScope(product: String): List<String> = when (product) {
        "AI Front Office" -> listOf("скрипт ответа", "чеклист приёма лида", "правило ручной передачи")
        "Система лидов" -> listOf("чеклист захвата лида", "поля квалификации", "очередь проверки владельцем")
        "Сайт / стартовая страница" -> listOf("сообщение на одну страницу", "очистка CTA", "черновик формы лида")
        "Проверка цифрового присутствия" -> listOf("ручной чеклист присутствия", "таблица доказательств", "заметки по рискам")
        else -> listOf("ручной мини-аудит", "список проблем", "следующий шаг, одобренный владельцем")
    }

    private fun qaReview(
        input: ManualLeadInput,
        audit: DigitalPresenceDraft,
        offer: OfferDraftResult,
        firstTouch: FirstTouchDraftResult,
        outboundHistoryGate: OutboundHistoryGateResult,
    ): QaReviewResult {
        val combinedText = listOf(
            input.companyName,
            input.websiteOrDomain,
            input.contact,
            input.niche,
            input.region,
            input.sourceUrl,
            input.evidence,
            input.problemHints,
            input.notes,
            offer.expectedValue,
            offer.risk,
            firstTouch.text,
        ).joinToString(" ").lowercase()
        val qaOverrideReady = input.qaOverrideConfirmed && input.qaOverrideReason.trim().length >= 10
        val historyAllowed = outboundHistoryGate.status in setOf("PASS", "PASS_PREVIEW_ONLY_NOT_SENT", "PASS_OWNER_OVERRIDE")
        val blockers = buildList {
            if (audit.unsupportedClaims.isNotEmpty()) add("есть неподтверждённые заявления")
            if (listOf("guaranteed", "proven revenue", "sent to client", "paid invoice").any { it in combinedText }) {
                add("ложный успех или неподтверждённые числа")
            }
            if (offer.ownerApprovalRequiredBeforeSend.not()) add("нет одобрения владельца перед отправкой")
            if ("payment request" in combinedText) add("запрос платежа запрещён")
            if (firstTouch.risks.isNotEmpty()) add("текст первого касания требует правки")
            if (!historyAllowed) {
                add("проверка истории контактов и списка запретов не пройдена")
            }
            if (input.doNotContact || input.outboundHistory.doNotContact || input.outboundHistory.ownerManualBan) {
                add("лид запрещён к контакту владельцем")
            }
            if (input.outboundHistory.bounceHistoryExists) add("есть история недоставки")
            if (input.contact.isBlank()) add("нет контактного канала для ручного действия")
            if (input.leadSource.isBlank() || input.sourceConfidence.isBlank() || input.collectedAt.isBlank() || input.sourceUrl.isBlank() || input.evidence.isBlank()) {
                add("не заполнены источник, уверенность, дата сбора или доказательства")
            }
            if (listOf("рост продаж", "гарантия", "окупится", "точно", "лучший").any { it in combinedText }) {
                add("есть неподдержанное обещание результата или окупаемости")
            }
        }
        val overrideApplied = blockers.isNotEmpty() && qaOverrideReady
        return QaReviewResult(
            status = when {
                blockers.isEmpty() -> "прошло"
                overrideApplied -> "override владельца"
                else -> "заблокировано"
            },
            blockers = blockers,
            checks = listOf(
                "Unsupported claims: проверены и блокируются",
                "Обещания окупаемости: прямые обещания результата блокируются",
                "Тон: давление, срочность и гарантии блокируются",
                "Длина: текст должен быть в безопасном диапазоне",
                "Персонализация: есть контекст сайта/страницы и мягкий следующий шаг",
                "Compliance: платежи, договоры и скрытая отправка заблокированы",
                "Deliverability: контактный канал и история обязательны",
                "История контактов и список запретов обязательны перед отправочным пакетом",
                "Запись в рабочую базу не используется",
            ),
            allowsManualPacket = blockers.isEmpty() || overrideApplied,
            overrideApplied = overrideApplied,
        )
    }

    private fun manualSendReadiness(
        input: ManualLeadInput,
        qualification: QualificationResult,
        scoring: LeadScoringResult,
        audit: DigitalPresenceDraft,
        strategy: ProductStrategyResult,
        offer: OfferDraftResult,
        roi: RoiAssumptions,
        qa: QaReviewResult,
        outboundHistoryGate: OutboundHistoryGateResult,
    ): ManualSendReadiness {
        val company = input.companyName.ifBlank { "ручной лид" }
        val historyAllowed = outboundHistoryGate.status in setOf("PASS", "PASS_PREVIEW_ONLY_NOT_SENT", "PASS_OWNER_OVERRIDE")
        val blockingReasons = buildList {
            if (qualification.fitScore < 55) add("низкое соответствие лида")
            if (!historyAllowed) add("история контактов или список запретов не закрыты")
            if (!qa.allowsManualPacket) add("QA не пройден и исключение владельца не зафиксировано")
            if (input.contact.isBlank()) add("нет контактного канала")
            if (input.doNotContact || input.outboundHistory.doNotContact || input.outboundHistory.ownerManualBan) add("лид помечен как не контактировать")
            if (input.outboundHistory.bounceHistoryExists) add("есть история недоставки")
            if (input.leadSource.isBlank() || input.sourceConfidence.isBlank() || input.collectedAt.isBlank() || input.sourceUrl.isBlank() || input.evidence.isBlank()) add("нет обязательных полей источника")
            if (scoring.riskScore > 45) add("риск лида выше безопасного порога")
        }
        val canCreatePacket = blockingReasons.isEmpty()
        val leadFingerprint = listOf(company, input.websiteOrDomain, input.contactChannel)
            .filter { it.isNotBlank() }
            .joinToString(" / ")
        val historyStatusLabel = historyGateStatusLabel(outboundHistoryGate.status)
        return ManualSendReadiness(
            status = if (canCreatePacket) {
                "готово к созданию отправочного пакета"
            } else {
                "заблокировано до исправления причин"
            },
            approvalPacketTitle = "Пакет согласования владельца для $company",
            packetItems = listOf(
                "Источник лида: ${input.leadSource}; уверенность: ${input.sourceConfidence}; дата сбора: ${input.collectedAt}.",
                "Контактный канал: ${input.contactChannel.ifBlank { input.contact }}.",
                "История обращений: ${input.outreachHistorySummary.ifBlank { outboundHistoryGate.recommendation }}.",
                "Статус запрета или дубля: ${input.suppressionStatus.ifBlank { historyStatusLabel }}.",
                "Квалификация: ${qualification.fitScore}/100, ${qualification.readiness}.",
                "Оценка: соответствие=${scoring.fitScore}, срочность=${scoring.urgencyScore}, контакт=${scoring.contactConfidence}, боль=${scoring.websitePainSignal}, ниша=${scoring.nicheMatch}, риск=${scoring.riskScore}.",
                "Проверка фактов: ${audit.evidenceSource}.",
                "Продукт: ${strategy.product}. ${strategy.productFitReason}",
                "Черновик оффера: ${offer.title}.",
                "Окупаемость: ${roi.confidence}; ${roi.paybackLogic}",
                "История контактов: $historyStatusLabel; ${outboundHistoryGate.recommendation}.",
                "Контроль: ${qa.status}; ${qa.blockers.ifEmpty { listOf("блокеров нет") }.joinToString(", ")}.",
                "Действие владельца: проверить финальный текст, создать пакет, открыть письмо вручную и выполнить отправку только своим нажатием.",
            ),
            blockedActions = listOf(
                "Автоматическая отправка без владельца",
                "Запрос платежа",
                "Запись в рабочую базу без отдельного разрешения",
                "Автоматизация браузера или соцсетей без отдельного разрешения",
            ),
            blockingReasons = blockingReasons,
            fixActions = blockingReasons.map { reason ->
                when {
                    "лида" in reason || "источника" in reason || "канала" in reason -> "Исправить карточку лида"
                    "история" in reason || "запрет" in reason -> "Открыть историю и исключение владельца"
                    "QA" in reason -> "Исправить текст или оформить QA override"
                    else -> "Проверить вручную"
                }
            }.distinct(),
            auditRecordPreview = listOf(
                "Кто подтверждает: владелец устройства",
                "Когда: локальное время фиксируется при ручном действии владельца",
                "Лид: $leadFingerprint",
                "Риск: $historyStatusLabel; контроль=${qa.status}",
                "Текст: сохраняется как черновик и отправочный пакет, не как отправленное сообщение",
                "Фиксация результата: локально на телефоне; запись в рабочую базу только после отдельного разрешения",
            ),
            canCreatePacket = canCreatePacket,
        )
    }

    private fun historyGateStatusLabel(status: String): String = when (status) {
        "PASS" -> "прошло"
        "PASS_PREVIEW_ONLY_NOT_SENT" -> "прошло, отправки не было"
        "PASS_OWNER_OVERRIDE" -> "исключение владельца зафиксировано"
        "NEEDS_OWNER_OVERRIDE" -> "нужно исключение владельца"
        "NOT_A_REAL_LEAD" -> "не реальный лид"
        "BLOCKED_PRIOR_REPLY" -> "заблокировано: уже был ответ"
        else -> "нужна проверка"
    }

    private fun leadScoring(
        input: ManualLeadInput,
        qualification: QualificationResult,
        outboundHistoryGate: OutboundHistoryGateResult,
        qa: QaReviewResult,
    ): LeadScoringResult {
        val text = listOf(input.problemHints, input.notes, input.evidence, input.niche).joinToString(" ").lowercase()
        val urgency = when {
            listOf("срочно", "теряет", "нет ответа", "пропущ", "ошиб", "заявк").any { it in text } -> 85
            listOf("ручн", "форма", "контакт", "лид", "захват").any { it in text } -> 70
            else -> 45
        }
        val contactConfidence = when {
            input.contact.contains("@") && input.sourceConfidence.contains("выс", ignoreCase = true) -> 90
            input.contact.contains("@") -> 75
            input.contactChannel.contains("форма", ignoreCase = true) -> 60
            input.contact.isNotBlank() -> 50
            else -> 10
        }
        val pain = when {
            listOf("заяв", "форма", "контакт", "ответ", "ручн", "cta", "лид").any { it in text } -> 80
            input.problemHints.length >= 40 -> 65
            else -> 35
        }
        val niche = when {
            input.niche.isBlank() -> 25
            listOf("b2b", "производ", "строител", "жби", "услуг").any { it in input.niche.lowercase() + text } -> 80
            else -> 55
        }
        val risk = buildList {
            if (input.doNotContact || input.outboundHistory.doNotContact || input.outboundHistory.ownerManualBan) add(100)
            if (input.outboundHistory.bounceHistoryExists) add(70)
            if (outboundHistoryGate.status !in setOf("PASS", "PASS_PREVIEW_ONLY_NOT_SENT", "PASS_OWNER_OVERRIDE")) add(55)
            if (qa.status == "заблокировано") add(50)
            if (input.sourceUrl.isBlank() || input.evidence.isBlank()) add(30)
            if (input.sourceConfidence.contains("низ", ignoreCase = true) || input.sourceConfidence.contains("low", ignoreCase = true)) add(25)
        }.maxOrNull() ?: 15
        val total = ((qualification.fitScore + urgency + contactConfidence + pain + niche + (100 - risk)) / 6).coerceIn(0, 100)
        return LeadScoringResult(
            fitScore = qualification.fitScore,
            urgencyScore = urgency,
            contactConfidence = contactConfidence,
            websitePainSignal = pain,
            nicheMatch = niche,
            riskScore = risk,
            totalScore = total,
            whySelected = listOf(
                "Соответствие: ${qualification.reason}",
                "Контакт: ${if (contactConfidence >= 70) "понятный канал с подтверждённым источником" else "нужна ручная проверка канала"}",
                "Боль сайта: ${if (pain >= 70) "есть видимый сигнал для первого касания" else "сигнал слабый"}",
                "Риск: ${if (risk <= 30) "низкий" else "нужно решение владельца"}",
            ),
        )
    }

    private fun funnelStatus(
        input: ManualLeadInput,
        missingData: List<String>,
        scoring: LeadScoringResult,
        firstTouch: FirstTouchDraftResult,
        outboundHistoryGate: OutboundHistoryGateResult,
        qa: QaReviewResult,
        readiness: ManualSendReadiness,
    ): FunnelStatusResult {
        val status = when {
            input.doNotContact || input.outboundHistory.doNotContact || input.outboundHistory.ownerManualBan -> SalesFunnelStatus.SUPPRESSED
            input.outboundHistory.bounceHistoryExists -> SalesFunnelStatus.SUPPRESSED
            input.outboundHistory.selfTestOnly -> SalesFunnelStatus.REJECTED
            input.outboundHistory.priorReplyExists -> SalesFunnelStatus.REPLIED
            outboundHistoryGate.status == "NEEDS_OWNER_OVERRIDE" -> SalesFunnelStatus.SUPPRESSED
            missingData.isNotEmpty() -> SalesFunnelStatus.ENRICHING
            scoring.totalScore < 55 || scoring.riskScore > 45 -> SalesFunnelStatus.NEEDS_REVIEW
            firstTouch.qualityStatus != "прошло" -> SalesFunnelStatus.DRAFT_READY
            qa.status == "заблокировано" -> SalesFunnelStatus.QA_FAILED
            readiness.canCreatePacket && scoring.totalScore >= 70 && scoring.contactConfidence >= 70 && scoring.riskScore <= 30 && qa.status == "прошло" -> SalesFunnelStatus.READY_FOR_SEND
            readiness.canCreatePacket -> SalesFunnelStatus.READY_FOR_OWNER
            scoring.totalScore >= 55 -> SalesFunnelStatus.QUALIFIED
            else -> SalesFunnelStatus.NEW
        }
        return FunnelStatusResult(
            status = status,
            label = statusLabel(status),
            explanation = statusExplanation(status),
            nextStep = nextStepFor(status),
        )
    }

    private fun autoSendDryRun(
        funnelStatus: FunnelStatusResult,
        scoring: LeadScoringResult,
        qa: QaReviewResult,
        readiness: ManualSendReadiness,
        outboundHistoryGate: OutboundHistoryGateResult,
    ): AutoSendDryRunResult {
        val blockers = buildList {
            if (funnelStatus.status != SalesFunnelStatus.READY_FOR_SEND) add("лид ещё не готов к ручной отправке")
            if (qa.status != "прошло") add("контроль качества не пройден")
            if (!readiness.canCreatePacket) add("отправочный пакет не готов")
            if (outboundHistoryGate.status != "PASS") add("история контактов или запреты не закрыты без риска")
            if (scoring.contactConfidence < 80) add("уверенность в контактном канале ниже порога")
            if (scoring.riskScore > 20) add("риск выше безопасного порога")
        }
        return AutoSendDryRunResult(
            mode = "DRY_RUN",
            wouldSend = blockers.isEmpty(),
            outboundCount = 0,
            candidateExplanation = listOf(
                "Сухой прогон: реальная отправка не выполняется.",
                "Система готовит кандидат на отправку только для лида с чистой историей, качественным текстом и высокой оценкой.",
                "Платежи выключены; запись в рабочую базу требует отдельного разрешения.",
            ) + scoring.whySelected,
            blockedReasons = blockers,
        )
    }

    private fun ownerApprovedBatch(dryRun: AutoSendDryRunResult): OwnerApprovedBatchResult = OwnerApprovedBatchResult(
        ready = dryRun.wouldSend || dryRun.blockedReasons.isNotEmpty(),
        approvedCount = 0,
        batchSizeRange = "3-10 после решения владельца",
        requirements = listOf(
            "каждый лид одобряется или отклоняется вручную",
            "ограничение темпа обязательно",
            "текст остановки контакта обязателен",
            "фиксация недоставки и ответа обязательна",
            "реальная автоотправка только после отдельного разрешения владельца",
        ),
    )

    private fun statusLabel(status: SalesFunnelStatus): String = when (status) {
        SalesFunnelStatus.NEW -> "новый лид"
        SalesFunnelStatus.ENRICHING -> "нужно обогащение"
        SalesFunnelStatus.NEEDS_REVIEW -> "нужна проверка владельца"
        SalesFunnelStatus.QUALIFIED -> "квалифицирован"
        SalesFunnelStatus.DRAFT_READY -> "черновик готовится"
        SalesFunnelStatus.QA_FAILED -> "контроль не пройден"
        SalesFunnelStatus.SUPPRESSED -> "контакт запрещён или требует исключения"
        SalesFunnelStatus.READY_FOR_OWNER -> "готов к решению владельца"
        SalesFunnelStatus.READY_FOR_SEND -> "готов к ручной отправке"
        SalesFunnelStatus.SENT -> "отправлено владельцем"
        SalesFunnelStatus.BOUNCED -> "недоставка"
        SalesFunnelStatus.REPLIED -> "есть ответ"
        SalesFunnelStatus.HOLD -> "отложено"
        SalesFunnelStatus.REJECTED -> "отклонено"
    }

    private fun statusExplanation(status: SalesFunnelStatus): String = when (status) {
        SalesFunnelStatus.READY_FOR_SEND -> "Лид прошёл оценку, контроль качества и проверку истории; можно создать ручной отправочный пакет."
        SalesFunnelStatus.READY_FOR_OWNER -> "Пакет можно готовить, но владелец должен принять решение перед действием."
        SalesFunnelStatus.SUPPRESSED -> "Есть запрет, дубль, недоставка или прежнее обращение; без исключения владельца движение запрещено."
        SalesFunnelStatus.QA_FAILED -> "Текст или доказательства не прошли контроль качества."
        SalesFunnelStatus.ENRICHING -> "Не хватает обязательных полей источника, ниши, региона, контакта или доказательств."
        SalesFunnelStatus.NEEDS_REVIEW -> "Оценка или риск не позволяют отправлять без ручной проверки."
        else -> "Статус определён по текущим данным лида и истории."
    }

    private fun nextStepFor(status: SalesFunnelStatus): String = when (status) {
        SalesFunnelStatus.NEW -> "заполнить карточку и источник"
        SalesFunnelStatus.ENRICHING -> "добавить обязательные поля и источник"
        SalesFunnelStatus.NEEDS_REVIEW -> "проверить оценку и риск"
        SalesFunnelStatus.QUALIFIED -> "подготовить черновик первого сообщения"
        SalesFunnelStatus.DRAFT_READY -> "исправить или подтвердить черновик"
        SalesFunnelStatus.QA_FAILED -> "исправить замечания качества или оформить исключение владельца"
        SalesFunnelStatus.SUPPRESSED -> "разобрать историю контактов и при необходимости оформить исключение владельца"
        SalesFunnelStatus.READY_FOR_OWNER -> "принять решение: отправить, править, отложить или отклонить"
        SalesFunnelStatus.READY_FOR_SEND -> "создать пакет и открыть почту вручную"
        SalesFunnelStatus.SENT -> "зафиксировать ответ или недоставку"
        SalesFunnelStatus.BOUNCED -> "пометить недоставку и не отправлять повторно"
        SalesFunnelStatus.REPLIED -> "работать в существующей ветке"
        SalesFunnelStatus.HOLD -> "вернуться позже"
        SalesFunnelStatus.REJECTED -> "не использовать лид"
    }
}
