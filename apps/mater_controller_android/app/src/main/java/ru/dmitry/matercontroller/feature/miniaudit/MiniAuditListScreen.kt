package ru.dmitry.matercontroller.feature.miniaudit

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ru.dmitry.matercontroller.core.model.Lead
import ru.dmitry.matercontroller.core.ui.EmptyState
import ru.dmitry.matercontroller.core.ui.ErrorState
import ru.dmitry.matercontroller.core.ui.LoadingState
import ru.dmitry.matercontroller.core.ui.OfflineBanner
import ru.dmitry.matercontroller.core.ui.OwnerLocalization

private fun bucketTitle(b: String) = when (b) {
    "ready_send" -> "Готовы к отправке"
    "waiting_reply" -> "Ожидают ответа"
    "followups" -> "Повторный контакт"
    "needs_check" -> "Требуют проверки"
    "send_uncertain" -> "Неопределённые отправки"
    "preparing" -> "Готовят аудит"
    else -> "Все лиды"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MiniAuditListScreen(
    bucket: String,
    onOpenLead: (String) -> Unit,
    onBack: () -> Unit,
    vm: MiniAuditListViewModel = hiltViewModel(),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    LaunchedEffect(bucket) { vm.load(bucket) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(bucketTitle(bucket)) },
                navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.miniaudit.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
                actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.miniaudit.control.refresh")) { Text("Обновить") } },
            )
        },
    ) { pad ->
        Column(Modifier.padding(pad).testTag("ma_list_$bucket")) {
            if (ui.offline) OfflineBanner(ui.cachedAt)
            OutlinedTextField(
                value = ui.search, onValueChange = vm::onSearch,
                label = { Text("Поиск по компании, домену, email") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(12.dp).testTag("ma_search"),
            )
            when {
                ui.loading -> LoadingState()
                ui.error != null -> ErrorState(ui.error!!, onRetry = vm::refresh)
                ui.items.isEmpty() -> EmptyState("В этой категории нет лидов")
                else -> LazyColumn(Modifier.fillMaxSize()) {
                    items(ui.items, key = { it.leadId }) { lead ->
                        LeadRow(lead, onClick = { onOpenLead(lead.leadId) })
                    }
                }
            }
        }
    }
}

@Composable
private fun LeadRow(lead: Lead, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp).testTag("lead_row_${lead.leadId}"),
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(lead.company ?: lead.leadId, style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(2.dp))
            Text(
                buildString {
                    append("Статус: ${OwnerLocalization.renderApprovalStatusRu(lead.status ?: lead.category)}")
                    if (lead.sendProof == "proven") append(" · доставка подтверждена")
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
            )
            val blk = OwnerLocalization.renderBlockerLinesRu(lead.blockingReasons, lead.status)
            if (blk.isNotEmpty()) {
                Text("⚠ ${blk.joinToString(", ")}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }
        }
    }
}
