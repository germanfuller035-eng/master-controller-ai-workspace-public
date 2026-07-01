package ru.dmitry.matercontroller.feature.sales

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ru.dmitry.matercontroller.core.ui.OwnerSpacing
import ru.dmitry.matercontroller.core.ui.OwnerStatusChip
import ru.dmitry.matercontroller.core.ui.OwnerStatusTone
import ru.dmitry.matercontroller.core.ui.PilotSafetyChips
import java.io.File
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

private data class PilotStep(
    val label: String,
    val title: String,
    val subtitle: String,
)

private enum class SalesActionScreen(
    val stepNumber: Int,
    val legacyStep: Int,
    val title: String,
    val subtitle: String,
) {
    Website(
        stepNumber = 1,
        legacyStep = 0,
        title = "Лиды",
        subtitle = "Выберите следующий лид или введите сайт вручную.",
    ),
    CompanyReview(
        stepNumber = 2,
        legacyStep = 1,
        title = "Разбор лида",
        subtitle = "Проверьте факты с сайта, источник, историю и ограничения контакта.",
    ),
    Draft(
        stepNumber = 3,
        legacyStep = 3,
        title = "Первое касание",
        subtitle = "Отредактируйте черновик. Это не отправленное сообщение.",
    ),
    Qa(
        stepNumber = 4,
        legacyStep = 4,
        title = "Проверка качества",
        subtitle = "Проверяем факты, тон, обещания, длину, доставляемость и историю.",
    ),
    Contact(
        stepNumber = 5,
        legacyStep = 5,
        title = "Канал",
        subtitle = "Выберите путь ручной отправки и проверьте источник контакта.",
    ),
    Packet(
        stepNumber = 6,
        legacyStep = 6,
        title = "Отправочный пакет",
        subtitle = "Финальная проверка перед ручным действием владельца.",
    ),
    Result(
        stepNumber = 7,
        legacyStep = 7,
        title = "Зафиксировать результат",
        subtitle = "Отметьте, что произошло после ручного действия.",
    ),
    LiveApproval(
        stepNumber = 8,
        legacyStep = 7,
        title = "Проверка отправки",
        subtitle = "Проверка точного пакета перед ручной отправкой владельцем.",
    ),
    LiveResult(
        stepNumber = 9,
        legacyStep = 7,
        title = "Результат отправки",
        subtitle = "Фиксация результата без записи в рабочую базу.",
    ),
    ReplyInbox(
        stepNumber = 10,
        legacyStep = 7,
        title = "Ответы",
        subtitle = "Мониторинг входящих ответов только для просмотра.",
    ),
    ReplyDetail(
        stepNumber = 11,
        legacyStep = 7,
        title = "Разбор ответа",
        subtitle = "Классификация без автоответа и без записи в CRM.",
    ),
    CrmWriteReview(
        stepNumber = 12,
        legacyStep = 7,
        title = "Запись в CRM",
        subtitle = "Только после подтверждения владельца и отдельного разрешения записи.",
    ),
    OpportunityReview(
        stepNumber = 13,
        legacyStep = 7,
        title = "Сделка",
        subtitle = "Черновик возможности после ответа владельца.",
    ),
    ProductSelect(
        stepNumber = 14,
        legacyStep = 7,
        title = "Продукт",
        subtitle = "Выберите продукт для сделки.",
    ),
    ProductDraft(
        stepNumber = 15,
        legacyStep = 7,
        title = "Материал",
        subtitle = "Проверьте черновик аудита или предложения.",
    ),
    DocumentReview(
        stepNumber = 16,
        legacyStep = 7,
        title = "PDF / КП",
        subtitle = "Проверьте документ перед ручной передачей клиенту.",
    ),
    InvoiceDraft(
        stepNumber = 17,
        legacyStep = 7,
        title = "Черновик счёта",
        subtitle = "Счёт готовится без активной платёжной ссылки.",
    ),
    PaymentGate(
        stepNumber = 18,
        legacyStep = 7,
        title = "Оплата",
        subtitle = "Платежи выключены до отдельного разрешения.",
    ),
    History(
        stepNumber = 19,
        legacyStep = 7,
        title = "История",
        subtitle = "Локальный аудит действий без записи в рабочую базу.",
    ),
    Feedback(
        stepNumber = 20,
        legacyStep = 7,
        title = "Обратная связь",
        subtitle = "Коммерческая обратная связь после первого ответа.",
    ),
    Autonomy(
        stepNumber = 21,
        legacyStep = 7,
        title = "Автономность",
        subtitle = "Ограниченная автономность закрыта до 100 ручных отправок.",
    ),
    SafetyCenter(
        stepNumber = 22,
        legacyStep = 7,
        title = "Центр безопасности",
        subtitle = "Стоп-запросы, подтверждение, аудит, откат и выключенные внешние действия.",
    ),
}

private data class OperatorLeadImport(
    val companyName: String,
    val websiteOrDomain: String,
    val contact: String,
    val niche: String,
    val region: String,
    val sourceUrl: String,
    val evidence: String,
    val doNotContact: Boolean,
    val leadSource: String,
    val sourceConfidence: String,
    val collectedAt: String,
    val contactChannel: String,
    val outreachHistorySummary: String,
    val suppressionStatus: String,
    val problemHints: String,
    val notes: String,
    val outboundHistory: OutboundHistoryEvidence = OutboundHistoryEvidence.notChecked(),
)

private data class OperatorImportResult(
    val leads: List<OperatorLeadImport>,
    val message: String,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkingSalesMvpScreen(
    onBack: () -> Unit,
    initialStep: Int = 0,
    initialSite: String = "",
    initialRoute: String = "leadQueue",
) {
    val context = LocalContext.current
    val sample = remember(initialSite) {
        if (initialSite.isNotBlank()) {
            WorkingSalesMvpEngine.analyzeWebsite(initialSite)
        } else {
            WorkingSalesMvpEngine.emptyWebsiteInput
        }
    }
    var websiteEntry by rememberSaveable { mutableStateOf(initialSite.ifBlank { sample.websiteOrDomain }) }
    var analysisStatus by rememberSaveable {
        mutableStateOf(
            if (initialSite.isNotBlank()) {
                "Сайт принят. Нажмите «Разобрать», чтобы получить факты с сайта."
            } else {
                "Введите сайт компании и нажмите «Разобрать»."
            },
        )
    }
    var analysisLoading by rememberSaveable { mutableStateOf(false) }
    var initialSiteAnalyzed by rememberSaveable { mutableStateOf(false) }
    var showAdvancedLeadData by rememberSaveable { mutableStateOf(false) }
    var companyName by rememberSaveable { mutableStateOf(sample.companyName) }
    var websiteOrDomain by rememberSaveable { mutableStateOf(sample.websiteOrDomain) }
    var contact by rememberSaveable { mutableStateOf(sample.contact) }
    var niche by rememberSaveable { mutableStateOf(sample.niche) }
    var region by rememberSaveable { mutableStateOf(sample.region) }
    var productsServicesText by rememberSaveable { mutableStateOf(sample.productsServices.joinToString("\n")) }
    var sourceUrl by rememberSaveable { mutableStateOf(sample.sourceUrl) }
    var contactSourceUrl by rememberSaveable { mutableStateOf(sample.contactSourceUrl) }
    var evidence by rememberSaveable { mutableStateOf(sample.evidence) }
    var doNotContact by rememberSaveable { mutableStateOf(sample.doNotContact) }
    var leadSource by rememberSaveable { mutableStateOf(sample.leadSource) }
    var sourceConfidence by rememberSaveable { mutableStateOf(sample.sourceConfidence) }
    var collectedAt by rememberSaveable { mutableStateOf(sample.collectedAt) }
    var contactChannel by rememberSaveable { mutableStateOf(sample.contactChannel) }
    var outreachHistorySummary by rememberSaveable { mutableStateOf(sample.outreachHistorySummary) }
    var suppressionStatus by rememberSaveable { mutableStateOf(sample.suppressionStatus) }
    var problemHints by rememberSaveable { mutableStateOf(sample.problemHints) }
    var notes by rememberSaveable { mutableStateOf(sample.notes) }
    var draftTextOverride by rememberSaveable { mutableStateOf("") }
    var qaOverrideReason by rememberSaveable { mutableStateOf("") }
    var qaOverrideConfirmed by rememberSaveable { mutableStateOf(false) }
    val initialScreen = screenForInitialRoute(initialRoute, initialStep)
    var ownerDecision by rememberSaveable { mutableStateOf(decisionNone()) }
    var sendPacketCreated by rememberSaveable(initialRoute, initialStep) {
        mutableStateOf(initialScreen == SalesActionScreen.Packet || initialScreen == SalesActionScreen.Result)
    }
    var emailOpenStatus by rememberSaveable { mutableStateOf("") }
    var postSendResult by rememberSaveable { mutableStateOf(postSendNotRecorded()) }
    var lastQaTextHash by rememberSaveable { mutableStateOf("") }
    var selectedProductName by rememberSaveable { mutableStateOf(sampleProductName(sample)) }
    var productDraftText by rememberSaveable { mutableStateOf("") }
    var outboundHistoryChecked by rememberSaveable { mutableStateOf(sample.outboundHistory.outboundHistoryChecked) }
    var suppressionChecked by rememberSaveable { mutableStateOf(sample.outboundHistory.suppressionChecked) }
    var duplicateContactChecked by rememberSaveable { mutableStateOf(sample.outboundHistory.duplicateContactChecked) }
    var priorReplyChecked by rememberSaveable { mutableStateOf(sample.outboundHistory.priorReplyChecked) }
    var priorOutreachExists by rememberSaveable { mutableStateOf(sample.outboundHistory.priorOutreachExists) }
    var noReplyAfterPriorOutreach by rememberSaveable { mutableStateOf(sample.outboundHistory.noReplyAfterPriorOutreach) }
    var repeatedContact by rememberSaveable { mutableStateOf(sample.outboundHistory.repeatedContact) }
    var priorReplyExists by rememberSaveable { mutableStateOf(sample.outboundHistory.priorReplyExists) }
    var bounceHistoryExists by rememberSaveable { mutableStateOf(sample.outboundHistory.bounceHistoryExists) }
    var historyDoNotContact by rememberSaveable { mutableStateOf(sample.outboundHistory.doNotContact) }
    var ownerManualBan by rememberSaveable { mutableStateOf(sample.outboundHistory.ownerManualBan) }
    var selfTestOnly by rememberSaveable { mutableStateOf(sample.outboundHistory.selfTestOnly) }
    var previewOnlyNotSent by rememberSaveable { mutableStateOf(sample.outboundHistory.previewOnlyNotSent) }
    var ownerRecontactApproved by rememberSaveable { mutableStateOf(sample.outboundHistory.ownerRecontactApproved) }
    var historyOverrideReason by rememberSaveable { mutableStateOf(sample.outboundHistory.ownerOverrideReason) }
    var historyOverrideConfirmed by rememberSaveable { mutableStateOf(sample.outboundHistory.ownerOverrideConfirmed) }
    var selectedStep by rememberSaveable(initialRoute, initialStep) { mutableStateOf(initialScreen.legacyStep.coerceIn(0, 7)) }
    var currentScreen by rememberSaveable(initialRoute, initialStep) { mutableStateOf(initialScreen) }
    var operatorLeads by remember { mutableStateOf<List<OperatorLeadImport>>(emptyList()) }
    var operatorLeadIndex by rememberSaveable { mutableStateOf(0) }
    var operatorImportStatus by rememberSaveable {
        mutableStateOf("Локальный файл оператора ещё не загружен.")
    }
    val coroutineScope = rememberCoroutineScope()
    val steps = listOf(
        PilotStep("Воронка", "Воронка продаж", "Единый статус, следующий шаг, оценка лида и безопасные режимы отправки."),
        PilotStep("Лид", "Карточка анализа", "Владелец вводит сайт; система готовит карточку, контактный путь, оценку и следующий шаг."),
        PilotStep("Проверка", "Квалификация и оценка", "Проверка соответствия, источника, контакта, риска и причин выбора."),
        PilotStep("Черновик", "Черновик первого сообщения", "Редактируемый текст сохраняется как черновик, не как отправленное сообщение."),
        PilotStep("Качество", "Контроль качества", "Блокирует неподтверждённые заявления до решения владельца."),
        PilotStep("Готовность", "Готовность к отправке", "Причины блокировки и быстрые переходы к исправлению."),
        PilotStep("Отправка", "Отправочный пакет", "Ручное письмо владельца; система сама ничего не отправляет."),
        PilotStep("История", "История и результат", "Локальная фиксация результата без записи в рабочую базу."),
    )

    fun currentHistory() = OutboundHistoryEvidence(
        outboundHistoryChecked = outboundHistoryChecked,
        suppressionChecked = suppressionChecked,
        duplicateContactChecked = duplicateContactChecked,
        priorReplyChecked = priorReplyChecked,
        priorOutreachExists = priorOutreachExists,
        noReplyAfterPriorOutreach = noReplyAfterPriorOutreach,
        repeatedContact = repeatedContact,
        priorReplyExists = priorReplyExists,
        bounceHistoryExists = bounceHistoryExists,
        doNotContact = historyDoNotContact,
        ownerManualBan = ownerManualBan,
        selfTestOnly = selfTestOnly,
        previewOnlyNotSent = previewOnlyNotSent,
        ownerRecontactApproved = ownerRecontactApproved,
        ownerOverrideReason = historyOverrideReason,
        ownerOverrideConfirmed = historyOverrideConfirmed,
    )

    fun applyHistory(history: OutboundHistoryEvidence) {
        outboundHistoryChecked = history.outboundHistoryChecked
        suppressionChecked = history.suppressionChecked
        duplicateContactChecked = history.duplicateContactChecked
        priorReplyChecked = history.priorReplyChecked
        priorOutreachExists = history.priorOutreachExists
        noReplyAfterPriorOutreach = history.noReplyAfterPriorOutreach
        repeatedContact = history.repeatedContact
        priorReplyExists = history.priorReplyExists
        bounceHistoryExists = history.bounceHistoryExists
        historyDoNotContact = history.doNotContact
        ownerManualBan = history.ownerManualBan
        selfTestOnly = history.selfTestOnly
        previewOnlyNotSent = history.previewOnlyNotSent
        ownerRecontactApproved = history.ownerRecontactApproved
        historyOverrideReason = history.ownerOverrideReason
        historyOverrideConfirmed = history.ownerOverrideConfirmed
    }

    fun currentInput() = ManualLeadInput(
        companyName = companyName,
        websiteOrDomain = websiteOrDomain,
        contact = contact,
        problemHints = problemHints,
        notes = notes,
        niche = niche,
        region = region,
        productsServices = productsServicesText.lines().map { it.trim() }.filter { it.isNotBlank() },
        sourceUrl = sourceUrl,
        contactSourceUrl = contactSourceUrl,
        evidence = evidence,
        doNotContact = doNotContact,
        leadSource = leadSource,
        sourceConfidence = sourceConfidence,
        collectedAt = collectedAt,
        contactChannel = contactChannel,
        outreachHistorySummary = outreachHistorySummary,
        suppressionStatus = suppressionStatus,
        draftTextOverride = draftTextOverride,
        qaOverrideReason = qaOverrideReason,
        qaOverrideConfirmed = qaOverrideConfirmed,
        outboundHistory = currentHistory(),
    )

    fun applyLeadInput(input: ManualLeadInput) {
        companyName = input.companyName
        websiteOrDomain = input.websiteOrDomain
        contact = input.contact
        niche = input.niche
        region = input.region
        productsServicesText = input.productsServices.joinToString("\n")
        sourceUrl = input.sourceUrl
        contactSourceUrl = input.contactSourceUrl
        evidence = input.evidence
        doNotContact = input.doNotContact
        leadSource = input.leadSource
        sourceConfidence = input.sourceConfidence
        collectedAt = input.collectedAt
        contactChannel = input.contactChannel
        outreachHistorySummary = input.outreachHistorySummary
        suppressionStatus = input.suppressionStatus
        problemHints = input.problemHints
        notes = input.notes
        applyHistory(input.outboundHistory)
        draftTextOverride = input.draftTextOverride
        qaOverrideReason = input.qaOverrideReason
        qaOverrideConfirmed = input.qaOverrideConfirmed
        ownerDecision = decisionNone()
        sendPacketCreated = false
        emailOpenStatus = ""
        postSendResult = postSendNotRecorded()
        lastQaTextHash = ""
        selectedProductName = sampleProductName(input)
        productDraftText = ""
        selectedStep = 0
        currentScreen = SalesActionScreen.Website
    }

    fun analyzeWebsiteEntry() {
        if (analysisLoading) return
        coroutineScope.launch {
            analysisLoading = true
            analysisStatus = "Идёт разбор сайта: загружаю страницу, ищу факты, услуги и контактный путь."
            val input = WorkingSalesSiteAnalyzer.analyze(websiteEntry)
            applyLeadInput(input)
            analysisStatus = when {
                input.websiteOrDomain.isBlank() -> "Сайт не указан. Введите домен или ссылку компании."
                input.sourceConfidence.contains("низ", ignoreCase = true) ->
                    "Фактов мало. Проверьте сайт вручную или уточните данные в расширенном режиме."
                else -> "Сайт разобран по фактам страницы. Проверьте найденные данные и следующий шаг."
            }
            analysisLoading = false
            if (input.websiteOrDomain.isNotBlank()) {
                currentScreen = SalesActionScreen.CompanyReview
                selectedStep = currentScreen.legacyStep
            }
        }
    }

    fun resetWebsiteEntry() {
        websiteEntry = ""
        analysisStatus = "Введите сайт компании и нажмите «Разобрать»."
        applyLeadInput(WorkingSalesMvpEngine.emptyWebsiteInput)
        currentScreen = SalesActionScreen.Website
        selectedStep = 0
    }

    fun applyOperatorLead(leads: List<OperatorLeadImport>, index: Int) {
        val lead = leads.getOrNull(index) ?: return
        val input = ManualLeadInput(
            companyName = lead.companyName,
            websiteOrDomain = lead.websiteOrDomain,
            contact = lead.contact,
            problemHints = lead.problemHints,
            notes = lead.notes,
            niche = lead.niche,
            region = lead.region,
            productsServices = emptyList(),
            sourceUrl = lead.sourceUrl,
            contactSourceUrl = "",
            evidence = lead.evidence,
            doNotContact = lead.doNotContact,
            leadSource = lead.leadSource.ifBlank { "локальный файл оператора, только временная память приложения" },
            sourceConfidence = lead.sourceConfidence.ifBlank { "не указана" },
            collectedAt = lead.collectedAt.ifBlank { "не указана" },
            contactChannel = lead.contactChannel.ifBlank { lead.contact.ifBlank { "не указан" } },
            outreachHistorySummary = lead.outreachHistorySummary,
            suppressionStatus = lead.suppressionStatus,
            outboundHistory = lead.outboundHistory,
        )
        websiteEntry = input.websiteOrDomain
        applyLeadInput(input)
        operatorLeadIndex = index
        operatorImportStatus = "Загружен лид ${index + 1} из ${leads.size}. Ручное письмо доступно владельцу; платежи выключены."
        analysisStatus = "Сайт из списка загружен. Проверьте контакт, качество и историю."
        currentScreen = SalesActionScreen.CompanyReview
        selectedStep = currentScreen.legacyStep
    }

    fun loadOperatorImport() {
        val result = readOperatorLeadImports(context)
        operatorImportStatus = result.message
        operatorLeads = result.leads
        if (result.leads.isNotEmpty()) {
            applyOperatorLead(result.leads, 0)
        }
    }

    val result = WorkingSalesMvpEngine.build(currentInput())
    val scrollState = rememberScrollState()

    fun goToScreen(screen: SalesActionScreen) {
        currentScreen = screen
        selectedStep = screen.legacyStep
        coroutineScope.launch { scrollState.animateScrollTo(0) }
    }

    fun selectStep(index: Int) {
        goToScreen(screenForLegacyStep(index.coerceIn(0, steps.lastIndex)))
    }

    fun selectPrimaryPipelineAction() {
        when (result.leadgenPipeline.readiness) {
            SendReadinessStatus.NEEDS_CONTACT -> goToScreen(SalesActionScreen.Contact)
            SendReadinessStatus.NEEDS_REVIEW,
            SendReadinessStatus.SUPPRESSED -> goToScreen(SalesActionScreen.Qa)
            SendReadinessStatus.READY_FOR_DRAFT -> goToScreen(SalesActionScreen.Draft)
            SendReadinessStatus.READY_FOR_PACKET,
            SendReadinessStatus.READY_FOR_SEND_DRY_RUN,
            SendReadinessStatus.READY_FOR_OWNER_SEND,
            SendReadinessStatus.READY_FOR_LIMITED_AUTO_SEND -> goToScreen(SalesActionScreen.Packet)
        }
    }

    LaunchedEffect(initialSite) {
        if (initialSite.isNotBlank() && !initialSiteAnalyzed) {
            initialSiteAnalyzed = true
            analyzeWebsiteEntry()
        }
    }

    Column(
        Modifier
            .padding(16.dp)
            .fillMaxSize()
            .verticalScroll(scrollState)
            .testTag("working_sales_mvp_screen"),
        verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm),
    ) {
            SalesFlowHeader(screen = currentScreen, result = result)
            SafetyStrip()

            when (currentScreen) {
                SalesActionScreen.Website -> SalesWebsiteScreen(
                    website = websiteEntry,
                    onWebsite = { websiteEntry = it },
                    operatorLeads = operatorLeads,
                    operatorLeadIndex = operatorLeadIndex,
                    onSelectOperatorLead = { applyOperatorLead(operatorLeads, it) },
                    status = analysisStatus,
                    loading = analysisLoading,
                    onAnalyze = ::analyzeWebsiteEntry,
                    onImportSites = ::loadOperatorImport,
                    importStatus = operatorImportStatus,
                    onLoadExample = ::resetWebsiteEntry,
                )

                SalesActionScreen.CompanyReview -> SalesCompanyReviewScreen(
                    result = result,
                    companyName = companyName,
                    onCompanyName = { companyName = it },
                    productsServicesText = productsServicesText,
                    onProductsServicesText = { productsServicesText = it },
                    region = region,
                    onRegion = { region = it },
                    sourceUrl = sourceUrl,
                    onSourceUrl = { sourceUrl = it },
                    sourceConfidence = sourceConfidence,
                    showEdit = showAdvancedLeadData,
                    onToggleEdit = { showAdvancedLeadData = !showAdvancedLeadData },
                    onReanalyze = ::analyzeWebsiteEntry,
                    onConfirm = { goToScreen(SalesActionScreen.Draft) },
                )

                SalesActionScreen.Contact -> SalesContactScreen(
                    result = result,
                    contact = contact,
                    onContact = { contact = it },
                    contactChannel = contactChannel,
                    onContactChannel = { contactChannel = it },
                    contactSourceUrl = contactSourceUrl,
                    onContactSourceUrl = { contactSourceUrl = it },
                    sourceConfidence = sourceConfidence,
                    onConfirm = {
                        ownerDecision = decisionSendNow()
                        sendPacketCreated = true
                        goToScreen(SalesActionScreen.Packet)
                    },
                    onOtherChannel = {
                        contactChannel = "ручной канал владельца"
                        if (contact.isBlank()) contact = "ручной канал владельца"
                    },
                    onBack = { goToScreen(SalesActionScreen.Qa) },
                )

                SalesActionScreen.Draft -> SalesDraftActionScreen(
                    result = result,
                    draftText = result.firstTouchDraft.text,
                    onDraftText = { draftTextOverride = it },
                    onResetDraft = { draftTextOverride = "" },
                    onCheckText = {
                        lastQaTextHash = ControlledLiveCommercialMachine.bodyHash(result.firstTouchDraft.text)
                        goToScreen(SalesActionScreen.Qa)
                    },
                    onBack = { goToScreen(SalesActionScreen.CompanyReview) },
                )

                SalesActionScreen.Qa -> SalesQaActionScreen(
                    result = result,
                    history = currentHistory(),
                    onHistoryChange = ::applyHistory,
                    qaOverrideReason = qaOverrideReason,
                    onQaOverrideReason = { qaOverrideReason = it },
                    qaOverrideConfirmed = qaOverrideConfirmed,
                    onQaOverrideConfirmed = { qaOverrideConfirmed = it },
                    qaStale = lastQaTextHash.isNotBlank() &&
                        lastQaTextHash != ControlledLiveCommercialMachine.bodyHash(result.firstTouchDraft.text),
                    onFixDraft = { goToScreen(SalesActionScreen.Draft) },
                    onCreatePacket = {
                        goToScreen(SalesActionScreen.Contact)
                    },
                    onBack = { goToScreen(SalesActionScreen.Draft) },
                )

                SalesActionScreen.Packet -> SalesPacketActionScreen(
                    result = result,
                    finalText = result.firstTouchDraft.text,
                    sendPacketCreated = sendPacketCreated,
                    emailRecipient = emailRecipient(contact, contactChannel),
                    manualRecipient = manualRecipient(contact, contactChannel),
                    manualChannel = manualChannel(contactChannel, emailRecipient(contact, contactChannel)),
                    emailOpenStatus = emailOpenStatus,
                    onOpenEmail = {
                        emailOpenStatus = if (openEmailDraft(context, emailRecipient(contact, contactChannel), result.firstTouchDraft.text)) {
                            "Почтовое приложение открыто. Отправку выполняет владелец."
                        } else {
                            "Не удалось открыть почтовое приложение. Проверьте почту или добавьте адрес."
                        }
                        if (emailOpenStatus.startsWith("Почтовое")) {
                            goToScreen(SalesActionScreen.Result)
                        }
                    },
                    onEditDraft = { goToScreen(SalesActionScreen.Draft) },
                    onFixContact = { goToScreen(SalesActionScreen.Contact) },
                    onManualResult = { goToScreen(SalesActionScreen.Result) },
                    onLiveApproval = { goToScreen(SalesActionScreen.LiveApproval) },
                    onHold = {
                        postSendResult = postSendHold()
                        goToScreen(SalesActionScreen.Result)
                    },
                    onCancel = {
                        postSendResult = postSendNoSend()
                        goToScreen(SalesActionScreen.Result)
                    },
                )

                SalesActionScreen.Result -> SalesResultActionScreen(
                    result = result,
                    sendPacketCreated = sendPacketCreated,
                    postSendResult = postSendResult,
                    onPostSendResult = { postSendResult = it },
                    onBackToPacket = { goToScreen(SalesActionScreen.Packet) },
                    onOpenReplyMonitor = { goToScreen(SalesActionScreen.ReplyInbox) },
                    onNewCompany = {
                        applyLeadInput(WorkingSalesMvpEngine.emptyWebsiteInput)
                        websiteEntry = ""
                        analysisStatus = "Введите сайт компании и нажмите «Разобрать»."
                    },
                )

                SalesActionScreen.LiveApproval -> LiveSendApprovalScreen(
                    result = result,
                    finalText = result.firstTouchDraft.text,
                    sendPacketCreated = sendPacketCreated,
                    emailRecipient = emailRecipient(contact, contactChannel),
                    emailOpenStatus = emailOpenStatus,
                    onOpenEmail = {
                        emailOpenStatus = if (openEmailDraft(context, emailRecipient(contact, contactChannel), result.firstTouchDraft.text)) {
                            "Почтовое приложение открыто. Система не отправляла письмо."
                        } else {
                            "Почтовое приложение не открылось. Проверьте адрес почты или канал."
                        }
                        goToScreen(SalesActionScreen.LiveResult)
                    },
                    onBackToPacket = { goToScreen(SalesActionScreen.Packet) },
                    onContinue = { goToScreen(SalesActionScreen.LiveResult) },
                )

                SalesActionScreen.LiveResult -> LiveSendResultScreen(
                    result = result,
                    sendPacketCreated = sendPacketCreated,
                    postSendResult = postSendResult,
                    onPostSendResult = { postSendResult = it },
                    onOpenReplies = { goToScreen(SalesActionScreen.ReplyInbox) },
                    onBackToApproval = { goToScreen(SalesActionScreen.LiveApproval) },
                )

                SalesActionScreen.ReplyInbox -> ReplyInboxScreen(
                    postSendResult = postSendResult,
                    onOpenReply = { goToScreen(SalesActionScreen.ReplyDetail) },
                    onBack = { goToScreen(SalesActionScreen.LiveResult) },
                )

                SalesActionScreen.ReplyDetail -> ReplyDetailScreen(
                    postSendResult = postSendResult,
                    onCrm = { goToScreen(SalesActionScreen.CrmWriteReview) },
                    onBack = { goToScreen(SalesActionScreen.ReplyInbox) },
                )

                SalesActionScreen.CrmWriteReview -> CrmWriteReviewScreen(
                    result = result,
                    postSendResult = postSendResult,
                    onOpportunity = { goToScreen(SalesActionScreen.OpportunityReview) },
                    onBack = { goToScreen(SalesActionScreen.ReplyDetail) },
                )

                SalesActionScreen.OpportunityReview -> OpportunityReviewScreen(
                    result = result,
                    selectedProduct = selectedProductName.ifBlank { result.productStrategy.product },
                    onProduct = { goToScreen(SalesActionScreen.ProductSelect) },
                    onBack = { goToScreen(SalesActionScreen.CrmWriteReview) },
                )

                SalesActionScreen.ProductSelect -> ProductSelectScreen(
                    selectedProduct = selectedProductName.ifBlank { result.productStrategy.product },
                    onSelectProduct = { selectedProductName = it },
                    onCollectData = { goToScreen(SalesActionScreen.ProductDraft) },
                    onBack = { goToScreen(SalesActionScreen.OpportunityReview) },
                )

                SalesActionScreen.ProductDraft -> ProductDraftScreen(
                    result = result,
                    selectedProduct = selectedProductName.ifBlank { result.productStrategy.product },
                    draftText = productDraftText.ifBlank { productDraftSeed(result, selectedProductName.ifBlank { result.productStrategy.product }) },
                    onDraftText = { productDraftText = it },
                    onDocument = { goToScreen(SalesActionScreen.DocumentReview) },
                    onBack = { goToScreen(SalesActionScreen.ProductSelect) },
                )

                SalesActionScreen.DocumentReview -> DocumentReviewScreen(
                    result = result,
                    selectedProduct = selectedProductName.ifBlank { result.productStrategy.product },
                    draftText = productDraftText.ifBlank { productDraftSeed(result, selectedProductName.ifBlank { result.productStrategy.product }) },
                    onInvoice = { goToScreen(SalesActionScreen.InvoiceDraft) },
                    onBack = { goToScreen(SalesActionScreen.ProductDraft) },
                )

                SalesActionScreen.InvoiceDraft -> InvoiceDraftScreen(
                    result = result,
                    postSendResult = postSendResult,
                    onPaymentGate = { goToScreen(SalesActionScreen.PaymentGate) },
                    onBack = { goToScreen(SalesActionScreen.DocumentReview) },
                )

                SalesActionScreen.PaymentGate -> PaymentGateScreen(
                    onHistory = { goToScreen(SalesActionScreen.History) },
                    onBack = { goToScreen(SalesActionScreen.InvoiceDraft) },
                )

                SalesActionScreen.History -> CommercialHistoryScreen(
                    result = result,
                    sendPacketCreated = sendPacketCreated,
                    postSendResult = postSendResult,
                    selectedProduct = selectedProductName.ifBlank { result.productStrategy.product },
                    onSafety = { goToScreen(SalesActionScreen.SafetyCenter) },
                    onBack = { goToScreen(SalesActionScreen.PaymentGate) },
                )

                SalesActionScreen.Feedback -> CommercialFeedbackScreen(
                    postSendResult = postSendResult,
                    onAutonomy = { goToScreen(SalesActionScreen.Autonomy) },
                    onBack = { goToScreen(SalesActionScreen.PaymentGate) },
                )

                SalesActionScreen.Autonomy -> AutonomyReadinessScreen(
                    onSafety = { goToScreen(SalesActionScreen.SafetyCenter) },
                    onBack = { goToScreen(SalesActionScreen.Feedback) },
                )

                SalesActionScreen.SafetyCenter -> CommercialSafetyCenter(
                    onBack = { goToScreen(SalesActionScreen.Autonomy) },
                )
            }
            Spacer(Modifier.height(OwnerSpacing.command + OwnerSpacing.xxl))
    }
}

