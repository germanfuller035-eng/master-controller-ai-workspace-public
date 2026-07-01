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
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ru.dmitry.matercontroller.core.model.LeadCountKey
import ru.dmitry.matercontroller.core.ui.ErrorState
import ru.dmitry.matercontroller.core.ui.LoadingState
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import ru.dmitry.matercontroller.core.ui.PilotSafetyChips
import ru.dmitry.matercontroller.core.ui.SectionCard

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MiniAuditHomeScreen(
    onOpenBucket: (String) -> Unit,
    onOpenLead: (String) -> Unit,
    onBack: () -> Unit,
    vm: MiniAuditHomeViewModel = hiltViewModel(),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Мини-аудит") },
                navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.miniaudit.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
                actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.miniaudit.control.refresh")) { Text("Обновить") } },
            )
        },
    ) { pad ->
        when {
            ui.loading -> LoadingState(Modifier.padding(pad))
            ui.error != null -> ErrorState(ui.error!!, onRetry = vm::refresh, modifier = Modifier.padding(pad))
            else -> {
                val s = ui.status
                Column(Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()).testTag("ma_home")) {
                    Text("Мини-аудит", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.testTag("pilot_mini_audit"))
                    Text("Очередь доказательств для ручной проверки. Категории не означают подтверждённую отправку.", style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(8.dp))
                    PilotSafetyChips(tag = "pilot_mini_audit_safety_chips")
                    Spacer(Modifier.height(8.dp))
                    val na = ui.nextAction
                    SectionCard(
                        title = "Следующее действие",
                        subtitle = na?.lead?.let { "${it.company ?: it.leadId} · ${OwnerLocalization.renderNextActionReasonRu(na)}" } ?: "Следующих действий сейчас нет",
                        onClick = { na?.lead?.leadId?.let(onOpenLead) },
                        tag = "ma_card_next",
                    )
                    SectionCard("Готовы к отправке", trailing = s?.readySend?.toString(), onClick = { onOpenBucket("ready_send") }, tag = "ma_card_ready")
                    SectionCard("Готовят аудит", trailing = s?.preparing?.toString(), onClick = { onOpenBucket("preparing") }, tag = "ma_card_preparing")
                    SectionCard("Ожидают ответа", trailing = s?.waitingReply?.toString(), onClick = { onOpenBucket("waiting_reply") }, tag = "ma_card_waiting")
                    SectionCard("Повторный контакт", trailing = s?.followupDue?.toString(), onClick = { onOpenBucket("followups") }, tag = "ma_card_followup")
                    SectionCard("Требуют проверки", trailing = s?.needsCheck?.toString(), onClick = { onOpenBucket("needs_check") }, tag = "ma_card_needs")

                    // Records with an UNCERTAIN delivery status — NOT confirmed sends. The authoritative
                    // ledger count is shown separately so the owner never reads these as successful sends.
                    val sr = ui.sendRecon
                    val uncertain = sr?.records_requiring_reconciliation ?: s?.sendUncertain
                    SectionCard(
                        title = "Записи с неуточнённым статусом доставки",
                        subtitle = "Попытка была, но нет подтверждения в реестре. Это НЕ успешные отправки.",
                        trailing = uncertain?.toString(),
                        onClick = { onOpenBucket("send_uncertain") },
                        tag = "ma_card_uncertain",
                    )
                    if (sr != null) {
                        Text(
                            "Подтверждённых успешных отправок в реестре: ${sr.authoritative_successful_sends}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                            modifier = Modifier.padding(start = 8.dp, top = 2.dp, bottom = 6.dp).testTag("ma_authoritative_sends"),
                        )
                    }

                    // Lead totals: canonical base vs Мини-аудит operational subset, explained — not a bare number.
                    val lc = ui.leadCount
                    if (lc != null) {
                        SectionCard(
                            title = "Лиды",
                            subtitle = "Всего в системе: ${lc.canonical_total_leads} · В контуре Мини-аудит: ${lc.mini_audit_operational_leads} · Не включены: ${lc.excluded_from_mini_audit}",
                            onClick = { onOpenBucket("all") },
                            tag = "ma_card_status",
                        )
                        var showWhy by remember { mutableStateOf(false) }
                        TextButton(onClick = { showWhy = !showWhy }, modifier = Modifier.testTag("ma_why_toggle")) {
                            Text(if (showWhy) "Скрыть пояснение" else "Почему отличаются показатели?")
                        }
                        if (showWhy) {
                            Column(Modifier.padding(start = 8.dp, bottom = 8.dp)) {
                                lc.definitionFor(LeadCountKey.CANONICAL_TOTAL)?.let { Text("• Всего в системе: $it", style = MaterialTheme.typography.bodySmall) }
                                lc.definitionFor(LeadCountKey.OPERATIONAL)?.let { Text("• В контуре Мини-аудит: $it", style = MaterialTheme.typography.bodySmall) }
                                lc.definitionFor(LeadCountKey.EXCLUDED)?.let { Text("• Не включены: $it", style = MaterialTheme.typography.bodySmall) }
                                if (lc.excluded_breakdown_by_status.isNotEmpty()) {
                                    val parts = lc.excluded_breakdown_by_status.entries.joinToString(", ") { "${OwnerLocalization.renderLeadStatusRu(it.key)}: ${it.value}" }
                                    Text("Состав не включённых: $parts", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                                }
                            }
                        }
                    } else {
                        SectionCard("Статус", subtitle = "Всего лидов: ${s?.total ?: 0} · автоотправка ${OwnerLocalization.renderAutomationStateRu(s?.autosend)}", onClick = { onOpenBucket("all") }, tag = "ma_card_status")
                    }
                }
            }
        }
    }
}
