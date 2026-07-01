package ru.dmitry.matercontroller.feature.backup

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
import ru.dmitry.matercontroller.core.model.BackupStatus
import ru.dmitry.matercontroller.core.model.RestoreDrillAll
import ru.dmitry.matercontroller.core.ui.ErrorState
import ru.dmitry.matercontroller.core.ui.LoadingState
import ru.dmitry.matercontroller.core.ui.OfflineBanner
import javax.inject.Inject

/**
 * Backup & Recovery Center (0.8.0). Read-only owner view: protected-data inventory,
 * backup freshness, and a NON-DESTRUCTIVE restore drill that proves snapshots are
 * restorable without ever touching live files. Rollback is owner-executed manually
 * (not from the app). Never sends, never restores live.
 */
data class BackupUi(
    val loading: Boolean = true,
    val error: String? = null,
    val status: BackupStatus? = null,
    val drill: RestoreDrillAll? = null,
    val drillRunning: Boolean = false,
    val offline: Boolean = false,
    val cachedAt: Long? = null,
)

@HiltViewModel
class BackupViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(BackupUi())
    val ui: StateFlow<BackupUi> = _ui.asStateFlow()

    init { refresh() }

    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = repo.backupStatus()) {
                is DataResult.Success -> _ui.update { it.copy(loading = false, status = r.data, offline = r.fromCache, cachedAt = r.cachedAt, error = null) }
                is DataResult.Error -> _ui.update { it.copy(loading = false, error = r.message) }
            }
        }
    }

    fun runDrill() {
        _ui.update { it.copy(drillRunning = true) }
        viewModelScope.launch {
            when (val r = repo.restoreDrill()) {
                is DataResult.Success -> _ui.update { it.copy(drillRunning = false, drill = r.data) }
                is DataResult.Error -> _ui.update { it.copy(drillRunning = false, error = r.message) }
            }
        }
    }
}

@Composable
private fun freshColor(hasBackup: Boolean, ageHours: Double?): Color = when {
    !hasBackup -> MaterialTheme.colorScheme.error
    ageHours != null && ageHours > 48 -> MaterialTheme.colorScheme.tertiary
    else -> MaterialTheme.colorScheme.primary
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BackupCenterScreen(onBack: () -> Unit, vm: BackupViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(topBar = {
        TopAppBar(
            title = { Text("Резервные копии") },
            navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.backup.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.backup.control.refresh")) { Text("Обновить") } },
        )
    }) { pad ->
        when {
            ui.loading -> LoadingState(Modifier.padding(pad))
            ui.error != null && ui.status == null -> ErrorState(ui.error!!, onRetry = vm::refresh, modifier = Modifier.padding(pad))
            ui.status == null -> Box(Modifier.padding(pad).fillMaxSize().padding(32.dp)) { Text("Нет данных") }
            else -> {
                val s = ui.status!!
                Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).testTag("backup_center_screen")) {
                    if (ui.offline) OfflineBanner(ui.cachedAt)

                    // Summary card
                    Card(Modifier.fillMaxWidth().padding(12.dp)) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("Защита данных", style = MaterialTheme.typography.labelMedium)
                            Text("Под защитой наборов: ${s.total_protected}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                            Text("Критичных с копией: ${s.critical_with_backup} из ${s.critical_total}", style = MaterialTheme.typography.bodyMedium)
                            if (s.critical_missing_backup.isNotEmpty()) {
                                Text("Без копии: ${s.critical_missing_backup.joinToString(", ")}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                            }
                            AssistChip(onClick = {}, enabled = false, label = { Text("Только чтение · откат вручную") }, modifier = Modifier.padding(top = 4.dp))
                        }
                    }

                    // Restore drill (non-destructive)
                    SectionTitle("Проверка восстановления")
                    Text(
                        "Неразрушающая проверка: копия читается во временный файл и проверяется. Живые данные не изменяются.",
                        Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary,
                    )
                    Button(onClick = vm::runDrill, enabled = !ui.drillRunning, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp).testTag("backup_run_drill")) {
                        Text(if (ui.drillRunning) "Проверка…" else "Проверить восстановление")
                    }
                    ui.drill?.let { dr ->
                        Card(Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
                            Column(Modifier.padding(12.dp)) {
                                Text("Восстановимо: ${dr.restorable} из ${dr.checked}" + if (dr.skipped.isNotEmpty()) " · пропущено: ${dr.skipped.size}" else "", fontWeight = FontWeight.Medium)
                                Text(if (dr.all_critical_restorable) "Все критичные наборы восстановимы" else "Не все критичные наборы восстановимы", color = if (dr.all_critical_restorable) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
                                Text("Живые данные затронуты: ${if (dr.live_touched) "да" else "нет"}", style = MaterialTheme.typography.bodySmall)
                                if (dr.not_restorable.isNotEmpty()) Text("Проблемные: ${dr.not_restorable.joinToString(", ")}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                            }
                        }
                    }

                    // Inventory
                    SectionTitle("Наборы данных")
                    s.items.forEach { it2 ->
                        ListItem(
                            headlineContent = { Text((it2.name_ru ?: it2.key ?: "—") + if (it2.critical) " ★" else "") },
                            supportingContent = {
                                val age = it2.latest_age_hours
                                Text(
                                    when {
                                        !it2.live_exists -> "Файл отсутствует"
                                        !it2.has_backup -> "Нет резервной копии"
                                        age != null -> "Копий: ${it2.snapshot_count} · свежесть: ${age} ч"
                                        else -> "Копий: ${it2.snapshot_count}"
                                    },
                                )
                            },
                            trailingContent = {
                                Text(
                                    if (it2.has_backup) "есть" else "нет",
                                    color = freshColor(it2.has_backup, it2.latest_age_hours),
                                    fontWeight = FontWeight.Medium,
                                )
                            },
                            modifier = Modifier.testTag("backup_item_${it2.key}"),
                        )
                    }
                    Spacer(Modifier.height(24.dp))
                }
            }
        }
    }
}

@Composable
private fun SectionTitle(t: String) {
    Text(t, Modifier.padding(start = 16.dp, top = 16.dp, bottom = 4.dp), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
}