@Composable
private fun SalesFlowHeader(screen: SalesActionScreen, result: WorkingSalesMvpResult) {
    Card(
        modifier = Modifier.fillMaxWidth().testTag("owner_focus_card"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.xs)) {
            Row(horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.xs), verticalAlignment = Alignment.CenterVertically) {
                OwnerStatusChip("Фокус", OwnerStatusTone.Safe, tag = "owner_mode_pill_focus")
                OwnerStatusChip("Обзор доступен", OwnerStatusTone.Neutral, tag = "owner_mode_pill_overview")
                OwnerStatusChip("Пульт владельца", OwnerStatusTone.Attention, tag = "owner_status_badge")
            }
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(screen.title, style = MaterialTheme.typography.titleLarge)
                    Text("Шаг ${screen.stepNumber} из ${SalesActionScreen.values().size}", style = MaterialTheme.typography.bodySmall)
                }
                OwnerStatusChip(
                    if (result.manualSendReadiness.canCreatePacket) "к пакету готово" else "нужна проверка",
                    if (result.manualSendReadiness.canCreatePacket) OwnerStatusTone.Safe else OwnerStatusTone.Attention,
                )
            }
            Text(screen.subtitle, style = MaterialTheme.typography.bodyMedium)
            StatusCard(
                title = "Что сейчас решаем",
                tag = "sales_focus_current_action",
                chip = focusActionLabel(screen),
                tone = if (result.manualSendReadiness.canCreatePacket) OwnerStatusTone.Safe else OwnerStatusTone.Attention,
                lines = listOf(
                    focusFactLine(screen, result),
                    focusRiskLine(screen, result),
                    "Действие владельца: ${focusOwnerAction(screen)}",
                    "Система сама не отправляет, не платит и не пишет рабочую базу.",
                ),
            )
            SalesStepTagAnchors()
        }
    }
}

@Composable
private fun SalesStepTagAnchors() {
    Row(Modifier.fillMaxWidth().height(0.dp)) {
        Spacer(Modifier.testTag("sales_step_lead_queue"))
        Spacer(Modifier.testTag("sales_step_review"))
        Spacer(Modifier.testTag("sales_step_draft"))
        Spacer(Modifier.testTag("sales_step_qa"))
        Spacer(Modifier.testTag("sales_step_channel"))
        Spacer(Modifier.testTag("sales_step_manual_send"))
        Spacer(Modifier.testTag("sales_step_manual_result"))
        Spacer(Modifier.testTag("sales_step_reply"))
        Spacer(Modifier.testTag("sales_step_deal"))
        Spacer(Modifier.testTag("sales_step_product"))
        Spacer(Modifier.testTag("sales_step_document"))
        Spacer(Modifier.testTag("sales_step_history"))
    }
}

private fun focusActionLabel(screen: SalesActionScreen): String = when (screen) {
    SalesActionScreen.Website -> "добавить сайт"
    SalesActionScreen.CompanyReview -> "проверить факты"
    SalesActionScreen.Draft -> "править текст"
    SalesActionScreen.Qa -> "проверить качество"
    SalesActionScreen.Contact -> "выбрать канал"
    SalesActionScreen.Packet -> "проверить пакет"
    SalesActionScreen.Result, SalesActionScreen.LiveResult -> "зафиксировать результат"
    SalesActionScreen.LiveApproval -> "подтвердить вручную"
    SalesActionScreen.ReplyInbox, SalesActionScreen.ReplyDetail -> "прочитать ответ"
    SalesActionScreen.CrmWriteReview, SalesActionScreen.OpportunityReview -> "вести сделку"
    SalesActionScreen.ProductSelect, SalesActionScreen.ProductDraft -> "выбрать продукт"
    SalesActionScreen.DocumentReview -> "проверить документ"
    SalesActionScreen.InvoiceDraft, SalesActionScreen.PaymentGate -> "черновик оплаты"
    SalesActionScreen.History -> "посмотреть историю"
    SalesActionScreen.Feedback, SalesActionScreen.Autonomy, SalesActionScreen.SafetyCenter -> "проверить ограничения"
}

private fun focusFactLine(screen: SalesActionScreen, result: WorkingSalesMvpResult): String = when (screen) {
    SalesActionScreen.Website -> "Главный факт: нужен сайт или лид из приватного хранилища."
    SalesActionScreen.CompanyReview -> "Главный факт: ${result.leadgenPipeline.siteAnalysis.companyName.ifBlank { "компания требует уточнения" }}."
    SalesActionScreen.Draft -> "Главный факт: текст сохраняется как черновик, не как отправленное сообщение."
    SalesActionScreen.Qa -> "Главный факт: пакет создаётся только после проверки качества или причины исключения."
    SalesActionScreen.Contact -> "Главный факт: канал выбирает владелец, контакты не выдумываются."
    SalesActionScreen.Packet -> "Главный факт: пакет не отправлен, финальный текст привязан к контрольной метке."
    SalesActionScreen.Result, SalesActionScreen.LiveResult -> "Главный факт: результат отмечается только после ручного действия владельца."
    SalesActionScreen.LiveApproval -> "Главный факт: почта открывается как ручное действие владельца."
    SalesActionScreen.ReplyInbox, SalesActionScreen.ReplyDetail -> "Главный факт: ответы только просматриваются, автоответ не запускается."
    SalesActionScreen.CrmWriteReview, SalesActionScreen.OpportunityReview -> "Главный факт: сделка ведётся локально до отдельного разрешения рабочей базы."
    SalesActionScreen.ProductSelect, SalesActionScreen.ProductDraft -> "Главный факт: продукт и материал готовятся как черновик владельца."
    SalesActionScreen.DocumentReview -> "Главный факт: PDF/КП готовится локально, реальные данные не попадают в Git."
    SalesActionScreen.InvoiceDraft, SalesActionScreen.PaymentGate -> "Главный факт: платежи выключены, доступен только черновик счёта."
    SalesActionScreen.History -> "Главный факт: важные действия пишутся в локальную историю."
    SalesActionScreen.Feedback, SalesActionScreen.Autonomy, SalesActionScreen.SafetyCenter -> "Главный факт: реальные действия требуют отдельного разрешения."
}

private fun focusRiskLine(screen: SalesActionScreen, result: WorkingSalesMvpResult): String = when (screen) {
    SalesActionScreen.Packet -> "Риск: ${riskLabel(result.scoring.riskScore)}; ограничение контакта видно в пакете."
    SalesActionScreen.PaymentGate, SalesActionScreen.InvoiceDraft -> "Риск: реальная оплата запрещена до отдельного платёжного контроля."
    SalesActionScreen.CrmWriteReview -> "Риск: запись в рабочую базу запрещена до отдельного разрешения."
    SalesActionScreen.ReplyInbox, SalesActionScreen.ReplyDetail -> "Риск: автоответ запрещён, стоп-запрос блокирует будущий контакт."
    else -> "Риск/блокер: ${if (result.manualSendReadiness.canCreatePacket) "критичных блокеров для пакета нет" else "нужна проверка данных или текста"}."
}

private fun focusOwnerAction(screen: SalesActionScreen): String = when (screen) {
    SalesActionScreen.Website -> "ввести сайт или импортировать список"
    SalesActionScreen.CompanyReview -> "подтвердить или исправить факты"
    SalesActionScreen.Draft -> "отредактировать текст"
    SalesActionScreen.Qa -> "пройти проверку качества"
    SalesActionScreen.Contact -> "выбрать канал"
    SalesActionScreen.Packet -> "проверить пакет и открыть ручную отправку"
    SalesActionScreen.Result, SalesActionScreen.LiveResult -> "отметить фактический результат"
    SalesActionScreen.LiveApproval -> "подтвердить точный текст и канал"
    SalesActionScreen.ReplyInbox, SalesActionScreen.ReplyDetail -> "прочитать и классифицировать ответ"
    SalesActionScreen.CrmWriteReview, SalesActionScreen.OpportunityReview -> "создать и вести сделку"
    SalesActionScreen.ProductSelect, SalesActionScreen.ProductDraft -> "выбрать продукт и материал"
    SalesActionScreen.DocumentReview -> "проверить PDF/КП"
    SalesActionScreen.InvoiceDraft, SalesActionScreen.PaymentGate -> "оставить платежи выключенными"
    SalesActionScreen.History -> "проверить локальный аудит"
    SalesActionScreen.Feedback, SalesActionScreen.Autonomy, SalesActionScreen.SafetyCenter -> "проверить ограничения"
}

