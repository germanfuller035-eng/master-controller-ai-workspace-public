package ru.dmitry.matercontroller.feature.agents

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ru.dmitry.matercontroller.core.ui.ErrorState
import ru.dmitry.matercontroller.core.ui.LoadingState
import ru.dmitry.matercontroller.core.ui.OfflineBanner
import ru.dmitry.matercontroller.core.ui.ApprovalRiskCard
import ru.dmitry.matercontroller.core.ui.OwnerActionCard
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import ru.dmitry.matercontroller.core.ui.PilotSafetyChips
import ru.dmitry.matercontroller.core.ui.OwnerStatusChip
import ru.dmitry.matercontroller.core.ui.OwnerStatusTone
import ru.dmitry.matercontroller.core.ui.SectionCard

/** «Агенты» — shadow-без отправки agent dashboard + полный provider-health. No API key, no send. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AgentsScreen(
    onBack: () -> Unit,
    showBack: Boolean = true,
    onOpenQueues: () -> Unit = {},
    onOpenAiUsage: () -> Unit = {},
    onOpenCost: () -> Unit = {},
    onOpenKnowledge: () -> Unit = {},
    onOpenFirstTouch: () -> Unit = {},
    vm: AgentsViewModel = hiltViewModel(),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    var confirmWave by remember { mutableStateOf(false) }
    Scaffold(topBar = {
        TopAppBar(title = { Text("Агенты") },
            navigationIcon = {
                if (showBack) {
                    IconButton(onClick = onBack, modifier = Modifier.testTag("screen.agents.control.back")) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, null)
                    }
                }
            },
            actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.agents.control.refresh")) { Text("Обновить") } })
    }) { pad ->
        when {
            ui.loading -> LoadingState(Modifier.padding(pad))
            ui.error != null && ui.status == null && ui.health == null -> ErrorState(ui.error!!, onRetry = vm::refresh, modifier = Modifier.padding(pad))
            else -> Column(Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()).testTag("agents")) {
                if (ui.offline) { OfflineBanner(ui.cachedAt); Spacer(Modifier.height(8.dp)) }
                val s = ui.status
                val h = ui.health

                Text("Агенты", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.testTag("pilot_agents"))
                Text("Помощники анализируют лиды и готовят материалы только для просмотра владельцем. Они не отправляют сообщения и не меняют данные напрямую.", style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(8.dp))
                PilotSafetyChips(tag = "pilot_agents_safety_chips")
                Spacer(Modifier.height(8.dp))
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OwnerStatusChip("Теневой режим", OwnerStatusTone.NoSend)
                    OwnerStatusChip("Без отправки", OwnerStatusTone.NoSend)
                }
                Spacer(Modifier.height(12.dp))
                Text("Быстрый доступ", style = MaterialTheme.typography.titleMedium)
                OwnerActionCard("Первое касание", "Подготовка лида и текста без отправки клиенту.", tag = "agents_card_first_touch", onClick = onOpenFirstTouch)
                OwnerActionCard("Очереди владельца", "Коммерческие и агентские результаты, которые требуют просмотра.", tag = "agents_card_queues", onClick = onOpenQueues)
                OwnerActionCard("Расход ИИ", "Расчётные единицы, провайдеры и использование.", tag = "agents_card_ai_usage", onClick = onOpenAiUsage)
                OwnerActionCard("Стоимость и лимиты", "Бюджеты, ёмкость и риск перерасхода.", tag = "agents_card_cost", onClick = onOpenCost)
                OwnerActionCard("Радар знаний", "Изменения рынка, права и безопасности для решений.", tag = "agents_card_knowledge", onClick = onOpenKnowledge)
                Spacer(Modifier.height(12.dp))

                // ---- Mode + provider (status) ----
                if (s != null) {
                    Text("Режим: ${OwnerLocalization.renderAgentModeRu(s.mode)}", style = MaterialTheme.typography.titleMedium, modifier = Modifier.testTag("ag_mode"))
                    Text("Провайдер: ${OwnerLocalization.renderAgentProviderRu(s.provider, s.provider_available)} · ключ не отображается", style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("ag_provider"))
                }

                // ---- Full provider-health (GET /agents/provider-health?probe=true) ----
                if (h != null) {
                    Spacer(Modifier.height(8.dp))
                    Text("Готовность помощников", style = MaterialTheme.typography.titleMedium, modifier = Modifier.testTag("ag_health"))
                    Kv("Подключение ИИ", OwnerLocalization.renderAgentProviderRu(h.provider, h.configured == true || h.reachable == true))
                    Kv("Настроен", ruBool(h.configured))
                    Kv("Доступен", ruBool(h.reachable))
                    h.active_model?.let { Kv("Активная модель", it) }
                    h.primary_model?.let { Kv("Основная модель", it) }
                    Kv("Способ подключения", OwnerLocalization.renderApiModeRu(h.api_mode))
                    Kv("Защита (аварийный выключатель)", OwnerLocalization.renderCircuitStateRu(h.circuit_state))
                    Kv("Последний успешный запрос", OwnerLocalization.renderDateRu(h.last_successful_call) ?: "нет данных")
                    Kv("Последняя ошибка", OwnerLocalization.renderDateRu(h.last_failure) ?: "нет данных")
                    Kv("Задач выполнено", numOrDash(h.completed_tasks))
                    Kv("Задач с ошибкой", numOrDash(h.failed_tasks))
                    Kv("Задач в карантине", numOrDash(h.quarantined_tasks))
                    Kv("Входящий объём", OwnerLocalization.formatCalculatedUnits(h.raw_input_tokens))
                    Kv("Исходящий объём", OwnerLocalization.formatCalculatedUnits(h.raw_output_tokens))
                    Kv("Расчётные единицы", OwnerLocalization.formatCalculatedUnits(h.cumulative_calculated_units))
                    if (h.first_run_budget_limit != null) {
                        Kv("Бюджет первого запуска", OwnerLocalization.formatCalculatedUnits(h.first_run_budget_limit))
                        Kv("Остаток бюджета", OwnerLocalization.formatCalculatedUnits(h.first_run_budget_remaining))
                    }
                    Kv("Попыток отправки", numOrDash(h.sends_attempted))
                    Kv("Попыток прямой записи", numOrDash(h.direct_writes_attempted))
                } else if (s != null && s.first_run_budget_limit != null) {
                    // fallback to agents/status budget when provider-health is unavailable
                    val used = s.cumulative_calculated_units ?: 0L
                    Text("Бюджет первого запуска: ${OwnerLocalization.formatCalculatedUnits(used)} / ${OwnerLocalization.formatCalculatedUnits(s.first_run_budget_limit)}", style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("ag_budget"))
                }

                // ---- Agent roles (profiles) ----
                if (s != null && s.profiles.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    Text("Роли агентов", style = MaterialTheme.typography.titleMedium)
                    s.profiles.forEach { p -> SectionCard(OwnerLocalization.renderAgentRoleRu(p.profile), subtitle = ruState(p.state), tag = "ag_${p.profile}") }
                }

                // ---- Shadow analysis run ----
                Spacer(Modifier.height(12.dp))
                ApprovalRiskCard(
                    title = "Запуск теневого анализа",
                    riskLevel = "R3",
                    riskLabel = "стоимость и данные",
                    whatChanges = "создаёт запрос на анализ и показывает результат после подтверждения",
                    whatDoesNotHappen = "сообщения клиентам не отправляются, платежи не выполняются, прямые записи запрещены",
                    nextStep = "проверьте бюджет и подтвердите запуск в диалоге",
                    tag = "agents_shadow_risk",
                )
                Button(onClick = { confirmWave = true }, enabled = !ui.waveSubmitting, modifier = Modifier.testTag("ag_run_wave")) {
                    Text(if (ui.waveSubmitting) "Анализ выполняется…" else "Запустить теневой анализ")
                }

                val w = ui.wave
                if (w != null) {
                    Spacer(Modifier.height(12.dp))
                    Text("Результат теневого анализа", style = MaterialTheme.typography.titleMedium)
                    Text("Обработано лидов: ${w.shadow_leads_processed}", style = MaterialTheme.typography.bodyMedium)
                    Kv("Задач выполнено", w.agent_tasks_completed.toString())
                    Kv("Задач с ошибкой", w.agent_tasks_failed.toString())
                    Kv("Задач в карантине / ошибочных", w.agent_dead_letters.toString())
                    Kv("Попыток отправки", w.send_attempts.toString())
                    Kv("Необоснованных утверждений", w.unsupported_claims.toString())
                    Kv("Угаданных email", w.guessed_emails.toString())
                    if (w.qa_verdicts.isNotEmpty()) {
                        Spacer(Modifier.height(6.dp))
                        Text("Контроль качества", style = MaterialTheme.typography.titleSmall)
                        w.qa_verdicts.forEach { (k, v) -> Kv(OwnerLocalization.renderQaVerdictRu(k), v.toString()) }
                    }
                    if (w.artifacts.isNotEmpty()) {
                        Spacer(Modifier.height(6.dp))
                        Text("Артефакты на проверку", style = MaterialTheme.typography.titleSmall)
                        w.artifacts.forEach { a ->
                            val company = OwnerLocalization.companyFromLeadId(a.lead_id) ?: a.lead_id
                            val verdict = OwnerLocalization.renderQaVerdictRu(a.qa_verdict)
                            val review = if (a.owner_review_required) " · нужна проверка владельцем" else ""
                            Text("• $company: $verdict$review", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))
                Text("Агенты не отправляют сообщений, не меняют данные напрямую, не имеют доступа к платежам.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
            }
        }
    }

    // Confirmation dialog before launching the shadow analysis. Shows selected leads + projected
    // spend + max budget. Никогда не отправляет сообщения.
    if (confirmWave) {
        val s = ui.status
        val h = ui.health
        val budget = h?.first_run_budget_limit ?: s?.first_run_budget_limit
        val remaining = h?.first_run_budget_remaining
        AlertDialog(
            onDismissRequest = { confirmWave = false },
            title = { Text("Запустить теневой анализ?") },
            text = {
                Column {
                    Text("Теневой анализ обрабатывает выбранных лидов без отправки сообщений и без изменения данных.", style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(6.dp))
                    Kv("Режим", OwnerLocalization.renderAgentModeRu(s?.mode))
                    Kv("Прогнозный расход", if (remaining != null) "до ${OwnerLocalization.formatCalculatedUnits(remaining)} ед." else "нет данных")
                    Kv("Максимальный бюджет", OwnerLocalization.formatCalculatedUnits(budget))
                    Spacer(Modifier.height(6.dp))
                    Text("Сообщения клиентам не отправляются.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                }
            },
            confirmButton = {
                TextButton(
                    enabled = !ui.waveSubmitting,
                    onClick = { vm.runShadowWave(); confirmWave = false },
                    modifier = Modifier.testTag("ag_wave_confirm"),
                ) { Text("Запустить") }
            },
            dismissButton = { TextButton(onClick = { confirmWave = false }) { Text("Отмена") } },
        )
    }
}

@Composable
private fun Kv(k: String, v: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Text("$k: ", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
        Text(v, style = MaterialTheme.typography.bodySmall)
    }
}

private fun ruBool(v: Boolean?): String = when (v) { true -> "да"; false -> "нет"; null -> "нет данных" }
private fun numOrDash(v: Int?): String = v?.toString() ?: "нет данных"
private fun ruState(s: String) = when (s) { "SHADOW" -> "теневой режим"; "DISABLED" -> "отключён"; "ACTIVE" -> "активен"; else -> "нет данных" }

/** «Очереди владельца» + executive brief. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OwnerQueuesScreen(
    onBack: () -> Unit,
    onOpenSendReview: () -> Unit = {},
    onOpenQueue: (String) -> Unit = {},
    vm: QueuesViewModel = hiltViewModel(),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(topBar = {
        TopAppBar(title = { Text("Очереди и сводка") },
            navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.agents.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.agents.control.refresh")) { Text("Обновить") } })
    }) { pad ->
        when {
            ui.loading -> LoadingState(Modifier.padding(pad))
            ui.error != null && ui.queues == null -> ErrorState(ui.error!!, onRetry = vm::refresh, modifier = Modifier.padding(pad))
            else -> Column(Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()).testTag("owner_queues")) {
                if (ui.offline) { OfflineBanner(ui.cachedAt); Spacer(Modifier.height(8.dp)) }
                ui.brief?.let { b ->
                    Text("Сводка для владельца", style = MaterialTheme.typography.titleMedium)
                    b.what_changed?.let { Text("• $it", style = MaterialTheme.typography.bodySmall) }
                    b.needs_owner?.let { Text("• $it", style = MaterialTheme.typography.bodySmall) }
                    b.next_safe_action?.let { Text("• Следующее: $it", style = MaterialTheme.typography.bodySmall) }
                    Spacer(Modifier.height(12.dp))
                }
                ui.queues?.let { q ->
                    Text("Очереди", style = MaterialTheme.typography.titleMedium)
                    SectionCard("Ожидают отправки (проверка)", trailing = q.ready_for_send_review.size.toString(), tag = "q_ready", onClick = onOpenSendReview)
                    SectionCard("Ожидают ответа", trailing = q.awaiting_reply.toString(), tag = "q_awaiting", onClick = { onOpenQueue("awaiting-reply") })
                    SectionCard("Ответы получены", trailing = q.replies_received.toString(), tag = "q_replies", onClick = { onOpenQueue("replies") })
                    SectionCard("Повторный контакт к рассмотрению", trailing = q.followup_due.toString(), tag = "q_followup", onClick = { onOpenQueue("followup-review") })
                    SectionCard("Требуют сверки доставки", trailing = q.delivery_review.toString(), tag = "q_delivery", onClick = { onOpenQueue("delivery-reconciliation") })
                    SectionCard("Агентские результаты на проверку", trailing = q.agent_results_to_review.toString(), tag = "q_agents", onClick = { onOpenQueue("agent-review") })
                    SectionCard("Служебные записи", trailing = q.test_records.toString(), tag = "q_test", onClick = { onOpenQueue("test-records") })
                    q.note?.let { Spacer(Modifier.height(8.dp)); Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary) }
                }
            }
        }
    }
}
