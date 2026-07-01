package ru.dmitry.matercontroller.feature.pipeline

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
import ru.dmitry.matercontroller.core.model.PipelineLead
import ru.dmitry.matercontroller.core.ui.EmptyState
import ru.dmitry.matercontroller.core.ui.ErrorState
import ru.dmitry.matercontroller.core.ui.LoadingState
import ru.dmitry.matercontroller.core.ui.OfflineBanner
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import ru.dmitry.matercontroller.core.ui.OwnerSafetyInvariant
import ru.dmitry.matercontroller.core.ui.OwnerStatusTone
import ru.dmitry.matercontroller.core.ui.SafetyInvariantPanel

/**
 * Per-queue pipeline list. Renders loading / error / empty / stale (offline banner) / content
 * states. Read-only: rows are not tappable into any mutation and there is no send/approve action.
 * score_v2 (candidate_score) and score_v1 (canonical score) are shown as separate, labelled values.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PipelineQueueScreen(
    queueKey: String,
    onBack: () -> Unit,
    vm: PipelineQueueViewModel = hiltViewModel(),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val queue = remember(queueKey) { PipelineQueue.fromKey(queueKey) }
    LaunchedEffect(queueKey) { vm.load(queue) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(ui.queue.title) },
                navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.pipeline.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
                actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.pipeline.control.refresh")) { Text("Обновить") } },
            )
        },
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().testTag("pipeline_queue_${ui.queue.status}")) {
            if (ui.offline) OfflineBanner(ui.cachedAt)
            when {
                ui.loading -> LoadingState()
                ui.error != null -> ErrorState(ui.error!!, onRetry = vm::refresh)
                ui.items.isEmpty() -> {
                    PipelineNoSendHeader(ui.queue)
                    EmptyState(
                        "В очереди «${ui.queue.title}» нет лидов",
                        nextAction = "Это не успех отправки. Это означает, что текущий список только для просмотра пуст или данные ещё не пришли.",
                    )
                }
                else -> LazyColumn(Modifier.fillMaxSize().padding(top = 4.dp)) {
                    item { PipelineNoSendHeader(ui.queue) }
                    items(ui.items, key = { it.lead_id ?: it.hashCode().toString() }) { lead ->
                        PipelineLeadRow(lead)
                    }
                }
            }
        }
    }
}

@Composable
private fun PipelineNoSendHeader(queue: PipelineQueue) {
    SafetyInvariantPanel(
        title = "Очередь: ${queue.title}",
        subtitle = "Строки ниже показывают готовность и приоритет. Никаких сообщений клиентам отсюда не уходит.",
        items = listOf(
            OwnerSafetyInvariant("Реальная отправка", "OFF", OwnerStatusTone.NoSend, "Только просмотр и подготовка будущего решения владельца."),
            OwnerSafetyInvariant("Подтверждение владельца", "обязательно", OwnerStatusTone.Attention, "Перед будущей отправкой нужен отдельный gate и подтверждение."),
            OwnerSafetyInvariant("Запись в рабочую базу", "ВЫКЛ", OwnerStatusTone.Safe, "Эта очередь читает снимок воронки и не меняет рабочую базу."),
        ),
        modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
        tag = "pipeline_no_send_header",
    )
}

@Composable
private fun PipelineLeadRow(lead: PipelineLead) {
    val id = lead.lead_id ?: "—"
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp).testTag("pipeline_row_$id"),
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(lead.company ?: id, style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(2.dp))
            Text(
                buildString {
                    append("Статус: ${OwnerLocalization.renderLeadStatusRu(lead.status)}")
                    if (OwnerLocalization.hasValue(lead.website_status)) append(" · сайт: проверен")
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
            )
            Spacer(Modifier.height(4.dp))
            // Предварительная (score_v2) и каноническая (score_v1) оценки — раздельно, скрыты при отсутствии.
            if (lead.candidateScoreV2 != null || lead.canonicalScoreV1 != null) {
                Row {
                    lead.candidateScoreV2?.let {
                        Text(
                            "Предварительная оценка: $it",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.testTag("pipeline_score_v2_$id"),
                        )
                        Spacer(Modifier.width(16.dp))
                    }
                    lead.canonicalScoreV1?.let {
                        Text(
                            "Каноническая оценка: ${String.format("%.0f", it)}",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.secondary,
                            modifier = Modifier.testTag("pipeline_score_v1_$id"),
                        )
                    }
                }
            }
            OwnerLocalization.renderRouteRu(lead.lead_route)?.let {
                Spacer(Modifier.height(2.dp))
                Text("Маршрут: $it", style = MaterialTheme.typography.bodySmall)
            }
            Spacer(Modifier.height(4.dp))
            Text(
                "Следующий шаг: ручная проверка владельцем. Отправка и оплата не выполняются.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}