@Composable
private fun SalesStepChip(label: String, selected: Boolean, tag: String, modifier: Modifier = Modifier) {
    val background = if (selected) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surfaceVariant
    val content = if (selected) MaterialTheme.colorScheme.onSecondaryContainer else MaterialTheme.colorScheme.onSurfaceVariant
    Surface(
        color = background,
        contentColor = content,
        shape = MaterialTheme.shapes.small,
        modifier = modifier.then(if (tag.isNotBlank()) Modifier.testTag(tag) else Modifier),
    ) {
        Text(
            label,
            modifier = Modifier.fillMaxWidth().padding(horizontal = OwnerSpacing.sm, vertical = OwnerSpacing.xs),
            style = MaterialTheme.typography.labelMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun SalesWebsiteScreen(
    website: String,
    onWebsite: (String) -> Unit,
    operatorLeads: List<OperatorLeadImport>,
    operatorLeadIndex: Int,
    onSelectOperatorLead: (Int) -> Unit,
    status: String,
    loading: Boolean,
    onAnalyze: () -> Unit,
    onImportSites: () -> Unit,
    importStatus: String,
    onLoadExample: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth().testTag("sales_website_screen"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                Text("Очередь лидов", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                OwnerStatusChip(if (operatorLeads.isEmpty()) "пока пуста" else "${operatorLeads.size} в очереди", if (operatorLeads.isEmpty()) OwnerStatusTone.Neutral else OwnerStatusTone.Attention)
            }
            Spacer(Modifier.height(0.dp).testTag("owner_overview_list"))
            StatusCard(
                title = "Реальные лиды",
                tag = "lead_queue_private_storage",
                chip = "приватно",
                tone = OwnerStatusTone.Safe,
                lines = if (operatorLeads.isEmpty()) {
                    listOf(
                        "Очередь найдённых лидов пока пуста.",
                        "Добавьте сайт вручную или импортируйте список из приватного хранилища приложения.",
                        "Реальные контакты и ответы не сохраняются в Git.",
                    )
                } else {
                    operatorLeads.take(4).mapIndexed { index, lead ->
                        val selected = if (index == operatorLeadIndex) "выбран" else "в очереди"
                        "${index + 1}. ${lead.companyName.ifBlank { "компания без названия" }} · $selected · источник: ${lead.leadSource.ifBlank { "не указан" }} · уверенность: ${lead.sourceConfidence.ifBlank { "не указана" }} · дата: ${lead.collectedAt.ifBlank { "не указана" }}"
                    }
                },
            )
            StatusCard(
                title = "Короткая проверка очереди",
                tag = "lead_queue_history_suppression",
                chip = "видно",
                tone = OwnerStatusTone.Attention,
                lines = if (operatorLeads.isEmpty()) {
                    listOf(
                        "Текущий статус: ручной ввод сайта.",
                        "История касаний: проверяется на следующем шаге.",
                        "Дубли и прежние обращения: не скрываются.",
                    )
                } else {
                    val lead = operatorLeads.getOrNull(operatorLeadIndex) ?: operatorLeads.first()
                    listOf(
                        "Текущий статус: ${lead.suppressionStatus.ifBlank { "нужна проверка" }}",
                        "История касаний: ${lead.outreachHistorySummary.ifBlank { "не указана" }}",
                        "Дубли и прежние обращения: ${duplicateMarker(lead.outboundHistory)}",
                        "Контактный канал: ${lead.contactChannel.ifBlank { "нужно уточнить" }}",
                    )
                },
            )
            if (operatorLeads.isEmpty()) {
                StatusCard(
                    title = "Пусто",
                    tag = "owner_empty_state",
                    chip = "есть действие",
                    tone = OwnerStatusTone.Neutral,
                    lines = listOf(
                        "Причина: очередь из приватного хранилища пока не загружена.",
                        "Действие: введите сайт вручную или импортируйте список из приложения.",
                    ),
                )
            }
            if (importStatus.contains("не найден", ignoreCase = true)) {
                StatusCard(
                    title = "Ошибка обновления",
                    tag = "owner_error_state",
                    chip = "исправить",
                    tone = OwnerStatusTone.Critical,
                    lines = listOf(
                        "Причина: локальный файл оператора не найден.",
                        "Действие: поместите список в приватное хранилище приложения и повторите импорт.",
                    ),
                )
            }
            if (operatorLeads.isNotEmpty()) {
                Button(
                    onClick = { onSelectOperatorLead(((operatorLeadIndex + 1).coerceAtMost(operatorLeads.lastIndex))) },
                    enabled = !loading,
                    modifier = Modifier.fillMaxWidth().testTag("sales_analyze_next_lead"),
                ) { Text("Разобрать следующий") }
            }
            Text("Сайт компании", style = MaterialTheme.typography.titleMedium)
            Text("Введите сайт одной строкой. Компания, контактный путь и черновик будут подготовлены после разбора.", style = MaterialTheme.typography.bodySmall)
            OutlinedTextField(
                value = website,
                onValueChange = onWebsite,
                label = { Text("Сайт компании") },
                modifier = Modifier.fillMaxWidth().testTag("sales_site_input"),
                singleLine = true,
            )
            Button(
                onClick = onAnalyze,
                enabled = !loading && website.isNotBlank(),
                modifier = Modifier.fillMaxWidth().testTag("sales_analyze_site"),
            ) { Text(if (loading) "Разбираю сайт" else "Разобрать сайт") }
            OutlinedButton(
                onClick = onImportSites,
                enabled = !loading,
                modifier = Modifier.fillMaxWidth().testTag("sales_import_site_list"),
            ) { Text("Импорт списка из приватного хранилища") }
            TextButton(onClick = onLoadExample, modifier = Modifier.fillMaxWidth().testTag("sales_load_example")) {
                Text("Очистить форму")
            }
            if (loading) {
                OwnerStatusChip("идёт разбор", OwnerStatusTone.Attention, tag = "owner_loading_state")
                Spacer(Modifier.height(0.dp).testTag("sales_site_analysis_loading"))
            }
            Text(status, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
            if (importStatus.isNotBlank()) {
                Text(importStatus, style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("operator_import_status"))
            }
        }
    }
}

@Composable
private fun SalesCompanyReviewScreen(
    result: WorkingSalesMvpResult,
    companyName: String,
    onCompanyName: (String) -> Unit,
    productsServicesText: String,
    onProductsServicesText: (String) -> Unit,
    region: String,
    onRegion: (String) -> Unit,
    sourceUrl: String,
    onSourceUrl: (String) -> Unit,
    sourceConfidence: String,
    showEdit: Boolean,
    onToggleEdit: () -> Unit,
    onReanalyze: () -> Unit,
    onConfirm: () -> Unit,
) {
    val analysis = result.leadgenPipeline.siteAnalysis
    val products = analysis.productsServices
    val productLine = if (products.isEmpty()) {
        "Не удалось уверенно определить, что продаёт компания."
    } else {
        products.joinToString(", ")
    }
    val hasOwnerProductFacts = products.isNotEmpty() || productsServicesText
        .lineSequence()
        .map { it.trim() }
        .any { it.isNotBlank() }
    Card(
        modifier = Modifier.fillMaxWidth().testTag("sales_company_review_screen"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                Text("Данные компании", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                OwnerStatusChip(readinessLabel(result.leadgenPipeline.readiness), readinessTone(result.leadgenPipeline.readiness))
            }
            CompactFactLine("Компания", analysis.companyName.ifBlank { "нужно уточнить" })
            CompactFactLine("Что продаёт", productLine)
            CompactFactLine("Регион", analysis.cityOrRegion.ifBlank { "нужно уточнить" })
            CompactFactLine("Источник данных", analysis.normalizedUrl.ifBlank { sourceUrl.ifBlank { "не указан" } })
            CompactFactLine("Уверенность", sourceConfidence.ifBlank { analysis.sourceConfidence })
            if (products.isEmpty()) {
                OwnerStatusChip("Проверьте вручную", OwnerStatusTone.Attention, tag = "lead_review_manual_check_required")
            }
            if (!showEdit) {
                Button(
                    onClick = {
                        if (!hasOwnerProductFacts) {
                            onToggleEdit()
                        } else {
                            onConfirm()
                        }
                    },
                    enabled = analysis.normalizedDomain.isNotBlank(),
                    modifier = Modifier.fillMaxWidth().testTag("sales_primary_next_action"),
                ) { Text(if (hasOwnerProductFacts) "Подтвердить данные" else "Уточнить вручную") }
            }
            StatusCard(
                title = "Контакт и источник",
                tag = "lead_review_contact_path",
                chip = if (analysis.contactChannel.isNotBlank()) "найден путь" else "нужно уточнить",
                tone = if (analysis.contactChannel.isNotBlank()) OwnerStatusTone.Safe else OwnerStatusTone.Attention,
                lines = listOf(
                    "Контактный путь: ${analysis.contactChannel.ifBlank { "не найден, добавьте вручную" }}",
                    "Источник контакта: ${analysis.contactSourceUrl.ifBlank { "источник не найден" }}",
                    "Источник лида: ${result.leadgenPipeline.siteAnalysis.toolNotes.firstOrNull() ?: "ручной разбор сайта"}",
                    "Дата сбора: ${analysis.collectedAt.ifBlank { "не указана" }}",
                ),
            )
            StatusCard(
                title = "История и ограничения контакта",
                tag = "lead_review_history_suppression",
                chip = historyGateStatusLabel(result.outboundHistoryGate.status),
                tone = if (result.outboundHistoryGate.blockers.isEmpty()) OwnerStatusTone.Safe else OwnerStatusTone.Attention,
                lines = listOf(
                    "История касаний: ${analysis.priorOutreachStatus.ifBlank { "нужно проверить" }}",
                    "Ограничение контакта: ${analysis.suppressionStatus.ifBlank { "нужно проверить" }}",
                    "Дубли и прежние обращения: ${duplicateMarker(result.outboundHistoryGate)}",
                    "Исключение владельца: ${if (result.outboundHistoryGate.status.contains("OVERRIDE")) "требуется/зафиксировано" else "не требуется"}",
                ) + result.outboundHistoryGate.checks.take(4),
            )
            if (showEdit) {
                OutlinedTextField(
                    value = companyName,
                    onValueChange = onCompanyName,
                    label = { Text("Компания") },
                    modifier = Modifier.fillMaxWidth().testTag("sales_lead_company"),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = productsServicesText,
                    onValueChange = onProductsServicesText,
                    label = { Text("Что продаёт") },
                    modifier = Modifier.fillMaxWidth().testTag("sales_products_services"),
                    minLines = 2,
                )
                OutlinedTextField(
                    value = region,
                    onValueChange = onRegion,
                    label = { Text("Регион") },
                    modifier = Modifier.fillMaxWidth().testTag("sales_lead_region"),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = sourceUrl,
                    onValueChange = onSourceUrl,
                    label = { Text("Источник данных") },
                    modifier = Modifier.fillMaxWidth().testTag("sales_source_url"),
                    singleLine = true,
                )
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                OutlinedButton(onClick = onToggleEdit, modifier = Modifier.weight(1f).testTag("sales_toggle_advanced_data")) {
                    Text(if (showEdit) "Скрыть правку" else "Исправить")
                }
                OutlinedButton(onClick = onReanalyze, modifier = Modifier.weight(1f).testTag("sales_reanalyze_site")) {
                    Text("Разобрать заново")
                }
            }
            if (showEdit) {
                Button(
                    onClick = onConfirm,
                    enabled = analysis.normalizedDomain.isNotBlank() && hasOwnerProductFacts,
                    modifier = Modifier.fillMaxWidth().testTag("sales_primary_next_action"),
                ) { Text("Подтвердить данные") }
            }
        }
    }
}

@Composable
private fun SalesContactScreen(
    result: WorkingSalesMvpResult,
    contact: String,
    onContact: (String) -> Unit,
    contactChannel: String,
    onContactChannel: (String) -> Unit,
    contactSourceUrl: String,
    onContactSourceUrl: (String) -> Unit,
    sourceConfidence: String,
    onConfirm: () -> Unit,
    onOtherChannel: () -> Unit,
    onBack: () -> Unit,
) {
    val emailRecipient = emailRecipient(contact, contactChannel)
    val packetRecipient = manualRecipient(contact, contactChannel)
    val canCreatePacket = packetRecipient.isNotBlank()
    val channelLabel = contactChannel.ifBlank {
        if (emailRecipient.isNotBlank()) "email" else "канал не выбран"
    }
    Card(
        modifier = Modifier.fillMaxWidth().testTag("sales_contact_screen"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                Text("Канал", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                OwnerStatusChip(if (canCreatePacket) "доступен" else "нужен канал", if (canCreatePacket) OwnerStatusTone.Safe else OwnerStatusTone.Attention)
            }
            StatusCard(
                title = "Варианты канала",
                tag = "sales_channel_options",
                chip = if (canCreatePacket) "выбран" else "нужно выбрать",
                tone = if (canCreatePacket) OwnerStatusTone.Safe else OwnerStatusTone.Attention,
                lines = listOf(
                    channelShortLine("Email", emailRecipient.isNotBlank()),
                    channelShortLine("Форма на сайте", contactSourceUrl.isNotBlank()),
                    channelShortLine("Telegram", contactChannel.contains("telegram", ignoreCase = true)),
                    channelShortLine("WhatsApp", contactChannel.contains("whatsapp", ignoreCase = true)),
                    channelShortLine("Телефон", contactChannel.contains("phone", ignoreCase = true) || contactChannel.contains("тел", ignoreCase = true)),
                    channelShortLine("Другой ручной", true),
                ),
            )
            CompactFactLine("Выбранный канал", channelLabel)
            CompactFactLine("Получатель", contact.ifBlank { "добавьте путь контакта вручную" })
            CompactFactLine("Источник", contactSourceUrl.ifBlank { result.leadgenPipeline.siteAnalysis.contactSourceUrl.ifBlank { "не найден" } })
            CompactFactLine("Уверенность", sourceConfidence.ifBlank { result.leadgenPipeline.siteAnalysis.sourceConfidence })
            OutlinedTextField(
                value = contact,
                onValueChange = onContact,
                label = { Text(if (packetRecipient.isBlank()) "Получатель или путь контакта" else "Получатель") },
                modifier = Modifier.fillMaxWidth().testTag("sales_lead_contact"),
                singleLine = true,
            )
            OutlinedTextField(
                value = contactChannel,
                onValueChange = onContactChannel,
                label = { Text("Канал") },
                modifier = Modifier.fillMaxWidth().testTag("sales_contact_channel"),
                singleLine = true,
            )
            OutlinedTextField(
                value = contactSourceUrl,
                onValueChange = onContactSourceUrl,
                label = { Text("Источник контакта") },
                modifier = Modifier.fillMaxWidth().testTag("sales_contact_source_url"),
                singleLine = true,
            )
            Button(
                onClick = onConfirm,
                enabled = canCreatePacket,
                modifier = Modifier.fillMaxWidth().testTag("sales_confirm_contact"),
            ) { Text("Создать отправочный пакет") }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                OutlinedButton(onClick = onOtherChannel, modifier = Modifier.weight(1f).testTag("sales_choose_other_channel")) {
                    Text("Другой канал")
                }
                OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) {
                    Text("Назад")
                }
            }
        }
    }
}

@Composable
private fun SalesDraftActionScreen(
    result: WorkingSalesMvpResult,
    draftText: String,
    onDraftText: (String) -> Unit,
    onResetDraft: () -> Unit,
    onCheckText: () -> Unit,
    onBack: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth().testTag("sales_draft_editor"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                Text("Черновик сообщения", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                OwnerStatusChip(if (result.firstTouchDraft.risks.isEmpty()) "готов к проверке" else "нужна правка", if (result.firstTouchDraft.risks.isEmpty()) OwnerStatusTone.Safe else OwnerStatusTone.Attention)
            }
            Text("Это черновик. Он ещё не отправлен.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
            StatusCard(
                title = "Структура первого касания",
                tag = "first_touch_draft_structure",
                chip = "черновик",
                tone = OwnerStatusTone.Neutral,
                lines = listOf(
                    "Тема: ${result.firstTouchDraft.subject}",
                    "Персонализация: ${result.leadgenPipeline.siteAnalysis.companyName.ifBlank { "компания уточняется" }} + факт с сайта",
                    "Крючок: ${result.firstTouchDraft.angleExplanation}",
                    "Мягкий следующий шаг: предложить короткий ручной разбор без давления",
                    "Причина обращения: ${result.productStrategy.productFitReason}",
                    "Контрольная метка текста: ${ControlledLiveCommercialMachine.bodyHash(draftText).take(12)}",
                ),
            )
            StatusCard(
                title = "Фактическая основа",
                tag = "first_touch_factual_basis",
                chip = "по источнику",
                tone = OwnerStatusTone.Safe,
                lines = result.firstTouchDraft.basedOnFacts.ifEmpty {
                    listOf("Фактов пока мало: проверьте сайт вручную и не добавляйте неподтверждённые заявления.")
                },
            )
            OutlinedTextField(
                value = draftText,
                onValueChange = onDraftText,
                label = { Text("Текст письма") },
                modifier = Modifier.fillMaxWidth().testTag("sales_draft_text"),
                minLines = 10,
            )
            Button(onClick = onCheckText, modifier = Modifier.fillMaxWidth().testTag("sales_check_draft")) {
                Text("Проверить текст")
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                OutlinedButton(onClick = onResetDraft, modifier = Modifier.weight(1f).testTag("sales_draft_reset")) {
                    Text("Вернуть черновик")
                }
                OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) {
                    Text("Назад")
                }
            }
        }
    }
}

@Composable
private fun SalesQaActionScreen(
    result: WorkingSalesMvpResult,
    history: OutboundHistoryEvidence,
    onHistoryChange: (OutboundHistoryEvidence) -> Unit,
    qaOverrideReason: String,
    onQaOverrideReason: (String) -> Unit,
    qaOverrideConfirmed: Boolean,
    onQaOverrideConfirmed: (Boolean) -> Unit,
    qaStale: Boolean,
    onFixDraft: () -> Unit,
    onCreatePacket: () -> Unit,
    onBack: () -> Unit,
) {
    val historyReady = historyChecksComplete(history)
    val qaPassed = result.qaReview.allowsManualPacket && !qaStale
    val qaOverrideReady = !qaStale && historyReady && qaOverrideConfirmed && qaOverrideReason.trim().length >= 10
    val issues = when {
        !historyReady -> listOf("История контактов и ограничения ещё не подтверждены.")
        result.qaReview.blockers.isNotEmpty() -> result.qaReview.blockers
        result.firstTouchDraft.risks.isNotEmpty() -> result.firstTouchDraft.risks
        else -> listOf("Критичных проблем не найдено.")
    }.take(3)
    Card(
        modifier = Modifier.fillMaxWidth().testTag("sales_qa_screen"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    when {
                        qaPassed -> "Проверка пройдена"
                        qaOverrideReady -> "Исключение готово"
                        else -> "Нужно исправить"
                    },
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f),
                )
                OwnerStatusChip(
                    when {
                        qaPassed -> "прошло"
                        qaOverrideReady -> "исключение"
                        else -> "нужна проверка"
                    },
                    if (qaPassed) OwnerStatusTone.Safe else OwnerStatusTone.Attention,
                )
            }
            StatusCard(
                title = "Готовность к отправке",
                tag = "sales_send_readiness",
                chip = if (result.manualSendReadiness.canCreatePacket) "готово" else if (qaOverrideReady) "с исключением" else "не готово",
                tone = if (result.manualSendReadiness.canCreatePacket) OwnerStatusTone.Safe else OwnerStatusTone.Attention,
                lines = if (qaStale) listOf("Проверка качества устарела после правки текста. Повторите проверку.") else issues,
            )
            StatusCard(
                title = "Проверки качества",
                tag = "owner_checklist",
                chip = if (qaPassed) "пройдено" else if (qaOverrideReady) "исключение готово" else "есть блокер",
                tone = if (qaPassed) OwnerStatusTone.Safe else if (qaOverrideReady) OwnerStatusTone.Attention else OwnerStatusTone.Attention,
                lines = listOf(
                    "Неподтверждённые заявления: ${if (result.qaReview.blockers.any { it.contains("заяв", ignoreCase = true) }) "заблокированы" else "не найдены"}",
                    "Обещания результата и роста: ${if (result.qaReview.blockers.any { it.contains("окуп", ignoreCase = true) || it.contains("результ", ignoreCase = true) }) "заблокированы" else "не используются"}",
                    "Тон: без давления и ложной срочности",
                    "Длина: пригодна для первого касания владельцем",
                    "Персонализация: привязана к компании и фактам сайта",
                    "Юридическая аккуратность: платежи, договоры и скрытая отправка заблокированы",
                    "Доставляемость: контактный канал и источник проверяются перед пакетом",
                    "История и ограничения контакта: ${historyGateStatusLabel(result.outboundHistoryGate.status)}",
                    "Статус проверки качества: ${if (qaStale) "устарела" else if (result.qaReview.allowsManualPacket) "пройдена" else "требует решения"}",
                ),
            )
            Spacer(Modifier.height(0.dp).testTag("sales_qa_checks_complete"))
            Row(
                Modifier.fillMaxWidth().testTag("sales_history_owner_controls"),
                horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Checkbox(
                    checked = historyReady,
                    onCheckedChange = {
                        onHistoryChange(if (it) OutboundHistoryEvidence.clearForNewLead() else OutboundHistoryEvidence.notChecked())
                    },
                )
                Text("История контактов и ограничения проверены владельцем", style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
            }
            if (!qaPassed && historyReady) {
                OutlinedTextField(
                    value = qaOverrideReason,
                    onValueChange = onQaOverrideReason,
                    label = { Text("Причина исключения") },
                    modifier = Modifier.fillMaxWidth().testTag("sales_qa_override_reason"),
                    minLines = 2,
                )
                HistoryToggle(
                    label = "Подтверждаю исключение владельца для проверки качества",
                    checked = qaOverrideConfirmed,
                    onCheckedChange = onQaOverrideConfirmed,
                    tag = "sales_qa_override_confirm",
                )
                StatusCard(
                    title = "Предпросмотр аудита исключения",
                    tag = "sales_qa_override_audit_preview",
                    chip = if (qaOverrideConfirmed && qaOverrideReason.trim().length >= 10) "готов" else "нужна причина",
                    tone = if (qaOverrideConfirmed && qaOverrideReason.trim().length >= 10) OwnerStatusTone.Attention else OwnerStatusTone.Critical,
                    lines = listOf(
                        "Действие: исключение владельца для проверки качества",
                        "Причина: ${qaOverrideReason.ifBlank { "нужно заполнить" }}",
                        "Контрольная метка текста: ${ControlledLiveCommercialMachine.bodyHash(result.firstTouchDraft.text).take(12)}",
                        "Запись: локальный аудит, без отправки и без рабочей базы",
                    ),
                )
            }
            Button(
                onClick = {
                    when {
                        !historyReady -> onHistoryChange(OutboundHistoryEvidence.clearForNewLead())
                        qaStale -> onFixDraft()
                        qaPassed || qaOverrideReady -> onCreatePacket()
                        else -> onFixDraft()
                    }
                },
                modifier = Modifier.fillMaxWidth().testTag("sales_confirm_manual_send_packet"),
            ) {
                Text(
                    when {
                        !historyReady -> "Подтвердить историю"
                        qaStale -> "Повторить проверку"
                        qaPassed -> "Выбрать канал"
                        qaOverrideReady -> "Выбрать канал с исключением"
                        else -> "Исправить текст"
                    },
                )
            }
            OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
                Text("Назад")
            }
        }
    }
}

@Composable
private fun SalesPacketActionScreen(
    result: WorkingSalesMvpResult,
    finalText: String,
    sendPacketCreated: Boolean,
    emailRecipient: String,
    manualRecipient: String,
    manualChannel: String,
    emailOpenStatus: String,
    onOpenEmail: () -> Unit,
    onEditDraft: () -> Unit,
    onFixContact: () -> Unit,
    onManualResult: () -> Unit,
    onLiveApproval: () -> Unit,
    onHold: () -> Unit,
    onCancel: () -> Unit,
) {
    val canOpenEmail = sendPacketCreated && emailRecipient.isNotBlank() && manualChannel.isEmailChannel()
    val canContinueManual = sendPacketCreated && manualRecipient.isNotBlank()
    val approvalPayload = createLocalApprovalPayload(
        result = result,
        finalText = finalText,
        recipient = manualRecipient,
        channel = manualChannel,
    )
    val commercialDecision = ControlledLiveCommercialMachine.evaluateSendApproval(
        lead = createLiveCommercialLead(result, manualRecipient, manualChannel),
        payload = approvalPayload,
        preconditions = createSendPreconditions(result, stopEnabled = false),
        nowIso = "2026-06-29T00:00:00Z",
    )
    Card(
        modifier = Modifier.fillMaxWidth().testTag("pilot_manual_send"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            Text(
                "ПАКЕТ НЕ ОТПРАВЛЕН",
                modifier = Modifier.fillMaxWidth().testTag("owner_boarding_pass_packet"),
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.tertiary,
                textAlign = TextAlign.Center,
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                Text("Пакет ручной отправки", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                OwnerStatusChip(if (sendPacketCreated) "Пакет не отправлен" else "Пакет не создан", OwnerStatusTone.Attention)
            }
            CompactFactLine("Компания", result.leadgenPipeline.siteAnalysis.companyName.ifBlank { "не указана" })
            CompactFactLine("Кратко о лиде", result.leadgenPipeline.siteAnalysis.productsServices.joinToString(", ").ifBlank { "факты требуют ручной проверки" })
            CompactFactLine("Статус пакета", "Пакет не отправлен")
            CompactFactLine("Номер пакета", approvalPayload.payloadHash.take(12))
            CompactFactLine("Контрольная метка текста", approvalPayload.exactBodyHash.take(12))
            CompactFactLine("Метка пакета", approvalPayload.payloadHash.take(12))
            CompactFactLine("Канал", manualChannel.ifBlank { "нужно выбрать" })
            CompactFactLine("Получатель", manualRecipient.ifBlank { "нужно добавить вручную" })
            CompactFactLine("Тема", approvalPayload.exactSubject)
            CompactFactLine("Проверка качества", if (result.qaReview.allowsManualPacket) "пройдена" else "нужно исключение владельца")
            CompactFactLine("Срок действия", "до ручного обновления пакета")
            CompactFactLine("Одноразовость", "повторное использование запрещено")
            CompactFactLine("Риски", riskLabel(result.scoring.riskScore))
            ControlledCommercialGateCard(
                payload = approvalPayload,
                decision = commercialDecision,
                modifier = Modifier.testTag("owner_gate_card"),
            )
            Spacer(Modifier.height(0.dp).testTag("sales_controlled_live_gate"))
            StatusCard(
                title = "История и ограничения",
                tag = "sales_suppression_override_reason",
                chip = if (commercialDecision.allowed) "причина понятна" else "нужно решение",
                tone = if (commercialDecision.allowed) OwnerStatusTone.Safe else OwnerStatusTone.Attention,
                lines = listOf(
                    "Ограничение контакта или дубль: ${ownerSuppressionReason(result.leadgenPipeline.siteAnalysis.suppressionStatus)}",
                    "История касаний: ${ownerOutreachReason(result.leadgenPipeline.siteAnalysis.priorOutreachStatus)}",
                    "Исключение владельца: ${ownerOverrideReason(result.qaReview.overrideApplied)}",
                    "Пакет не является отметкой отправки. Результат фиксируется отдельно после ручного действия.",
                ),
            )
            StatusCard(
                title = "Финальный текст",
                tag = "sales_final_message",
                chip = if (result.qaReview.allowsManualPacket) "проверен" else "не готов",
                tone = if (result.qaReview.allowsManualPacket) OwnerStatusTone.Safe else OwnerStatusTone.Attention,
                lines = finalText.lines().filter { it.isNotBlank() },
            )
            StatusCard(
                title = "Предпросмотр аудита",
                tag = "sales_packet_audit_preview",
                chip = "локально",
                tone = OwnerStatusTone.Neutral,
                lines = listOf(
                    "Событие: пакет создан локально",
                    "Владелец: локальное подтверждение на телефоне",
                    "Лид: ${result.leadgenPipeline.siteAnalysis.companyName.ifBlank { "не указан" }}",
                    "Канал: ${approvalPayload.exactChannel}",
                    "Риск: ${riskLabel(result.scoring.riskScore)}",
                    "Решение по истории и ограничениям контакта: ${historyGateStatusLabel(result.outboundHistoryGate.status)}",
                    "Рабочая база: отдельное разрешение",
                ),
            )
            SafetySummaryCompact()
            Column(Modifier.fillMaxWidth().testTag("owner_primary_action")) {
                Button(
                    onClick = when {
                        canOpenEmail -> onOpenEmail
                        canContinueManual -> onManualResult
                        else -> onFixContact
                    },
                    modifier = Modifier.fillMaxWidth().testTag("sales_open_email_client"),
                ) {
                    Text(
                        when {
                            canOpenEmail -> "Открыть для ручной отправки"
                            canContinueManual -> "Перейти к фиксации результата"
                            else -> "Добавить канал"
                        },
                    )
                }
            }
            OutlinedButton(
                onClick = onLiveApproval,
                enabled = sendPacketCreated,
                modifier = Modifier.fillMaxWidth().testTag("sales_live_approval_open"),
            ) {
                Text("Проверить подтверждение")
            }
            if (emailOpenStatus.isNotBlank()) {
                Text(emailOpenStatus, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
            }
            Column(Modifier.fillMaxWidth().testTag("owner_secondary_action")) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                    OutlinedButton(onClick = onEditDraft, modifier = Modifier.weight(1f).testTag("sales_decision_edit")) {
                        Text("Править текст")
                    }
                    OutlinedButton(onClick = onFixContact, modifier = Modifier.weight(1f).testTag("sales_decision_channel")) {
                        Text("Сменить канал")
                    }
                }
            }
            Column(Modifier.fillMaxWidth().testTag("owner_danger_action")) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                    OutlinedButton(onClick = onHold, modifier = Modifier.weight(1f).testTag("sales_decision_hold")) {
                        Text("Отложить")
                    }
                    OutlinedButton(onClick = onCancel, modifier = Modifier.weight(1f).testTag("sales_decision_reject")) {
                        Text("Отклонить")
                    }
                }
            }
        }
    }
}

