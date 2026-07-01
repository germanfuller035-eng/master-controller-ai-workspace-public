package ru.dmitry.matercontroller.feature.agents

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

/**
 * Универсальный экран очереди (count + пояснение + строки, если есть богатый источник).
 * Используется для всех очередей, кроме «Ожидают отправки (проверка)», у которой свой экран
 * с реальными предложениями. Read-only, без действий отправки.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QueueDetailScreen(
    queueKey: String,
    onBack: () -> Unit,
    vm: QueueDetailViewModel = hiltViewModel(),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val kind = remember(queueKey) { QueueKind.fromKey(queueKey) }
    LaunchedEffect(queueKey) { vm.load(kind) }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text(ui.kind.titleRu) },
            navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.agents.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.agents.control.refresh")) { Text("Обновить") } },
        )
    }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().testTag("queue_${ui.kind.routeKey}")) {
            if (ui.offline) OfflineBanner(ui.cachedAt)
            when {
                ui.loading -> LoadingState()
                ui.error != null -> ErrorState(ui.error!!, onRetry = vm::refresh)
                else -> Column(Modifier.fillMaxSize().padding(16.dp)) {
                    Text("В очереди: ${ui.count}", style = MaterialTheme.typography.titleLarge)
                    Spacer(Modifier.height(6.dp))
                    Text(ui.kind.explanationRu, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.75f))
                    Spacer(Modifier.height(12.dp))
                    when {
                        ui.count == 0 -> EmptyState("В очереди «${ui.kind.titleRu}» нет записей")
                        ui.rows.isNotEmpty() -> LazyColumn(Modifier.fillMaxSize()) {
                            items(ui.rows, key = { it }) { row ->
                                val label = OwnerLocalization.companyFromLeadId(row) ?: row
                                Card(Modifier.fillMaxWidth().padding(vertical = 5.dp).testTag("queue_row_$row")) {
                                    Text(label, Modifier.padding(14.dp), style = MaterialTheme.typography.titleMedium)
                                }
                            }
                        }
                        else -> Text(
                            "Записи учтены в счётчике. Детальный список появится по мере наполнения источника.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
            }
        }
    }
}
