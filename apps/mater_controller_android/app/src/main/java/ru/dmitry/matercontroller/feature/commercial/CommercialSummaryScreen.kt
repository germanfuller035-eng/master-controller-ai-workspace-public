package ru.dmitry.matercontroller.feature.commercial

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ru.dmitry.matercontroller.core.ui.ContractOnlyPanel
import ru.dmitry.matercontroller.core.ui.ErrorState
import ru.dmitry.matercontroller.core.ui.LoadingState
import ru.dmitry.matercontroller.core.ui.OwnerActionCard
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import ru.dmitry.matercontroller.core.ui.OwnerSafetyInvariant
import ru.dmitry.matercontroller.core.ui.OwnerSpacing
import ru.dmitry.matercontroller.core.ui.OwnerStatusChip
import ru.dmitry.matercontroller.core.ui.OwnerStatusTone
import ru.dmitry.matercontroller.core.ui.PilotSafetyChips
import ru.dmitry.matercontroller.core.ui.PrimaryBottomAction
import ru.dmitry.matercontroller.core.ui.SafetyInvariantPanel
import ru.dmitry.matercontroller.core.ui.SectionCard

/**
 * «Коммерческая сводка» — read-only owner view (Integration Wave 1). Reachable from Решения; the
 * Today screen shows a compact entry card. No mutation controls (Wave 1 commands are off, no send).
 * UNKNOWN money values render as words, never as 0.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CommercialSummaryScreen(
    onBack: () -> Unit,
    showBack: Boolean = true,
    onOpenLeads: () -> Unit = {},
    onOpenReplies: () -> Unit = {},
    onOpenCatalog: () -> Unit = {},
    onOpenCommands: () -> Unit = {},
    onOpenDeliveryReview: () -> Unit = {},
    onOpenConversations: () -> Unit = {},
    onOpenTestOnly: () -> Unit = {},
    onOpenAgents: () -> Unit = {},
    onOpenQueues: () -> Unit = {},
    onOpenMultichannel: () -> Unit = {},
    onOpenSendReview: () -> Unit = {},
    onOpenAiUsage: () -> Unit = {},
    onOpenSourceRegistry: () -> Unit = {},
    onOpenKnowledge: () -> Unit = {},
    onOpenFirstTouch: () -> Unit = {},
    onOpenWorkingSalesMvp: (String) -> Unit = {},
    vm: CommercialViewModel = hiltViewModel(),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Продажи") },
                navigationIcon = {
                    if (showBack) {
                        IconButton(onClick = onBack, modifier = Modifier.testTag("screen.commercial.control.back")) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, null)
                        }
                    }
                },
                actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.commercial.control.refresh")) { Text("Обновить") } },
            )
        },
    ) { pad ->
        when {
            ui.loading -> CommercialLoadingWithSalesEntry(
                onOpenLeads = onOpenLeads,
                onOpenWorkingSalesMvp = onOpenWorkingSalesMvp,
                modifier = Modifier.padding(pad),
            )
            ui.error != null -> ErrorState(ui.error!!, onRetry = vm::refresh, modifier = Modifier.padding(pad))
            else -> Column(
                Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()).testTag("commercial_summary"),
                verticalArrangement = Arrangement.spacedBy(OwnerSpacing.sm),
            ) {
                if (ui.offline) {
                    Surface(
                        color = MaterialTheme.colorScheme.secondaryContainer,
                        modifier = Modifier.fillMaxWidth().testTag("commercial_local_sales_ready"),
                    ) {
                        Text(
                            "Локальный ручной контур продаж доступен. Серверные контрольные числа можно обновить кнопкой «Обновить»; это не блокирует подготовку отправочного пакета.",
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSecondaryContainer,
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                }
                SalesWebsiteEntry(
                    onAnalyze = onOpenWorkingSalesMvp,
                    onImportSites = { onOpenWorkingSalesMvp("") },
                )
                Text("Продажи", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.testTag("pilot_commerce"))
                Text(
                    "Один рабочий маршрут: лид, проверка, черновик предложения, контроль качества и решение владельца. Всё локально и без отправки.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.74f),
                )
                OwnerActionCard(
                    "Открыть ручной контур продаж",
                    "Введите лид, проверьте стратегию, предложение, качество текста и отправочный пакет перед любым внешним действием.",
                    status = "начать здесь",
                    tone = OwnerStatusTone.NoSend,
                    onClick = { onOpenWorkingSalesMvp("") },
                    tag = "cs_working_sales_mvp",
                )
                PilotSafetyChips(tag = "pilot_commerce_safety_chips")
                PrimaryBottomAction(
                    label = "Открыть ручной контур продаж",
                    onClick = { onOpenWorkingSalesMvp("") },
                    tag = "cs_open_sales_pilot_primary",
                )
                SafetyInvariantPanel(
                    title = "Границы ручного контура",
                    subtitle = "Эта вкладка помогает выбрать следующий ручной шаг. Она не выполняет клиентские или финансовые действия.",
                    items = listOf(
                        OwnerSafetyInvariant(
                            "Автоотправка",
                            "ВЫКЛ",
                            OwnerStatusTone.NoSend,
                            "Статус отправки: ${OwnerLocalization.renderSendCapabilityRu(ui.integration?.sendCapability)}.",
                        ),
                        OwnerSafetyInvariant("Черновики", "только", OwnerStatusTone.Neutral, "Предложения и первые касания показываются как проверка/черновик, не как реальные отправки клиентам."),
                        OwnerSafetyInvariant("Лимит пачки", "3", OwnerStatusTone.Attention, "Лимит существует как контракт безопасности; этот экран его не расширяет."),
                        OwnerSafetyInvariant("Платежи", "ВЫКЛ", OwnerStatusTone.Safe, "Счета и суммы только отображаются; платёжный провайдер не вызывается."),
                        OwnerSafetyInvariant("Запись в рабочую базу", "ВЫКЛ", OwnerStatusTone.Safe, "Коммерческая сводка читает снимки данных и не пишет рабочую базу."),
                    ),
                    tag = "commercial_no_send_summary",
                )
                val s = ui.summary
                val offersReadyForReview = s?.offersReadyForSendReview ?: 0
                Text("Проверить сегодня", style = MaterialTheme.typography.titleMedium)
                OwnerActionCard(
                    "Предложения на проверку",
                    "Открыть предложения, где владелец решает текст и статус. Клиенту ничего не отправляется.",
                    trailing = s?.offersReadyForSendReview?.toString(),
                    tone = if (offersReadyForReview > 0) OwnerStatusTone.Attention else OwnerStatusTone.Safe,
                    status = when {
                        offersReadyForReview > 0 -> "нужно решение"
                        s != null -> "пусто"
                        else -> "открыть"
                    },
                    onClick = onOpenSendReview,
                    tag = "cs_send_review",
                )
                OwnerActionCard(
                    "Лиды",
                    "Открыть центр воронки и выбрать кандидата для ручного контура продаж.",
                    onClick = onOpenLeads,
                    tag = "cs_leads",
                    status = "вручную",
                    tone = OwnerStatusTone.Neutral,
                )
                OwnerActionCard(
                    "Ответы",
                    "Новые ответы, интерес, отказы, недоставка и неопознанные письма.",
                    onClick = onOpenReplies,
                    tag = "cs_replies",
                )

                Text("Рабочие зоны", style = MaterialTheme.typography.titleMedium)
                SectionCard("Первое касание", subtitle = "Подбор лида, крючок, текст — без отправки", onClick = onOpenFirstTouch, tag = "cs_first_touch")
                SectionCard("Очереди и сводка", subtitle = "Готовые предложения, ответы, повторный контакт", onClick = onOpenQueues, tag = "cs_queues")
                SectionCard("Источники и каналы", subtitle = "Многоканальные источники, входящие — без отправки", onClick = onOpenMultichannel, tag = "cs_multichannel")
                SectionCard("Диалоги", subtitle = "Лента переписки — только просмотр", onClick = onOpenConversations, tag = "cs_conversations")
                SectionCard("Статусы доставки требуют сверки", subtitle = "Неподтверждённая доставка — решение владельца", onClick = onOpenDeliveryReview, tag = "cs_delivery_review")
                SectionCard("Проверка данных", subtitle = "Записи, которые не учитываются в выручке", onClick = onOpenTestOnly, tag = "cs_test_only")
                SectionCard("Каталог продуктов", subtitle = "Продукты, цены и условия", onClick = onOpenCatalog, tag = "cs_catalog")
                SectionCard("Агенты", subtitle = "Теневой анализ лидов — без отправки", onClick = onOpenAgents, tag = "cs_agents")
                SectionCard("Расход ИИ", subtitle = "Учёт расчётных единиц — только просмотр", onClick = onOpenAiUsage, tag = "cs_ai_usage")
                SectionCard("Реестр источников", subtitle = "Источники лидов, доступ, здоровье", onClick = onOpenSourceRegistry, tag = "cs_source_registry")
                SectionCard("Радар знаний", subtitle = "Изменения рынка, права, безопасности", onClick = onOpenKnowledge, tag = "cs_knowledge")
                if (ui.integration?.commercialCommandsEnabled == true) {
                    SectionCard("Коммерческие действия", subtitle = "Возможности, предложения, проекты — без отправки", onClick = onOpenCommands, tag = "cs_commands")
                }

                if (s != null) {
                    Text("Контрольные числа", style = MaterialTheme.typography.titleMedium)
                    SectionCard("Открытые возможности", trailing = s.openOpportunities.toString(), tag = "cs_open_opps")
                    SectionCard("Предложения на подтверждение", trailing = s.offersAwaitingOwner.toString(), tag = "cs_offers")
                    SectionCard("Подтверждённые сделки", trailing = s.dealsWon.toString(), tag = "cs_deals_won")
                    SectionCard("Проекты на передачу", trailing = s.projectsWaitingHandoff.toString(), tag = "cs_handoff")
                    SectionCard("Счета к оплате", trailing = s.invoicesDue.toString(), tag = "cs_invoices_due")
                    SectionCard("Решения владельца", trailing = s.ownerDecisionsRequired.toString(), tag = "cs_decisions")
                    SectionCard("Ожидаемая выручка (оценка)", subtitle = OwnerLocalization.renderMoneyRu(s.estimatedPipelineValue, "RUB", s.estimatedPipelineClass), tag = "cs_pipeline")
                    SectionCard("Подтверждённые сделки, сумма", subtitle = OwnerLocalization.renderMoneyRu(s.confirmedDealValue, "RUB", s.confirmedDealClass), tag = "cs_confirmed")
                    SectionCard("Подтверждённые платежи", subtitle = OwnerLocalization.renderMoneyRu(s.confirmedPayments, "RUB", s.confirmedPaymentsClass), tag = "cs_payments")
                    if (s.confirmedPayments == null) {
                        Text(
                            "Платежи не исполняются из APK. Если подтверждённых платежей нет в модели чтения, показывается «нет данных», а не 0 ₽.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
                val f = ui.finance
                if (f != null) {
                    Spacer(Modifier.height(12.dp))
                    Text("Финансы", style = MaterialTheme.typography.titleMedium)
                    SectionCard("Подтверждённая выручка", subtitle = OwnerLocalization.renderMoneyRu(f.confirmedRevenue, "RUB", f.confirmedRevenueClass), tag = "cs_fin_confirmed")
                    SectionCard("Ожидаемая выручка", subtitle = OwnerLocalization.renderMoneyRu(f.estimatedRevenue, "RUB", f.estimatedRevenueClass), tag = "cs_fin_estimated")
                    SectionCard("Неоплаченные счета", trailing = f.unpaidInvoices.toString(), tag = "cs_fin_unpaid")
                    if (f.unknownDataCount > 0) {
                        Spacer(Modifier.height(4.dp))
                        Text("Данные без подтверждения: ${f.unknownDataCount}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                    }
                }
                Spacer(Modifier.height(12.dp))
                ContractOnlyPanel(
                    title = "Что сейчас недоступно в приложении",
                    items = listOf(
                        "автоматическая отправка клиентам",
                        "платежи и выставление счетов",
                        "изменение рабочей базы без отдельного разрешения",
                        "браузерные, голосовые и CRM-действия без отдельного подтверждения владельца",
                    ),
                    tag = "commercial_contract_only",
                )
                Spacer(Modifier.height(12.dp))
                Text("Клиенту ничего не отправляется на этой версии.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

@Composable
private fun CommercialLoadingWithSalesEntry(
    onOpenLeads: () -> Unit,
    onOpenWorkingSalesMvp: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier.padding(16.dp).verticalScroll(rememberScrollState()).testTag("commercial_summary"),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text("Продажи", style = MaterialTheme.typography.titleMedium)
        SalesWebsiteEntry(
            onAnalyze = onOpenWorkingSalesMvp,
            onImportSites = { onOpenWorkingSalesMvp("") },
        )
        OwnerStatusChip("Данные загружаются", OwnerStatusTone.Attention, tag = "state_loading")
        SafetyInvariantPanel(
            title = "Коммерческий режим",
            subtitle = "Сводка ещё загружается, но ручной контур продаж доступен без отправки, платежей и записи в рабочую базу.",
            items = listOf(
                OwnerSafetyInvariant("Отправка клиентам", "ВЫКЛ", OwnerStatusTone.NoSend, "Реальная отправка требует отдельного контроля владельца."),
                OwnerSafetyInvariant("Платежи", "ВЫКЛ", OwnerStatusTone.Safe, "Платёжный провайдер не вызывается."),
                OwnerSafetyInvariant("Запись в рабочую базу", "ВЫКЛ", OwnerStatusTone.Safe, "Черновик считается только на экране."),
            ),
            tag = "commercial_no_send_summary",
        )
        OwnerActionCard(
            "Ручной контур продаж",
            "Ручной лид превращается в проверку, продуктовую стратегию, черновик предложения и контроль качества. Клиенту ничего не отправляется.",
            status = "только черновик",
            tone = OwnerStatusTone.NoSend,
            onClick = { onOpenWorkingSalesMvp("") },
            tag = "cs_working_sales_mvp",
        )
        OwnerActionCard(
            "Лиды",
            "Открыть центр воронки и локальный ручной поток лида без отправки.",
            onClick = onOpenLeads,
            tag = "cs_leads",
        )
    }
}

@Composable
private fun SalesWebsiteEntry(
    onAnalyze: (String) -> Unit,
    onImportSites: () -> Unit,
) {
    var site by rememberSaveable { mutableStateOf("") }
    SectionCard(
        title = "Разобрать сайт",
        subtitle = "Владелец вводит только сайт. Система готовит карточку, контактный путь, черновик, проверку и пакет.",
        tag = "commercial_site_entry",
    )
    Column(verticalArrangement = Arrangement.spacedBy(OwnerSpacing.xs), modifier = Modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(OwnerSpacing.sm),
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = site,
                onValueChange = { site = it },
                label = { Text("Сайт компании") },
                modifier = Modifier.weight(1f).testTag("sales_home_site_input"),
                singleLine = true,
            )
            Button(
                onClick = { onAnalyze(site) },
                enabled = site.isNotBlank(),
                modifier = Modifier.testTag("sales_home_analyze_site"),
            ) { Text("Разобрать") }
        }
        OutlinedButton(
            onClick = onImportSites,
            modifier = Modifier.fillMaxWidth().testTag("sales_home_import_sites"),
        ) { Text("Импорт списка сайтов") }
    }
}
