package ru.dmitry.matercontroller.feature.approvals

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
import ru.dmitry.matercontroller.core.ui.EmptyState
import ru.dmitry.matercontroller.core.ui.ErrorState
import ru.dmitry.matercontroller.core.ui.LoadingState
import ru.dmitry.matercontroller.core.ui.OfflineBanner
import ru.dmitry.matercontroller.core.ui.OwnerLocalization

/** Approval queue list. Loading / error / empty / stale / content. Read + open-detail only. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ApprovalListScreen(
    queueKey: String,
    onOpenItem: (queue: String, id: String) -> Unit,
    onBack: () -> Unit,
    vm: ApprovalListViewModel = hiltViewModel(),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val queue = remember(queueKey) { ApprovalQueue.fromKey(queueKey) }
    LaunchedEffect(queueKey) { vm.load(queue) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(ui.queue.title) },
                navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.approvals.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
                actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.approvals.control.refresh")) { Text("Обновить") } },
            )
        },
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().testTag("approval_list_${ui.queue.key}")) {
            if (ui.offline) OfflineBanner(ui.cachedAt)
            when {
                ui.loading -> LoadingState()
                ui.error != null -> ErrorState(ui.error!!, onRetry = vm::refresh)
                ui.isEmpty -> EmptyState("В очереди «${ui.queue.title}» пусто")
                else -> LazyColumn(Modifier.fillMaxSize().padding(top = 4.dp)) {
                    items(ui.pipelineItems, key = { "p_" + (it.lead_id ?: it.hashCode().toString()) }) { lead ->
                        val id = lead.lead_id ?: return@items
                        ApprovalRow(
                            title = lead.company ?: id,
                            subtitle = buildString {
                                append(OwnerLocalization.renderApprovalStatusRu(lead.status))
                                if (!lead.email_status.isNullOrBlank()) append(" · email: проверен")
                            },
                            scoreV2 = lead.candidateScoreV2?.toString(),
                            scoreV1 = lead.canonicalScoreV1?.let { String.format("%.0f", it) },
                            tag = "approval_row_$id",
                            onClick = { onOpenItem(ui.queue.key, id) },
                        )
                    }
                    items(ui.leadItems, key = { "l_" + it.leadId }) { lead ->
                        ApprovalRow(
                            title = lead.company ?: lead.leadId,
                            subtitle = buildString {
                                append(OwnerLocalization.renderApprovalStatusRu(lead.status ?: lead.category))
                                if (lead.followupSubject != null) append(" · ${lead.followupSubject}")
                            },
                            scoreV1 = lead.score?.overallPriorityScore?.let { String.format("%.0f", it) },
                            tag = "approval_row_${lead.leadId}",
                            onClick = { onOpenItem(ui.queue.key, lead.leadId) },
                        )
                    }
                    items(ui.replyItems, key = { "r_" + it.replyId }) { reply ->
                        ApprovalRow(
                            title = reply.company ?: reply.from ?: reply.replyId,
                            subtitle = buildString {
                                append(OwnerLocalization.renderReplyClassRu(reply.category ?: reply.status))
                                if (!reply.subject.isNullOrBlank()) append(" · ${reply.subject}")
                            },
                            tag = "approval_row_${reply.replyId}",
                            onClick = { reply.leadId?.let { onOpenItem(ui.queue.key, it) } },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ApprovalRow(
    title: String,
    subtitle: String,
    scoreV2: String? = null,
    scoreV1: String? = null,
    tag: String,
    onClick: () -> Unit,
) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp).testTag(tag)) {
        Column(Modifier.padding(14.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(2.dp))
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
            if (scoreV2 != null || scoreV1 != null) {
                Spacer(Modifier.height(4.dp))
                Row {
                    if (scoreV2 != null) { Text("Предварительная оценка: $scoreV2", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary); Spacer(Modifier.width(16.dp)) }
                    if (scoreV1 != null) Text("Каноническая оценка: $scoreV1", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.secondary)
                }
            }
        }
    }
}
