package ru.dmitry.matercontroller.feature.reliability

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
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
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import ru.dmitry.matercontroller.core.data.DataResult
import ru.dmitry.matercontroller.core.data.MaterRepository
import ru.dmitry.matercontroller.core.model.ReliabilityOverview
import ru.dmitry.matercontroller.core.ui.ErrorState
import ru.dmitry.matercontroller.core.ui.LoadingState
import ru.dmitry.matercontroller.core.ui.OfflineBanner
import ru.dmitry.matercontroller.core.ui.PilotSafetyChips
import javax.inject.Inject

/**
 * Reliability Center (0.8.0). Read-only owner view of system health: services,
 * job queue + dead letters, ingest health, active incidents, recorded recovery
 * actions, and degraded states. Never sends; outbound stays blocked server-side.
 */
data class ReliabilityUi(
    val loading: Boolean = true,
    val error: String? = null,
    val data: ReliabilityOverview? = null,
    val offline: Boolean = false,
    val cachedAt: Long? = null,
    val autopilotMode: String? = null,
    val autopilotBusy: Boolean = false,
    val actionNote: String? = null,
)

@HiltViewModel
class ReliabilityViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(ReliabilityUi())
    val ui: StateFlow<ReliabilityUi> = _ui.asStateFlow()

    init { refresh() }

    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = repo.reliabilityOverview()) {
                is DataResult.Success -> _ui.update { it.copy(loading = false, data = r.data, offline = r.fromCache, cachedAt = r.cachedAt, error = null) }
                is DataResult.Error -> _ui.update { it.copy(loading = false, error = r.message) }
            }
            // pull current autopilot mode for the switch
            (repo.ownerAutopilot() as? DataResult.Success)?.let { _ui.update { s -> s.copy(autopilotMode = it.data.mode) } }
        }
    }

    /** Switch autopilot mode, then RE-READ from the server so the UI shows confirmed state. */
    fun setAutopilot(mode: String) {
        _ui.update { it.copy(autopilotBusy = true, actionNote = null) }
        viewModelScope.launch {
            when (repo.setAutopilotMode(mode)) {
                is DataResult.Success -> {
                    val rr = repo.ownerAutopilot()
                    val confirmed = (rr as? DataResult.Success)?.data?.mode
                    _ui.update { it.copy(autopilotBusy = false, autopilotMode = confirmed ?: mode, actionNote = if (confirmed == mode) "Режим подтверждён: $mode" else "Режим обновлён") }
                }
                is DataResult.Error -> _ui.update { it.copy(autopilotBusy = false, actionNote = "Не удалось сменить режим") }
            }
        }
    }
}

// A field that is either a number or the string "UNKNOWN" — render honestly.
private fun JsonElement?.numOrUnknown(): String {
    val p = this as? JsonPrimitive ?: return "—"
    return if (p.isString) (if (p.content == "UNKNOWN") "неизвестно" else p.content) else p.content
}

private fun healthRu(level: String?): String = when ((level ?: "").uppercase()) {
    "HEALTHY" -> "Штатно"; "DEGRADED" -> "Ограничения"; "DOWN" -> "Сбой"; "UNKNOWN" -> "Неизвестно"; else -> "—"
}

private fun serviceNameRu(nameRu: String?, key: String?): String {
    val normalized = (key ?: nameRu ?: "").lowercase()
    return when {
        normalized == "api" -> "Связь с сервером"
        normalized == "db" || "database" in normalized -> "Рабочее хранилище"
        "sync" in normalized -> "Синхронизация"
        "queue" in normalized -> "Очередь задач"
        else -> nameRu?.takeIf { it.isNotBlank() } ?: key ?: "—"
    }
}

