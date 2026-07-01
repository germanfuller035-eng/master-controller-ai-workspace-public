package ru.dmitry.matercontroller.feature.approvals

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ru.dmitry.matercontroller.core.ui.ErrorState
import ru.dmitry.matercontroller.core.ui.LoadingState
import ru.dmitry.matercontroller.core.ui.MutationPhase
import ru.dmitry.matercontroller.core.ui.ApprovalRiskCard
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import ru.dmitry.matercontroller.core.ui.SEND_DISABLED_WARNING

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ApprovalDetailScreen(
    queueKey: String,
    leadId: String,
    onBack: () -> Unit,
    vm: ApprovalDetailViewModel = hiltViewModel(),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val queue = remember(queueKey) { ApprovalQueue.fromKey(queueKey) }
    LaunchedEffect(queueKey, leadId) { vm.load(queue, leadId) }
    val submitting = ui.mutation == MutationPhase.Submitting

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(ui.lead?.company ?: leadId) },
                navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.approvals.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
                actions = { TextButton(onClick = vm::refresh, enabled = !submitting) { Text("Обновить") } },
            )
        },
    ) { pad ->
        when {
            ui.loading -> LoadingState(Modifier.padding(pad))
            ui.error != null -> ErrorState(ui.error!!, onRetry = vm::refresh, modifier = Modifier.padding(pad))
            else -> Column(
                Modifier.padding(pad).padding(16.dp).fillMaxSize().verticalScroll(rememberScrollState()).testTag("approval_detail_${queue.key}"),
            ) {
                // Persistent send-disabled warning — always visible where a mutation can happen.
                Surface(color = MaterialTheme.colorScheme.errorContainer, modifier = Modifier.fillMaxWidth().testTag("send_disabled_warning")) {
                    Text(
                        when (queue) {
                            ApprovalQueue.REPLY_DRAFTS -> "Автоматический ответ отключён."
                            ApprovalQueue.FOLLOWUPS -> "Автоматическое повторное обращение отключено."
                            else -> SEND_DISABLED_WARNING
                        },
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                }
                Spacer(Modifier.height(12.dp))
                ApprovalRiskCard(
                    title = "Решение по очереди",
                    riskLevel = "R3",
                    riskLabel = "статус лида",
                    whatChanges = "сохраняется решение владельца по этому элементу",
                    whatDoesNotHappen = "письмо клиенту не отправляется, платежи не выполняются",
                    nextStep = "проверьте аудит, черновик и блокеры перед действием",
                    tag = "approval_detail_risk",
                )

                ui.lead?.let { lead ->
                    Field("Статус", OwnerLocalization.renderApprovalStatusRu(lead.status))
                    lead.email?.let { Field("Получатель", it) }
                    // Каноническая оценка (score_v1); предварительная (score_v2) показывается в списках.
                    lead.score?.overallPriorityScore?.let { Field("Каноническая оценка", String.format("%.0f", it)) }
                    val blk = OwnerLocalization.renderBlockerLinesRu(lead.blockingReasons, lead.status)
                    if (blk.isNotEmpty()) Field("Блокеры", blk.joinToString(", "))
                }

                ui.audit?.let { a ->
                    Spacer(Modifier.height(8.dp))
                    Text("Аудит", style = MaterialTheme.typography.titleMedium)
                    Field("Доступен", if (a.available) "да" else "нет")
                    if (!a.available) a.missingReason?.let { Field("Причина отсутствия", OwnerLocalization.renderAuditMissingReasonRu(it)) }
                    a.body?.let {
                        Spacer(Modifier.height(4.dp))
                        Text(it, style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace), modifier = Modifier.testTag("audit_body"))
                    }
                }

                ui.emailPreview?.let { e ->
                    Spacer(Modifier.height(8.dp))
                    Text("Черновик письма", style = MaterialTheme.typography.titleMedium)
                    e.recipient?.let { Field("Получатель", it) }
                    e.subject?.let { Field("Тема", it) }
                    e.body?.let { Field("Текст", it) }
                    val ebl = OwnerLocalization.renderBlockerLinesRu(e.blockingReasons, null)
                    if (ebl.isNotEmpty()) Field("Блокеры", ebl.joinToString(", "))
                }

                Spacer(Modifier.height(16.dp))
                // Mutation feedback
                ui.mutationMessage?.let { msg ->
                    val color = when (ui.mutation) {
                        MutationPhase.Confirmed -> MaterialTheme.colorScheme.primary
                        MutationPhase.Conflict -> MaterialTheme.colorScheme.tertiary
                        MutationPhase.Failed -> MaterialTheme.colorScheme.error
                        else -> MaterialTheme.colorScheme.onSurface
                    }
                    Text(msg, color = color, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.testTag("mutation_message"))
                    Spacer(Modifier.height(8.dp))
                }

                // No-send actions. Buttons disabled while submitting to block duplicate taps.
                Row {
                    OutlinedButton(onClick = vm::defer, enabled = !submitting, modifier = Modifier.testTag("btn_defer")) { Text("Отложить") }
                    Spacer(Modifier.width(12.dp))
                    Button(
                        onClick = vm::reject, enabled = !submitting,
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                        modifier = Modifier.testTag("btn_reject"),
                    ) { Text("Отклонить") }
                }
                if (submitting) {
                    Spacer(Modifier.height(12.dp))
                    LinearProgressIndicator(Modifier.fillMaxWidth().testTag("mutation_progress"))
                }
                ui.lead?.let { Spacer(Modifier.height(12.dp)); Text("lead_id: ${it.leadId}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)) }
            }
        }
    }
}

@Composable
private fun Field(label: String, value: String) {
    Column(Modifier.padding(vertical = 4.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}
