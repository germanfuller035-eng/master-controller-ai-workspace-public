package ru.dmitry.matercontroller.feature.miniaudit

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
import ru.dmitry.matercontroller.core.model.Lead
import ru.dmitry.matercontroller.core.ui.ErrorState
import ru.dmitry.matercontroller.core.ui.LoadingState
import ru.dmitry.matercontroller.core.ui.OwnerLocalization

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LeadDetailScreen(leadId: String, onBack: () -> Unit, vm: LeadDetailViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    LaunchedEffect(leadId) { vm.load(leadId) }
    var tab by remember { mutableIntStateOf(0) }
    val tabs = listOf("Обзор", "Аудит", "Письмо", "История")

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(ui.lead?.company ?: leadId) },
                navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.miniaudit.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            )
        },
    ) { pad ->
        when {
            ui.loading -> Box(Modifier.padding(pad).fillMaxSize().testTag("lead_detail")) {
                LoadingState()
            }
            ui.error != null -> Box(Modifier.padding(pad).fillMaxSize().testTag("lead_detail")) {
                ErrorState(ui.error!!, onRetry = { vm.load(leadId) })
            }
            else -> Column(Modifier.padding(pad).testTag("lead_detail")) {
                TabRow(selectedTabIndex = tab) {
                    tabs.forEachIndexed { i, t ->
                        Tab(selected = tab == i, onClick = { tab = i }, text = { Text(t) }, modifier = Modifier.testTag("tab_$i"))
                    }
                }
                Box(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp)) {
                    when (tab) {
                        0 -> OverviewTab(ui.lead)
                        1 -> AuditTab(ui)
                        2 -> EmailTab(ui, vm)
                        3 -> HistoryTab(ui.lead)
                    }
                }
            }
        }
    }

    // ---- approval confirmation dialog (step 2) ----
    val approval = ui.approval
    if (approval != null) {
        AlertDialog(
            onDismissRequest = vm::cancelApproval,
            modifier = Modifier.testTag("approval_dialog"),
            title = { Text("Подтверждение отправки") },
            text = {
                Column {
                    Text("Компания: ${approval.company ?: "—"}")
                    Text("Email: ${approval.recipient ?: "—"}")
                    Text("Тема: ${approval.subject ?: "—"}")
                    Spacer(Modifier.height(8.dp))
                    Text(approval.warning ?: "Это реальная отправка письма клиенту.", color = MaterialTheme.colorScheme.error)
                }
            },
            confirmButton = {
                Button(onClick = vm::confirmSend, enabled = !ui.actionInFlight, modifier = Modifier.testTag("btn_send_email")) {
                    Text("Отправить письмо")
                }
            },
            dismissButton = { TextButton(onClick = vm::cancelApproval, modifier = Modifier.testTag("btn_cancel_send")) { Text("Отмена") } },
        )
    }

    val msg = ui.actionMessage ?: ui.sendResult
    if (msg != null) {
        LaunchedEffect(msg) {}
        Snackbar(Modifier.testTag("action_snackbar")) { Text(msg) }
    }
}

@Composable
private fun OverviewTab(lead: Lead?) {
    if (lead == null) return
    Column {
        Field("ID лида", lead.leadId)
        Field("Компания", lead.company)
        Field("Сайт", lead.website)
        Field("Ниша", lead.niche)
        Field("Регион", lead.region)
        Field("Email", lead.email ?: if (lead.emailPresent) "(скрыт)" else "нет")
        Field("Телефон", lead.phone)
        Field("Каноническая оценка", lead.score?.overallPriorityScore?.let { String.format("%.0f", it) })
        Field("Источник", OwnerLocalization.renderLeadSourceRu(lead.source))
        Field("Статус", if (OwnerLocalization.hasValue(lead.status)) OwnerLocalization.renderLeadStatusRu(lead.status) else null)
        Field("Аудит готов", if (lead.auditReady) "да" else null)
        Field("Письмо готово", if (lead.emailPreviewReady) "да" else null)
        Field("Доставка", if (lead.sendProof == "proven") "подтверждена" else null)
        Field("Отправлено", OwnerLocalization.renderDateRu(lead.sentAt))
        Field("Требуется ${OwnerLocalization.FOLLOWUP_TERM.lowercase()}", if (lead.followupDue) "да" else null)
        Field("Готов к отправке", if (lead.sendable) "да" else null)
        val blockerLines = OwnerLocalization.renderBlockerLinesRu(lead.blockingReasons, lead.status)
        Field("Блокеры", if (blockerLines.isEmpty()) "отсутствуют" else blockerLines.joinToString(", "))
    }
}

