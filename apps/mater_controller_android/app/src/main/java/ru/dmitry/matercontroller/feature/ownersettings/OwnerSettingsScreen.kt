package ru.dmitry.matercontroller.feature.ownersettings

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ru.dmitry.matercontroller.core.ui.ErrorState
import ru.dmitry.matercontroller.core.ui.LoadingState
import ru.dmitry.matercontroller.core.ui.OfflineBanner
import ru.dmitry.matercontroller.core.ui.OwnerLocalization

/**
 * «Лимиты и автоматизация» (RC5 defect F). Owner automation/limits controls.
 *
 * Read-only when offline (editing disabled, current values flagged cached). Each numeric field has a
 * slider + an exact number field bounded by [0, hard_limit]. Source strategy defaults to FREE_ONLY;
 * a paid strategy needs explicit confirmation. Save shows a diff (current → new + forecast) first,
 * then POSTs with expectedRevision + idempotencyKey; success only after a confirmed 2xx + re-read.
 */
@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun OwnerSettingsScreen(onBack: () -> Unit, vm: OwnerSettingsViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(topBar = {
        TopAppBar(title = { Text("Лимиты и автоматизация") },
            navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.ownersettings.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.ownersettings.control.refresh")) { Text("Обновить") } })
    }) { pad ->
        when {
            ui.loading -> LoadingState(Modifier.padding(pad))
            ui.error != null && ui.settings == null -> ErrorState(ui.error!!, onRetry = vm::refresh, modifier = Modifier.padding(pad))
            else -> Column(Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()).testTag("owner_settings")) {
                if (ui.offline) {
                    OfflineBanner(ui.cachedAt)
                    Spacer(Modifier.height(4.dp))
                    Text("Текущие лимиты показаны из сохранённых данных. Изменение недоступно без соединения.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                    Spacer(Modifier.height(8.dp))
                }

                // ---- save outcome banner (only after a confirmed response) ----
                ui.saveMessage?.let { msg ->
                    val container = when (ui.saveState) {
                        SaveState.SUCCESS -> MaterialTheme.colorScheme.secondaryContainer
                        SaveState.CONFLICT -> MaterialTheme.colorScheme.tertiaryContainer
                        else -> MaterialTheme.colorScheme.errorContainer
                    }
                    Surface(color = container, shape = MaterialTheme.shapes.medium, modifier = Modifier.fillMaxWidth().testTag("settings_save_outcome")) {
                        Row(Modifier.padding(12.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                            Text(msg, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                            TextButton(onClick = vm::clearSaveOutcome) { Text("Скрыть") }
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }

                // ---- profile ----
                Text("Профиль", style = MaterialTheme.typography.titleMedium)
                val profiles = ui.settings?.profiles_available?.ifEmpty { null }
                    ?: listOf("economy", "balanced", "active", "custom")
                // RC6 (defect F): adaptive wrapping so the 4-й «Пользовательский» профиль не обрезается
                // на узких экранах (FlowRow переносит чипы на следующую строку).
                FlowRow(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    profiles.forEach { code ->
                        val selected = ui.draftProfile.equals(code, ignoreCase = true)
                        FilterChip(
                            selected = selected,
                            onClick = { if (ui.editable) vm.setProfile(code) },
                            enabled = ui.editable,
                            label = { Text(OwnerLocalization.renderProfileRu(code)) },
                            modifier = Modifier.testTag("profile_$code"),
                        )
                    }
                }

                // ---- numeric fields: slider + exact number ----
                Spacer(Modifier.height(12.dp))
                Text("Числовые лимиты", style = MaterialTheme.typography.titleMedium)
                SettingsNumericField.entries.forEach { field ->
                    NumericRow(
                        label = OwnerLocalization.renderSettingsFieldRu(field.wire),
                        value = ui.currentValue(field),
                        serverValue = field.serverValue(ui.settings),
                        hardLimit = ui.hardLimit(field),
                        enabled = ui.editable,
                        tag = field.wire,
                        onChange = { vm.setNumeric(field, it) },
                    )
                }

                // ---- source strategy ----
                Spacer(Modifier.height(12.dp))
                Text("Источники", style = MaterialTheme.typography.titleMedium)
                SourceStrategyChoice.entries.forEach { choice ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        RadioButton(
                            selected = ui.draftStrategy == choice,
                            onClick = { if (ui.editable) vm.setStrategy(choice) },
                            enabled = ui.editable,
                            modifier = Modifier.testTag("strategy_${choice.wire}"),
                        )
                        Text(OwnerLocalization.renderSourceStrategyRu(choice.wire), style = MaterialTheme.typography.bodyMedium)
                    }
                }
                if (ui.draftStrategy.requiresPaid) {
                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        Checkbox(
                            checked = ui.confirmPaid,
                            onCheckedChange = { if (ui.editable) vm.setConfirmPaid(it) },
                            enabled = ui.editable,
                            modifier = Modifier.testTag("confirm_paid"),
                        )
                        Text("Подтверждаю использование платных источников", style = MaterialTheme.typography.bodySmall)
                    }
                    Text("Платные источники требуют настроенных учётных данных. Без них сервер отклонит сохранение.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                }

                // ---- schedule ----
                Spacer(Modifier.height(12.dp))
                Text("Расписание", style = MaterialTheme.typography.titleMedium)
                val tz = ui.settings?.timezone
                // RC6 (defect F): времена показаны в часовом поясе владельца (Europe/Moscow), без
                // предположения UTC. Суффикс пояса добавляется к каждому времени.
                Kv("Утренний запуск", OwnerLocalization.renderScheduleTimeRu(ui.settings?.morning_discovery_time, tz))
                Kv("Вечерний запуск", OwnerLocalization.renderScheduleTimeRu(ui.settings?.evening_discovery_time, tz))
                Kv("Окно обработки", OwnerLocalization.renderScheduleTimeRu(ui.settings?.processing_window, tz))
                if (OwnerLocalization.isTimezoneUnknown(tz)) {
                    Text(OwnerLocalization.TIMEZONE_UNKNOWN_WARNING, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                } else {
                    Kv("Часовой пояс", OwnerLocalization.renderTimezoneRu(tz))
                }

                // ---- save ----
                Spacer(Modifier.height(16.dp))
                Button(
                    onClick = vm::openDiff,
                    enabled = ui.editable && ui.hasChanges && ui.saveState != SaveState.SUBMITTING,
                    modifier = Modifier.fillMaxWidth().testTag("settings_review_save"),
                ) {
                    if (ui.saveState == SaveState.SUBMITTING) {
                        CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                        Text("Сохраняем…")
                    } else {
                        Text("Просмотреть и сохранить")
                    }
                }

                // ---- audit history ----
                ui.audit?.items?.takeIf { it.isNotEmpty() }?.let { items ->
                    Spacer(Modifier.height(16.dp))
                    Text("История изменений", style = MaterialTheme.typography.titleMedium)
                    items.forEach { e ->
                        Column(Modifier.fillMaxWidth().padding(vertical = 4.dp).testTag("audit_${e.revision}")) {
                            Text(
                                "Ревизия ${e.revision ?: "—"} · ${OwnerLocalization.renderDateRu(e.at) ?: "нет данных"}",
                                style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium,
                            )
                            val fields = e.changed_fields.joinToString(", ") { OwnerLocalization.renderSettingsFieldRu(it) }
                            if (fields.isNotBlank()) Text("Изменены: $fields", style = MaterialTheme.typography.bodySmall)
                            if (OwnerLocalization.hasValue(e.profile)) Text("Профиль: ${OwnerLocalization.renderProfileRu(e.profile)}", style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))
                Text("Изменение лимитов не отправляет сообщений клиентам. Применяется к будущим запускам автоматизации.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.height(12.dp))
            }
        }
    }

    if (ui.showDiff) {
        DiffDialog(ui = ui, forecast = vm.forecast(), onConfirm = vm::save, onDismiss = vm::closeDiff)
    }
}

@Composable
private fun NumericRow(
    label: String,
    value: Long,
    serverValue: Long?,
    hardLimit: Long?,
    enabled: Boolean,
    tag: String,
    onChange: (Long) -> Unit,
) {
    var text by remember(value) { mutableStateOf(value.toString()) }
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
            OutlinedTextField(
                value = text,
                onValueChange = { new ->
                    text = new.filter { it.isDigit() }
                    text.toLongOrNull()?.let(onChange)
                },
                enabled = enabled,
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.width(110.dp).testTag("num_$tag"),
            )
        }
        if (hardLimit != null && hardLimit > 0) {
            Slider(
                value = value.coerceIn(0L, hardLimit).toFloat(),
                onValueChange = { onChange(it.toLong()) },
                valueRange = 0f..hardLimit.toFloat(),
                enabled = enabled,
                modifier = Modifier.fillMaxWidth().testTag("slider_$tag"),
            )
        }
        Text(
            buildString {
                append("Текущее на сервере: ${serverValue?.toString() ?: "нет данных"}")
                if (hardLimit != null) append(" · максимум: $hardLimit")
            },
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
        )
    }
}

@Composable
private fun DiffDialog(ui: OwnerSettingsUi, forecast: String?, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Подтверждение изменений") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()).testTag("settings_diff")) {
                Text("Что изменится:", style = MaterialTheme.typography.titleSmall)
                ui.changedNumeric().forEach { f ->
                    val server = f.serverValue(ui.settings) ?: 0L
                    Text("• ${OwnerLocalization.renderSettingsFieldRu(f.wire)}: $server → ${ui.currentValue(f)}", style = MaterialTheme.typography.bodySmall)
                }
                if (ui.strategyChanged) {
                    Text("• ${OwnerLocalization.renderSettingsFieldRu("source_strategy")}: ${OwnerLocalization.renderSourceStrategyRu(ui.settings?.source_strategy)} → ${OwnerLocalization.renderSourceStrategyRu(ui.draftStrategy.wire)}", style = MaterialTheme.typography.bodySmall)
                }
                if (ui.profileChanged) {
                    Text("• ${OwnerLocalization.renderSettingsFieldRu("profile")}: ${OwnerLocalization.renderProfileRu(ui.settings?.profile)} → ${OwnerLocalization.renderProfileRu(ui.draftProfile)}", style = MaterialTheme.typography.bodySmall)
                }
                forecast?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                }
                if (ui.draftStrategy.requiresPaid) {
                    Spacer(Modifier.height(6.dp))
                    Text("Платные источники: ${if (ui.confirmPaid) "подтверждено" else "не подтверждено"}", style = MaterialTheme.typography.bodySmall)
                }
                Spacer(Modifier.height(6.dp))
                Text("Когда вступит в силу: применяется к следующим запускам автоматизации после сохранения.", style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = {
            TextButton(onClick = onConfirm, enabled = ui.saveState != SaveState.SUBMITTING, modifier = Modifier.testTag("settings_confirm_save")) { Text("Сохранить") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Отмена") } },
    )
}

@Composable
private fun Kv(k: String, v: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Text("$k: ", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
        Text(v, style = MaterialTheme.typography.bodySmall)
    }
}