@Composable
private fun healthColor(level: String?): Color = when ((level ?: "").uppercase()) {
    "HEALTHY" -> MaterialTheme.colorScheme.primary
    "DEGRADED" -> MaterialTheme.colorScheme.tertiary
    "DOWN" -> MaterialTheme.colorScheme.error
    else -> MaterialTheme.colorScheme.outline
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReliabilityScreen(vm: ReliabilityViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(topBar = { TopAppBar(title = { Text("Надёжность") }) }) { pad ->
        Column(
            Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).testTag("reliability_screen"),
        ) {
            if (ui.offline) OfflineBanner(ui.cachedAt)
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Надёжность", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.testTag("pilot_reliability"))
                Text("Связь с сервером, очередь, телефон, синхронизация, хранилище и последняя проверка. Нет ложного зелёного статуса, если живых данных нет.", style = MaterialTheme.typography.bodySmall)
                PilotSafetyChips(tag = "pilot_reliability_safety_chips")
            }
            when {
                ui.loading -> LoadingState()
                ui.error != null && ui.data == null -> ErrorState(ui.error!!, onRetry = vm::refresh)
                ui.data == null -> Box(Modifier.fillMaxSize().padding(32.dp)) { Text("Нет данных") }
                else -> {
                    val d = ui.data!!
                    // Overall verdict
                    Card(Modifier.fillMaxWidth().padding(12.dp)) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("Общее состояние", style = MaterialTheme.typography.labelMedium)
                            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(d.state_ru ?: healthRu(d.overall_health), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = healthColor(d.overall_health))
                            }
                            AssistChip(onClick = {}, enabled = false, label = { Text(d.outbound_ru ?: "Исходящие отключены") }, modifier = Modifier.padding(top = 4.dp))
                        }
                    }

                    // Automation mode switch (owner write -> server reread). LIMITED_AUTOMATION is owner-only blocked server-side.
                    Card(Modifier.fillMaxWidth().padding(horizontal = 12.dp).testTag("autopilot_card")) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("Режим ручной автоматизации", style = MaterialTheme.typography.labelMedium)
                            Text("Текущий: ${autopilotModeLabel(ui.autopilotMode)}", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                listOf("OBSERVE", "PREPARE", "MANAGED").forEach { m ->
                                    FilterChip(
                                        selected = ui.autopilotMode == m,
                                        onClick = { vm.setAutopilot(m) },
                                        enabled = !ui.autopilotBusy,
                                        label = { Text(autopilotModeLabel(m)) },
                                        modifier = Modifier.testTag("autopilot_$m"),
                                    )
                                }
                            }
                            ui.actionNote?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary) }
                        }
                    }

                    // Services
                    if (d.services.isNotEmpty()) {
                        SectionTitle("Сервисы")
                        d.services.forEach { s ->
                            ListItem(
                                headlineContent = { Text(serviceNameRu(s.name_ru, s.key)) },
                                supportingContent = { Text(s.reason_ru ?: "") },
                                trailingContent = { Text(healthRu(s.level), color = healthColor(s.level), fontWeight = FontWeight.Medium) },
                                modifier = Modifier.testTag("reliability_service_${s.key}"),
                            )
                        }
                    }

                    // Queue / dead letters
                    d.queue?.let { q ->
                        SectionTitle("Очередь задач")
                        Card(Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
                            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(q.reason_ru ?: "—", color = healthColor(q.level), fontWeight = FontWeight.Medium)
                                Text("В очереди: ${q.queued.numOrUnknown()} · Выполняется: ${q.running.numOrUnknown()}", style = MaterialTheme.typography.bodySmall)
                                Text("Повторы: ${q.retry.numOrUnknown()} · Не обработано: ${q.dead_letter.numOrUnknown()}", style = MaterialTheme.typography.bodySmall)
                                if (q.dead_letter_sample.isNotEmpty()) {
                                    Divider(Modifier.padding(vertical = 4.dp))
                                    Text("Необработанные задачи", style = MaterialTheme.typography.labelSmall)
                                    q.dead_letter_sample.forEach { j ->
                                        Text("• ${j.job_type ?: j.job_id ?: "—"} (${j.last_error_code ?: "—"})", style = MaterialTheme.typography.bodySmall)
                                    }
                                }
                            }
                        }
                    }

                    // Ingest health
                    d.ingest?.let { ing ->
                        SectionTitle("Источники и каналы")
                        ing.sources?.let { s ->
                            ListItem(
                                headlineContent = { Text("Источники") },
                                supportingContent = { Text(s.reason_ru ?: (if (s.available) "" else "нет данных")) },
                                trailingContent = { Text(healthRu(s.level), color = healthColor(s.level)) },
                            )
                        }
                        ing.channels?.let { c ->
                            ListItem(
                                headlineContent = { Text("Каналы") },
                                supportingContent = { Text(c.reason_ru ?: (if (c.available) "" else "нет данных")) },
                                trailingContent = { Text(healthRu(c.level), color = healthColor(c.level)) },
                            )
                        }
                    }

                    // Active incidents
                    d.incidents?.let { inc ->
                        SectionTitle("Инциденты" + if (inc.active > 0) " (${inc.active})" else "")
                        if (inc.items.isEmpty()) {
                            Text("Активных инцидентов нет", Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.bodyMedium)
                        } else {
                            inc.items.forEach { i ->
                                Card(
                                    Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
                                    colors = if (i.severity == "P0") CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer) else CardDefaults.cardColors(),
                                ) {
                                    Column(Modifier.padding(12.dp)) {
                                        Text(i.title_ru ?: "—", style = MaterialTheme.typography.bodyLarge)
                                        Text("Событий: ${i.event_count} · ${i.state ?: ""}", style = MaterialTheme.typography.labelSmall)
                                    }
                                }
                            }
                        }
                    }

                    // Recovery actions (recorded; system did this automatically)
                    d.recovery_actions?.let { rec ->
                        if (rec.total_recorded > 0) {
                            SectionTitle("Исправлено автоматически")
                            Text("Восстановлено: ${rec.recovered} · В процессе: ${rec.pending} · Ошибки: ${rec.failed}", Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.bodySmall)
                            rec.items.take(10).forEach { a ->
                                ListItem(
                                    headlineContent = { Text(a.playbook ?: "—") },
                                    supportingContent = { Text(a.trigger ?: "") },
                                    trailingContent = { Text(a.result ?: "") },
                                )
                            }
                        }
                    }

                    // Degraded states summary
                    if (d.degraded_states.isNotEmpty()) {
                        SectionTitle("Что требует внимания")
                        d.degraded_states.forEach { g ->
                            Text("• ${g.reason_ru ?: g.subsystem ?: "—"} (${healthRu(g.level)})", Modifier.padding(horizontal = 16.dp, vertical = 2.dp), style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                    Spacer(Modifier.height(24.dp))
                }
            }
        }
    }
}

private fun autopilotModeLabel(value: String?): String = when (value) {
    "OBSERVE" -> "Наблюдать"
    "PREPARE" -> "Готовить"
    "MANAGED" -> "Под контролем"
    null, "" -> "нет данных"
    else -> "требует сверки"
}

@Composable
private fun SectionTitle(t: String) {
    Text(t, Modifier.padding(start = 16.dp, top = 16.dp, bottom = 4.dp), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
}