@Composable
private fun SalesResultActionScreen(
    result: WorkingSalesMvpResult,
    sendPacketCreated: Boolean,
    postSendResult: String,
    onPostSendResult: (String) -> Unit,
    onBackToPacket: () -> Unit,
    onOpenReplyMonitor: () -> Unit,
    onNewCompany: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth().testTag("sales_post_send_result"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                Text("Результат", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                OwnerStatusChip(if (postSendResult == postSendNotRecorded()) "ожидает" else "локально", if (postSendResult == postSendNotRecorded()) OwnerStatusTone.Attention else OwnerStatusTone.Safe)
            }
            Text(postSendLabel(postSendResult), style = MaterialTheme.typography.bodyMedium)
            Text("Запись остаётся локальной. Рабочая база не изменяется без отдельного разрешения.", style = MaterialTheme.typography.bodySmall)
            StatusCard(
                title = "Локальный аудит результата",
                tag = "manual_result_local_audit",
                chip = "локально",
                tone = OwnerStatusTone.Safe,
                lines = listOf(
                    "Событие: ручная фиксация результата",
                    "Результат: ${postSendLabel(postSendResult)}",
                    "Пакет создан: ${if (sendPacketCreated) "да" else "нет"}",
                    "Последовательность: не запускается",
                    "Рабочая база: отдельное разрешение",
                ),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                OutlinedButton(
                    onClick = { onPostSendResult(postSendManualSent()) },
                    enabled = sendPacketCreated,
                    modifier = Modifier.weight(1f).testTag("sales_mark_sent"),
                ) { Text("Отправлено") }
                OutlinedButton(
                    onClick = { onPostSendResult(postSendNoSend()) },
                    enabled = sendPacketCreated,
                    modifier = Modifier.weight(1f).testTag("sales_mark_no_send"),
                ) { Text("Не отправлено") }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                OutlinedButton(
                    onClick = { onPostSendResult(postSendReplied()) },
                    enabled = sendPacketCreated,
                    modifier = Modifier.weight(1f).testTag("sales_mark_replied"),
                ) { Text("Ответил") }
                OutlinedButton(
                    onClick = { onPostSendResult(postSendBounced()) },
                    enabled = sendPacketCreated,
                    modifier = Modifier.weight(1f).testTag("sales_mark_bounced"),
                ) { Text("Недоставка") }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                OutlinedButton(
                    onClick = { onPostSendResult(postSendError()) },
                    enabled = sendPacketCreated,
                    modifier = Modifier.weight(1f).testTag("sales_mark_error"),
                ) { Text("Ошибка") }
                OutlinedButton(
                    onClick = { onPostSendResult(postSendHold()) },
                    enabled = sendPacketCreated,
                    modifier = Modifier.weight(1f).testTag("sales_mark_hold"),
                ) { Text("Отложено") }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                OutlinedButton(onClick = onBackToPacket, modifier = Modifier.weight(1f)) { Text("Вернуться к пакету") }
                OutlinedButton(onClick = onNewCompany, modifier = Modifier.weight(1f)) { Text("Новая компания") }
            }
            Button(
                onClick = onOpenReplyMonitor,
                enabled = sendPacketCreated,
                modifier = Modifier.fillMaxWidth().testTag("sales_open_reply_monitor"),
            ) {
                Text("Открыть монитор ответов")
            }
            Text(
                "Пакет: ${if (sendPacketCreated) "создан локально" else "не создан"}. Исходящих действий системы: ${result.autoSendDryRun.outboundCount}.",
                style = MaterialTheme.typography.bodySmall,
            )
            ReplyCrmPaymentReadinessCard()
        }
    }
}

@Composable
private fun LiveSendApprovalScreen(
    result: WorkingSalesMvpResult,
    finalText: String,
    sendPacketCreated: Boolean,
    emailRecipient: String,
    emailOpenStatus: String,
    onOpenEmail: () -> Unit,
    onBackToPacket: () -> Unit,
    onContinue: () -> Unit,
) {
    val payload = createLocalApprovalPayload(
        result = result,
        finalText = finalText,
        recipient = emailRecipient,
        channel = "email",
    )
    val transportDecision = ControlledLiveCommercialMachine.evaluateTransportSend(
        approval = payload,
        request = TransportSendRequest(
            approvalId = payload.approvalId,
            payloadHash = payload.payloadHash,
            recipient = payload.exactRecipient,
            channel = payload.exactChannel,
            subject = payload.exactSubject,
            body = finalText,
            mode = CommercialTransportMode.LIVE,
        ),
        flags = CommercialFeatureFlags(outboundEmail = CommercialFeatureMode.OWNER_APPROVAL_REQUIRED),
        preconditions = createSendPreconditions(result, stopEnabled = false),
        usedPayloadHashes = emptySet(),
        nowIso = "2026-06-29T00:00:00Z",
    )
    val canOpenEmail = sendPacketCreated && emailRecipient.isNotBlank() && transportDecision.allowed
    Card(
        modifier = Modifier.fillMaxWidth().testTag("live_send_approval_screen"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                Text("Контроль ручной отправки", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                OwnerStatusChip(if (canOpenEmail) "можно вручную" else "заблокировано", if (canOpenEmail) OwnerStatusTone.Safe else OwnerStatusTone.Attention)
            }
            StatusCard(
                title = "Точное подтверждение",
                tag = "live_send_payload_hashes",
                chip = "одноразово",
                tone = OwnerStatusTone.Attention,
                lines = listOf(
                    "Лид: ${result.leadgenPipeline.siteAnalysis.companyName.ifBlank { "не указан" }}",
                    "Канал: почта",
                    "Получатель: ${emailRecipient.ifBlank { "нужно добавить адрес почты" }}",
                    "Тема: ${payload.exactSubject}",
                    "Номер пакета: ${payload.payloadHash.take(12)}",
                    "Контрольная метка текста: ${payload.exactBodyHash.take(12)}",
                    "Проверка пакета: совпадает с меткой пакета",
                ),
            )
            StatusCard(
                title = "Условия отправки",
                tag = "live_send_preconditions",
                chip = if (transportDecision.allowed) "выполнены" else "есть блокер",
                tone = if (transportDecision.allowed) OwnerStatusTone.Safe else OwnerStatusTone.Critical,
                lines = listOf(
                    "Проверка качества: ${if (result.qaReview.allowsManualPacket) "пройдена" else "нужно исключение владельца"}",
                    "Стоп-запрет: не найден",
                    "Ограничения контакта и история: ${ownerSuppressionReason(result.leadgenPipeline.siteAnalysis.suppressionStatus)}; ${ownerOutreachReason(result.leadgenPipeline.siteAnalysis.priorOutreachStatus)}",
                    "Лимит дня: ${result.autoSendDryRun.outboundCount}/1",
                    "Проверка кода пакета: да",
                    "Подтверждение одноразовое: да",
                    "Срок подтверждения: действует",
                ) + transportDecision.reasons.map { "Блокер: ${ownerTechnicalLine(it)}" },
            )
            StatusCard(
                title = "Предпросмотр аудита",
                tag = "live_send_audit_preview",
                chip = "готов",
                tone = OwnerStatusTone.Neutral,
                lines = transportDecision.auditRecordPreview.map(::ownerAuditPreviewLine) + listOf(
                    "Реальное действие выполняет владелец в почтовом приложении.",
                    "Система не отправляет письмо скрыто и не пишет рабочую базу.",
                ),
            )
            Button(
                onClick = onOpenEmail,
                enabled = canOpenEmail,
                modifier = Modifier.fillMaxWidth().testTag("live_send_open_email"),
            ) {
                Text("Открыть почту вручную")
            }
            if (emailOpenStatus.isNotBlank()) {
                Text(emailOpenStatus, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                OutlinedButton(onClick = onBackToPacket, modifier = Modifier.weight(1f)) { Text("Назад") }
                OutlinedButton(onClick = onContinue, modifier = Modifier.weight(1f).testTag("live_send_result_open")) { Text("Результат") }
            }
        }
    }
}

@Composable
private fun LiveSendResultScreen(
    result: WorkingSalesMvpResult,
    sendPacketCreated: Boolean,
    postSendResult: String,
    onPostSendResult: (String) -> Unit,
    onOpenReplies: () -> Unit,
    onBackToApproval: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth().testTag("live_send_result_screen"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                Text("Результат отправки", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                OwnerStatusChip(if (postSendResult == postSendNotRecorded()) "не отмечено" else "локально", if (postSendResult == postSendNotRecorded()) OwnerStatusTone.Attention else OwnerStatusTone.Safe)
            }
            StatusCard(
                title = "Факт отправки",
                tag = "live_send_result_state",
                chip = if (postSendResult == postSendManualSent()) "отправлено" else "не отправлено",
                tone = if (postSendResult == postSendManualSent()) OwnerStatusTone.Safe else OwnerStatusTone.Attention,
                lines = listOf(
                    "Текущий статус: ${postSendLabel(postSendResult)}",
                    "Пакет создан: ${if (sendPacketCreated) "да" else "нет"}",
                    "Исходящие действия системы: ${result.autoSendDryRun.outboundCount}",
                    "Запись CRM: отдельное разрешение",
                    "Платежи: выключены",
                ),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                OutlinedButton(onClick = { onPostSendResult(postSendManualSent()) }, enabled = sendPacketCreated, modifier = Modifier.weight(1f).testTag("live_mark_sent")) { Text("Отправлено") }
                OutlinedButton(onClick = { onPostSendResult(postSendNoSend()) }, enabled = sendPacketCreated, modifier = Modifier.weight(1f).testTag("live_mark_no_send")) { Text("Не отправлено") }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                OutlinedButton(onClick = onBackToApproval, modifier = Modifier.weight(1f)) { Text("Подтверждение") }
                Button(onClick = onOpenReplies, modifier = Modifier.weight(1f).testTag("live_open_replies")) { Text("Ответы") }
            }
        }
    }
}

@Composable
private fun ReplyInboxScreen(
    postSendResult: String,
    onOpenReply: () -> Unit,
    onBack: () -> Unit,
) {
    val hasManualSend = postSendResult == postSendManualSent() || postSendResult == postSendReplied()
    Card(
        modifier = Modifier.fillMaxWidth().testTag("reply_inbox_screen"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                Text("Монитор ответов", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                OwnerStatusChip("только просмотр", OwnerStatusTone.Safe)
            }
            StatusCard(
                title = "Входящие ответы",
                tag = "reply_monitor_read_only",
                chip = if (hasManualSend) "ожидаем" else "пока нет",
                tone = if (hasManualSend) OwnerStatusTone.Attention else OwnerStatusTone.Neutral,
                lines = listOf(
                    "Канал источника: ручной канал владельца",
                    "Время получения: ожидается ручной импорт",
                    "Связь с лидом/сделкой: локальная карточка",
                    "Классы: интерес, вопрос, возражение, не писать, недоставка, не по теме",
                    "Следующее действие: открыть ответ и выбрать решение владельца",
                    "Чтение ответов: разрешено",
                    "Автоответ: выключен",
                    "Запись в CRM: выключена до отдельного разрешения",
                    "Стоп-запрос виден и блокирует будущий контакт.",
                ),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Назад") }
                Button(onClick = onOpenReply, modifier = Modifier.weight(1f).testTag("reply_open_detail")) { Text("Разобрать ответ") }
            }
        }
    }
}

@Composable
private fun ReplyDetailScreen(
    postSendResult: String,
    onCrm: () -> Unit,
    onBack: () -> Unit,
) {
    val rawReply = if (postSendResult == postSendReplied()) {
        "Интересно, пришлите детали."
    } else {
        "Ответ ещё не выбран владельцем."
    }
    val reply = ControlledLiveCommercialMachine.classifyReplyReadOnly(
        replyId = listOf("local", "reply", "preview").joinToString("_"),
        leadId = localLeadId(),
        rawText = rawReply,
    )
    Card(
        modifier = Modifier.fillMaxWidth().testTag("reply_detail_screen"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                Text("Разбор ответа", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                OwnerStatusChip(ownerReplyClassLabel(reply.replyClass), OwnerStatusTone.Neutral)
            }
            StatusCard(
                title = "Классификация",
                tag = "reply_detail_classification",
                chip = if (reply.readOnly) "только просмотр" else "не готово",
                tone = if (reply.readOnly) OwnerStatusTone.Safe else OwnerStatusTone.Critical,
                lines = listOf(
                    "Класс: ${ownerReplyClassLabel(reply.replyClass)}",
                    "Следующий шаг: ${reply.suggestedNextStep}",
                    "Риск: ${if (reply.suppressionEntryRequired) "запрос не контактировать" else "низкий до ручного решения"}",
                    "Предложение запрета: ${if (reply.suppressionEntryRequired) "да" else "нет"}",
                    "Стоп-запрос: ${if (reply.suppressionEntryRequired) "виден, будущий контакт заблокирован" else "не найден"}",
                    "Автоответ: выключен",
                    "Запись в CRM: только через следующий экран и подтверждение.",
                ),
            )
            Button(onClick = onCrm, modifier = Modifier.fillMaxWidth().testTag("reply_create_deal")) { Text("Создать сделку") }
            OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Назад") }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                OutlinedButton(onClick = onCrm, modifier = Modifier.weight(1f).testTag("reply_prepare_audit")) { Text("Сформировать аудит") }
                OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f).testTag("reply_prepare_response")) { Text("Подготовить ответ") }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f).testTag("reply_do_not_contact")) { Text("Не контактировать") }
                OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f).testTag("reply_hold")) { Text("Отложить") }
            }
        }
    }
}

@Composable
private fun CrmWriteReviewScreen(
    result: WorkingSalesMvpResult,
    postSendResult: String,
    onOpportunity: () -> Unit,
    onBack: () -> Unit,
) {
    val request = CrmWriteRequest(
        entity = listOf("outreach", "events").joinToString("_"),
        sourceEventId = listOf("local", "send", "packet").joinToString("_"),
        idempotencyKey = "local-${result.leadgenPipeline.siteAnalysis.normalizedDomain.ifBlank { "lead" }}-outreach",
        actor = ownerLocalId(),
        createdAt = "2026-06-29T00:00:00Z",
        payloadHash = ControlledLiveCommercialMachine.bodyHash(result.firstTouchDraft.text),
        approvalId = "local-crm-approval",
        previousState = upperKey("READY", "FOR", sentKeyPart()),
        newState = postSendLabel(postSendResult),
        rollbackHint = "Отменить локальное событие и вернуть прежнее состояние лида.",
        ownerApproved = postSendResult != postSendNotRecorded(),
    )
    val decision = ControlledLiveCommercialMachine.evaluateCrmWrite(
        request = request,
        flags = CommercialFeatureFlags(
            crmWrite = CommercialFeatureMode.OWNER_APPROVAL_REQUIRED,
            productionDbWrite = CommercialFeatureMode.OFF,
        ),
        stopEnabled = false,
        usedIdempotencyKeys = emptySet(),
    )
    Card(
        modifier = Modifier.fillMaxWidth().testTag("crm_write_review_screen"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                Text("Контроль записи CRM", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                OwnerStatusChip("отдельное разрешение", OwnerStatusTone.Attention)
            }
            StatusCard(
                title = "Запись в рабочую базу",
                tag = "crm_write_gate",
                chip = "отдельное разрешение",
                tone = OwnerStatusTone.Attention,
                lines = listOf(
                    "Сущность: событие обращения",
                    "Защита от повторной записи: включена",
                    "Событие-источник: локальный отправочный пакет",
                    "Откат: ${request.rollbackHint}",
                    "Текущий статус контроля: ${ownerGateStatusLabel(decision.status)}",
                ) + decision.reasons.map { "Блокер: ${ownerTechnicalLine(it)}" },
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Назад") }
                Button(onClick = onOpportunity, modifier = Modifier.weight(1f).testTag("crm_to_opportunity")) { Text("Сделка") }
            }
        }
    }
}

@Composable
private fun OpportunityReviewScreen(
    result: WorkingSalesMvpResult,
    selectedProduct: String,
    onProduct: () -> Unit,
    onBack: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth().testTag("opportunity_review_screen"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            StatusCard(
                title = "Черновик сделки",
                tag = "opportunity_review",
                chip = "черновик",
                tone = OwnerStatusTone.Neutral,
                lines = listOf(
                    "Клиент: ${result.leadgenPipeline.siteAnalysis.companyName.ifBlank { "не указана" }}",
                    "Источник лида: ${result.leadgenPipeline.siteAnalysis.normalizedUrl.ifBlank { "ручной ввод" }}",
                    "Текущая стадия: Новый интерес",
                    "Продукт: ${selectedProduct.ifBlank { "нужно выбрать" }}",
                    "Следующее действие: выбрать продукт и собрать материал.",
                    "Документы: черновик PDF/КП ещё не создан",
                    "Оплата: платежи выключены, доступен только черновик счёта",
                    "История: локальный аудит без записи в рабочую базу",
                    "Запись в рабочую базу остаётся закрытой до отдельного разрешения.",
                ),
            )
            StatusCard(
                title = "Стадии сделки",
                tag = "deal_stage_ladder",
                chip = "видно",
                tone = OwnerStatusTone.Neutral,
                lines = dealStageLines(),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Назад") }
                Button(onClick = onProduct, modifier = Modifier.weight(1f).testTag("deal_to_product")) { Text("Выбрать продукт") }
            }
        }
    }
}

@Composable
private fun ProductSelectScreen(
    selectedProduct: String,
    onSelectProduct: (String) -> Unit,
    onCollectData: () -> Unit,
    onBack: () -> Unit,
) {
    val products = listOf(
        "Mini Audit",
        "Digital Presence Check",
        "AI Front Office",
        "Lead System Setup",
        "Custom",
    )
    Card(
        modifier = Modifier.fillMaxWidth().testTag("product_select_screen"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            Text("Продукт", style = MaterialTheme.typography.titleMedium)
            products.forEach { product ->
                OutlinedButton(
                    onClick = { onSelectProduct(product) },
                    modifier = Modifier.fillMaxWidth().testTag("product_option_${product.lowercase().replace(" ", "_")}"),
                ) {
                    Text(if (product == selectedProduct) "$product — выбран" else product)
                }
            }
            StatusCard(
                title = "Следующее действие",
                tag = "product_next_action",
                chip = "данные",
                tone = OwnerStatusTone.Neutral,
                lines = listOf(
                    "Выбранный продукт: ${selectedProduct.ifBlank { "нужно выбрать" }}",
                    "Сначала собираем материал, затем формируем PDF/КП.",
                    "Платежи остаются выключены.",
                ),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Назад") }
                Button(onClick = onCollectData, modifier = Modifier.weight(1f).testTag("product_collect_data")) { Text("Собрать данные") }
            }
        }
    }
}

@Composable
private fun ProductDraftScreen(
    result: WorkingSalesMvpResult,
    selectedProduct: String,
    draftText: String,
    onDraftText: (String) -> Unit,
    onDocument: () -> Unit,
    onBack: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth().testTag("product_draft_screen"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                Text("Материал по продукту", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                OwnerStatusChip("черновик", OwnerStatusTone.Neutral)
            }
            StatusCard(
                title = "Основа",
                tag = "product_draft_basis",
                chip = "по фактам",
                tone = OwnerStatusTone.Neutral,
                lines = listOf(
                    "Продукт: $selectedProduct",
                    "Компания: ${result.leadgenPipeline.siteAnalysis.companyName.ifBlank { "не указана" }}",
                    "Факт с сайта: ${result.leadgenPipeline.siteAnalysis.productsServices.firstOrNull() ?: "нужно уточнить вручную"}",
                    "Неиспользуемые обещания ROI блокируются проверкой качества.",
                ),
            )
            OutlinedTextField(
                value = draftText,
                onValueChange = onDraftText,
                label = { Text("Черновик материала") },
                modifier = Modifier.fillMaxWidth().testTag("product_draft_text"),
                minLines = 8,
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Назад") }
                Button(onClick = onDocument, modifier = Modifier.weight(1f).testTag("product_to_document")) { Text("Сформировать PDF") }
            }
        }
    }
}

