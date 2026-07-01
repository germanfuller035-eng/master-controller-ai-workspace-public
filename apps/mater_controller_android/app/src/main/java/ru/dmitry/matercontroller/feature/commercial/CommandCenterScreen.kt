package ru.dmitry.matercontroller.feature.commercial

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

/**
 * «Коммерческие действия» (Gate C1-A) — owner-only internal command center. NO send, NO payment.
 * Every step has a preview the owner confirms; a persistent badge states no client message is sent.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CommandCenterScreen(onBack: () -> Unit, vm: CommandCenterViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Коммерческие действия") },
                navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.commercial.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            )
        },
    ) { pad ->
        Column(Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()).testTag("command_center")) {
            // Persistent no-send safety badge.
            Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = MaterialTheme.shapes.small, modifier = Modifier.fillMaxWidth().testTag("no_send_badge")) {
                Text(
                    "Клиенту ничего не отправляется. Только внутренние записи.",
                    style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium,
                    modifier = Modifier.padding(12.dp),
                )
            }
            Spacer(Modifier.height(12.dp))

            OutlinedTextField(
                value = ui.leadId, onValueChange = vm::setLeadId,
                label = { Text("ID лида (проверенный)") }, singleLine = true,
                modifier = Modifier.fillMaxWidth().testTag("cc_lead_id"),
            )
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Switch(checked = ui.testOnly, onCheckedChange = vm::setTestOnly, modifier = Modifier.testTag("cc_test_only"))
                Spacer(Modifier.width(8.dp))
                Text(if (ui.testOnly) "Служебная запись, не учитывается в выручке" else "Реальная запись", style = MaterialTheme.typography.bodySmall)
            }

            if (ui.error != null) {
                Spacer(Modifier.height(8.dp))
                Text(ui.error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.testTag("cc_error"))
            }
            if (ui.staleRevision) {
                Text("Обновите данные и повторите действие.", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            Spacer(Modifier.height(12.dp))
            Text("Цепочка действий", style = MaterialTheme.typography.titleMedium)
            // Each step enabled only when its precondition entity exists.
            StepButton("1. Создать возможность", enabled = ui.leadId.isNotBlank() && ui.opportunityId == null && !ui.inFlight, done = ui.opportunityId != null, tag = "cc_step_opp") { vm.requestStep(C1AStep.OPPORTUNITY) }
            StepButton("2. Подготовить предложение", enabled = ui.opportunityId != null && ui.offerId == null && !ui.inFlight, done = ui.offerId != null, tag = "cc_step_offer") { vm.requestStep(C1AStep.OFFER) }
            StepButton("3. Подтвердить (решение владельца)", enabled = ui.offerId != null && ui.dealId == null && !ui.inFlight, done = ui.dealId != null, tag = "cc_step_decision") { vm.requestStep(C1AStep.DECISION, "APPROVE") }
            StepButton("4. Передать в работу", enabled = ui.dealId != null && ui.handoffId == null && !ui.inFlight, done = ui.handoffId != null, tag = "cc_step_handoff") { vm.requestStep(C1AStep.HANDOFF) }
            StepButton("5. Создать проект", enabled = ui.handoffId != null && ui.projectId == null && !ui.inFlight, done = ui.projectId != null, tag = "cc_step_project") { vm.requestStep(C1AStep.PROJECT) }
            StepButton("6. Создать счёт (черновик)", enabled = ui.dealId != null && ui.invoiceId == null && !ui.inFlight, done = ui.invoiceId != null, tag = "cc_step_invoice") { vm.requestStep(C1AStep.INVOICE) }

            if (ui.inFlight) { Spacer(Modifier.height(12.dp)); LinearProgressIndicator(Modifier.fillMaxWidth()) }

            if (ui.log.isNotEmpty()) {
                Spacer(Modifier.height(16.dp))
                Text("Журнал", style = MaterialTheme.typography.titleMedium)
                ui.log.forEach { Text("• $it", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 2.dp)) }
            }

            Spacer(Modifier.height(16.dp))
            Text(
                "Оплата и отправка недоступны на этой версии (Gate C1-A). Платёж — отдельное подтверждение владельца.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
            )
        }
    }

    // Preview / confirm dialog.
    val step = ui.pendingStep
    if (step != null) {
        AlertDialog(
            onDismissRequest = vm::cancelStep,
            modifier = Modifier.testTag("cc_confirm_dialog"),
            title = { Text(CommandCenterViewModel.labelOf(step)) },
            text = {
                Column {
                    Text(previewFor(step, ui), style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(8.dp))
                    Text("Будет создана внутренняя запись. Клиенту НИЧЕГО не отправляется.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                    if (ui.testOnly) Text("Запись помечается как служебная и не учитывается в выручке.", style = MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton = { TextButton(onClick = vm::confirmStep, modifier = Modifier.testTag("cc_confirm_btn")) { Text("Подтвердить") } },
            dismissButton = { TextButton(onClick = vm::cancelStep) { Text("Отмена") } },
        )
    }
}

@Composable
private fun StepButton(label: String, enabled: Boolean, done: Boolean, tag: String, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth().padding(top = 8.dp).testTag(tag)) {
        Text((if (done) "✓ " else "") + label)
    }
}

private fun previewFor(step: C1AStep, ui: CommandCenterUi): String = when (step) {
    C1AStep.OPPORTUNITY -> "Лид: ${ui.leadId}\nПродукт: ${ui.productId}\nЦена берётся из каталога (snapshot).\nБудет создана: внутренняя возможность."
    C1AStep.OFFER -> "Возможность: ${ui.opportunityId}\nБудет создан неизменяемый снимок предложения (scope, цена, версия). Без отправки."
    C1AStep.DECISION -> "Предложение: ${ui.offerId}\nРешение: ПОДТВЕРДИТЬ. Решение фиксируется как запись авторитета."
    C1AStep.HANDOFF -> "Сделка: ${ui.dealId}\nБудет создана передача в работу со снимком продукта и критериями приёмки."
    C1AStep.PROJECT -> "Передача: ${ui.handoffId}\nБудет создан проект (Delivery OS)."
    C1AStep.INVOICE -> "Сделка: ${ui.dealId}\nБудет создан счёт в статусе ЧЕРНОВИК. Реальная выставка и банк отключены. Платёж не создаётся."
}
