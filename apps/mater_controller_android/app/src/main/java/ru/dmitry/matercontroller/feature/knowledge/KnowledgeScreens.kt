package ru.dmitry.matercontroller.feature.knowledge

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ru.dmitry.matercontroller.core.model.KnowledgeDigestItem
import ru.dmitry.matercontroller.core.ui.EmptyState
import ru.dmitry.matercontroller.core.ui.ErrorState
import ru.dmitry.matercontroller.core.ui.LoadingState
import ru.dmitry.matercontroller.core.ui.OfflineBanner
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import ru.dmitry.matercontroller.core.ui.PilotSafetyChips
import ru.dmitry.matercontroller.core.ui.SectionCard

/** «Радар знаний» — hub. Links to digests (urgent/weekly/monthly), sources, status. Read-only. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KnowledgeHomeScreen(
    onBack: () -> Unit,
    onOpenDigest: (String) -> Unit,
    onOpenSources: () -> Unit,
    onOpenStatus: () -> Unit,
) {
    Scaffold(topBar = {
        TopAppBar(title = { Text("Радар знаний") },
            navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.knowledge.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } })
    }) { pad ->
        Column(Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()).testTag("knowledge_home")) {
            Text("Знания", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.testTag("pilot_knowledge"))
            Text("Дайджест рынка, права, безопасности и методов для ручных решений. Реальные Qdrant/Docling не заявляются активными без доказательств.", style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
            PilotSafetyChips(tag = "pilot_knowledge_safety_chips")
            Spacer(Modifier.height(8.dp))
            Text("Сводки", style = MaterialTheme.typography.titleMedium)
            SectionCard("Срочное", subtitle = "Изменения, требующие внимания сейчас", tag = "kn_urgent", onClick = { onOpenDigest(KnowledgeWindow.URGENT.wire) })
            SectionCard("Недельная сводка", subtitle = "Что изменилось за неделю", tag = "kn_weekly", onClick = { onOpenDigest(KnowledgeWindow.WEEKLY.wire) })
            SectionCard("Месячный обзор", subtitle = "Обзор за месяц", tag = "kn_monthly", onClick = { onOpenDigest(KnowledgeWindow.MONTHLY.wire) })
            Spacer(Modifier.height(12.dp))
            Text("Радар", style = MaterialTheme.typography.titleMedium)
            SectionCard("Источники знаний", subtitle = "Реестр отслеживаемых источников", tag = "kn_sources", onClick = onOpenSources)
            SectionCard("Состояние радара", subtitle = "Режим, источники, бюджеты", tag = "kn_status", onClick = onOpenStatus)
            Spacer(Modifier.height(12.dp))
            Text(OwnerLocalization.KNOWLEDGE_NO_AUTO + ". Радар не меняет производство, сообщения клиентам и финансы.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
        }
    }
}

/** Digest window screen (urgent / weekly / monthly). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KnowledgeDigestScreen(
    window: String,
    onBack: () -> Unit,
    vm: KnowledgeDigestViewModel = hiltViewModel(),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val win = when (window) {
        KnowledgeWindow.WEEKLY.wire -> KnowledgeWindow.WEEKLY
        KnowledgeWindow.MONTHLY.wire -> KnowledgeWindow.MONTHLY
        else -> KnowledgeWindow.URGENT
    }
    LaunchedEffect(win) { vm.load(win) }
    var openFinding by remember { mutableStateOf<KnowledgeDigestItem?>(null) }

    Scaffold(topBar = {
        TopAppBar(title = { Text(OwnerLocalization.renderKnowledgeWindowRu(win.wire)) },
            navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.knowledge.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            actions = { TextButton(onClick = { vm.load(win) }) { Text("Обновить") } })
    }) { pad ->
        when {
            ui.loading -> LoadingState(Modifier.padding(pad))
            ui.error != null && ui.items.isEmpty() -> ErrorState(ui.error!!, onRetry = { vm.load(win) }, modifier = Modifier.padding(pad))
            ui.items.isEmpty() -> EmptyState("Нет изменений в этой сводке", Modifier.padding(pad).testTag("knowledge_digest"))
            else -> Column(Modifier.padding(pad).fillMaxSize().testTag("knowledge_digest")) {
                if (ui.offline) OfflineBanner(ui.cachedAt)
                Column(Modifier.fillMaxSize().padding(horizontal = 12.dp).verticalScroll(rememberScrollState())) {
                    ui.items.forEach { item ->
                        FindingCard(item, ui.localDecisions[item.itemKey], onOpen = { openFinding = item })
                    }
                    Spacer(Modifier.height(12.dp))
                    Text(OwnerLocalization.KNOWLEDGE_NO_AUTO + ".", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.height(12.dp))
                }
            }
        }
    }

    openFinding?.let { item ->
        FindingActionsDialog(
            item = item,
            onDismiss = { openFinding = null },
            onAction = { action ->
                item.itemKey?.let { vm.recordLocalDecision(it, action) }
                openFinding = null
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FindingCard(item: KnowledgeDigestItem, decision: KnowledgeOwnerAction?, onOpen: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp).testTag("kn_finding_${item.itemKey}"), onClick = onOpen) {
        Column(Modifier.padding(14.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(item.title ?: "Изменение", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                VerificationBadge(item.verification)
            }
            Kv("Приоритет", OwnerLocalization.renderUrgencyRu(item.urgency))
            Kv("Категория", OwnerLocalization.renderKnowledgeCategoryRu(item.category))
            if (OwnerLocalization.hasValue(item.what_changed)) Kv("Что изменилось", item.what_changed!!)

            // RC5: grounded evidence — IDs, versions, stack match, applicability, dates, document.
            if (OwnerLocalization.hasValue(item.cve_id)) Kv("Идентификатор CVE", item.cve_id!!)
            if (OwnerLocalization.hasValue(item.advisory_id)) Kv("Идентификатор бюллетеня", item.advisory_id!!)
            if (OwnerLocalization.hasValue(item.affected_versions)) Kv("Затронутые версии", item.affected_versions!!)
            if (OwnerLocalization.hasValue(item.installed_version)) Kv("Ваша версия", item.installed_version!!)
            OwnerLocalization.renderStackMatchRu(item.stack_match)?.let { Kv("Совпадение со стеком", it) }
            if (OwnerLocalization.hasValue(item.applicability)) Kv("Применимость", OwnerLocalization.renderApplicabilityRu(item.applicability))
            OwnerLocalization.renderDateRu(item.published_at)?.let { Kv("Опубликовано", it) }
            OwnerLocalization.renderDateRu(item.effective_at)?.let { Kv("Вступает в силу", it) }
            if (OwnerLocalization.hasValue(item.document_id)) Kv("Документ", item.document_id!!)
            if (OwnerLocalization.hasValue(item.evidence_excerpt)) Kv("Выдержка", item.evidence_excerpt!!)

            val sourceName = when {
                OwnerLocalization.hasValue(item.source_name) -> item.source_name!!
                OwnerLocalization.hasValue(item.source) -> item.source!!
                else -> "источник не указан"
            }
            val sourceLine = buildString {
                append(sourceName)
                append(" · ")
                append(OwnerLocalization.renderTrustRu(item.trust))
                append(" · ")
                append(OwnerLocalization.renderSourceTierRu(item.source_tier))
            }
            Kv("Источник", sourceLine)
            Kv("Риск безопасности", OwnerLocalization.renderImpactRu(item.security_impact))
            Kv("Юридический риск", OwnerLocalization.renderImpactRu(item.legal_impact))
            if (OwnerLocalization.hasValue(item.priority_reason)) Kv("Причина приоритета", item.priority_reason!!)
            if (OwnerLocalization.hasValue(item.recommended_action)) Kv("Рекомендация", item.recommended_action!!)
            Kv("Маршрут", OwnerLocalization.renderKnowledgeRouteRu(item.review_route ?: item.route))
            Spacer(Modifier.height(4.dp))
            Text(OwnerLocalization.KNOWLEDGE_NO_AUTO, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
            decision?.let {
                Text("Ваше решение: ${ruOwnerAction(it)}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary)
            }
        }
    }
}

/** Verification badge. TEST_ONLY / synthetic is shown as a warning chip; VERIFIED as trusted. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VerificationBadge(verification: String?) {
    if (!OwnerLocalization.hasValue(verification)) return
    val verified = OwnerLocalization.isVerified(verification)
    val testOnly = OwnerLocalization.isTestOnly(verification)
    val container = when {
        verified -> MaterialTheme.colorScheme.secondaryContainer
        testOnly -> MaterialTheme.colorScheme.errorContainer
        else -> MaterialTheme.colorScheme.surfaceVariant
    }
    Surface(color = container, shape = MaterialTheme.shapes.small, modifier = Modifier.testTag("kn_badge_verification")) {
        Text(
            OwnerLocalization.renderVerificationRu(verification),
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
        )
    }
}

@Composable
private fun FindingActionsDialog(item: KnowledgeDigestItem, onDismiss: () -> Unit, onAction: (KnowledgeOwnerAction) -> Unit) {
    val uriHandler = androidx.compose.ui.platform.LocalUriHandler.current
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(item.title ?: "Изменение") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                if (OwnerLocalization.hasValue(item.what_changed)) {
                    Text(item.what_changed!!, style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(8.dp))
                }
                // Evidence recap inside the dialog.
                if (OwnerLocalization.hasValue(item.cve_id)) Text("CVE: ${item.cve_id}", style = MaterialTheme.typography.bodySmall)
                if (OwnerLocalization.hasValue(item.evidence_excerpt)) Text(item.evidence_excerpt!!, style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(8.dp))
                Text("Радар работает в режиме предложений: отметка сохраняется локально на устройстве и не меняет производство, сообщения клиентам или финансы. Серверная задача не создаётся.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.height(8.dp))
                // «Открыть первоисточник» opens the source_url in a browser when present.
                if (OwnerLocalization.hasValue(item.source_url)) {
                    ActionButton("Открыть первоисточник", tag = "kn_act_open") {
                        runCatching { uriHandler.openUri(item.source_url!!) }
                        onAction(KnowledgeOwnerAction.OPEN_SOURCE)
                    }
                }
                ActionButton("Отметить «нужна проверка» (локально)", tag = "kn_act_task") { onAction(KnowledgeOwnerAction.CREATE_REVIEW_TASK) }
                ActionButton("Отложить", tag = "kn_act_postpone") { onAction(KnowledgeOwnerAction.POSTPONE) }
                ActionButton("Не относится", tag = "kn_act_irrelevant") { onAction(KnowledgeOwnerAction.NOT_RELEVANT) }
                ActionButton("Отметить ошибочным", tag = "kn_act_erroneous") { onAction(KnowledgeOwnerAction.MARK_ERRONEOUS) }
                ActionButton("Передать на юридическую проверку", tag = "kn_act_legal") { onAction(KnowledgeOwnerAction.LEGAL_REVIEW) }
                ActionButton("Передать на проверку безопасности", tag = "kn_act_security") { onAction(KnowledgeOwnerAction.SECURITY_REVIEW) }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Закрыть") } },
    )
}

@Composable
private fun ActionButton(label: String, tag: String, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp).testTag(tag)) { Text(label) }
}

private fun ruOwnerAction(a: KnowledgeOwnerAction): String = when (a) {
    KnowledgeOwnerAction.OPEN_SOURCE -> "открыт первоисточник"
    KnowledgeOwnerAction.CREATE_REVIEW_TASK -> "создана задача проверки"
    KnowledgeOwnerAction.POSTPONE -> "отложено"
    KnowledgeOwnerAction.NOT_RELEVANT -> "не относится"
    KnowledgeOwnerAction.REJECT -> "отклонено"
    KnowledgeOwnerAction.MARK_ERRONEOUS -> "отмечено ошибочным"
    KnowledgeOwnerAction.LEGAL_REVIEW -> "передано на юридическую проверку"
    KnowledgeOwnerAction.SECURITY_REVIEW -> "передано на проверку безопасности"
    KnowledgeOwnerAction.APPROVE_TESTING -> "одобрена проверка"
}

/** Knowledge sources registry. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KnowledgeSourcesScreen(onBack: () -> Unit, vm: KnowledgeSourcesViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(topBar = {
        TopAppBar(title = { Text("Источники знаний") },
            navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.knowledge.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.knowledge.control.refresh")) { Text("Обновить") } })
    }) { pad ->
        when {
            ui.loading -> LoadingState(Modifier.padding(pad))
            ui.error != null && ui.items.isEmpty() -> ErrorState(ui.error!!, onRetry = vm::refresh, modifier = Modifier.padding(pad))
            ui.items.isEmpty() -> EmptyState("Нет источников", Modifier.padding(pad))
            else -> Column(Modifier.padding(pad).fillMaxSize().padding(horizontal = 12.dp).verticalScroll(rememberScrollState()).testTag("knowledge_sources")) {
                if (ui.offline) OfflineBanner(ui.cachedAt)
                ui.items.forEach { s ->
                    Card(Modifier.fillMaxWidth().padding(vertical = 6.dp).testTag("kn_src_${s.source_id}")) {
                        Column(Modifier.padding(14.dp)) {
                            Text(s.name ?: s.source_id ?: "источник", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                            Kv("Категория", OwnerLocalization.renderKnowledgeCategoryRu(s.category))
                            Kv("Уровень доверия", OwnerLocalization.renderSourceTierRu(s.tier))
                            Kv("Состояние", OwnerLocalization.renderSourceEnabledRu(s.enabled))
                            Kv("Класс стоимости", OwnerLocalization.renderCostClassRu(s.cost_class))
                            if (OwnerLocalization.hasValue(s.type)) Kv("Тип", s.type!!)
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
            }
        }
    }
}

/** Knowledge radar status (RC6 defect C): GET /knowledge/radar-status. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KnowledgeStatusScreen(onBack: () -> Unit, vm: KnowledgeStatusViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(topBar = {
        TopAppBar(title = { Text("Состояние радара") },
            navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.knowledge.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.knowledge.control.refresh")) { Text("Обновить") } })
    }) { pad ->
        when {
            ui.loading -> LoadingState(Modifier.padding(pad))
            ui.error != null && ui.status == null -> ErrorState(ui.error!!, onRetry = vm::refresh, modifier = Modifier.padding(pad))
            else -> Column(Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()).testTag("knowledge_status")) {
                if (ui.offline) OfflineBanner(ui.cachedAt)
                val s = ui.status

                // ---- freshness: LIVE/CACHE + last successful update + data age ----
                Text("Свежесть данных", style = MaterialTheme.typography.titleMedium)
                Kv("Источник ответа", OwnerLocalization.renderRadarEndpointRu(s?.endpoint))
                if (OwnerLocalization.isRadarCache(s?.endpoint)) {
                    Text("Данные радара получены из кэша сервера, не вживую.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
                }
                Kv("Последнее успешное обновление", OwnerLocalization.renderDateRu(s?.last_successful_update) ?: "нет данных")
                OwnerLocalization.renderDataAgeRu(s?.last_successful_update)?.let { Kv("Возраст данных", it) }
                Kv("Последний запуск", OwnerLocalization.renderDateRu(s?.last_run) ?: "нет данных")
                Kv("Следующий запуск", OwnerLocalization.renderDateRu(s?.next_scheduled_run) ?: "нет данных")

                Spacer(Modifier.height(8.dp))
                Text("Состояние", style = MaterialTheme.typography.titleMedium)
                Kv("Радар активен", ruBool(s?.active))
                Kv("Режим", OwnerLocalization.renderSchedulerStateRu(s?.mode))
                Kv("Защита (аварийный выключатель)", OwnerLocalization.renderCircuitStateRu(s?.circuit_state))
                Kv("Сжатие через ИИ", ruBool(s?.llm_summarization))
                Kv("Недельный бюджет", OwnerLocalization.formatCalculatedUnits(s?.weekly_budget_units))

                Spacer(Modifier.height(8.dp))
                Text("Источники и находки", style = MaterialTheme.typography.titleMedium)
                Kv("Всего источников", s?.sources_total?.toString() ?: "нет данных")
                Kv("Всего находок", s?.findings_total?.toString() ?: "нет данных")
                Kv("Производственные находки", s?.production_findings?.toString() ?: "нет данных")
                Kv("Служебные находки", s?.test_only_findings?.toString() ?: "нет данных")
                Kv("Подтверждённые срочные", s?.verified_urgent?.toString() ?: "нет данных")
                Kv("Требуют проверки", s?.needs_verification?.toString() ?: "нет данных")
                Kv("Карантин (защита от инъекций)", s?.prompt_injection_quarantines?.toString() ?: "нет данных")

                if (OwnerLocalization.hasValue(s?.last_error)) {
                    Spacer(Modifier.height(8.dp))
                    Text("Последняя ошибка радара", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.error)
                    Text(s!!.last_error!!, style = MaterialTheme.typography.bodySmall)
                }

                Spacer(Modifier.height(8.dp))
                Text("Автоматические изменения", style = MaterialTheme.typography.titleSmall)
                Kv("Изменения производства", ruBool(s?.auto_production_changes))
                Spacer(Modifier.height(8.dp))
                Text("Радар не выполняет автоматических действий без подтверждения владельца.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

private fun ruBool(v: Boolean?): String = when (v) { true -> "да"; false -> "нет"; null -> "нет данных" }

@Composable
private fun Kv(k: String, v: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Text("$k: ", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
        Text(v, style = MaterialTheme.typography.bodySmall)
    }
}