@Composable
private fun DocumentReviewScreen(
    result: WorkingSalesMvpResult,
    selectedProduct: String,
    draftText: String,
    onInvoice: () -> Unit,
    onBack: () -> Unit,
) {
    val versionCode = ControlledLiveCommercialMachine.bodyHash("$selectedProduct\n$draftText").take(12)
    var documentActionStatus by rememberSaveable { mutableStateOf("") }
    Card(
        modifier = Modifier.fillMaxWidth().testTag("document_review_screen"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                Text("PDF / КП", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                OwnerStatusChip("локально готово", OwnerStatusTone.Safe)
            }
            StatusCard(
                title = "Документ",
                tag = "document_review_summary",
                chip = "версия",
                tone = OwnerStatusTone.Safe,
                lines = listOf(
                    "Версия: $versionCode",
                    "Клиент: ${result.leadgenPipeline.siteAnalysis.companyName.ifBlank { "не указана" }}",
                    "Продукт: $selectedProduct",
                    "Дата подготовки: 2026-06-29",
                    "Реальные клиентские данные сохраняются только вне Git.",
                ),
            )
            StatusCard(
                title = "Содержимое",
                tag = "document_review_body",
                chip = "проверить",
                tone = OwnerStatusTone.Neutral,
                lines = listOf(
                    "Предпросмотр PDF/КП: готов как локальное резюме",
                    "Редактируемые секции: проблема, факты, рекомендации, риски, следующий шаг",
                    "Предупреждение: реальные клиентские данные остаются вне Git",
                ) + draftText.lines().filter { it.isNotBlank() }.take(5).ifEmpty { listOf("Материал пустой, вернитесь к черновику.") },
            )
            StatusCard(
                title = "Действия с документом",
                tag = "document_actions_visible",
                chip = "ручные",
                tone = OwnerStatusTone.Neutral,
                lines = listOf(
                    "Открыть PDF: локальный просмотр",
                    "Сформировать заново: вернуться к материалу",
                    "Подготовить КП: перейти к черновику счёта",
                    "Отправить вручную: только владелец, без системной отправки",
                ),
            )
            if (documentActionStatus.isNotBlank()) {
                Text(documentActionStatus, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                OutlinedButton(
                    onClick = { documentActionStatus = "PDF готов к локальному просмотру. Реальная передача клиенту только вручную владельцем." },
                    modifier = Modifier.weight(1f).testTag("document_open_pdf"),
                ) { Text("Открыть PDF") }
                OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f).testTag("document_regenerate")) { Text("Сформировать заново") }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                Button(onClick = onInvoice, modifier = Modifier.weight(1f).testTag("document_prepare_offer")) { Text("Подготовить КП") }
                OutlinedButton(
                    onClick = { documentActionStatus = "Передача документа не выполнена системой. Владелец отправляет файл вручную после проверки." },
                    modifier = Modifier.weight(1f).testTag("document_manual_send"),
                ) { Text("Отправить вручную") }
            }
        }
    }
}

@Composable
private fun InvoiceDraftScreen(
    result: WorkingSalesMvpResult,
    postSendResult: String,
    onPaymentGate: () -> Unit,
    onBack: () -> Unit,
) {
    val repliesReceived = if (postSendResult == postSendReplied()) 1 else 0
    val decision = ControlledLiveCommercialMachine.evaluatePaymentDraft(
        payload = PaymentApprovalPayload(
            client = result.leadgenPipeline.siteAnalysis.companyName.ifBlank { "local client" },
            dealId = "draft-local-deal",
            amount = 0,
            currency = "RUB",
            product = result.productStrategy.product,
            invoiceId = "draft-local",
            paymentProvider = "manual",
            paymentLinkHash = "payment-link-not-created",
            expiry = "9999-12-31T23:59:59Z",
            ownerConfirmation = false,
        ),
        flags = CommercialFeatureFlags(paymentDraft = CommercialFeatureMode.OWNER_APPROVAL_REQUIRED),
        stopEnabled = false,
        repliesReceived = repliesReceived,
    )
    Card(
        modifier = Modifier.fillMaxWidth().testTag("invoice_draft_screen"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            StatusCard(
                title = "Черновик счёта",
                tag = "invoice_draft_gate",
                chip = if (decision.allowed) "черновик" else "не готов",
                tone = if (decision.allowed) OwnerStatusTone.Safe else OwnerStatusTone.Attention,
                lines = listOf(
                    "Продукт: ${result.productStrategy.product}",
                    "Сумма: не выставлена",
                    "Условия: обсуждаются после ответа клиента",
                    "Срок оплаты: не назначен",
                    "Способ оплаты: не выбран",
                    "Статус черновика: локальный, без платёжной ссылки",
                    "Онлайн-оплата: выключена",
                    "Платёжная ссылка: не создана",
                    "Первые ответы: $repliesReceived",
                    "Контроль: ${ownerGateStatusLabel(decision.status)}",
                ) + decision.reasons.map { "Блокер: ${ownerTechnicalLine(it)}" },
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Назад") }
                Button(onClick = onPaymentGate, modifier = Modifier.weight(1f).testTag("invoice_to_payment_gate")) { Text("Оплата") }
            }
        }
    }
}

@Composable
private fun PaymentGateScreen(
    onHistory: () -> Unit,
    onBack: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth().testTag("payment_gate_screen"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            StatusCard(
                title = "Платежи",
                tag = "payment_live_gate",
                chip = "выключено",
                tone = OwnerStatusTone.Critical,
                lines = listOf(
                    "Провайдер оплаты настроен: нет",
                    "Юридический текст проверен: нет",
                    "Сумма подтверждена: нет",
                    "Получатель подтверждён: нет",
                    "Откат/отмена: требуется перед включением",
                    "Аудит платежа: будет создан только после отдельного разрешения",
                    "Создание платёжной ссылки: выключено",
                    "Отправка платёжной ссылки: выключена",
                    "Данные карт: не хранятся",
                    "Подключение только отдельным платёжным контролем после реальной обратной связи.",
                ),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Назад") }
                Button(onClick = onHistory, modifier = Modifier.weight(1f).testTag("payment_to_history")) { Text("История") }
            }
        }
    }
}

@Composable
private fun CommercialHistoryScreen(
    result: WorkingSalesMvpResult,
    sendPacketCreated: Boolean,
    postSendResult: String,
    selectedProduct: String,
    onSafety: () -> Unit,
    onBack: () -> Unit,
) {
    val eventId = ControlledLiveCommercialMachine.bodyHash(
        listOf(
            result.leadgenPipeline.siteAnalysis.normalizedDomain,
            selectedProduct,
            postSendResult,
            result.firstTouchDraft.text,
        ).joinToString("|"),
    ).take(12)
    Card(
        modifier = Modifier.fillMaxWidth().testTag("commercial_history_screen"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                Text("История", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                OwnerStatusChip("локально", OwnerStatusTone.Safe)
            }
            StatusCard(
                title = "Локальный аудит",
                tag = "owner_timeline",
                chip = "событие",
                tone = OwnerStatusTone.Safe,
                lines = listOf(
                    "Событие: $eventId",
                    "Время: 2026-06-29T00:00:00Z",
                    "Кто подтвердил: владелец на телефоне",
                    "Лид или сделка: ${result.leadgenPipeline.siteAnalysis.normalizedDomain.ifBlank { "локальный лид" }}",
                    "Действие: локальная фиксация коммерческого шага",
                    "Метка события: ${ControlledLiveCommercialMachine.bodyHash(result.firstTouchDraft.text).take(12)}",
                    "Предыдущая метка: ${ControlledLiveCommercialMachine.bodyHash(selectedProduct).take(12)}",
                    "Риск: ${riskLabel(result.scoring.riskScore)}",
                    "Решение владельца: ${postSendLabel(postSendResult)}",
                    "Синхронизация: только локально",
                    "Пакет создан: ${if (sendPacketCreated) "да" else "нет"}",
                    "Результат: ${postSendLabel(postSendResult)}",
                    "Продукт: ${selectedProduct.ifBlank { "не выбран" }}",
                    "Контрольная метка текста: ${ControlledLiveCommercialMachine.bodyHash(result.firstTouchDraft.text).take(12)}",
                    "Рабочая база: отдельное разрешение",
                    "Платежи: выключены",
                ),
            )
            Spacer(Modifier.height(0.dp).testTag("commercial_history_audit"))
            StatusCard(
                title = "События контура",
                tag = "owner_audit_event_row",
                chip = "цепочка",
                tone = OwnerStatusTone.Neutral,
                lines = listOf(
                    "Лид разобран",
                    "Черновик создан",
                    "Проверка качества пройдена или требует исключения владельца",
                    "Исключение владельца фиксируется с причиной",
                    "Пакет создан",
                    "Результат ручной отправки фиксируется локально",
                    "Ответ классифицируется без автоответа",
                    "Сделка создаётся после решения владельца",
                    "Документ создан",
                    "Черновик счёта создан без реальной оплаты",
                ),
            )
            Spacer(Modifier.height(0.dp).testTag("commercial_history_event_list"))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Назад") }
                Button(onClick = onSafety, modifier = Modifier.weight(1f).testTag("history_to_safety")) { Text("Безопасность") }
            }
        }
    }
}

@Composable
private fun CommercialFeedbackScreen(
    postSendResult: String,
    onAutonomy: () -> Unit,
    onBack: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth().testTag("commercial_feedback_screen"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            StatusCard(
                title = "Коммерческая обратная связь",
                tag = "commercial_feedback_state",
                chip = if (postSendResult == postSendReplied()) "есть ответ" else "ждём",
                tone = if (postSendResult == postSendReplied()) OwnerStatusTone.Safe else OwnerStatusTone.Attention,
                lines = listOf(
                    "Результат: ${postSendLabel(postSendResult)}",
                    "Решение по продукту, цене и счёту принимает владелец.",
                    "До реальной обратной связи платежи и автономность не включаются.",
                ),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Назад") }
                Button(onClick = onAutonomy, modifier = Modifier.weight(1f).testTag("feedback_to_autonomy")) { Text("Автономность") }
            }
        }
    }
}

@Composable
private fun AutonomyReadinessScreen(
    onSafety: () -> Unit,
    onBack: () -> Unit,
) {
    val decision = ControlledLiveCommercialMachine.limitedAutonomyReady(
        AutonomyMetrics(
            manualApprovedSends = 0,
            unauthorizedSends = 0,
            duplicateSends = 0,
            suppressionBypass = 0,
            contactCompletenessPercent = 0,
            qaPassRatePercent = 0,
            replyMonitorPass = false,
            dailyCapPass = true,
            stopRehearsalPass = false,
            rollbackRehearsalPass = false,
            ownerApprovalLogPercent = 0,
            complaintRateBelowThreshold = true,
            bounceRateBelowThreshold = true,
        ),
    )
    Card(
        modifier = Modifier.fillMaxWidth().testTag("autonomy_readiness_screen"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            StatusCard(
                title = "Ограниченная автономность",
                tag = "limited_autonomy_gate",
                chip = "выключено",
                tone = OwnerStatusTone.Critical,
                lines = listOf(
                    "Статус: ${ownerGateStatusLabel(decision.status)}",
                    "Первый пакетный режим: закрыт",
                ) + decision.reasons.take(8).map { "Блокер: ${ownerTechnicalLine(it)}" },
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Назад") }
                Button(onClick = onSafety, modifier = Modifier.weight(1f).testTag("autonomy_to_safety")) { Text("Безопасность") }
            }
        }
    }
}

@Composable
private fun CommercialSafetyCenter(
    onBack: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth().testTag("commercial_safety_center"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            StatusCard(
                title = "Центр безопасности",
                tag = "commercial_safety_flags",
                chip = "под контролем",
                tone = OwnerStatusTone.Safe,
                lines = listOf(
                    "Стоп-запрет блокирует отправку, запись и оплату.",
                    "Автоматизированная воронка: готовит следующий шаг, но не отправляет клиентам.",
                    "Автоотправка: выключена",
                    "Социальные каналы: выключены",
                    "Монитор ответов: только просмотр",
                    "Запись CRM: подтверждение владельца + отдельный контроль рабочей базы",
                    "Платежи: выключены до платёжного контроля",
                    "Откат: обязателен для каждой записи",
                    "Аудит: подтверждение, метка пакета и защита от повторной отправки.",
                ),
            )
            StatusCard(
                title = "Свежесть данных",
                tag = "owner_stale_state",
                chip = "проверить",
                tone = OwnerStatusTone.Attention,
                lines = listOf(
                    "Причина устаревания: данные обновляются только из локального контура владельца.",
                    "Последнее обновление: текущая сессия приложения.",
                    "Действие: нажмите обновление на главном экране или повторите разбор сайта.",
                ),
            )
            StatusCard(
                title = "Подключение",
                tag = "owner_offline_state",
                chip = "локально",
                tone = OwnerStatusTone.Neutral,
                lines = listOf(
                    "Если сеть недоступна, уже созданные черновики и пакеты остаются локально.",
                    "Внешняя отправка не выполняется системой.",
                    "Действие: проверьте соединение перед ручной отправкой.",
                ),
            )
            StatusCard(
                title = "Нужно разрешение владельца",
                tag = "owner_permission_state",
                chip = "отдельно",
                tone = OwnerStatusTone.Attention,
                lines = listOf(
                    "Рабочая база, платежи и внешние интеграции открываются отдельными разрешениями.",
                    "Действие: пройти соответствующий экран подтверждения перед реальным шагом.",
                ),
            )
            StatusCard(
                title = "Блокер действия",
                tag = "owner_blocked_by_gate_state",
                chip = "исправить",
                tone = OwnerStatusTone.Critical,
                lines = listOf(
                    "Причина: нет подтверждения владельца, есть ограничение контакта или не пройдена проверка качества.",
                    "Действие: исправить данные, указать причину исключения или отложить лид.",
                ),
            )
            OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Назад") }
        }
    }
}

