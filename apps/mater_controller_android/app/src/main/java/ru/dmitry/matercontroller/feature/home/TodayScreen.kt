package ru.dmitry.matercontroller.feature.home

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
import androidx.compose.material3.Button
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun TodayScreen(
    onOpenMiniAudit: () -> Unit,
    onOpenCommercial: () -> Unit = {},
    onOpenCommandCenter: () -> Unit = {},
    onOpenCampaigns: () -> Unit = {},
    onOpenDecisions: () -> Unit = {},
    onOpenAgents: () -> Unit = {},
    onOpenReplies: () -> Unit = {},
    onOpenSystem: () -> Unit = {},
    onOpenCost: () -> Unit = {},
    onOpenIncidents: () -> Unit = {},
    onOpenWorkingSalesMvp: () -> Unit = {},
    vm: TodayViewModel = hiltViewModel(),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold { pad ->
        TodayContent(
            ui = ui,
            onRefresh = vm::refresh,
            onStartSearch = vm::startLeadgen,
            onOpenLead = onOpenWorkingSalesMvp,
            onAddSite = onOpenWorkingSalesMvp,
            onOpenReplies = onOpenReplies,
            onOpenDeals = onOpenCommercial,
            modifier = Modifier.padding(pad),
        )
    }
}

@Composable
private fun TodayContent(
    ui: TodayUi,
    onRefresh: () -> Unit,
    onStartSearch: () -> Unit,
    onOpenLead: () -> Unit,
    onAddSite: () -> Unit,
    onOpenReplies: () -> Unit,
    onOpenDeals: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val visibleQueueLeads = ui.outreachQueue?.items?.size ?: 0
    val leads = when {
        visibleQueueLeads > 0 -> visibleQueueLeads
        ui.outreachQueue != null -> 0
        else -> ui.autonomy?.pipelineCounts?.values?.sum()
            ?: ui.autonomy?.firstTouch?.leadsConsidered
            ?: 0
    }
    val replies = ui.replyAttention
    val deals = ui.brief?.owner_actions?.size ?: 0
    val readyToSend = ui.outreachQueue?.readyCount ?: ui.status?.readySend ?: 0
    val packets = ui.autonomy?.firstTouch?.approvalPending ?: 0
    val hasLeadAction = leads > 0 || ui.nextAction?.lead != null
    val loading = ui.loading || ui.actionBusy

    val actionTitle: String
    val actionDescription: String
    val actionLabel: String
    val action: () -> Unit
    val secondaryLabel: String?
    val secondaryAction: (() -> Unit)?

    when {
        ui.loading -> {
            actionTitle = "Следующее действие"
            actionDescription = "Обновляем сводку."
            actionLabel = "Обновить"
            action = onRefresh
            secondaryLabel = null
            secondaryAction = null
        }
        packets > 0 -> {
            actionTitle = "Следующее действие"
            actionDescription = "Пакет не отправлен."
            actionLabel = "Открыть отправку"
            action = onOpenLead
            secondaryLabel = null
            secondaryAction = null
        }
        readyToSend > 0 -> {
            actionTitle = "Следующее действие"
            actionDescription = "Письмо готово к ручной отправке."
            actionLabel = "Открыть письмо"
            action = onOpenLead
            secondaryLabel = null
            secondaryAction = null
        }
        hasLeadAction -> {
            actionTitle = "Следующее действие"
            actionDescription = "Проверить письмо для лида."
            actionLabel = "Открыть лид"
            action = onOpenLead
            secondaryLabel = null
            secondaryAction = null
        }
        else -> {
            actionTitle = "Следующее действие"
            actionDescription = "Лидов пока нет."
            actionLabel = "Запустить поиск"
            action = onStartSearch
            secondaryLabel = "Добавить сайт"
            secondaryAction = onAddSite
        }
    }

    Column(
        modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
            .testTag("today_screen"),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        if (ui.offline || !ui.apiOk || ui.error != null) {
            Text(
                freshnessText(ui),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.testTag("today_freshness_warning"),
            )
        }

        ElevatedCard(Modifier.fillMaxWidth().testTag("today_next_action")) {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(actionTitle, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text(actionDescription, style = MaterialTheme.typography.bodyLarge)
                Button(
                    onClick = action,
                    enabled = !loading,
                    modifier = Modifier.fillMaxWidth().height(56.dp).testTag("today_primary_action"),
                ) {
                    Text(actionLabel)
                }
                ui.notice?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (ui.error != null || ui.offline || !ui.apiOk) {
                            MaterialTheme.colorScheme.error
                        } else {
                            MaterialTheme.colorScheme.primary
                        },
                        modifier = Modifier.testTag("today_action_notice"),
                    )
                }
                if (secondaryLabel != null && secondaryAction != null) {
                    OutlinedButton(
                        onClick = secondaryAction,
                        enabled = !loading,
                        modifier = Modifier.fillMaxWidth().height(52.dp).testTag("today_secondary_action"),
                    ) {
                        Text(secondaryLabel)
                    }
                }
            }
        }

        ElevatedCard(Modifier.fillMaxWidth().testTag("today_summary")) {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Краткая сводка", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                SummaryLine("Лиды", leads.toString())
                SummaryLine("Ответы", replies.toString())
                SummaryLine("Сделки", deals.toString())
                SummaryLine("К отправке", readyToSend.toString())
                SummaryLine("Обновлено", updatedText(ui))
            }
        }

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            val actionsEnabled = !loading && !ui.actionBusy
            OutlinedButton(onClick = onRefresh, enabled = actionsEnabled, modifier = Modifier.weight(1f).height(52.dp).testTag("today_refresh")) {
                Text("Обновить")
            }
            OutlinedButton(onClick = onStartSearch, enabled = actionsEnabled, modifier = Modifier.weight(1f).height(52.dp).testTag("today_start_search")) {
                Text("Запустить поиск")
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedButton(onClick = onOpenReplies, modifier = Modifier.weight(1f).height(52.dp).testTag("today_open_replies")) {
                Text("Ответы")
            }
            OutlinedButton(onClick = onOpenDeals, modifier = Modifier.weight(1f).height(52.dp).testTag("today_open_deals")) {
                Text("Сделки")
            }
        }

        Spacer(Modifier.height(20.dp))
    }
}

@Composable
private fun SummaryLine(label: String, value: String) {
    Row(Modifier.fillMaxWidth()) {
        Text(label, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
    }
}

private fun freshnessText(ui: TodayUi): String = when {
    ui.loading -> "Обновляем данные"
    ui.offline || !ui.apiOk -> "Данные не обновились"
    else -> "Данные не обновились"
}

private fun updatedText(ui: TodayUi): String = when {
    ui.cachedAt != null -> formatTime(ui.cachedAt)
    ui.apiOk && !ui.offline -> "сейчас"
    else -> "Данные не обновились"
}

private fun formatTime(value: Long): String {
    val millis = if (value < 10_000_000_000L) value * 1000 else value
    return SimpleDateFormat("HH:mm", Locale("ru", "RU")).format(Date(millis))
}
