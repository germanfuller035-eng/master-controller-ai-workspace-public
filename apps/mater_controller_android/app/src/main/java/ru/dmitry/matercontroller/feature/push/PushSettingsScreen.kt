package ru.dmitry.matercontroller.feature.push

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import ru.dmitry.matercontroller.core.data.DataResult
import ru.dmitry.matercontroller.core.data.MaterRepository
import ru.dmitry.matercontroller.core.model.PushPrefs
import ru.dmitry.matercontroller.core.model.PushStatus
import ru.dmitry.matercontroller.core.ui.ErrorState
import ru.dmitry.matercontroller.core.ui.LoadingState
import ru.dmitry.matercontroller.core.ui.OfflineBanner
import javax.inject.Inject

/**
 * Push-уведомления (0.8.0). Owner-facing operational push status + preferences. Push delivery is
 * DISABLED by default server-side until a real Firebase credential is provisioned; this screen shows
 * the honest state (CREDENTIAL_REQUIRED / DISABLED_BY_CONFIG / LIVE) and lets the owner tune routing
 * preferences. It never sends client messages.
 */
data class PushUi(
    val loading: Boolean = true,
    val error: String? = null,
    val status: PushStatus? = null,
    val prefs: PushPrefs = PushPrefs(),
    val saving: Boolean = false,
    val offline: Boolean = false,
    val cachedAt: Long? = null,
)

@HiltViewModel
class PushViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(PushUi())
    val ui: StateFlow<PushUi> = _ui.asStateFlow()

    init { refresh() }

    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val st = repo.pushStatus()
            val pr = repo.pushPreferences()
            val status = (st as? DataResult.Success)?.data
            val prefs = (pr as? DataResult.Success)?.data?.prefs ?: PushPrefs()
            if (st is DataResult.Error && status == null) {
                _ui.update { it.copy(loading = false, error = st.message) }
                return@launch
            }
            _ui.update { it.copy(loading = false, status = status, prefs = prefs, offline = (st as? DataResult.Success)?.fromCache ?: false, cachedAt = (st as? DataResult.Success)?.cachedAt, error = null) }
        }
    }

    fun update(p: PushPrefs) {
        _ui.update { it.copy(prefs = p, saving = true) }
        viewModelScope.launch {
            when (repo.pushSetPreferences(p)) {
                is DataResult.Success -> _ui.update { it.copy(saving = false) }
                is DataResult.Error -> _ui.update { it.copy(saving = false) }
            }
        }
    }
}

@Composable
private fun stateColor(s: String?): Color = when (s) {
    "LIVE" -> MaterialTheme.colorScheme.primary
    "DISABLED_BY_CONFIG" -> MaterialTheme.colorScheme.tertiary
    else -> MaterialTheme.colorScheme.outline
}

private fun stateRu(s: String?): String = when (s) {
    "LIVE" -> "Активны"
    "DISABLED_BY_CONFIG" -> "Отключены настройкой"
    "CREDENTIAL_REQUIRED" -> "Требуются учётные данные Firebase"
    else -> "Неизвестно"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PushSettingsScreen(onBack: () -> Unit, vm: PushViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(topBar = {
        TopAppBar(
            title = { Text("Push-уведомления") },
            navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.push.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.push.control.refresh")) { Text("Обновить") } },
        )
    }) { pad ->
        when {
            ui.loading -> LoadingState(Modifier.padding(pad))
            ui.error != null && ui.status == null -> ErrorState(ui.error!!, onRetry = vm::refresh, modifier = Modifier.padding(pad))
            else -> {
                val s = ui.status
                Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).testTag("push_settings_screen")) {
                    if (ui.offline) OfflineBanner(ui.cachedAt)

                    // Delivery state
                    Card(Modifier.fillMaxWidth().padding(12.dp)) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("Состояние доставки", style = MaterialTheme.typography.labelMedium)
                            Text(stateRu(s?.delivery_state), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = stateColor(s?.delivery_state))
                            if (s?.delivery_state == "CREDENTIAL_REQUIRED") {
                                Text("Push выключен до настройки Firebase владельцем. Уведомления остаются в приложении.", style = MaterialTheme.typography.bodySmall)
                            }
                            Text("Зарегистрировано устройств: ${s?.registered_tokens ?: 0}", style = MaterialTheme.typography.bodySmall)
                            Text("Доставок: ${s?.deliveries_live ?: 0} активных · ${s?.deliveries_suppressed ?: 0} подавлено", style = MaterialTheme.typography.bodySmall)
                            AssistChip(onClick = {}, enabled = false, label = { Text("Только служебные уведомления") }, modifier = Modifier.padding(top = 4.dp))
                        }
                    }

                    // Preferences
                    SectionTitle("Предпочтения")
                    val p = ui.prefs
                    SwitchRow("Получать push", p.enabled, tag = "push_switch_enabled") { vm.update(p.copy(enabled = it)) }
                    SwitchRow("Решения владельца", p.decisions, enabled = p.enabled, tag = "push_switch_decisions") { vm.update(p.copy(decisions = it)) }
                    SwitchRow("Инциденты", p.incidents, enabled = p.enabled, tag = "push_switch_incidents") { vm.update(p.copy(incidents = it)) }
                    SwitchRow("Ежедневная сводка", p.daily_brief, enabled = p.enabled, tag = "push_switch_daily_brief") { vm.update(p.copy(daily_brief = it)) }

                    SectionTitle("Минимальная важность")
                    Row(Modifier.padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("P0", "P1", "P2").forEach { sev ->
                            FilterChip(selected = p.min_severity == sev, onClick = { vm.update(p.copy(min_severity = sev)) }, label = { Text(sevRu(sev)) }, enabled = p.enabled, modifier = Modifier.testTag("push_severity_$sev"))
                        }
                    }
                    if (ui.saving) Text("Сохранение…", Modifier.padding(16.dp), style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(24.dp))
                }
            }
        }
    }
}

private fun sevRu(s: String): String = when (s) { "P0" -> "Критично"; "P1" -> "Важно"; "P2" -> "Инфо"; else -> s }

@Composable
private fun SwitchRow(label: String, checked: Boolean, enabled: Boolean = true, tag: String? = null, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
        Switch(checked = checked, onCheckedChange = onChange, enabled = enabled, modifier = if (tag != null) Modifier.testTag(tag) else Modifier)
    }
}

@Composable
private fun SectionTitle(t: String) {
    Text(t, Modifier.padding(start = 16.dp, top = 16.dp, bottom = 4.dp), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
}