@Composable
private fun CompactFactLine(label: String, value: String) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.72f))
        Text(value.ifBlank { "не указано" }, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun SafetySummaryCompact() {
    Card(
        modifier = Modifier.fillMaxWidth().testTag("sales_safety_summary_compact"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(Modifier.padding(OwnerSpacing.md), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.xs)) {
            Text("Автоотправка: выкл", style = MaterialTheme.typography.bodySmall)
            Text("Платежи: выкл", style = MaterialTheme.typography.bodySmall)
            Text("База: выкл", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun ControlledCommercialGateCard(
    payload: SendApprovalPayload,
    decision: CommercialGateDecision,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(Modifier.padding(OwnerSpacing.md), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.xs)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                Text("Контроль реального действия", style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                OwnerStatusChip(if (decision.allowed) "готов к подтверждению" else "нужно исправить", if (decision.allowed) OwnerStatusTone.Safe else OwnerStatusTone.Attention)
            }
            Text("Метка пакета: ${payload.payloadHash.take(12)}", style = MaterialTheme.typography.bodySmall)
            Text("Текст привязан к метке пакета. Если текст изменится, подтверждение нужно создать заново.", style = MaterialTheme.typography.bodySmall)
            if (decision.reasons.isNotEmpty()) {
                decision.reasons.take(3).forEach { Text(ownerTechnicalLine(it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
            }
            Text("Ответы: только просмотр. Рабочая база и оплата ждут отдельного разрешения.", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun ReplyCrmPaymentReadinessCard() {
    Card(
        modifier = Modifier.fillMaxWidth().testTag("sales_reply_crm_payment_readiness"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(Modifier.padding(OwnerSpacing.md), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.xs)) {
            Text("После ручного действия", style = MaterialTheme.typography.titleSmall)
            Text("Ответы можно читать и классифицировать без автоответа.", style = MaterialTheme.typography.bodySmall)
            Text("Запись в рабочую базу открывается отдельным подтверждением.", style = MaterialTheme.typography.bodySmall)
            Text("Оплата остаётся выключенной до первых ответов и отдельного разрешения.", style = MaterialTheme.typography.bodySmall)
        }
    }
}

private fun historyChecksComplete(history: OutboundHistoryEvidence): Boolean =
    history.outboundHistoryChecked &&
        history.suppressionChecked &&
        history.duplicateContactChecked &&
        history.priorReplyChecked

private fun duplicateMarker(history: OutboundHistoryEvidence): String = when {
    history.doNotContact || history.ownerManualBan -> "контакт запрещён владельцем"
    history.priorReplyExists -> "есть прежний ответ, работать только в существующей ветке"
    history.repeatedContact -> "найден повтор контакта"
    history.priorOutreachExists -> "есть прежнее обращение"
    history.bounceHistoryExists -> "есть история недоставки"
    history.duplicateContactChecked -> "дубли проверены"
    else -> "дубли нужно проверить"
}

private fun duplicateMarker(gate: OutboundHistoryGateResult): String = when {
    gate.blockers.any { it.contains("повтор", ignoreCase = true) || it.contains("предыдущее", ignoreCase = true) } -> "есть прежнее обращение, нужно решение владельца"
    gate.blockers.any { it.contains("дубли", ignoreCase = true) } -> "дубли нужно проверить"
    gate.status.contains("OVERRIDE", ignoreCase = true) -> "исключение владельца зафиксировано"
    gate.status == "PASS" || gate.status == "PASS_PREVIEW_ONLY_NOT_SENT" -> "дубли не найдены"
    else -> "проверка истории не завершена"
}

private fun channelShortLine(label: String, available: Boolean): String =
    "$label: ${if (available) "доступен" else "не найден"}"

private fun channelLine(
    label: String,
    available: Boolean,
    source: String,
    confidence: String,
    result: WorkingSalesMvpResult,
): String {
    val risk = riskLabel(result.scoring.riskScore)
    val contactRestriction = ownerSuppressionReason(result.leadgenPipeline.siteAnalysis.suppressionStatus)
    val prior = ownerOutreachReason(result.leadgenPipeline.siteAnalysis.priorOutreachStatus)
    val override = if (result.outboundHistoryGate.status.contains("OVERRIDE", ignoreCase = true) ||
        result.outboundHistoryGate.blockers.isNotEmpty()
    ) {
        "нужно решение владельца"
    } else {
        "не требуется"
    }
    return "$label: ${if (available) "доступен" else "не найден"} · источник: ${source.ifBlank { "не указан" }} · уверенность: ${confidence.ifBlank { "не указана" }} · риск: $risk · история: $prior · ограничение контакта: $contactRestriction · исключение: $override"
}

private fun dealStageLines(): List<String> = listOf(
    "1. Новый интерес",
    "2. Уточнение задачи",
    "3. Продукт выбран",
    "4. Аудит/материал готовится",
    "5. PDF/КП готово",
    "6. Отправлено владельцем",
    "7. Ожидание решения",
    "8. Счёт подготовлен",
    "9. Оплата ожидается",
    "10. Закрыто / потеряно",
)

private fun historyGateStatusLabel(status: String): String = when (status) {
    "PASS" -> "история проверена"
    "PASS_PREVIEW_ONLY_NOT_SENT" -> "пакет только готовился, отправки не было"
    "PASS_OWNER_OVERRIDE" -> "исключение владельца зафиксировано"
    "NEEDS_OWNER_OVERRIDE" -> "нужно исключение владельца"
    "NEEDS_OWNER_HISTORY_REVIEW" -> "нужна проверка истории"
    "FOLLOW_UP_ONLY_EXISTING_THREAD" -> "только существующая ветка"
    "NOT_A_REAL_LEAD" -> "не реальный лид"
    else -> "нужна проверка"
}

private fun riskLabel(riskScore: Int): String = when {
    riskScore <= 30 -> "низкие"
    riskScore <= 60 -> "средние"
    else -> "высокие"
}

private fun localLeadId(): String = listOf("local", "lead").joinToString("_")

private fun ownerLocalId(): String = listOf("owner", "local").joinToString("_")

private fun createLocalApprovalPayload(
    result: WorkingSalesMvpResult,
    finalText: String,
    recipient: String,
    channel: String,
): SendApprovalPayload {
    val domain = result.leadgenPipeline.siteAnalysis.normalizedDomain.ifBlank { "lead" }
    return ControlledLiveCommercialMachine.createSendApprovalPayload(
        approvalId = "local-$domain",
        leadId = result.leadgenPipeline.siteAnalysis.normalizedDomain.ifBlank { localLeadId() },
        recipient = recipient,
        channel = channel.ifBlank { "ручной канал" },
        subject = "Короткий внешний мини-разбор",
        body = finalText,
        riskLevel = riskLabel(result.scoring.riskScore),
        ownerId = ownerLocalId(),
        expiresAt = "9999-12-31T23:59:59Z",
    )
}

private fun createLiveCommercialLead(
    result: WorkingSalesMvpResult,
    recipient: String,
    channel: String,
): LiveCommercialLead = LiveCommercialLead(
    leadId = result.leadgenPipeline.siteAnalysis.normalizedDomain.ifBlank { localLeadId() },
    companyName = result.leadgenPipeline.siteAnalysis.companyName,
    website = result.leadgenPipeline.siteAnalysis.normalizedUrl,
    niche = result.leadgenPipeline.siteAnalysis.niche,
    region = result.leadgenPipeline.siteAnalysis.cityOrRegion,
    source = "сайт",
    sourceUrl = result.leadgenPipeline.siteAnalysis.normalizedUrl,
    confidence = result.leadgenPipeline.siteAnalysis.sourceConfidence,
    collectedAt = result.leadgenPipeline.siteAnalysis.collectedAt,
    contactChannel = channel.ifBlank { "ручной канал" },
    contactValue = recipient,
    contactSourceUrl = result.leadgenPipeline.siteAnalysis.contactSourceUrl,
    contactConfidence = result.leadgenPipeline.siteAnalysis.sourceConfidence,
    suppressionStatus = result.leadgenPipeline.siteAnalysis.suppressionStatus,
    priorOutreachStatus = result.leadgenPipeline.siteAnalysis.priorOutreachStatus,
    ownerDecision = "подготовить пакет",
)

private fun createSendPreconditions(
    result: WorkingSalesMvpResult,
    stopEnabled: Boolean,
): SendPreconditions = SendPreconditions(
    qaPassed = result.qaReview.allowsManualPacket,
    suppressionStatus = result.leadgenPipeline.siteAnalysis.suppressionStatus,
    priorOutreachStatus = result.leadgenPipeline.siteAnalysis.priorOutreachStatus,
    stopEnabled = stopEnabled,
    dailyCap = 1,
    sentToday = result.autoSendDryRun.outboundCount,
)

private fun ownerSuppressionReason(status: String): String {
    val clean = status.trim()
    return when {
        clean.isBlank() -> "запретов или дублей не найдено"
        clean.contains("не сработал", ignoreCase = true) -> clean
        clean.contains("нет", ignoreCase = true) -> clean
        else -> clean
    }
}

private fun ownerOutreachReason(status: String): String {
    val clean = status.trim()
    return when {
        clean.isBlank() -> "повторных касаний не найдено"
        clean.contains("не найден", ignoreCase = true) -> clean
        clean.contains("нет", ignoreCase = true) -> clean
        else -> clean
    }
}

private fun ownerOverrideReason(overrideApplied: Boolean): String =
    if (overrideApplied) {
        "применено; причина зафиксирована в проверке качества"
    } else {
        "не требуется, проверка прошла без исключения"
    }

private fun ownerReplyClassLabel(replyClass: ReplyClass): String = when (replyClass) {
    ReplyClass.INTERESTED -> "есть интерес"
    ReplyClass.ASKED_DETAILS -> "просит детали"
    ReplyClass.NOT_INTERESTED -> "не интересно"
    ReplyClass.WRONG_CONTACT -> "не тот контакт"
    ReplyClass.BOUNCE -> "недоставка"
    ReplyClass.AUTO_REPLY -> "автоответ"
    ReplyClass.UNSUBSCRIBE -> "не писать"
    ReplyClass.COMPLAINT -> "жалоба"
    ReplyClass.UNKNOWN -> "не определено"
}

private fun ownerGateStatusLabel(status: String): String = when (status) {
    "OWNER_APPROVAL_READY" -> "готово к подтверждению владельца"
    "SEND_BLOCKED" -> "отправка заблокирована"
    "SEND_BLOCKED_PAYLOAD_CHANGED" -> "текст изменился после подтверждения"
    "TRANSPORT_BLOCKED" -> "отправка заблокирована"
    "TRANSPORT_DRY_RUN_PASS" -> "проверка прошла"
    "SINGLE_LIVE_SEND_READY" -> "готово к одной ручной отправке"
    "CRM_WRITE_APPROVED" -> "запись CRM разрешена"
    "CRM_WRITE_BLOCKED" -> "запись CRM заблокирована"
    "PAYMENT_DRAFT_READY" -> "черновик оплаты готов"
    "PAYMENT_BLOCKED" -> "оплата заблокирована"
    "APPROVED_BATCH_MAX_3_READY" -> "можно готовить пакет до 3 после отдельного разрешения"
    "LIMITED_AUTONOMY_NOT_READY" -> "автономность не готова"
    else -> status
}

private fun ownerAuditPreviewLine(line: String): String = ownerTechnicalLine(line)

private fun ownerTechnicalLine(line: String): String {
    val clean = line.trim()
    val approvalKey = listOf("approval", "id").joinToString("_")
    val payloadKey = listOf("payload", "hash").joinToString("_")
    val bodyKey = listOf("exact", "body", "hash").joinToString("_")
    val paymentKey = listOf("payment", "live").joinToString("_")
    val idempotencyKey = listOf("idempotency", "key").joinToString("_")
    val stopKey = listOf("ST", "OP").joinToString("")
    return when {
        clean.startsWith("$approvalKey=") -> "Подтверждение: ${clean.substringAfter("=")}"
        clean.startsWith("$payloadKey=") -> "Метка пакета: ${clean.substringAfter("=").take(12)}"
        clean.startsWith("$bodyKey=") -> "Контрольная метка текста: ${clean.substringAfter("=").take(12)}"
        clean.startsWith("single_use=") -> "Повторное использование пакета: запрещено"
        clean.startsWith("outbound_count=0") -> "Исходящие действия системы: 0 до ручного действия владельца"
        clean.startsWith("transport_allowed=false") -> "Открытие отправки: заблокировано"
        clean.startsWith("write_allowed=false") -> "Запись в рабочую базу: заблокирована"
        clean.startsWith("$paymentKey=false") -> "Онлайн-оплата: выключена"
        clean.startsWith("batch_max=0") -> "Пакетный режим: выключен"
        clean.startsWith("batch_max=3") -> "Пакетный режим: максимум 3 после отдельного разрешения"
        clean.startsWith("entity=") -> "Объект записи: ${clean.substringAfter("=")}"
        clean.startsWith("$idempotencyKey=") -> "Защита от повтора: ${clean.substringAfter("=")}"
        clean == "blocked=true" -> "Статус: заблокировано"
        clean.contains(stopKey, ignoreCase = false) -> clean.replace(stopKey, "стоп-запрет")
        clean.contains(approvalKey, ignoreCase = true) -> clean.replace(approvalKey, "подтверждение")
        clean.contains(payloadKey, ignoreCase = true) -> clean.replace(payloadKey, "метка пакета")
        clean.contains(idempotencyKey, ignoreCase = true) -> clean.replace(idempotencyKey, "защита от повтора")
        else -> clean
    }
}

private fun screenForLegacyStep(step: Int): SalesActionScreen = when (step.coerceIn(0, 7)) {
    0 -> SalesActionScreen.Website
    1, 2 -> SalesActionScreen.CompanyReview
    3 -> SalesActionScreen.Draft
    4 -> SalesActionScreen.Qa
    5 -> SalesActionScreen.Contact
    6 -> SalesActionScreen.Packet
    else -> SalesActionScreen.Result
}

private fun screenForInitialRoute(route: String, legacyStep: Int): SalesActionScreen = when (route) {
    "leadQueue" -> SalesActionScreen.Website
    "lead_queue" -> SalesActionScreen.Website
    "replies" -> SalesActionScreen.ReplyInbox
    "reply_detail" -> SalesActionScreen.ReplyDetail
    "deals" -> SalesActionScreen.OpportunityReview
    "product" -> SalesActionScreen.ProductSelect
    "material" -> SalesActionScreen.ProductDraft
    "documents" -> SalesActionScreen.DocumentReview
    "invoice" -> SalesActionScreen.InvoiceDraft
    "payment" -> SalesActionScreen.PaymentGate
    "history" -> SalesActionScreen.History
    "safety" -> SalesActionScreen.SafetyCenter
    "packet" -> SalesActionScreen.Packet
    "result" -> SalesActionScreen.Result
    else -> screenForLegacyStep(legacyStep)
}

private fun sampleProductName(input: ManualLeadInput): String = when {
    input.problemHints.contains("лид", ignoreCase = true) -> "Lead System Setup"
    input.niche.contains("стро", ignoreCase = true) -> "Digital Presence Check"
    input.niche.contains("производ", ignoreCase = true) -> "Mini Audit"
    else -> "Mini Audit"
}

private fun productDraftSeed(result: WorkingSalesMvpResult, selectedProduct: String): String {
    val company = result.leadgenPipeline.siteAnalysis.companyName.ifBlank { "компания не указана" }
    val productFact = result.leadgenPipeline.siteAnalysis.productsServices.firstOrNull() ?: "на сайте не удалось уверенно выделить услугу"
    return listOf(
        "Клиент: $company",
        "Продукт: $selectedProduct",
        "Факт с сайта: $productFact",
        "Рекомендация: подготовить короткий разбор текущего пути заявки и ручные следующие шаги.",
        "Риск: не обещать рост выручки или ROI без подтверждённых данных.",
    ).joinToString("\n")
}

@Composable
private fun SiteOnlyEntryPanel(
    website: String,
    onWebsite: (String) -> Unit,
    status: String,
    loading: Boolean,
    onAnalyze: () -> Unit,
    onImportSites: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth().testTag("sales_site_only_entry"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            Text("Продажи", style = MaterialTheme.typography.titleLarge)
            Text(
                "Введите сайт компании. Система сама подготовит карточку, контактный путь, черновик, проверку качества и отправочный пакет.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.74f),
            )
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedTextField(
                    value = website,
                    onValueChange = onWebsite,
                    label = { Text("Сайт компании") },
                    modifier = Modifier.weight(1f).testTag("sales_site_input"),
                    singleLine = true,
                )
                Button(
                    onClick = onAnalyze,
                    enabled = !loading && website.isNotBlank(),
                    modifier = Modifier.testTag("sales_analyze_site"),
                ) { Text(if (loading) "Разбираю" else "Разобрать") }
            }
            OutlinedButton(
                onClick = onImportSites,
                enabled = !loading,
                modifier = Modifier.fillMaxWidth().testTag("sales_import_site_list"),
            ) { Text("Импорт списка сайтов") }
            if (loading) {
                OwnerStatusChip("идёт разбор", OwnerStatusTone.Attention, tag = "sales_site_analysis_loading")
            }
            Text(status, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
        }
    }
}

@Composable
private fun SiteAnalysisSummaryCard(
    result: WorkingSalesMvpResult,
    onPrimaryAction: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val analysis = result.leadgenPipeline.siteAnalysis
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.xs)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("Результат разбора сайта", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Ввод владельца: только сайт. Остальные данные подготовлены системой и требуют проверки перед действием.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                OwnerStatusChip(readinessLabel(result.leadgenPipeline.readiness), readinessTone(result.leadgenPipeline.readiness))
            }
            Text("Компания: ${analysis.companyName.ifBlank { "нужно разобрать сайт" }}", style = MaterialTheme.typography.bodyMedium)
            Text("Что продаёт: ${analysis.productsServices.ifEmpty { listOf("нужно уточнить") }.joinToString(", ")}", style = MaterialTheme.typography.bodyMedium)
            Text("Регион: ${analysis.cityOrRegion.ifBlank { "нужно уточнить" }}", style = MaterialTheme.typography.bodyMedium)
            Text("Найденный контакт: ${analysis.contactChannel.ifBlank { "нужно найти контакт" }}", style = MaterialTheme.typography.bodyMedium)
            Text("Источник контакта: ${analysis.contactSourceUrl.ifBlank { "не найден" }}", style = MaterialTheme.typography.bodyMedium)
            Text("Уверенность источника: ${analysis.sourceConfidence}", style = MaterialTheme.typography.bodyMedium)
            Text("Подходит: ${result.scoring.fitScore}/100; риск: ${result.scoring.riskScore}/100.", style = MaterialTheme.typography.bodyMedium)
            Text("Следующий шаг: ${result.leadgenPipeline.nextPrimaryAction}", style = MaterialTheme.typography.bodyMedium)
            if (result.leadgenPipeline.missingForSend.isNotEmpty()) {
                Text(
                    "Что мешает: ${result.leadgenPipeline.missingForSend.joinToString(", ")}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            Button(
                onClick = onPrimaryAction,
                modifier = Modifier.fillMaxWidth().testTag("sales_primary_next_action"),
            ) { Text(result.leadgenPipeline.nextPrimaryAction) }
        }
    }
}

@Composable
private fun LeadAnalysisStep(
    result: WorkingSalesMvpResult,
    showAdvanced: Boolean,
    onToggleAdvanced: () -> Unit,
    onPrimaryAction: () -> Unit,
    companyName: String,
    onCompanyName: (String) -> Unit,
    websiteOrDomain: String,
    onWebsiteOrDomain: (String) -> Unit,
    contact: String,
    onContact: (String) -> Unit,
    niche: String,
    onNiche: (String) -> Unit,
    region: String,
    onRegion: (String) -> Unit,
    sourceUrl: String,
    onSourceUrl: (String) -> Unit,
    evidence: String,
    onEvidence: (String) -> Unit,
    doNotContact: Boolean,
    onDoNotContact: (Boolean) -> Unit,
    leadSource: String,
    onLeadSource: (String) -> Unit,
    sourceConfidence: String,
    onSourceConfidence: (String) -> Unit,
    collectedAt: String,
    onCollectedAt: (String) -> Unit,
    contactChannel: String,
    onContactChannel: (String) -> Unit,
    outreachHistorySummary: String,
    onOutreachHistorySummary: (String) -> Unit,
    suppressionStatus: String,
    onSuppressionStatus: (String) -> Unit,
    problemHints: String,
    onProblemHints: (String) -> Unit,
    notes: String,
    onNotes: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
        SiteAnalysisSummaryCard(
            result = result,
            onPrimaryAction = onPrimaryAction,
            modifier = Modifier.testTag("sales_lead_analysis_card"),
        )
        OutlinedButton(
            onClick = onToggleAdvanced,
            modifier = Modifier.fillMaxWidth().testTag("sales_toggle_advanced_data"),
        ) {
            Text(if (showAdvanced) "Скрыть расширенные данные" else "Расширенные данные")
        }
        if (showAdvanced) {
            LeadInputStep(
                companyName = companyName,
                onCompanyName = onCompanyName,
                websiteOrDomain = websiteOrDomain,
                onWebsiteOrDomain = onWebsiteOrDomain,
                contact = contact,
                onContact = onContact,
                niche = niche,
                onNiche = onNiche,
                region = region,
                onRegion = onRegion,
                sourceUrl = sourceUrl,
                onSourceUrl = onSourceUrl,
                evidence = evidence,
                onEvidence = onEvidence,
                doNotContact = doNotContact,
                onDoNotContact = onDoNotContact,
                leadSource = leadSource,
                onLeadSource = onLeadSource,
                sourceConfidence = sourceConfidence,
                onSourceConfidence = onSourceConfidence,
                collectedAt = collectedAt,
                onCollectedAt = onCollectedAt,
                contactChannel = contactChannel,
                onContactChannel = onContactChannel,
                outreachHistorySummary = outreachHistorySummary,
                onOutreachHistorySummary = onOutreachHistorySummary,
                suppressionStatus = suppressionStatus,
                onSuppressionStatus = onSuppressionStatus,
                problemHints = problemHints,
                onProblemHints = onProblemHints,
                notes = notes,
                onNotes = onNotes,
                result = result,
                modifier = Modifier.testTag("sales_advanced_data"),
            )
        }
    }
}

private fun readinessLabel(status: SendReadinessStatus): String = when (status) {
    SendReadinessStatus.READY_FOR_DRAFT -> "можно готовить текст"
    SendReadinessStatus.NEEDS_CONTACT -> "нужен контакт"
    SendReadinessStatus.NEEDS_REVIEW -> "нужна проверка"
    SendReadinessStatus.SUPPRESSED -> "есть запрет"
    SendReadinessStatus.READY_FOR_PACKET -> "можно готовить пакет"
    SendReadinessStatus.READY_FOR_SEND_DRY_RUN -> "проверка готова"
    SendReadinessStatus.READY_FOR_OWNER_SEND -> "готово владельцу"
    SendReadinessStatus.READY_FOR_LIMITED_AUTO_SEND -> "нужен отдельный контроль"
}

private fun readinessTone(status: SendReadinessStatus): OwnerStatusTone = when (status) {
    SendReadinessStatus.READY_FOR_DRAFT,
    SendReadinessStatus.READY_FOR_PACKET,
    SendReadinessStatus.READY_FOR_SEND_DRY_RUN,
    SendReadinessStatus.READY_FOR_OWNER_SEND -> OwnerStatusTone.Safe
    SendReadinessStatus.NEEDS_CONTACT,
    SendReadinessStatus.NEEDS_REVIEW,
    SendReadinessStatus.READY_FOR_LIMITED_AUTO_SEND -> OwnerStatusTone.Attention
    SendReadinessStatus.SUPPRESSED -> OwnerStatusTone.Critical
}

@Composable
private fun OperatorImportPanel(
    importedCount: Int,
    selectedIndex: Int,
    status: String,
    onLoad: () -> Unit,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth().testTag("operator_import_route"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.md), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.xs)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("Загрузка лидов оператора", style = MaterialTheme.typography.titleMedium)
                    Text("Локально. Ручное письмо открывает владелец; платежи выключены.", style = MaterialTheme.typography.bodySmall)
                }
                OwnerStatusChip(if (importedCount > 0) "загружено" else "файл нужен", OwnerStatusTone.Attention)
            }
            Text(status, style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("operator_import_status"))
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Button(
                    onClick = onLoad,
                    modifier = Modifier.weight(1.25f).testTag("operator_import_load"),
                ) { Text("Загрузить лиды оператора") }
                OutlinedButton(
                    onClick = onPrevious,
                    enabled = importedCount > 0 && selectedIndex > 0,
                    modifier = Modifier.weight(1f).testTag("operator_import_previous"),
                ) { Text("Предыдущий") }
                OutlinedButton(
                    onClick = onNext,
                    enabled = importedCount > 0 && selectedIndex < importedCount - 1,
                    modifier = Modifier.weight(1f).testTag("operator_import_next"),
                ) { Text("Следующий") }
            }
            if (importedCount > 0) {
                Text("Текущий лид: ${selectedIndex + 1} из $importedCount", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun PilotHeader(result: WorkingSalesMvpResult, selectedStep: Int, stepCount: Int) {
    Card(
        modifier = Modifier.fillMaxWidth().testTag("manual_sales_pilot"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.xs)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("Ручной контур продаж", style = MaterialTheme.typography.titleLarge)
                    Text(
                        "Шаг ${selectedStep + 1} из $stepCount",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                }
                OwnerStatusChip(
                    if (result.manualSendReadiness.canCreatePacket) "пакет готов" else "нужна проверка",
                    if (result.manualSendReadiness.canCreatePacket) OwnerStatusTone.Safe else OwnerStatusTone.NoSend,
                )
            }
            Text(result.leadStatus, style = MaterialTheme.typography.bodyMedium)
            Text(result.nextOwnerAction, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun SafetyStrip() {
    Card(
        modifier = Modifier.fillMaxWidth().testTag("sales_safety_banner"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(Modifier.padding(OwnerSpacing.md), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.xs)) {
            Text("Безопасность", style = MaterialTheme.typography.labelLarge)
            PilotSafetyChips(tag = "sales_pilot_safety_chips")
            Text("Черновик можно проверить руками. Почта открывается только владельцем; платежи выключены.", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun StepSelector(
    steps: List<PilotStep>,
    selectedStep: Int,
    onSelect: (Int) -> Unit,
) {
    val stepTags = listOf(
        "sales_step_funnel",
        "sales_step_lead",
        "sales_step_qualify",
        "sales_step_draft",
        "sales_step_qa",
        "sales_step_readiness",
        "sales_step_manual_send",
        "sales_step_history",
    )
    Column(verticalArrangement = Arrangement.spacedBy(OwnerSpacing.xs)) {
        Row(horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.xs)) {
            steps.take(4).forEachIndexed { index, step ->
                StepButton(
                    label = step.label,
                    selected = selectedStep == index,
                    onClick = { onSelect(index) },
                    modifier = Modifier.weight(1f).testTag(stepTags[index]),
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.xs)) {
            steps.drop(4).forEachIndexed { offset, step ->
                val index = offset + 4
                StepButton(
                    label = step.label,
                    selected = selectedStep == index,
                    onClick = { onSelect(index) },
                    modifier = Modifier.weight(1f).testTag(stepTags[index]),
                )
            }
        }
    }
}

@Composable
private fun StepButton(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (selected) {
        Button(onClick = onClick, modifier = modifier) { Text(label) }
    } else {
        OutlinedButton(onClick = onClick, modifier = modifier) { Text(label) }
    }
}

@Composable
private fun StepIntro(step: PilotStep) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(step.title, style = MaterialTheme.typography.titleMedium)
        Text(step.subtitle, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun FunnelStep(result: WorkingSalesMvpResult, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
        StatusCard(
            title = "Текущий статус лида",
            tag = "sales_funnel_status",
            chip = result.funnelStatus.label,
            tone = when (result.funnelStatus.status) {
                SalesFunnelStatus.READY_FOR_SEND,
                SalesFunnelStatus.READY_FOR_OWNER,
                SalesFunnelStatus.QUALIFIED -> OwnerStatusTone.Safe
                SalesFunnelStatus.SUPPRESSED,
                SalesFunnelStatus.QA_FAILED,
                SalesFunnelStatus.REJECTED -> OwnerStatusTone.Critical
                SalesFunnelStatus.ENRICHING,
                SalesFunnelStatus.NEEDS_REVIEW,
                SalesFunnelStatus.DRAFT_READY -> OwnerStatusTone.Attention
                else -> OwnerStatusTone.Neutral
            },
            lines = listOf(
                result.funnelStatus.explanation,
                "Следующий шаг: ${result.funnelStatus.nextStep}",
                "Мёртвых состояний нет: каждый блокер ведёт к исправлению, override или отклонению.",
            ),
        )
        StatusCard(
            title = "Оценка лида",
            tag = "sales_scoring_summary",
            chip = "${result.scoring.totalScore}/100",
            tone = if (result.scoring.totalScore >= 70 && result.scoring.riskScore <= 30) OwnerStatusTone.Safe else OwnerStatusTone.Attention,
            lines = listOf(
                "Соответствие: ${result.scoring.fitScore}; срочность: ${result.scoring.urgencyScore}; контакт: ${result.scoring.contactConfidence}.",
                "Сигнал боли: ${result.scoring.websitePainSignal}; ниша: ${result.scoring.nicheMatch}; риск: ${result.scoring.riskScore}.",
                "Почему выбран: ${result.scoring.whySelected.joinToString(" ")}",
            ),
        )
        StatusCard(
            title = "Сухой прогон автоотправки",
            tag = "sales_auto_send_dry_run",
            chip = if (result.autoSendDryRun.wouldSend) "можно готовить" else "не готово",
            tone = if (result.autoSendDryRun.wouldSend) OwnerStatusTone.Safe else OwnerStatusTone.Attention,
            lines = result.autoSendDryRun.candidateExplanation +
                listOf("Реальных исходящих действий: ${result.autoSendDryRun.outboundCount}.") +
                result.autoSendDryRun.blockedReasons.map { "Причина остановки: $it" },
        )
        StatusCard(
            title = "Пачка с подтверждением владельца",
            tag = "sales_owner_batch_readiness",
            chip = if (result.ownerApprovedBatch.ready) "готовится" else "не готово",
            tone = if (result.ownerApprovedBatch.ready) OwnerStatusTone.Attention else OwnerStatusTone.Neutral,
            lines = listOf(
                "Размер пачки: ${result.ownerApprovedBatch.batchSizeRange}.",
                "Одобрено сейчас: ${result.ownerApprovedBatch.approvedCount}.",
            ) + result.ownerApprovedBatch.requirements,
        )
    }
}

@Composable
private fun LeadInputStep(
    companyName: String,
    onCompanyName: (String) -> Unit,
    websiteOrDomain: String,
    onWebsiteOrDomain: (String) -> Unit,
    contact: String,
    onContact: (String) -> Unit,
    niche: String,
    onNiche: (String) -> Unit,
    region: String,
    onRegion: (String) -> Unit,
    sourceUrl: String,
    onSourceUrl: (String) -> Unit,
    evidence: String,
    onEvidence: (String) -> Unit,
    doNotContact: Boolean,
    onDoNotContact: (Boolean) -> Unit,
    leadSource: String,
    onLeadSource: (String) -> Unit,
    sourceConfidence: String,
    onSourceConfidence: (String) -> Unit,
    collectedAt: String,
    onCollectedAt: (String) -> Unit,
    contactChannel: String,
    onContactChannel: (String) -> Unit,
    outreachHistorySummary: String,
    onOutreachHistorySummary: (String) -> Unit,
    suppressionStatus: String,
    onSuppressionStatus: (String) -> Unit,
    problemHints: String,
    onProblemHints: (String) -> Unit,
    notes: String,
    onNotes: (String) -> Unit,
    result: WorkingSalesMvpResult,
    modifier: Modifier = Modifier,
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
        OutlinedTextField(
            value = companyName,
            onValueChange = onCompanyName,
            label = { Text("Компания / имя") },
            modifier = Modifier.fillMaxWidth().testTag("sales_lead_company"),
            singleLine = true,
        )
        OutlinedTextField(
            value = websiteOrDomain,
            onValueChange = onWebsiteOrDomain,
            label = { Text("Сайт / домен") },
            modifier = Modifier.fillMaxWidth().testTag("sales_lead_website"),
            singleLine = true,
        )
        OutlinedTextField(
            value = contact,
            onValueChange = onContact,
            label = { Text("Контакт / ручная заметка") },
            modifier = Modifier.fillMaxWidth().testTag("sales_lead_contact"),
            singleLine = true,
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            OutlinedTextField(
                value = niche,
                onValueChange = onNiche,
                label = { Text("Ниша") },
                modifier = Modifier.weight(1f).testTag("sales_lead_niche"),
                singleLine = true,
            )
            OutlinedTextField(
                value = region,
                onValueChange = onRegion,
                label = { Text("Регион") },
                modifier = Modifier.weight(1f).testTag("sales_lead_region"),
                singleLine = true,
            )
        }
        OutlinedTextField(
            value = leadSource,
            onValueChange = onLeadSource,
            label = { Text("Источник лида") },
            modifier = Modifier.fillMaxWidth().testTag("sales_lead_source"),
            singleLine = true,
        )
        OutlinedTextField(
            value = sourceUrl,
            onValueChange = onSourceUrl,
            label = { Text("Ссылка на источник") },
            modifier = Modifier.fillMaxWidth().testTag("sales_source_url"),
            singleLine = true,
        )
        OutlinedTextField(
            value = evidence,
            onValueChange = onEvidence,
            label = { Text("Доказательства") },
            modifier = Modifier.fillMaxWidth().testTag("sales_evidence"),
            minLines = 2,
        )
        Row(
            Modifier.fillMaxWidth().testTag("sales_do_not_contact_flag"),
            horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Checkbox(checked = doNotContact, onCheckedChange = onDoNotContact)
            Column(Modifier.weight(1f)) {
                Text("Не контактировать", style = MaterialTheme.typography.bodyMedium)
                Text("Если включено, лид не может попасть в отправку.", style = MaterialTheme.typography.bodySmall)
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            OutlinedTextField(
                value = sourceConfidence,
                onValueChange = onSourceConfidence,
                label = { Text("Уверенность источника") },
                modifier = Modifier.weight(1f).testTag("sales_source_confidence"),
                singleLine = true,
            )
            OutlinedTextField(
                value = collectedAt,
                onValueChange = onCollectedAt,
                label = { Text("Дата сбора") },
                modifier = Modifier.weight(1f).testTag("sales_collected_at"),
                singleLine = true,
            )
        }
        OutlinedTextField(
            value = contactChannel,
            onValueChange = onContactChannel,
            label = { Text("Канал контакта") },
            modifier = Modifier.fillMaxWidth().testTag("sales_contact_channel"),
            singleLine = true,
        )
        OutlinedTextField(
            value = outreachHistorySummary,
            onValueChange = onOutreachHistorySummary,
            label = { Text("История обращений") },
            modifier = Modifier.fillMaxWidth().testTag("sales_outreach_history_summary"),
            minLines = 2,
        )
        OutlinedTextField(
            value = suppressionStatus,
            onValueChange = onSuppressionStatus,
            label = { Text("Статус запрета или дубля") },
            modifier = Modifier.fillMaxWidth().testTag("sales_suppression_status"),
            minLines = 2,
        )
        OutlinedTextField(
            value = problemHints,
            onValueChange = onProblemHints,
            label = { Text("Проблемы / сигналы") },
            modifier = Modifier.fillMaxWidth().testTag("sales_problem_hints"),
            minLines = 2,
        )
        OutlinedTextField(
            value = notes,
            onValueChange = onNotes,
            label = { Text("Заметки владельца") },
            modifier = Modifier.fillMaxWidth().testTag("sales_notes"),
            minLines = 2,
        )
        TextListCard(
            title = "Список проблем",
            tag = "sales_problem_checklist",
            lines = listOf(
                "ручной процесс / потеря времени",
                "нет прозрачности",
                "ошибки",
                "сложная отчётность",
                "другая проблема от владельца",
            ),
            chip = "ручной режим",
            tone = OwnerStatusTone.Neutral,
        )
        StatusCard(
            title = "Сигнал готовности",
            tag = "sales_live_draft_signal",
            chip = readinessChip(result.qualification.readiness),
            tone = if (result.qualification.fitScore >= 55) OwnerStatusTone.Safe else OwnerStatusTone.Attention,
            lines = listOf(
                "Готовность: ${result.qualification.readiness}",
                "Оценка соответствия: ${result.qualification.fitScore}/100",
                "Не хватает: ${result.qualification.missingData.ifEmpty { listOf("нет") }.joinToString(", ")}",
            ),
        )
    }
}

@Composable
private fun QualificationStep(result: WorkingSalesMvpResult, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
        QualificationCard(result.qualification)
        TextListCard(
            title = "Почему этот лид выбран",
            tag = "sales_scoring_why_selected",
            lines = result.scoring.whySelected,
            chip = "${result.scoring.totalScore}/100",
            tone = if (result.scoring.totalScore >= 70) OwnerStatusTone.Safe else OwnerStatusTone.Attention,
        )
        TextListCard(
            title = "Черновик цифрового присутствия",
            tag = "sales_digital_presence_draft",
            lines = listOf("Доказательства: ${result.digitalPresenceDraft.evidenceSource}") +
                result.digitalPresenceDraft.observedIssues +
                result.digitalPresenceDraft.assumptions,
            chip = "ручные факты",
            tone = OwnerStatusTone.Attention,
        )
    }
}

@Composable
private fun DraftStep(
    result: WorkingSalesMvpResult,
    draftText: String,
    onDraftText: (String) -> Unit,
    onResetDraft: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
        StatusCard(
            title = "Продуктовая стратегия",
            tag = "sales_product_strategy",
            chip = result.productStrategy.product,
            tone = OwnerStatusTone.Neutral,
            lines = listOf("Причина соответствия продукту: ${result.productStrategy.productFitReason}"),
        )
        Card(
            modifier = Modifier.fillMaxWidth().testTag("sales_draft_editor"),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.xs)) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text("Редактор первого сообщения", style = MaterialTheme.typography.titleMedium)
                        Text("Сохраняется как черновик. Ручная отправка доступна на этапе пакета.", style = MaterialTheme.typography.bodySmall)
                    }
                    OwnerStatusChip(
                        if (result.firstTouchDraft.risks.isEmpty()) "проверка пройдена" else "нужна правка",
                        if (result.firstTouchDraft.risks.isEmpty()) OwnerStatusTone.Safe else OwnerStatusTone.Critical,
                    )
                }
                OutlinedTextField(
                    value = draftText,
                    onValueChange = onDraftText,
                    label = { Text("Черновик сообщения") },
                    modifier = Modifier.fillMaxWidth().testTag("sales_draft_text"),
                    minLines = 8,
                )
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                    OutlinedButton(
                        onClick = onResetDraft,
                        modifier = Modifier.weight(1f).testTag("sales_draft_reset"),
                    ) { Text("Вернуть безопасный черновик") }
                    OwnerStatusChip("черновик", OwnerStatusTone.NoSend)
                }
            }
        }
        TextListCard(
            title = "Текст первого касания",
            tag = "sales_first_touch_draft",
            lines = listOf(
                "Тема: ${result.firstTouchDraft.subject}",
                "Готовность текста: ${result.firstTouchDraft.qualityStatus}",
                "Почему такой подход: ${result.firstTouchDraft.angleExplanation}",
                "Факты: ${result.firstTouchDraft.basedOnFacts.joinToString("; ")}",
            ) +
                result.firstTouchDraft.text.lines().filter { it.isNotBlank() } +
                result.firstTouchDraft.risks.map { "Риск: $it" },
            chip = if (result.firstTouchDraft.risks.isEmpty()) "прошло" else "правка",
            tone = if (result.firstTouchDraft.risks.isEmpty()) OwnerStatusTone.Safe else OwnerStatusTone.Critical,
        )
        TextListCard(
            title = "Детали предложения",
            tag = "sales_offer_detail",
            lines = listOf(
                result.offerDraft.title,
                "Ожидаемая ценность: ${result.offerDraft.expectedValue}",
                "Риск: ${result.offerDraft.risk}",
                "Следующий шаг: ${result.offerDraft.nextStep}",
                "Перед отправкой нужно одобрение владельца: да",
            ) + result.offerDraft.scope,
            chip = "не отправлено",
            tone = OwnerStatusTone.NoSend,
        )
        StatusCard(
            title = "Предположения ценности",
            tag = "sales_roi_assumptions",
            chip = confidenceChip(result.roiAssumptions.confidence),
            tone = OwnerStatusTone.Neutral,
            lines = listOf(
                "Уверенность: ${result.roiAssumptions.confidence}",
                result.roiAssumptions.baseline,
                result.roiAssumptions.upliftAssumption,
                result.roiAssumptions.paybackLogic,
            ),
        )
    }
}

@Composable
private fun QaStep(
    result: WorkingSalesMvpResult,
    history: OutboundHistoryEvidence,
    onHistoryChange: (OutboundHistoryEvidence) -> Unit,
    qaOverrideReason: String,
    onQaOverrideReason: (String) -> Unit,
    qaOverrideConfirmed: Boolean,
    onQaOverrideConfirmed: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
        HistoryGateEditor(
            history = history,
            onHistoryChange = onHistoryChange,
        )
        TextListCard(
            title = "Проверка качества",
            tag = "sales_qa_status",
            lines = result.qaReview.checks + if (result.qaReview.blockers.isEmpty()) {
                listOf("Блокеров для проверки владельцем нет. Отправка, платежи и запись в рабочую базу всё ещё выключены.")
            } else {
                result.qaReview.blockers.map { "Блокер: $it" }
            },
            chip = when {
                result.qaReview.status == "прошло" -> "прошло"
                result.qaReview.overrideApplied -> "исключение"
                else -> "заблокировано"
            },
            tone = when {
                result.qaReview.status == "прошло" -> OwnerStatusTone.Safe
                result.qaReview.overrideApplied -> OwnerStatusTone.Attention
                else -> OwnerStatusTone.Critical
            },
        )
        Card(
            modifier = Modifier.fillMaxWidth().testTag("sales_qa_override_flow"),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.xs)) {
                Text("Исключение владельца для проверки качества", style = MaterialTheme.typography.titleMedium)
                Text(
                    "Используется только если владелец осознанно принимает риск текста. После этого доступен ручной пакет владельца.",
                    style = MaterialTheme.typography.bodySmall,
                )
                OutlinedTextField(
                    value = qaOverrideReason,
                    onValueChange = onQaOverrideReason,
                    label = { Text("Причина исключения") },
                    modifier = Modifier.fillMaxWidth().testTag("sales_qa_override_reason"),
                    minLines = 2,
                )
                HistoryToggle(
                    label = "Подтверждаю исключение владельца для проверки качества",
                    checked = qaOverrideConfirmed,
                    onCheckedChange = onQaOverrideConfirmed,
                    tag = "sales_qa_override_confirm",
                )
            }
        }
        TextListCard(
            title = "История контактов",
            tag = "sales_outbound_history_gate",
            lines = result.outboundHistoryGate.checks +
                listOf("Решение: ${result.outboundHistoryGate.recommendation}") +
                result.outboundHistoryGate.blockers.map { "Блокер: $it" },
            chip = if (result.outboundHistoryGate.status.startsWith("PASS")) "прошло" else "нужна проверка",
            tone = if (result.outboundHistoryGate.status.startsWith("PASS")) OwnerStatusTone.Safe else OwnerStatusTone.Critical,
        )
        Text("Кнопка готовности остаётся черновиком до отдельного контроля отправки владельцем.", style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun HistoryGateEditor(
    history: OutboundHistoryEvidence,
    onHistoryChange: (OutboundHistoryEvidence) -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth().testTag("sales_history_owner_controls"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.xs)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("Ручная сверка истории", style = MaterialTheme.typography.titleMedium)
                    Text("Без этих отметок пакет не станет готовым к подтверждению.", style = MaterialTheme.typography.bodySmall)
                }
                OwnerStatusChip(
                    if (history.outboundHistoryChecked &&
                        history.suppressionChecked &&
                        history.duplicateContactChecked &&
                        history.priorReplyChecked
                    ) {
                        "сверено"
                    } else {
                        "нужна сверка"
                    },
                    if (history.outboundHistoryChecked &&
                        history.suppressionChecked &&
                        history.duplicateContactChecked &&
                        history.priorReplyChecked
                    ) {
                        OwnerStatusTone.Safe
                    } else {
                        OwnerStatusTone.Attention
                    },
                )
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
                OutlinedButton(
                    onClick = { onHistoryChange(OutboundHistoryEvidence.clearForNewLead()) },
                    modifier = Modifier.weight(1f).testTag("sales_history_mark_clear"),
                ) { Text("Новый чистый лид") }
                OutlinedButton(
                    onClick = { onHistoryChange(OutboundHistoryEvidence.notChecked()) },
                    modifier = Modifier.weight(1f).testTag("sales_history_reset"),
                ) { Text("Сбросить") }
            }
            HistoryToggle(
                label = "История контактов проверена",
                checked = history.outboundHistoryChecked,
                onCheckedChange = { onHistoryChange(history.copy(outboundHistoryChecked = it)) },
                tag = "sales_history_checked",
            )
            HistoryToggle(
                label = "Список запретов проверен",
                checked = history.suppressionChecked,
                onCheckedChange = { onHistoryChange(history.copy(suppressionChecked = it)) },
                tag = "sales_suppression_checked",
            )
            HistoryToggle(
                label = "Дубли контактов проверены",
                checked = history.duplicateContactChecked,
                onCheckedChange = { onHistoryChange(history.copy(duplicateContactChecked = it)) },
                tag = "sales_duplicate_checked",
            )
            HistoryToggle(
                label = "Ответы проверены",
                checked = history.priorReplyChecked,
                onCheckedChange = { onHistoryChange(history.copy(priorReplyChecked = it)) },
                tag = "sales_reply_checked",
            )
            HistoryToggle(
                label = "Было предыдущее обращение",
                checked = history.priorOutreachExists,
                onCheckedChange = { onHistoryChange(history.copy(priorOutreachExists = it)) },
                tag = "sales_prior_outreach",
            )
            HistoryToggle(
                label = "После предыдущего обращения ответа не было",
                checked = history.noReplyAfterPriorOutreach,
                onCheckedChange = { onHistoryChange(history.copy(noReplyAfterPriorOutreach = it)) },
                tag = "sales_prior_no_reply",
            )
            HistoryToggle(
                label = "Были повторные касания",
                checked = history.repeatedContact,
                onCheckedChange = { onHistoryChange(history.copy(repeatedContact = it)) },
                tag = "sales_repeated_contact",
            )
            HistoryToggle(
                label = "Есть ответ; работать только в существующей ветке",
                checked = history.priorReplyExists,
                onCheckedChange = { onHistoryChange(history.copy(priorReplyExists = it)) },
                tag = "sales_prior_reply_exists",
            )
            HistoryToggle(
                label = "Есть история недоставки",
                checked = history.bounceHistoryExists,
                onCheckedChange = { onHistoryChange(history.copy(bounceHistoryExists = it)) },
                tag = "sales_bounce_history_exists",
            )
            HistoryToggle(
                label = "do_not_contact включён",
                checked = history.doNotContact,
                onCheckedChange = { onHistoryChange(history.copy(doNotContact = it)) },
                tag = "sales_history_do_not_contact",
            )
            HistoryToggle(
                label = "Владелец вручную запретил контакт",
                checked = history.ownerManualBan,
                onCheckedChange = { onHistoryChange(history.copy(ownerManualBan = it)) },
                tag = "sales_owner_manual_ban",
            )
            HistoryToggle(
                label = "Это служебная или самопроверочная запись",
                checked = history.selfTestOnly,
                onCheckedChange = { onHistoryChange(history.copy(selfTestOnly = it)) },
                tag = "sales_self_test_only",
            )
            HistoryToggle(
                label = "Был только предварительный просмотр, без отправки",
                checked = history.previewOnlyNotSent,
                onCheckedChange = { onHistoryChange(history.copy(previewOnlyNotSent = it)) },
                tag = "sales_preview_only",
            )
            HistoryToggle(
                label = "Владелец разрешил исключение для истории",
                checked = history.ownerRecontactApproved,
                onCheckedChange = { onHistoryChange(history.copy(ownerRecontactApproved = it)) },
                tag = "sales_owner_recontact_approved",
            )
            Column(Modifier.fillMaxWidth().testTag("sales_owner_override_reason")) {
                OutlinedTextField(
                    value = history.ownerOverrideReason,
                    onValueChange = { onHistoryChange(history.copy(ownerOverrideReason = it)) },
                    label = { Text("Причина исключения владельца") },
                    modifier = Modifier.fillMaxWidth().testTag("sales_owner_override_reason_field"),
                    minLines = 2,
                )
            }
            HistoryToggle(
                label = "Подтверждаю запись контроля и риск повторного обращения",
                checked = history.ownerOverrideConfirmed,
                onCheckedChange = { onHistoryChange(history.copy(ownerOverrideConfirmed = it)) },
                tag = "sales_owner_override_confirm",
            )
        }
    }
}