@Composable
private fun AuditTab(ui: LeadDetailUi) {
    val art = ui.artifactAudit
    Column {
        // RC6 (defect B): badge that audit ≠ email — these are distinct artifacts.
        AuditNotEmailBadge()
        Spacer(Modifier.height(8.dp))

        if (art != null) {
            val ready = art.audit_ready == true
            if (!ready) {
                // Аудит не готов — показываем статус и НЕ показываем письмо вместо аудита.
                Text("Аудит не готов: ${OwnerLocalization.renderAuditStatusRu(art.audit_status)}", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.titleSmall)
                Spacer(Modifier.height(4.dp))
                Text("Письмо клиента показывается на отдельной вкладке «Письмо» и не заменяет аудит.", style = MaterialTheme.typography.bodySmall)
                return@Column
            }
            Text("Аудит готов", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
            Field("Статус аудита", OwnerLocalization.renderAuditStatusRu(art.audit_status))
            Field("Создан", OwnerLocalization.renderDateRu(art.created_at))
            Field("Снимок данных", OwnerLocalization.renderDateRu(art.source_snapshot_at))
            Field("Контроль качества", if (OwnerLocalization.hasValue(art.qa_status)) OwnerLocalization.renderQaVerdictRu(art.qa_status) else null)
            Field("Готов для клиента", art.client_facing_ready?.let { if (it) "да" else "нет" })
            Field("Хэш артефакта", art.artifact_hash)
            Field("Происхождение (провайдер)", art.provider_provenance)

            // Findings
            if (art.findings.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Text("Находки (${art.finding_count ?: art.findings.size})", style = MaterialTheme.typography.titleSmall)
                art.findings.forEach { f ->
                    Spacer(Modifier.height(6.dp))
                    Card(Modifier.fillMaxWidth().testTag("audit_finding_${f.finding_id}")) {
                        Column(Modifier.padding(12.dp)) {
                            Text(f.title ?: "Находка", style = MaterialTheme.typography.titleSmall)
                            Field("Влияние", if (OwnerLocalization.hasValue(f.impact)) OwnerLocalization.renderImpactRu(f.impact) else null)
                            Field("Приоритет", if (OwnerLocalization.hasValue(f.priority)) OwnerLocalization.renderUrgencyRu(f.priority) else null)
                            Field("Доказательство", f.evidence_text)
                            Field("Ссылка на доказательство", f.evidence_url)
                            Field("Рекомендация", f.recommendation)
                            Field("Достоверность", if (OwnerLocalization.hasValue(f.confidence)) OwnerLocalization.renderConfidenceRu(f.confidence) else null)
                            Field("Источник", f.source)
                            Field("Наблюдалось", OwnerLocalization.renderDateRu(f.observed_at))
                        }
                    }
                }
            }

            if (art.quick_fix_plan.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Text("План быстрых исправлений", style = MaterialTheme.typography.titleSmall)
                art.quick_fix_plan.forEach { Text("• $it", style = MaterialTheme.typography.bodySmall) }
            }
            if (OwnerLocalization.hasValue(art.next_step)) {
                Spacer(Modifier.height(8.dp))
                Field("Следующий шаг", art.next_step)
            }
            if (art.limitations.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Text("Ограничения", style = MaterialTheme.typography.titleSmall)
                art.limitations.forEach { Text("• $it", style = MaterialTheme.typography.bodySmall) }
            }
            return@Column
        }

        // Fallback to the legacy audit read when the artifacts endpoint is unavailable.
        val a = ui.audit
        if (a?.available == true) {
            Text("Аудит готов", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(8.dp))
            val body: String = a.body ?: ""
            Text(text = body, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall)
        } else {
            Text("Аудит ещё не сгенерирован", color = MaterialTheme.colorScheme.error)
            Spacer(Modifier.height(4.dp))
            Text("Причина: ${OwnerLocalization.renderAuditMissingReasonRu(a?.missingReason)}", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun AuditNotEmailBadge() {
    Surface(color = MaterialTheme.colorScheme.tertiaryContainer, shape = MaterialTheme.shapes.small, modifier = Modifier.testTag("audit_not_email_badge")) {
        Text(
            "Аудит и письмо — разные документы",
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
        )
    }
}

@Composable
private fun EmailTab(ui: LeadDetailUi, vm: LeadDetailViewModel) {
    val art = ui.artifactEmail
    val e = ui.email
    Column {
        AuditNotEmailBadge()
        Spacer(Modifier.height(8.dp))
        // RC6 (defect B): «Письмо» — только email-артефакт (artifacts.email). Получатель замаскирован.
        if (art != null) {
            Field("Получатель", art.recipient_masked)
            Field("Тема", art.subject)
            Spacer(Modifier.height(8.dp))
            Text("Текст письма", style = MaterialTheme.typography.titleSmall)
            Text(text = art.body_text ?: "(нет)", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall)
            if (OwnerLocalization.hasValue(art.no_send_notice)) {
                Spacer(Modifier.height(8.dp))
                Text(art.no_send_notice!!, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
            }
        } else {
            Field("Получатель", e?.recipient)
            Field("Тема", e?.subject)
            Spacer(Modifier.height(8.dp))
            Text("Текст письма", style = MaterialTheme.typography.titleSmall)
            val emailBody: String = e?.body ?: "(нет)"
            Text(text = emailBody, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.height(12.dp))
        if (e?.blockingReasons?.isNotEmpty() == true) {
            val lines = OwnerLocalization.renderBlockerLinesRu(e.blockingReasons, null)
            if (lines.isNotEmpty()) {
                Text("Блокеры отправки: ${lines.joinToString(", ")}", color = MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(8.dp))
            }
        }
        Row {
            OutlinedButton(onClick = vm::cancelApproval, modifier = Modifier.testTag("btn_reject")) { Text("Отклонить") }
            Spacer(Modifier.width(8.dp))
            Button(
                onClick = vm::prepareSend,
                enabled = e?.sendable == true && !ui.actionInFlight,
                modifier = Modifier.testTag("btn_confirm_send"),
            ) { Text("Подтвердить отправку") }
        }
        if (e?.sendable != true) {
            Spacer(Modifier.height(8.dp))
            Text("Отправка недоступна для этого лида.", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun HistoryTab(lead: Lead?) {
    Column {
        Field("Статус", if (OwnerLocalization.hasValue(lead?.status)) OwnerLocalization.renderLeadStatusRu(lead?.status) else null)
        Field("Отправлено", lead?.sentAt?.replace("T", " ")?.take(16))
        Field("Доставка", if (lead?.sendProof == "proven") "подтверждена" else null)
    }
}

@Composable
private fun Field(label: String, value: String?) {
    if (value.isNullOrBlank()) return
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text("$label: ", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}
