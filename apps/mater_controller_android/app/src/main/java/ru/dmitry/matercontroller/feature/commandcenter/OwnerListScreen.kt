package ru.dmitry.matercontroller.feature.commandcenter

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import ru.dmitry.matercontroller.core.data.DataResult
import ru.dmitry.matercontroller.core.data.MaterRepository
import ru.dmitry.matercontroller.core.model.IncidentDto
import ru.dmitry.matercontroller.core.model.OwnerDecisionDto
import ru.dmitry.matercontroller.core.ui.EmptyState
import ru.dmitry.matercontroller.core.ui.ErrorState
import ru.dmitry.matercontroller.core.ui.LoadingState
import ru.dmitry.matercontroller.core.ui.OfflineBanner
import ru.dmitry.matercontroller.core.ui.OwnerStatusChip
import ru.dmitry.matercontroller.core.ui.OwnerStatusTone
import ru.dmitry.matercontroller.core.ui.PilotSafetyChips
import javax.inject.Inject

data class OwnerListUi(
    val loading: Boolean = true,
    val error: String? = null,
    val decisions: List<OwnerDecisionDto> = emptyList(),
    val incidents: List<IncidentDto> = emptyList(),
    val offline: Boolean = false,
    val cachedAt: Long? = null,
    val acking: String? = null,
    val actionNote: String? = null,
)

@HiltViewModel
class OwnerListViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(OwnerListUi())
    val ui: StateFlow<OwnerListUi> = _ui.asStateFlow()
    fun load(kind: String) {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            if (kind == "incidents") {
                when (val r = repo.ownerIncidents()) {
                    is DataResult.Success -> _ui.update { it.copy(loading = false, incidents = r.data.items, offline = r.fromCache, cachedAt = r.cachedAt) }
                    is DataResult.Error -> _ui.update { it.copy(loading = false, error = r.message) }
                }
            } else {
                when (val r = repo.ownerDecisions()) {
                    is DataResult.Success -> _ui.update { it.copy(loading = false, decisions = r.data.items, offline = r.fromCache, cachedAt = r.cachedAt) }
                    is DataResult.Error -> _ui.update { it.copy(loading = false, error = r.message) }
                }
            }
        }
    }

    /** Acknowledge an incident, then RE-READ from the server so the UI reflects confirmed state. */
    fun acknowledge(incidentId: String) {
        _ui.update { it.copy(acking = incidentId, actionNote = null) }
        viewModelScope.launch {
            when (repo.acknowledgeIncident(incidentId)) {
                is DataResult.Success -> {
                    // server reread → UI shows the real post-write state
                    when (val r = repo.ownerIncidents()) {
                        is DataResult.Success -> _ui.update { it.copy(acking = null, incidents = r.data.items, actionNote = "Инцидент подтверждён") }
                        is DataResult.Error -> _ui.update { it.copy(acking = null, actionNote = "Подтверждено; обновите список") }
                    }
                }
                is DataResult.Error -> _ui.update { it.copy(acking = null, actionNote = "Не удалось подтвердить") }
            }
        }
    }
}

private fun sevRu(s: String?): String = when ((s ?: "").uppercase()) {
    "P0" -> "Критично"; "P1" -> "Важно"; "P2" -> "Инфо"; else -> ""
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OwnerListScreen(kind: String, vm: OwnerListViewModel = hiltViewModel()) {
    LaunchedEffect(kind) { vm.load(kind) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    val title = if (kind == "incidents") "Инциденты" else "Решения"
    Scaffold(topBar = { TopAppBar(title = { Text(title) }) }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().testTag("owner_list_$kind")) {
            if (ui.offline) OfflineBanner(ui.cachedAt)
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (kind == "incidents") {
                    Text(title, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.testTag("pilot_incidents"))
                } else {
                    Text(title, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.testTag("pilot_owner_decisions"))
                }
                Text(
                    if (kind == "incidents") "Критические события, стоп-контекст и история. Нет ложного зелёного статуса."
                    else "Очередь решений владельца с ручным контролем одобрения, отклонения и переноса.",
                    style = MaterialTheme.typography.bodySmall,
                )
                if (kind == "incidents") {
                    PilotSafetyChips(tag = "pilot_incidents_safety_chips")
                } else {
                    PilotSafetyChips(tag = "pilot_owner_decisions_safety_chips")
                }
            }
            ui.actionNote?.let { Text(it, Modifier.padding(horizontal = 16.dp, vertical = 4.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary) }
            when {
                ui.loading -> LoadingState()
                ui.error != null -> ErrorState(ui.error!!, onRetry = { vm.load(kind) })
                kind == "incidents" && ui.incidents.isEmpty() -> EmptyState(
                    "Инцидентов нет",
                    nextAction = "По текущим данным открытых строк инцидентов нет. Это не включает новые внешние действия и не скрывает риски отключённых интеграций.",
                )
                kind != "incidents" && ui.decisions.isEmpty() -> EmptyState(
                    "Решений не требуется",
                    nextAction = "Если появится решение R4/R5, владелец должен подтвердить его до любой будущей отправки или платежа.",
                )
                kind == "incidents" -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OwnerStatusChip("Инциденты", OwnerStatusTone.Attention)
                            OwnerStatusChip("Отправка ВЫКЛ", OwnerStatusTone.NoSend)
                        }
                    }
                    items(ui.incidents, key = { it.incident_id }) { i ->
                        Card(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(12.dp)) {
                                Text("[${sevRu(i.severity)}] ${i.title_ru ?: "—"}", style = MaterialTheme.typography.bodyLarge)
                                if (i.summary_ru != null) Text(i.summary_ru!!, style = MaterialTheme.typography.bodySmall)
                                Text("Событий: ${i.event_count} · ${i.state ?: ""}", style = MaterialTheme.typography.labelSmall)
                                val acked = (i.state ?: "").uppercase() == "ACKNOWLEDGED"
                                TextButton(
                                    onClick = { vm.acknowledge(i.incident_id) },
                                    enabled = !acked && ui.acking == null,
                                    modifier = Modifier.testTag("incident_ack_${i.incident_id}"),
                                ) { Text(if (acked) "Подтверждён" else if (ui.acking == i.incident_id) "Подтверждаю…" else "Подтвердить") }
                            }
                        }
                    }
                }
                else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OwnerStatusChip("Контроль владельца", OwnerStatusTone.Attention)
                            OwnerStatusChip("Отправка ВЫКЛ", OwnerStatusTone.NoSend)
                        }
                    }
                    items(ui.decisions, key = { it.decision_id }) { d ->
                        Card(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(12.dp)) {
                                Text("[${sevRu(d.priority)}] ${d.title_ru ?: "—"}", style = MaterialTheme.typography.bodyLarge)
                                if (d.consequence_ru != null) Text(d.consequence_ru!!, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
        }
    }
}