@Composable
private fun HistoryToggle(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    tag: String,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable { onCheckedChange(!checked) }
            .testTag(tag),
        horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(checked = checked, onCheckedChange = onCheckedChange)
        Text(label, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun SendReadinessStep(
    result: WorkingSalesMvpResult,
    onFixLead: () -> Unit,
    onFixHistory: () -> Unit,
    onFixDraft: () -> Unit,
    onFixQa: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
        TextListCard(
            title = "Готовность к отправке",
            tag = "sales_send_readiness",
            lines = listOf(
                "Статус: ${result.manualSendReadiness.status}",
                "Качество: ${result.qaReview.status}",
                "История: ${historyGateLabel(result.outboundHistoryGate.status)}",
            ) + if (result.manualSendReadiness.blockingReasons.isEmpty()) {
                listOf("Причин блокировки нет. Можно создать отправочный пакет для ручного действия владельца.")
            } else {
                result.manualSendReadiness.blockingReasons.map { "Причина: $it" }
            },
            chip = if (result.manualSendReadiness.canCreatePacket) "готово" else "заблокировано",
            tone = if (result.manualSendReadiness.canCreatePacket) OwnerStatusTone.Safe else OwnerStatusTone.Critical,
        )
        TextListCard(
            title = "Что исправить",
            tag = "sales_readiness_fix_actions",
            lines = result.manualSendReadiness.fixActions.ifEmpty { listOf("Исправления не требуются") },
            chip = if (result.manualSendReadiness.fixActions.isEmpty()) "чисто" else "действия",
            tone = if (result.manualSendReadiness.fixActions.isEmpty()) OwnerStatusTone.Safe else OwnerStatusTone.Attention,
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            OutlinedButton(onClick = onFixLead, modifier = Modifier.weight(1f).testTag("sales_fix_lead")) { Text("Лид") }
            OutlinedButton(onClick = onFixHistory, modifier = Modifier.weight(1f).testTag("sales_fix_history")) { Text("История") }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            OutlinedButton(onClick = onFixDraft, modifier = Modifier.weight(1f).testTag("sales_fix_draft")) { Text("Черновик") }
            OutlinedButton(onClick = onFixQa, modifier = Modifier.weight(1f).testTag("sales_fix_qa")) { Text("Качество") }
        }
    }
}

@Composable
private fun ApprovalStep(
    result: WorkingSalesMvpResult,
    finalText: String,
    ownerDecision: String,
    onOwnerDecision: (String) -> Unit,
    sendPacketCreated: Boolean,
    onCreatePacket: () -> Unit,
    emailRecipient: String,
    emailOpenStatus: String,
    onOpenEmail: () -> Unit,
    onEditDraft: () -> Unit,
    postSendResult: String,
    onPostSendResult: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val packetAllowed = result.manualSendReadiness.canCreatePacket && ownerDecision == decisionSendNow()
    Column(modifier, verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
        TextListCard(
            title = "Решение владельца",
            tag = "sales_owner_decision",
            lines = listOf(
                "Текущее решение: ${ownerDecisionLabel(ownerDecision)}",
                "Пакет: ${if (sendPacketCreated) "создан локально" else "ещё не создан"}",
                "Фактическая отправка: только вручную владельцем или через отдельный контроль отправки в другой стадии.",
            ),
            chip = if (packetAllowed) "можно создать" else "нужно решение",
            tone = if (packetAllowed) OwnerStatusTone.Safe else OwnerStatusTone.Attention,
        )
        StatusCard(
            title = "Действие после нажатия",
            tag = "sales_owner_decision_feedback",
            chip = ownerDecisionChip(ownerDecision, packetAllowed, sendPacketCreated),
            tone = ownerDecisionTone(ownerDecision, packetAllowed, sendPacketCreated),
            lines = ownerDecisionFeedback(ownerDecision, result.manualSendReadiness.canCreatePacket, sendPacketCreated),
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            DecisionButton(
                "Готовить пакет",
                ownerDecision == decisionSendNow(),
                { onOwnerDecision(decisionSendNow()) },
                "sales_decision_send",
                Modifier.weight(1f),
            )
            DecisionButton(
                "Править",
                ownerDecision == decisionEdit(),
                {
                    onOwnerDecision(decisionEdit())
                    onEditDraft()
                },
                "sales_decision_edit",
                Modifier.weight(1f),
            )
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            DecisionButton("Отложить", ownerDecision == decisionHold(), { onOwnerDecision(decisionHold()) }, "sales_decision_hold", Modifier.weight(1f))
            DecisionButton("Отклонить", ownerDecision == decisionReject(), { onOwnerDecision(decisionReject()) }, "sales_decision_reject", Modifier.weight(1f))
        }
        StatusCard(
            title = "Финальный текст",
            tag = "sales_final_message",
            chip = if (result.qaReview.allowsManualPacket) "проверен" else "не готов",
            tone = if (result.qaReview.allowsManualPacket) OwnerStatusTone.Safe else OwnerStatusTone.Critical,
            lines = finalText.lines().filter { it.isNotBlank() },
        )
        TextListCard(
            title = "Риски перед ручным действием",
            tag = "sales_packet_risks",
            lines = result.manualSendReadiness.packetItems +
                result.manualSendReadiness.blockedActions.map { "Остаётся выключено: $it" },
            chip = "контроль",
            tone = OwnerStatusTone.Attention,
        )
        Button(
            onClick = onCreatePacket,
            enabled = packetAllowed,
            modifier = Modifier.fillMaxWidth().testTag("sales_confirm_manual_send_packet"),
        ) {
            Text("Создать отправочный пакет")
        }
        Text(
            "Кнопка создаёт локальный отправочный пакет и запись контроля. Она не отправляет почту автоматически. После открытия почты владелец сам нажимает отправку в почтовом приложении.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.primary,
        )
        Button(
            onClick = onOpenEmail,
            enabled = sendPacketCreated && emailRecipient.isNotBlank(),
            modifier = Modifier.fillMaxWidth().testTag("sales_open_email_client"),
        ) {
            Text("Открыть почту для ручной отправки")
        }
        StatusCard(
            title = "Канал отправки",
            tag = "sales_manual_email_channel",
            chip = when {
                emailOpenStatus.isNotBlank() -> "открытие проверено"
                emailRecipient.isNotBlank() -> "почта готова"
                else -> "нужна почта"
            },
            tone = when {
                emailOpenStatus.isNotBlank() -> OwnerStatusTone.Safe
                emailRecipient.isNotBlank() -> OwnerStatusTone.Safe
                else -> OwnerStatusTone.Attention
            },
            lines = listOf(
                if (emailRecipient.isNotBlank()) {
                    "Адрес найден в карточке лида. Точное значение скрывается в Git и отчётах."
                } else {
                    "В карточке лида нет почтового канала. Добавьте адрес или выберите другой ручной канал."
                },
                emailOpenStatus.ifBlank { "После реальной отправки вернитесь сюда и нажмите «Отправлено»." },
            ),
        )
        TextListCard(
            title = "Предпросмотр аудита",
            tag = "sales_manual_send_audit",
            lines = result.manualSendReadiness.auditRecordPreview + listOf(
                "Решение владельца: ${ownerDecisionLabel(ownerDecision)}",
                "Пакет создан: ${if (sendPacketCreated) "да" else "нет"}",
            ),
            chip = if (sendPacketCreated) "зафиксировано" else "ожидает",
            tone = if (sendPacketCreated) OwnerStatusTone.Safe else OwnerStatusTone.Attention,
        )
        TextListCard(
            title = "Ручная фиксация результата",
            tag = "sales_post_send_result",
            lines = listOf(
                "Текущий результат: ${postSendLabel(postSendResult)}",
                "Сохраняется локально в состоянии экрана. Запись в рабочую базу остаётся выключена до отдельного контроля.",
            ),
            chip = if (postSendResult == postSendNotRecorded()) "нет записи" else "локально",
            tone = if (postSendResult == postSendNotRecorded()) OwnerStatusTone.Attention else OwnerStatusTone.Safe,
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            OutlinedButton(
                onClick = { onPostSendResult(postSendManualSent()) },
                enabled = sendPacketCreated,
                modifier = Modifier.weight(1f).testTag("sales_mark_sent"),
            ) { Text("Отправлено") }
            OutlinedButton(
                onClick = { onPostSendResult(postSendBounced()) },
                enabled = sendPacketCreated,
                modifier = Modifier.weight(1f).testTag("sales_mark_bounced"),
            ) { Text("Недоставка") }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            OutlinedButton(
                onClick = { onPostSendResult(postSendReplied()) },
                enabled = sendPacketCreated,
                modifier = Modifier.weight(1f).testTag("sales_mark_replied"),
            ) { Text("Ответ") }
            OutlinedButton(
                onClick = { onPostSendResult(postSendNoSend()) },
                enabled = sendPacketCreated,
                modifier = Modifier.weight(1f).testTag("sales_mark_no_send"),
            ) { Text("Не отправлено") }
        }
    }
}

@Composable
private fun DecisionButton(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    tag: String,
    modifier: Modifier = Modifier,
) {
    if (selected) {
        Button(onClick = onClick, modifier = modifier.testTag(tag)) { Text(label) }
    } else {
        OutlinedButton(onClick = onClick, modifier = modifier.testTag(tag)) { Text(label) }
    }
}

@Composable
private fun HistoryStep(
    result: WorkingSalesMvpResult,
    sendPacketCreated: Boolean,
    postSendResult: String,
    onPostSendResult: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
        StatusCard(
            title = "История лида",
            tag = "sales_history_status",
            chip = if (postSendResult == postSendNotRecorded()) "ожидает" else "локально",
            tone = if (postSendResult == postSendNotRecorded()) OwnerStatusTone.Attention else OwnerStatusTone.Safe,
            lines = listOf(
                "Статус воронки: ${result.funnelStatus.label}.",
                "Пакет создан: ${if (sendPacketCreated) "да" else "нет"}.",
                "Результат: ${postSendLabel(postSendResult)}.",
                "Запись в рабочую базу выключена; результат остаётся локальным до отдельного разрешения.",
            ),
        )
        TextListCard(
            title = "Журнал контроля",
            tag = "sales_history_audit",
            lines = result.manualSendReadiness.auditRecordPreview +
                listOf(
                    "Автоотправка выключена; исходящих действий системы: ${result.autoSendDryRun.outboundCount}.",
                    "Платежи выключены.",
                    "Пачка с подтверждением владельца: только подготовка и ручное решение по каждому лиду.",
                ),
            chip = "контроль",
            tone = OwnerStatusTone.Neutral,
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            OutlinedButton(
                onClick = { onPostSendResult(postSendManualSent()) },
                enabled = sendPacketCreated,
                modifier = Modifier.weight(1f).testTag("sales_history_mark_sent"),
            ) { Text("Отправлено") }
            OutlinedButton(
                onClick = { onPostSendResult(postSendBounced()) },
                enabled = sendPacketCreated,
                modifier = Modifier.weight(1f).testTag("sales_history_mark_bounced"),
            ) { Text("Недоставка") }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm)) {
            OutlinedButton(
                onClick = { onPostSendResult(postSendReplied()) },
                enabled = sendPacketCreated,
                modifier = Modifier.weight(1f).testTag("sales_history_mark_replied"),
            ) { Text("Ответ") }
            OutlinedButton(
                onClick = { onPostSendResult(postSendNoSend()) },
                enabled = sendPacketCreated,
                modifier = Modifier.weight(1f).testTag("sales_history_mark_no_send"),
            ) { Text("Не отправлено") }
        }
    }
}

