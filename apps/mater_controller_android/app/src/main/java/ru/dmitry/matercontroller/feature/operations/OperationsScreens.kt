package ru.dmitry.matercontroller.feature.operations

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ru.dmitry.matercontroller.core.model.JobSummary
import ru.dmitry.matercontroller.core.ui.*

/** «Система» hub — links to automation, queue, dead letters, sources, scheduler, connection. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OperationsHomeScreen(
    onOpen: (String) -> Unit,
    onOpenConnection: () -> Unit,
    onOpenKnowledge: () -> Unit = {},
    onOpenFirstTouch: () -> Unit = {},
    onOpenAiUsage: () -> Unit = {},
    onOpenSourceRegistry: () -> Unit = {},
    onOpenSourceTelemetry: () -> Unit = {},
    onOpenOwnerSettings: () -> Unit = {},
    onOpenReservoir: () -> Unit = {},
    onOpenReliability: () -> Unit = {},
    onOpenCost: () -> Unit = {},
    onOpenBackup: () -> Unit = {},
    onOpenPush: () -> Unit = {},
    vm: OperationsViewModel = hiltViewModel(),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Система") },
                actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.operations.control.refresh")) { Text("Обновить") } },
            )
        },
    ) { pad ->
        Column(Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()).testTag("operations_home")) {
            if (ui.offline) OfflineBanner(ui.cachedAt)
            Text("Центр системы", style = MaterialTheme.typography.headlineSmall)
            Text("Проверка состояния приложения, подключения, лимитов и безопасных границ. Опасные действия остаются выключены.", style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
            PilotSafetyChips(tag = "pilot_stop_safety_chips")
            Spacer(Modifier.height(8.dp))
            SafetyInvariantPanel(
                title = "Границы системы",
                subtitle = "Система показывает контрольные контуры. В этом приложении опасные действия не выполняются без отдельного контроля владельца.",
                items = listOf(
                    OwnerSafetyInvariant(
                        "Реальная отправка",
                        if (ui.automation?.sendAllowedLive == true) "включена" else "ВЫКЛ",
                        if (ui.automation?.sendAllowedLive == true) OwnerStatusTone.Critical else OwnerStatusTone.NoSend,
                        "Должна оставаться выключенной до отдельного разрешения владельца.",
                    ),
                    OwnerSafetyInvariant("Автоотправка", OwnerLocalization.renderAutomationStateRu(ui.automation?.autosend), OwnerStatusTone.NoSend, "Автоматические клиентские отправки не запускаются."),
                    OwnerSafetyInvariant("Платежи", "ВЫКЛ", OwnerStatusTone.Safe, "Исполнение платежей не подключено к приложению."),
                    OwnerSafetyInvariant("Запись в рабочую базу", "ВЫКЛ", OwnerStatusTone.Safe, "Система не пишет рабочую базу и не меняет серверные настройки."),
                    OwnerSafetyInvariant("Новые live-возможности", "ВЫКЛ", OwnerStatusTone.Attention, "Включение внешних действий требует отдельной стадии с подтверждением владельца."),
                ),
                tag = "operations_safety_summary",
            )
            Spacer(Modifier.height(12.dp))
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OwnerStatusChip("Автоотправка: ${OwnerLocalization.renderAutomationStateRu(ui.automation?.autosend)}", OwnerStatusTone.NoSend)
                OwnerStatusChip("Реальная отправка: ${OwnerLocalization.renderLiveSendRu(ui.automation?.sendAllowedLive == true)}", OwnerStatusTone.Attention)
            }
            Spacer(Modifier.height(12.dp))
            SectionCard("Надёжность", subtitle = "Здоровье сервисов, инциденты, авто-восстановление", onClick = onOpenReliability, tag = "ops_card_reliability")
            SectionCard("Расходы и лимиты", subtitle = "Бюджет ИИ, провайдеры, мощности — просмотр", onClick = onOpenCost, tag = "ops_card_cost")
            SectionCard("Резервные копии", subtitle = "Инвентарь, статус, проверка восстановления", onClick = onOpenBackup, tag = "ops_card_backup")
            SectionCard("Push-уведомления", subtitle = "Состояние доставки и предпочтения", onClick = onOpenPush, tag = "ops_card_push")
            val a = ui.automation
            SectionCard("Ошибки обработки", trailing = (a?.deadLetter ?: ui.deadLetters.size).toString(), onClick = { onOpen("deadletters") }, tag = "ops_card_deadletters")
            SectionCard(
                "Автоматизация",
                subtitle = a?.let {
                    "Автоотправка: ${OwnerLocalization.renderAutomationStateRu(it.autosend)} · " +
                        "запись в рабочую базу: ${OwnerLocalization.renderWriterStateRu(it.canonicalWriter)}"
                } ?: "Нет сохранённых данных о состоянии системы",
                onClick = { onOpen("automation") }, tag = "ops_card_automation",
            )
            SectionCard(
                "Очередь задач",
                subtitle = "В работе: ${a?.running ?: 0} · В очереди: ${a?.queued ?: 0}",
                trailing = if (ui.queueCountsKnown) ui.queueCounts.values.sum().toString() else "—",
                onClick = { onOpen("queue") }, tag = "ops_card_queue",
            )
            SectionCard("Источники", subtitle = "Здоровье источников лидов", onClick = { onOpen("sources") }, tag = "ops_card_sources")
            SectionCard("Реестр источников", subtitle = "Полный реестр: доступ, здоровье, стоимость", onClick = onOpenSourceRegistry, tag = "ops_card_source_registry")
            SectionCard("Телеметрия источников", subtitle = "Здоровье, стоимость, счётчики по источникам", onClick = onOpenSourceTelemetry, tag = "ops_card_source_telemetry")
            SectionCard("Лимиты и автоматизация", subtitle = "Профили, лимиты, расписание, стратегия источников", onClick = onOpenOwnerSettings, tag = "ops_card_owner_settings")
            SectionCard("Резервуар доменов", subtitle = "Резервуар, воронка обработки, загрузка очереди", onClick = onOpenReservoir, tag = "ops_card_reservoir")
            SectionCard("Расход ИИ", subtitle = "Расчётные единицы и провайдеры — просмотр", onClick = onOpenAiUsage, tag = "ops_card_ai_usage")
            SectionCard("Радар знаний", subtitle = "Изменения рынка, права, безопасности", onClick = onOpenKnowledge, tag = "ops_card_knowledge")
            SectionCard("Первое касание", subtitle = "Подбор лида, крючок, текст — без отправки", onClick = onOpenFirstTouch, tag = "ops_card_first_touch")
            SectionCard("Планировщик", subtitle = "Один планировщик · пауза/возобновление", onClick = { onOpen("scheduler") }, tag = "ops_card_scheduler")
            SectionCard("Подключение", subtitle = "Профиль и настройки соединения", onClick = onOpenConnection, tag = "ops_card_connection")
            OwnerStopComponent(
                status = "Перед любым критическим действием проверьте автоотправку, реальную отправку и состояние очередей выше.",
                tag = "pilot_stop",
            )
            ContractOnlyPanel(
                title = "Что сейчас недоступно в приложении",
                items = listOf(
                    "автоматическая отправка клиентам",
                    "платежи и выставление счетов",
                    "запись в рабочую базу без отдельного разрешения",
                    "браузерные, голосовые и CRM-действия без отдельного подтверждения владельца",
                ),
                tag = "operations_contract_only",
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OperationsDetailScreen(
    section: String,
    onBack: () -> Unit,
    vm: OperationsViewModel = hiltViewModel(),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val title = when (section) {
        "automation" -> "Автоматизация"
        "queue" -> "Очередь задач"
        "deadletters" -> "Ошибки обработки"
        "sources" -> "Источники"
        "scheduler" -> "Планировщик"
        else -> "Система"
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.operations.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
                actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.operations.control.refresh")) { Text("Обновить") } },
            )
        },
    ) { pad ->
        when {
            ui.loading -> LoadingState(Modifier.padding(pad))
            ui.error != null -> ErrorState(ui.error!!, onRetry = vm::refresh, modifier = Modifier.padding(pad))
            else -> when (section) {
                "deadletters" -> DeadLettersContent(ui, vm, Modifier.padding(pad))
                "queue" -> QueueContent(ui, Modifier.padding(pad))
                "sources" -> SourcesContent(ui, Modifier.padding(pad))
                "scheduler" -> SchedulerContent(ui, Modifier.padding(pad))
                else -> AutomationContent(ui, Modifier.padding(pad))
            }
        }
    }
}

@Composable
private fun AutomationContent(ui: OperationsUi, modifier: Modifier) {
    val a = ui.automation
    Box(modifier.fillMaxSize().testTag("automation_screen")) {
        Column(Modifier.padding(16.dp).verticalScroll(rememberScrollState()).testTag("ops_automation")) {
            if (ui.offline) OfflineBanner(ui.cachedAt)
            Kv("Запись в рабочую базу", OwnerLocalization.renderWriterStateRu(a?.canonicalWriter == true))
            Kv("Автоотправка", OwnerLocalization.renderAutomationStateRu(a?.autosend))
            Kv("Реальная отправка", OwnerLocalization.renderLiveSendRu(a?.sendAllowedLive == true))
            Kv("Обслуживание", if (a?.maintenance == true) "да" else "нет")
            Kv("Версия состояния", a?.storeRevision?.toString() ?: "нет данных")
            Spacer(Modifier.height(8.dp))
            Text("Очередь задач", style = MaterialTheme.typography.titleMedium)
            // Unknown queue counts render «—», never a false 0.
            Kv("Выполнено", if (ui.queueCountsKnown) (ui.queueCounts["COMPLETED"] ?: ui.queueCounts["completed"] ?: 0).toString() else "—")
            Kv("В работе", (a?.running ?: 0).toString())
            Kv("В очереди", (a?.queued ?: 0).toString())
            Kv("Ожидают подтверждения", (a?.blockedApproval ?: 0).toString())
            Kv("Ошибок обработки", (a?.deadLetter ?: 0).toString())
            val others = ui.queueCounts.filterKeys { !it.equals("COMPLETED", true) }
            if (others.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Text("Прочие статусы очереди", style = MaterialTheme.typography.titleSmall)
                others.forEach { (k, v) -> Kv(OwnerLocalization.renderJobStatusRu(k), v.toString()) }
            }
        }
    }
}

@Composable
private fun QueueContent(ui: OperationsUi, modifier: Modifier) {
    Column(modifier.fillMaxSize().testTag("ops_queue")) {
        if (ui.offline) OfflineBanner(ui.cachedAt)
        if (ui.jobs.isEmpty()) { EmptyState("Очередь пуста"); return@Column }
        LazyColumn(Modifier.fillMaxSize()) {
            items(ui.jobs, key = { it.jobId ?: it.hashCode().toString() }) { j -> JobRow(j) }
        }
    }
}

@Composable
private fun DeadLettersContent(ui: OperationsUi, vm: OperationsViewModel, modifier: Modifier) {
    Column(modifier.fillMaxSize().testTag("ops_deadletters")) {
        if (ui.offline) OfflineBanner(ui.cachedAt)
        ui.retryMessage?.let {
            val color = when (ui.retry) {
                MutationPhase.Confirmed -> MaterialTheme.colorScheme.primary
                MutationPhase.Failed, MutationPhase.Conflict -> MaterialTheme.colorScheme.error
                else -> MaterialTheme.colorScheme.onSurface
            }
            Text(it, color = color, modifier = Modifier.padding(12.dp).testTag("retry_message"))
        }
        if (ui.deadLetters.isEmpty()) { EmptyState("Нет необработанных ошибочных задач"); return@Column }
        LazyColumn(Modifier.fillMaxSize()) {
            items(ui.deadLetters, key = { it.jobId ?: it.hashCode().toString() }) { j ->
                JobRow(j, trailing = {
                    val submitting = ui.retry == MutationPhase.Submitting && ui.retryingId == j.jobId
                    Button(onClick = { vm.retry(j) }, enabled = ui.retry != MutationPhase.Submitting, modifier = Modifier.testTag("btn_retry_${j.jobId}")) {
                        Text(if (submitting) "…" else "Повтор")
                    }
                })
            }
        }
    }
}

@Composable
private fun SourcesContent(ui: OperationsUi, modifier: Modifier) {
    // Credentials are never displayed here.
    val sources = listOf("Overpass" to "основной источник без показа ключей", "Ручной CSV" to "проверенный ввод", "2GIS" to "ключ не предоставлен", "DataForSEO" to "ключ не предоставлен", "Yandex" to "ключ не предоставлен")
    Column(modifier.padding(16.dp).verticalScroll(rememberScrollState()).testTag("ops_sources")) {
        Text("Ключи и секреты не отображаются.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        Spacer(Modifier.height(8.dp))
        sources.forEach { (name, note) -> SectionCard(name, subtitle = note, tag = "source_$name") }
    }
}

@Composable
private fun SchedulerContent(ui: OperationsUi, modifier: Modifier) {
    val a = ui.automation
    Column(modifier.padding(16.dp).verticalScroll(rememberScrollState()).testTag("ops_scheduler")) {
        Kv("Планировщиков", "1")
        Kv("Обработчиков", "1")
        Kv("Источник Overpass", "1")
        Kv("Автоотправка", OwnerLocalization.renderAutomationStateRu(a?.autosend))
        Kv("Версия состояния", a?.storeRevision?.toString() ?: "нет данных")
        Spacer(Modifier.height(8.dp))
        Text("Пауза и возобновление поиска требуют отдельного подтверждения владельца.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
    }
}

@Composable
private fun JobRow(j: JobSummary, trailing: @Composable (() -> Unit)? = null) {
    Card(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp).testTag("job_row_${j.jobId}")) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(j.jobType ?: j.jobId ?: "—", style = MaterialTheme.typography.titleSmall)
                Text(
                    buildString {
                        append(OwnerLocalization.renderJobStatusRu(j.status))
                        append(" · попытки ${j.attempts}/${j.maxAttempts}")
                        if (!j.entityId.isNullOrBlank()) append(" · ${j.entityId}")
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                )
                j.errorCode?.let { Text("код: $it", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error) }
            }
            trailing?.invoke()
        }
    }
}

@Composable
private fun Kv(k: String, v: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
        Text(k, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
        Text(v, style = MaterialTheme.typography.bodyMedium)
    }
}
