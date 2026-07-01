package ru.dmitry.matercontroller.feature.transport

import androidx.compose.foundation.clickable
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
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import ru.dmitry.matercontroller.core.ui.PilotSafetyChips
import ru.dmitry.matercontroller.core.ui.SectionCard

/** «Статусы доставки требуют сверки» — read-only; no recipient/body; auto-resend forbidden. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeliveryReviewScreen(onBack: () -> Unit, vm: DeliveryReviewViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(topBar = {
        TopAppBar(title = { Text("Статусы доставки требуют сверки") },
            navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.transport.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.transport.control.refresh")) { Text("Обновить") } })
    }) { pad ->
        when {
            ui.loading -> LoadingState(Modifier.padding(pad))
            ui.error != null && ui.data == null -> ErrorState(ui.error!!, onRetry = vm::refresh, modifier = Modifier.padding(pad))
            else -> Column(Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()).testTag("delivery_review")) {
                if (ui.offline) { OfflineBanner(ui.cachedAt); Spacer(Modifier.height(8.dp)) }
                val d = ui.data
                if (d != null) {
                    Text("Записей на сверку: ${d.records_total}", style = MaterialTheme.typography.titleMedium, modifier = Modifier.testTag("dr_total"))
                    Spacer(Modifier.height(4.dp))
                    Text("Подтверждённая отправка: нет. Автоматическая повторная отправка: запрещена. Требуется решение владельца.",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                    Spacer(Modifier.height(12.dp))
                    d.owner_review_queue.forEach { rec ->
                        SectionCard(
                            title = "Лид ${rec.leadId}",
                            subtitle = "${ruCategory(rec.category)} · авто-повтор: запрещён · требуется владелец",
                            tag = "dr_${rec.leadId}",
                        )
                    }
                    if (d.owner_review_queue.isEmpty()) Text("Нет записей на сверку.", style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

private fun ruCategory(c: String): String = when (c) {
    "CONFIRMED_NOT_SENT" -> "Подтверждено: не отправлено"
    "ATTEMPT_UNPROVEN" -> "Попытка без подтверждения"
    "DELIVERY_UNCONFIRMED" -> "Доставка не подтверждена"
    "LEGACY_INCONSISTENCY" -> "Противоречие старых данных"
    "TEST_ONLY" -> "Запись только для проверки"
    else -> "Требует сверки"
}

/** Hidden verification records excluded from business KPIs. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TestOnlyScreen(onBack: () -> Unit, vm: TestOnlyViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(topBar = {
        TopAppBar(title = { Text("Проверка коммерческих записей") },
            navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.transport.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.transport.control.refresh")) { Text("Обновить") } })
    }) { pad ->
        when {
            ui.loading -> LoadingState(Modifier.padding(pad))
            ui.error != null && ui.data == null -> ErrorState(ui.error!!, onRetry = vm::refresh, modifier = Modifier.padding(pad))
            else -> Column(Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()).testTag("test_only")) {
                if (ui.offline) { OfflineBanner(ui.cachedAt); Spacer(Modifier.height(8.dp)) }
                val d = ui.data
                if (d != null) {
                    AssistChip(onClick = {}, enabled = false, label = { Text("Записи только для проверки — не учитываются в выручке") }, modifier = Modifier.testTag("to_badge"))
                    Spacer(Modifier.height(12.dp))
                    SectionCard("Возможности для проверки", trailing = d.test_only_opportunities.toString())
                    SectionCard("Предложения для проверки", trailing = d.test_only_offers.toString())
                    SectionCard("Сделки для проверки", trailing = d.test_only_deals.toString())
                    SectionCard("Передачи для проверки", trailing = d.test_only_handoffs.toString())
                    SectionCard("Проекты для проверки", trailing = d.test_only_projects.toString())
                    SectionCard("Счета-черновики для проверки", trailing = d.test_only_invoice_drafts.toString())
                    Spacer(Modifier.height(8.dp))
                    Text("Исключены из бизнес-показателей: ${if (d.excluded_from_business_kpi) "да" else "нет"}",
                        style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

/** «Диалоги» — unified read-only timeline; no send. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConversationsScreen(onBack: () -> Unit, vm: ConversationsViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(topBar = {
        TopAppBar(title = { Text("Диалоги") },
            navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.transport.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.transport.control.refresh")) { Text("Обновить") } })
    }) { pad ->
        when {
            ui.loading -> LoadingState(Modifier.padding(pad))
            ui.error != null && ui.list == null -> ErrorState(ui.error!!, onRetry = vm::refresh, modifier = Modifier.padding(pad))
            else -> Column(Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()).testTag("conversations")) {
                if (ui.offline) { OfflineBanner(ui.cachedAt); Spacer(Modifier.height(8.dp)) }
                Text("Диалог", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.testTag("pilot_dialog"))
                Text("Клиенту ничего не отправляется. История только для просмотра, ответ владельца остаётся черновиком.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.height(8.dp))
                PilotSafetyChips(tag = "pilot_dialog_safety_chips")
                Spacer(Modifier.height(8.dp))
                SectionCard(
                    title = "Черновик ответа владельца",
                    subtitle = "черновик не отправлен · требуется ручное подтверждение в отдельном контроле",
                    tag = "pilot_dialog_draft",
                )
                Spacer(Modifier.height(8.dp))
                ui.list?.items?.forEach { c ->
                    SectionCard(
                        title = "Лид ${c.lead_id}",
                        subtitle = "Событий: ${c.event_count}${if (c.has_offer) " · есть предложение" else ""}${if (c.has_reply) " · есть ответ" else ""}",
                        onClick = { c.lead_id?.let(vm::openTimeline) },
                        tag = "conv_${c.lead_id}",
                    )
                }
                if (ui.list?.items.isNullOrEmpty()) Text("Диалогов пока нет.", style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
    val tl = ui.timeline
    if (tl != null) {
        AlertDialog(
            onDismissRequest = vm::closeTimeline,
            confirmButton = { TextButton(onClick = vm::closeTimeline) { Text("Закрыть") } },
            title = { Text("Лента: ${tl.lead_id}") },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    tl.events.forEach { e -> Text("• ${e.at ?: ""} — ${ruEvent(e.type)}", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(vertical = 2.dp)) }
                    Spacer(Modifier.height(8.dp))
                    Text("Отправка: недоступна (${OwnerLocalization.renderSendCapabilityRu(tl.send_capability)})", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                }
            },
        )
    }
}

private fun ruEvent(t: String): String = when (t) {
    "LEAD_CREATED" -> "Лид создан"
    "OPPORTUNITY_CREATED" -> "Возможность создана"
    "OFFER_DRAFT_PREPARED" -> "Подготовлен черновик предложения"
    "OWNER_DECISION" -> "Решение владельца"
    "SEND_APPROVAL_PREPARED" -> "Подготовлено одобрение отправки"
    "MESSAGE_SENT_LEDGER" -> "Отправка зафиксирована в реестре"
    "REPLY_RECEIVED" -> "Получен ответ"
    "FOLLOWUP_PLANNED" -> "Запланирован повторный контакт"
    else -> "другое событие"
}