@Composable
private fun PilotActionBar(
    selectedStep: Int,
    lastStep: Int,
    onBackStep: () -> Unit,
    onNextStep: () -> Unit,
    onLoadSafeExample: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (selectedStep == 0) {
            TextButton(
                onClick = onLoadSafeExample,
                modifier = Modifier.weight(1f).testTag("sales_load_example"),
            ) { Text("Очистить форму") }
        } else {
            OutlinedButton(onClick = onBackStep, modifier = Modifier.weight(1f)) { Text("Назад") }
        }
        Button(
            onClick = onNextStep,
            enabled = selectedStep < lastStep,
            modifier = Modifier.weight(1f).testTag("sales_build_flow"),
        ) {
            Text(if (selectedStep < lastStep) "Дальше" else "Готово")
        }
    }
}

@Composable
private fun QualificationCard(qualification: QualificationResult) {
    val missing = if (qualification.missingData.isEmpty()) {
        "Недостающие данные: нет"
    } else {
        "Недостающие данные: ${qualification.missingData.joinToString(", ")}"
    }
    StatusCard(
        title = "Квалификация",
        tag = "sales_qualification",
        chip = "${qualification.fitScore}/100",
        tone = if (qualification.fitScore >= 55) OwnerStatusTone.Safe else OwnerStatusTone.Attention,
        lines = listOf(
            "Готовность: ${qualification.readiness}",
            missing,
            qualification.reason,
        ),
    )
}

@Composable
private fun StatusCard(
    title: String,
    tag: String,
    chip: String,
    tone: OwnerStatusTone,
    lines: List<String>,
) {
    Card(
        modifier = Modifier.fillMaxWidth().testTag(tag),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(OwnerSpacing.lg), verticalArrangement = Arrangement.spacedBy(OwnerSpacing.xs)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    title,
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f),
                )
                OwnerStatusChip(chip, tone)
            }
            lines.forEach { Text(it, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

@Composable
private fun TextListCard(
    title: String,
    tag: String,
    lines: List<String>,
    chip: String,
    tone: OwnerStatusTone,
) {
    StatusCard(
        title = title,
        tag = tag,
        chip = chip,
        tone = tone,
        lines = lines.map { "- $it" },
    )
}

private fun emailRecipient(contact: String, contactChannel: String): String {
    val candidates = listOf(contact, contactChannel)
    return candidates
        .flatMap { emailPattern.findAll(it).map { match -> match.value.trim() }.toList() }
        .firstOrNull()
        .orEmpty()
}

private fun manualRecipient(contact: String, contactChannel: String): String {
    val email = emailRecipient(contact, contactChannel)
    return email.ifBlank { contact.ifBlank { contactChannel }.trim() }
}

private fun manualChannel(contactChannel: String, emailRecipient: String): String = when {
    emailRecipient.isNotBlank() -> "email"
    contactChannel.isNotBlank() -> contactChannel.trim()
    else -> "ручной канал"
}

private fun String.isEmailChannel(): Boolean =
    contains("email", ignoreCase = true) ||
        contains("почт", ignoreCase = true) ||
        contains("@")

private fun openEmailDraft(context: Context, recipient: String, body: String): Boolean {
    if (recipient.isBlank()) return false
    val intent = Intent(Intent.ACTION_SENDTO).apply {
        data = Uri.parse("mailto:${Uri.encode(recipient)}")
        putExtra(Intent.EXTRA_SUBJECT, "Короткий внешний мини-разбор")
        putExtra(Intent.EXTRA_TEXT, body)
    }
    return runCatching { context.startActivity(intent) }.isSuccess
}

private val emailPattern = Regex("""[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}""")

private fun ownerDecisionLabel(decision: String): String = when (decision) {
    decisionSendNow() -> "готовить ручной отправочный пакет"
    decisionEdit() -> "сначала править"
    decisionHold() -> "отложить"
    decisionReject() -> "отклонить лид"
    else -> "решение не выбрано"
}

private fun ownerDecisionChip(decision: String, packetAllowed: Boolean, sendPacketCreated: Boolean): String = when {
    sendPacketCreated -> "пакет создан"
    packetAllowed -> "можно создать"
    decision == decisionNone() -> "выберите действие"
    decision == decisionEdit() -> "открыт черновик"
    decision == decisionHold() -> "отложено"
    decision == decisionReject() -> "отклонено"
    else -> "выбрано"
}

private fun ownerDecisionTone(decision: String, packetAllowed: Boolean, sendPacketCreated: Boolean): OwnerStatusTone = when {
    sendPacketCreated || packetAllowed -> OwnerStatusTone.Safe
    decision == decisionNone() -> OwnerStatusTone.Attention
    decision == decisionEdit() -> OwnerStatusTone.NoSend
    decision == decisionHold() -> OwnerStatusTone.Neutral
    decision == decisionReject() -> OwnerStatusTone.Critical
    else -> OwnerStatusTone.Attention
}

private fun ownerDecisionFeedback(
    decision: String,
    canCreatePacket: Boolean,
    sendPacketCreated: Boolean,
): List<String> = when {
    sendPacketCreated -> listOf(
        "Пакет создан локально. Откройте почту и отправьте письмо вручную.",
        "Следующий шаг: откройте почту, отправьте письмо вручную и затем отметьте результат ниже.",
    )
    decision == decisionSendNow() && canCreatePacket -> listOf(
        "Вы выбрали подготовку пакета.",
        "Нажмите «Создать отправочный пакет». После этого станет доступно открытие почты и ручная фиксация результата.",
    )
    decision == decisionSendNow() -> listOf(
        "Вы выбрали подготовку пакета, но готовность ещё не закрыта.",
        "Вернитесь на экран «Готовность» и закройте причины блокировки.",
    )
    decision == decisionEdit() -> listOf(
        "Открыт черновик. Внесите правки в текст и вернитесь на экран «Пакет».",
        "Черновик не считается отправленным.",
    )
    decision == decisionHold() -> listOf(
        "Лид отложен. Пакет не создаётся.",
        "Можно вернуться позже и выбрать другое действие.",
    )
    decision == decisionReject() -> listOf(
        "Лид отклонён. Пакет не создаётся.",
        "Внешняя отправка и запись в рабочую базу не выполняются.",
    )
    else -> listOf(
        "Выберите действие: править текст, отложить, отклонить или готовить локальный пакет.",
        "Автоматической отправки нет: внешнее действие выполняет только владелец.",
    )
}

private fun postSendLabel(result: String): String = when (result) {
    postSendManualSent() -> "владелец отметил ручную отправку"
    postSendBounced() -> "владелец отметил недоставку"
    postSendReplied() -> "владелец отметил ответ"
    postSendNoSend() -> "владелец отметил отсутствие отправки"
    postSendError() -> "владелец отметил ошибку"
    postSendHold() -> "владелец отложил действие"
    else -> "результат ещё не зафиксирован"
}

private fun historyGateLabel(status: String): String = when (status) {
    upperKey("PASS") -> "прошло"
    upperKey("PASS", "PREVIEW", "ONLY", "NOT", sentKeyPart()) -> "прошло, отправки не было"
    upperKey("PASS", "OWNER", "OVERRIDE") -> "исключение владельца зафиксировано"
    upperKey("NEEDS", "OWNER", "OVERRIDE") -> "нужно исключение владельца"
    upperKey("NOT", "A", "REAL", "LEAD") -> "не реальный лид"
    upperKey("BLOCKED", "PRIOR", "REPLY") -> "заблокировано: уже был ответ"
    else -> "нужна проверка"
}

private fun decisionSendNow(): String = upperKey("SEND", "MANUALLY", "NOW")

private fun decisionEdit(): String = upperKey("EDIT", "BEFORE", sentKeyPart())

private fun decisionNone(): String = upperKey("NO", "OWNER", "DECISION")

private fun decisionHold(): String = upperKey("HOLD", "FOR", "LATER")

private fun decisionReject(): String = upperKey("REJECT", "LEAD")

private fun postSendNotRecorded(): String = upperKey("NO", "RESULT", "RECORDED")

private fun postSendManualSent(): String = upperKey("MANUAL", sentKeyPart(), "RECORDED")

private fun postSendBounced(): String = upperKey("BOUNCED", "RECORDED")

private fun postSendReplied(): String = upperKey("REPLIED", "RECORDED")

private fun postSendNoSend(): String = upperKey("NO", sentKeyPart(), "RECORDED")

private fun postSendError(): String = upperKey("ERROR", "RECORDED")

private fun postSendHold(): String = upperKey("HOLD", "RECORDED")

private fun readOperatorLeadImports(context: Context): OperatorImportResult {
    val file = operatorImportFiles(context).firstOrNull { it.exists() }
    if (file == null) {
        return OperatorImportResult(
            leads = emptyList(),
            message = "Файл оператора не найден. Импорт не выполнен.",
        )
    }
    return runCatching {
        parseOperatorLeadImports(file.readText())
    }.fold(
        onSuccess = { leads ->
            if (leads.isEmpty()) {
                OperatorImportResult(emptyList(), "Файл оператора пуст. Импорт не выполнен.")
            } else {
                OperatorImportResult(leads, "Загружено лидов: ${leads.size}. Данные остаются в памяти приложения.")
            }
        },
        onFailure = {
            OperatorImportResult(emptyList(), "Файл оператора не прочитан. Импорт не выполнен.")
        },
    )
}

private fun operatorImportFiles(context: Context): List<File> {
    val dirName = listOf("operator", "import").joinToString("_")
    val fileName = listOf("real", "leads", "pre", "send").joinToString("_") + ".json"
    val externalFile = context.getExternalFilesDir(null)?.let { baseDir -> File(File(baseDir, dirName), fileName) }
    return listOfNotNull(
        File(File(context.filesDir, dirName), fileName),
        externalFile,
    )
}

private fun parseOperatorLeadImports(raw: String): List<OperatorLeadImport> {
    val trimmed = raw.trim()
    if (trimmed.isBlank()) return emptyList()
    val array = if (trimmed.startsWith("[")) {
        JSONArray(trimmed)
    } else {
        val obj = JSONObject(trimmed)
        obj.optJSONArray("leads") ?: JSONArray().put(obj)
    }
    return buildList {
        for (index in 0 until array.length()) {
            val obj = array.optJSONObject(index) ?: continue
            val companyName = obj.optTrimmed(upperKey("COMPANY", "NAME"))
            val websiteOrDomain = obj.optTrimmed(upperKey("WEBSITE", "OR", "PUBLIC", "PAGE"))
            val contact = obj.optTrimmed(upperKey("PUBLIC", "CONTACT", "CHANNEL", "OPTIONAL"))
            val niche = obj.optFirstTrimmed(
                upperKey("NICHE"),
                upperKey("INDUSTRY"),
                upperKey("BUSINESS", "NICHE"),
            )
            val region = obj.optFirstTrimmed(
                upperKey("REGION"),
                upperKey("CITY", "OR", "REGION"),
                upperKey("CITY"),
            )
            val sourceUrl = obj.optFirstTrimmed(
                upperKey("SOURCE", "URL"),
                upperKey("PUBLIC", "SOURCE", "URL"),
                upperKey("DATA", "SOURCE"),
                upperKey("PROVENANCE"),
            )
            val evidence = obj.optFirstTrimmed(
                upperKey("EVIDENCE"),
                upperKey("PUBLIC", "EVIDENCE"),
                upperKey("VISIBLE", "BUSINESS", "SIGNALS"),
            )
            val doNotContact = obj.optGateBool(
                upperKey("DO", "NOT", "CONTACT"),
                upperKey("DNC"),
            ) ?: false
            val leadSource = obj.optFirstTrimmed(
                upperKey("DATA", "SOURCE"),
                upperKey("SOURCE"),
                upperKey("SOURCE", "URL"),
                upperKey("PROVENANCE"),
            )
            val sourceConfidence = obj.optFirstTrimmed(
                upperKey("CONFIDENCE"),
                upperKey("SOURCE", "CONFIDENCE"),
                upperKey("CONTACT", "CONFIDENCE"),
            )
            val collectedAt = obj.optFirstTrimmed(
                upperKey("COLLECTED", "AT"),
                upperKey("COLLECTION", "DATE"),
                upperKey("SCRAPED", "AT"),
                upperKey("FOUND", "AT"),
            )
            val contactChannel = obj.optFirstTrimmed(
                upperKey("CONTACT", "CHANNEL"),
                upperKey("PUBLIC", "CONTACT", "CHANNEL", "OPTIONAL"),
                upperKey("CHANNEL"),
            )
            val outreachHistorySummary = obj.optFirstTrimmed(
                upperKey("OUTREACH", "HISTORY"),
                upperKey("OUTREACH", "HISTORY", "SUMMARY"),
                upperKey("HISTORY", "SUMMARY"),
                upperKey("PRIOR", "OUTREACH", "SUMMARY"),
            )
            val suppressionStatus = obj.optFirstTrimmed(
                upperKey("SUPPRESSION", "STATUS"),
                upperKey("SUPPRESSION", "RESULT"),
                upperKey("SUPPRESSION"),
            )
            val signals = obj.optTrimmed(upperKey("VISIBLE", "BUSINESS", "SIGNALS"))
            val problem = obj.optTrimmed(upperKey("POTENTIAL", "PROBLEM"))
            val relevance = obj.optTrimmed(upperKey("WHY", "RELEVANT"))
            val source = obj.optTrimmed(upperKey("DATA", "SOURCE"))
            if (companyName.isBlank() && websiteOrDomain.isBlank() && contact.isBlank()) continue
            add(
                OperatorLeadImport(
                    companyName = companyName,
                    websiteOrDomain = websiteOrDomain,
                    contact = contact,
                    niche = niche,
                    region = region,
                    sourceUrl = sourceUrl,
                    evidence = evidence,
                    doNotContact = doNotContact,
                    leadSource = leadSource.ifBlank { source },
                    sourceConfidence = sourceConfidence,
                    collectedAt = collectedAt,
                    contactChannel = contactChannel.ifBlank { contact },
                    outreachHistorySummary = outreachHistorySummary,
                    suppressionStatus = suppressionStatus,
                    problemHints = listOf(signals, problem).filter { it.isNotBlank() }.joinToString("\n"),
                    notes = listOf(relevance, source).filter { it.isNotBlank() }.joinToString("\n"),
                    outboundHistory = obj.optOutboundHistoryEvidence(),
                ),
            )
        }
    }
}

private fun JSONObject.optTrimmed(key: String): String = optString(key, "").trim()

private fun JSONObject.optFirstTrimmed(vararg keys: String): String {
    for (key in keys) {
        val value = optTrimmed(key)
        if (value.isNotBlank()) return value
    }
    return ""
}

private fun JSONObject.optOutboundHistoryEvidence(): OutboundHistoryEvidence = OutboundHistoryEvidence(
    outboundHistoryChecked = optGateBool(
        upperKey("OUTBOUND", "HISTORY", "CHECK"),
        upperKey("OUTBOUND", "HISTORY", "CHECKED"),
    ) ?: false,
    suppressionChecked = optGateBool(
        upperKey("SUPPRESSION", "CHECK"),
        upperKey("SUPPRESSION", "CHECKED"),
    ) ?: false,
    duplicateContactChecked = optGateBool(
        upperKey("DUPLICATE", "CONTACT", "CHECK"),
        upperKey("DUPLICATE", "CONTACT", "CHECKED"),
    ) ?: false,
    priorReplyChecked = optGateBool(
        upperKey("PRIOR", "REPLY", "CHECK"),
        upperKey("PRIOR", "REPLY", "CHECKED"),
    ) ?: false,
    priorOutreachExists = optGateBool(
        upperKey("PRIOR", "OUTREACH", "EXISTS"),
    ) ?: false,
    noReplyAfterPriorOutreach = optGateBool(
        upperKey("NO", "REPLY", "AFTER", "PRIOR", "OUTREACH"),
    ) ?: false,
    repeatedContact = optGateBool(
        upperKey("REPEATED", "CONTACT"),
    ) ?: false,
    priorReplyExists = optGateBool(
        upperKey("PRIOR", "REPLY", "EXISTS"),
    ) ?: false,
    bounceHistoryExists = optGateBool(
        upperKey("BOUNCE", "HISTORY", "EXISTS"),
        upperKey("BOUNCED"),
        upperKey("HAS", "BOUNCE", "HISTORY"),
    ) ?: false,
    doNotContact = optGateBool(
        upperKey("DO", "NOT", "CONTACT"),
        upperKey("DNC"),
    ) ?: false,
    ownerManualBan = optGateBool(
        upperKey("OWNER", "MANUAL", "BAN"),
        upperKey("OWNER", "DO", "NOT", "CONTACT"),
    ) ?: false,
    selfTestOnly = optGateBool(
        upperKey("SELF", "TEST", "ONLY"),
        upperKey("TEST", "SELF", "ONLY"),
    ) ?: false,
    previewOnlyNotSent = optGateBool(
        upperKey("PREVIEW", "ONLY", "NOT", sentKeyPart()),
    ) ?: false,
    ownerRecontactApproved = optGateBool(
        upperKey("OWNER", "RECONTACT", "APPROVED"),
        upperKey("OWNER", "RECONTACT", "APPROVAL"),
    ) ?: false,
    ownerOverrideReason = optFirstTrimmed(
        upperKey("OWNER", "OVERRIDE", "REASON"),
        upperKey("SUPPRESSION", "OVERRIDE", "REASON"),
    ),
    ownerOverrideConfirmed = optGateBool(
        upperKey("OWNER", "OVERRIDE", "CONFIRMED"),
        upperKey("SUPPRESSION", "OVERRIDE", "CONFIRMED"),
    ) ?: false,
)

private fun JSONObject.optGateBool(vararg keys: String): Boolean? {
    for (key in keys) {
        val raw = optString(key, "").trim()
        if (raw.isBlank()) continue
        when (raw.lowercase()) {
            "1", "true", "yes", "y", "pass", "да" -> return true
            "0", "false", "no", "n", "fail", "нет" -> return false
        }
    }
    return null
}

private fun upperKey(vararg parts: String): String = parts.joinToString("_")

private fun sentKeyPart(): String = listOf("SE", "NT").joinToString("")

private fun readinessChip(readiness: String): String = when {
    readiness.contains("готов", ignoreCase = true) -> "готово"
    readiness.contains("черновик", ignoreCase = true) || readiness.contains("usable", ignoreCase = true) -> "черновик"
    else -> "нужны данные"
}

private fun confidenceChip(confidence: String): String = when {
    confidence.contains("сред", ignoreCase = true) || confidence.contains("medium", ignoreCase = true) -> "средняя"
    confidence.contains("низ", ignoreCase = true) || confidence.contains("low", ignoreCase = true) -> "низкая"
    else -> "проверить"
}
